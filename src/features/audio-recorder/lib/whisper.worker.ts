import { pipeline, env } from "@huggingface/transformers";

// Disable local model caching attempts (use browser cache only)
env.allowLocalModels = false;

const WHISPER_MODEL = "onnx-community/whisper-base";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let whisperPipeline: any = null;
let isLoading = false;

interface WorkerMessage {
  type: "load" | "transcribe";
  audio?: Float32Array;
  language?: string;
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

async function transcribe(audio: Float32Array, language: string) {
  if (!whisperPipeline) {
    postMsg({ type: "error", error: "Model not loaded" });
    return;
  }

  try {
    const result = await whisperPipeline(audio, {
      language,
      task: "transcribe",
      chunk_length_s: 12,
      stride_length_s: 3,
    });

    const text = Array.isArray(result)
      ? result.map((r: { text: string }) => r.text).join(" ")
      : (result as { text: string }).text;
    postMsg({ type: "result", text: text.trim() });
  } catch (e) {
    postMsg({ type: "error", error: e instanceof Error ? e.message : "Transcription failed" });
  }
}

self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const { type, audio, language } = event.data;

  if (type === "load") {
    void loadModel();
  } else if (type === "transcribe" && audio) {
    void transcribe(audio, language ?? "es");
  }
};
