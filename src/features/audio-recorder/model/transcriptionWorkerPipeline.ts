import type { MoonshineWorkerResponse, TranscriptionBackend } from "../lib/transcription/types";

interface WorkerPipelineHandlers {
  onLoading: (progress: number) => void;
  onReady: () => void;
  onResult: (text?: string) => void;
  onError: (error?: string) => void;
  onCrash: (message: string) => void;
}

export function createTranscriptionWorker(
  backend: TranscriptionBackend,
  handlers: WorkerPipelineHandlers,
): Worker {
  if (backend === "whisper-native") {
    console.warn("[useTranscription] whisper-native not yet implemented, using moonshine-local");
  }

  const worker = new Worker(
    new URL("../lib/whisper.worker.ts", import.meta.url),
    { type: "module" },
  );

  worker.onerror = (evt) => {
    handlers.onCrash(evt.message ?? "Worker crashed");
  };

  worker.onmessage = (event: MessageEvent<MoonshineWorkerResponse>) => {
    const data = event.data;

    switch (data.type) {
      case "loading":
        handlers.onLoading(data.progress ?? 0);
        break;
      case "ready":
        handlers.onReady();
        break;
      case "result":
        handlers.onResult(data.text);
        break;
      case "error":
        handlers.onError(data.error);
        break;
    }
  };

  return worker;
}

export function terminateTranscriptionWorker(workerRef: { current: Worker | null }): void {
  if (workerRef.current) {
    workerRef.current.terminate();
    workerRef.current = null;
  }
}
