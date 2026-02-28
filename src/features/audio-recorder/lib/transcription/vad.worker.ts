import { AutoModel, env } from "@huggingface/transformers";
import type { VadWorkerRequest, VadWorkerResponse } from "./types";

env.allowLocalModels = false;

if (env.backends?.onnx?.wasm) {
  env.backends.onnx.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/";
}

const SILERO_VAD_MODEL = "onnx-community/silero-vad";
const SAMPLE_RATE = 16000;
const FRAME_SIZE = 1536; // Silero VAD expects 96ms frames at 16kHz

// Silero VAD speech probability threshold
const SPEECH_THRESHOLD = 0.5;
// Minimum voiced duration to consider as speech (samples)
const MIN_SPEECH_SAMPLES = Math.floor(0.25 * SAMPLE_RATE); // 250ms

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let vadModel: any = null;
let isLoading = false;

// Silero VAD internal state (h, c tensors)
let h: Float32Array = new Float32Array(2 * 1 * 64);
let c: Float32Array = new Float32Array(2 * 1 * 64);

function postMsg(msg: VadWorkerResponse) {
  self.postMessage(msg);
}

function resetState() {
  h = new Float32Array(2 * 1 * 64);
  c = new Float32Array(2 * 1 * 64);
}

async function loadModel() {
  if (vadModel || isLoading) return;
  isLoading = true;

  try {
    vadModel = await AutoModel.from_pretrained(SILERO_VAD_MODEL, {
      dtype: "fp32",
      device: "wasm",
    });
    resetState();
    postMsg({ type: "ready" });
    console.log("[VadWorker] Silero VAD model ready");
  } catch (e) {
    postMsg({ type: "error", error: e instanceof Error ? e.message : "Failed to load VAD model" });
  } finally {
    isLoading = false;
  }
}

/**
 * Process audio chunk through Silero VAD to detect voiced segments.
 *
 * Returns an array of [startSample, endSample] pairs for voiced regions,
 * and a boolean indicating if any speech was detected.
 */
async function processAudio(audio: Float32Array) {
  if (!vadModel) {
    postMsg({ type: "error", error: "VAD model not loaded" });
    return;
  }

  try {
    const segments: [number, number][] = [];
    let speechStart = -1;
    let isSpeech = false;

    // Process in frames
    for (let offset = 0; offset + FRAME_SIZE <= audio.length; offset += FRAME_SIZE) {
      const frame = audio.subarray(offset, offset + FRAME_SIZE);

      const result = await vadModel({
        input: frame,
        sr: SAMPLE_RATE,
        h,
        c,
      });

      // Update internal state
      if (result.hn) h = result.hn.data;
      if (result.cn) c = result.cn.data;

      const prob = result.output?.data?.[0] ?? 0;

      if (prob >= SPEECH_THRESHOLD) {
        isSpeech = true;
        if (speechStart === -1) {
          speechStart = offset;
        }
      } else {
        if (speechStart !== -1) {
          const speechEnd = offset;
          if (speechEnd - speechStart >= MIN_SPEECH_SAMPLES) {
            segments.push([speechStart, speechEnd]);
          }
          speechStart = -1;
        }
      }
    }

    // Handle speech that extends to the end of the chunk
    if (speechStart !== -1) {
      const speechEnd = audio.length;
      if (speechEnd - speechStart >= MIN_SPEECH_SAMPLES) {
        segments.push([speechStart, speechEnd]);
      }
    }

    postMsg({ type: "result", segments, isSpeech });
  } catch (e) {
    postMsg({ type: "error", error: e instanceof Error ? e.message : "VAD processing failed" });
  }
}

self.onmessage = (event: MessageEvent<VadWorkerRequest>) => {
  const { type, audio } = event.data;

  if (type === "load") {
    void loadModel();
  } else if (type === "process" && audio) {
    void processAudio(audio);
  }
};
