import { pipeline, env } from "@huggingface/transformers";
import type { MoonshineWorkerRequest, MoonshineWorkerResponse, InferenceDevice } from "./types";

// Disable local model caching attempts (use browser cache only)
env.allowLocalModels = false;

// Load ONNX Runtime WASM from CDN to avoid bundling the ~21 MB file
if (env.backends?.onnx?.wasm) {
  env.backends.onnx.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/";
}

const MOONSHINE_MODEL = "onnx-community/moonshine-tiny-ONNX";

const VAD_RMS_THRESHOLD = 0.02;
const NORMALIZE_TARGET = 0.95;
const NORMALIZE_MIN_PEAK = 0.01;
const HALLUCINATION_REPEAT_THRESHOLD = 3;
const MIN_UNIQUE_WORDS_RATIO = 0.25;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let asrPipeline: any = null;
let isLoading = false;
let activeDevice: InferenceDevice = "wasm";

function postMsg(msg: MoonshineWorkerResponse) {
  self.postMessage(msg);
}

function hasVoiceActivity(audio: Float32Array): boolean {
  let sumSq = 0;
  const step = 4;
  let count = 0;
  for (let i = 0; i < audio.length; i += step) {
    sumSq += audio[i] * audio[i];
    count++;
  }
  return Math.sqrt(sumSq / Math.max(1, count)) >= VAD_RMS_THRESHOLD;
}

function normalizeAudio(audio: Float32Array): Float32Array {
  let peak = 0;
  for (let i = 0; i < audio.length; i++) {
    const abs = Math.abs(audio[i]);
    if (abs > peak) peak = abs;
  }
  if (peak < NORMALIZE_MIN_PEAK || peak >= NORMALIZE_TARGET) return audio;
  const scale = NORMALIZE_TARGET / peak;
  const out = new Float32Array(audio.length);
  for (let i = 0; i < audio.length; i++) {
    out[i] = audio[i] * scale;
  }
  return out;
}

async function detectWebGPU(): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && "gpu" in navigator) {
      const gpu = (navigator as unknown as { gpu: { requestAdapter: () => Promise<unknown> } }).gpu;
      const adapter = await gpu.requestAdapter();
      return adapter !== null;
    }
  } catch {
    // WebGPU not available
  }
  return false;
}

async function loadModel() {
  if (asrPipeline || isLoading) return;
  isLoading = true;
  postMsg({ type: "loading", progress: 0 });

  try {
    // Try WebGPU first, fallback to WASM
    const hasWebGPU = await detectWebGPU();
    const device = hasWebGPU ? "webgpu" : "wasm";
    activeDevice = device;

    console.log(`[MoonshineWorker] Loading model with device: ${device}`);

    asrPipeline = await (pipeline as Function)(
      "automatic-speech-recognition",
      MOONSHINE_MODEL,
      {
        dtype: "q8",
        device,
        progress_callback: (progress: Record<string, unknown>) => {
          if (typeof progress.progress === "number") {
            postMsg({ type: "loading", progress: Math.round(progress.progress) });
          }
        },
      },
    );

    postMsg({ type: "ready", device: activeDevice });
    console.log(`[MoonshineWorker] Model ready on ${device}`);
  } catch (e) {
    // If WebGPU failed, retry with WASM
    if (activeDevice === "webgpu") {
      console.warn("[MoonshineWorker] WebGPU failed, falling back to WASM:", e);
      activeDevice = "wasm";

      try {
        asrPipeline = await (pipeline as Function)(
          "automatic-speech-recognition",
          MOONSHINE_MODEL,
          {
            dtype: "q8",
            device: "wasm",
            progress_callback: (progress: Record<string, unknown>) => {
              if (typeof progress.progress === "number") {
                postMsg({ type: "loading", progress: Math.round(progress.progress) });
              }
            },
          },
        );
        postMsg({ type: "ready", device: "wasm" });
        console.log("[MoonshineWorker] Model ready on WASM (fallback)");
      } catch (e2) {
        postMsg({ type: "error", error: e2 instanceof Error ? e2.message : "Failed to load Moonshine model" });
      }
    } else {
      postMsg({ type: "error", error: e instanceof Error ? e.message : "Failed to load Moonshine model" });
    }
  } finally {
    isLoading = false;
  }
}

/**
 * Detect hallucinated output by checking for repetitive phrases.
 * ASR models hallucinate loops like "Added Einzelnachweise least paysTAGfon" repeated N times.
 */
function isHallucination(text: string): boolean {
  if (!text || text.length < 20) return false;

  const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 1);
  if (words.length < 4) return false;

  // Check unique word ratio — hallucinations have very few unique words
  const unique = new Set(words);
  const uniqueRatio = unique.size / words.length;
  if (uniqueRatio < MIN_UNIQUE_WORDS_RATIO) {
    console.warn("[MoonshineWorker] Hallucination detected (low unique ratio):", uniqueRatio.toFixed(2));
    return true;
  }

  // Check for repeated n-grams (3-word phrases)
  const ngrams = new Map<string, number>();
  for (let i = 0; i <= words.length - 3; i++) {
    const gram = words.slice(i, i + 3).join(" ");
    const count = (ngrams.get(gram) ?? 0) + 1;
    ngrams.set(gram, count);
    if (count >= HALLUCINATION_REPEAT_THRESHOLD) {
      console.warn("[MoonshineWorker] Hallucination detected (repeated ngram):", gram);
      return true;
    }
  }

  return false;
}

async function transcribe(audio: Float32Array, language: string, _context?: string) {
  if (!asrPipeline) {
    postMsg({ type: "error", error: "Model not loaded" });
    return;
  }

  // Quick RMS pre-filter
  if (!hasVoiceActivity(audio)) {
    postMsg({ type: "result", text: "" });
    return;
  }

  const normalized = normalizeAudio(audio);

  try {
    const options: Record<string, unknown> = {
      language,
      task: "transcribe",
    };

    // NOTE: initial_prompt / context passing removed intentionally.
    // It amplifies hallucination loops where garbage text feeds back into the model.

    const result = await asrPipeline(normalized, options);

    const text = Array.isArray(result)
      ? result.map((r: { text: string }) => r.text).join(" ")
      : (result as { text: string }).text;

    const trimmed = text.trim();

    // Filter out hallucinated output
    if (isHallucination(trimmed)) {
      postMsg({ type: "result", text: "" });
      return;
    }

    postMsg({ type: "result", text: trimmed });
  } catch (e) {
    postMsg({ type: "error", error: e instanceof Error ? e.message : "Transcription failed" });
  }
}

self.onmessage = (event: MessageEvent<MoonshineWorkerRequest>) => {
  const { type, audio, language, context } = event.data;

  if (type === "load") {
    void loadModel();
  } else if (type === "transcribe" && audio) {
    void transcribe(audio, language ?? "es", context);
  }
};
