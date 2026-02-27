import { pipeline, env } from "@huggingface/transformers";

// Disable local model caching attempts (use browser cache only)
env.allowLocalModels = false;

// Load ONNX Runtime WASM from CDN to avoid bundling the ~21 MB file
if (env.backends?.onnx?.wasm) {
  env.backends.onnx.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/";
}

const WHISPER_MODEL = "onnx-community/whisper-base";

const VAD_RMS_THRESHOLD = 0.012;
const NORMALIZE_TARGET = 0.95;
const NORMALIZE_MIN_PEAK = 0.01;
const MAX_CONTEXT_CHARS = 224;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let whisperPipeline: any = null;
let isLoading = false;

interface WorkerMessage {
  type: "load" | "transcribe";
  audio?: Float32Array;
  language?: string;
  context?: string;
}

interface WorkerResponse {
  type: "loading" | "ready" | "result" | "error";
  text?: string;
  error?: string;
  progress?: number;
}

function postMsg(msg: WorkerResponse) {
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

async function loadModel() {
  if (whisperPipeline || isLoading) return;
  isLoading = true;
  postMsg({ type: "loading", progress: 0 });

  try {
    whisperPipeline = await (pipeline as Function)(
      "automatic-speech-recognition",
      WHISPER_MODEL,
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
    postMsg({ type: "ready" });
  } catch (e) {
    postMsg({ type: "error", error: e instanceof Error ? e.message : "Failed to load Whisper model" });
  } finally {
    isLoading = false;
  }
}

async function transcribe(audio: Float32Array, language: string, context?: string) {
  if (!whisperPipeline) {
    postMsg({ type: "error", error: "Model not loaded" });
    return;
  }

  if (!hasVoiceActivity(audio)) {
    postMsg({ type: "result", text: "" });
    return;
  }

  const normalized = normalizeAudio(audio);

  try {
    const options: Record<string, unknown> = {
      language,
      task: "transcribe",
      chunk_length_s: 12,
      stride_length_s: 3,
    };

    if (context && context.length > 0) {
      options.initial_prompt = context.slice(-MAX_CONTEXT_CHARS);
    }

    const result = await whisperPipeline(normalized, options);

    const text = Array.isArray(result)
      ? result.map((r: { text: string }) => r.text).join(" ")
      : (result as { text: string }).text;
    postMsg({ type: "result", text: text.trim() });
  } catch (e) {
    postMsg({ type: "error", error: e instanceof Error ? e.message : "Transcription failed" });
  }
}

self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const { type, audio, language, context } = event.data;

  if (type === "load") {
    void loadModel();
  } else if (type === "transcribe" && audio) {
    void transcribe(audio, language ?? "es", context);
  }
};
