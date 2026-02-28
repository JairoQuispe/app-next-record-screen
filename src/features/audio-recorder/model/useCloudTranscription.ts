import { useCallback, useRef, useState } from "react";
import { isTauriRuntime } from "@shared/lib/runtime/isTauriRuntime";

const IS_TAURI = isTauriRuntime();
const WORKER_URL = import.meta.env.VITE_WHISPER_WORKER_URL as string | undefined;

export interface CloudTranscriptionSegment {
  start: number;
  end: number;
  text: string;
}

export interface CloudTranscriptionState {
  isTranscribing: boolean;
  progress: number;
  transcriptionText: string | null;
  segments: CloudTranscriptionSegment[];
  wordCount: number;
  error: string | null;
}

export interface CloudTranscriptionActions {
  transcribe: (audioUrl: string, nativeWavPath: string | null, language?: string) => Promise<void>;
  downloadTranscription: () => Promise<void>;
  cancel: () => void;
  reset: () => void;
}

function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function buildTranscriptionFileContent(
  text: string,
  segments: CloudTranscriptionSegment[],
  wordCount: number,
): string {
  const lines: string[] = [];
  lines.push("═══════════════════════════════════════════");
  lines.push("  TRANSCRIPCIÓN — Recogni");
  lines.push(`  Fecha: ${new Date().toLocaleString("es-ES")}`);
  lines.push(`  Palabras: ${wordCount}`);
  lines.push("═══════════════════════════════════════════");
  lines.push("");

  if (segments.length > 0) {
    for (const seg of segments) {
      lines.push(`[${formatTimestamp(seg.start)} → ${formatTimestamp(seg.end)}]`);
      lines.push(seg.text);
      lines.push("");
    }
    lines.push("───────────────────────────────────────────");
    lines.push("TEXTO COMPLETO:");
    lines.push("───────────────────────────────────────────");
    lines.push(text);
  } else {
    lines.push(text);
  }

  lines.push("");
  return lines.join("\n");
}

async function readAudioAsBlob(audioUrl: string, nativeWavPath: string | null): Promise<Blob> {
  if (IS_TAURI && nativeWavPath) {
    const { readFile } = await import("@tauri-apps/plugin-fs");
    const bytes = await readFile(nativeWavPath);
    return new Blob([bytes], { type: "audio/wav" });
  }

  // Browser path: fetch the blob URL
  const response = await fetch(audioUrl);
  return await response.blob();
}

/**
 * Post-recording cloud transcription hook.
 *
 * Sends recorded audio to Cloudflare Worker running Whisper-large-v3-turbo.
 * Provides transcribe, download, cancel, and reset actions.
 */
export function useCloudTranscription(): CloudTranscriptionState & CloudTranscriptionActions {
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [transcriptionText, setTranscriptionText] = useState<string | null>(null);
  const [segments, setSegments] = useState<CloudTranscriptionSegment[]>([]);
  const [wordCount, setWordCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsTranscribing(false);
    setProgress(0);
    setTranscriptionText(null);
    setSegments([]);
    setWordCount(0);
    setError(null);
  }, []);

  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsTranscribing(false);
    setProgress(0);
    setError(null);
  }, []);

  const transcribe = useCallback(
    async (audioUrl: string, nativeWavPath: string | null, language = "es") => {
      if (!WORKER_URL) {
        setError("VITE_WHISPER_WORKER_URL no está configurada.");
        return;
      }

      reset();
      setIsTranscribing(true);
      setProgress(10);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        // Step 1: Read audio as binary blob
        setProgress(20);
        const audioBlob = await readAudioAsBlob(audioUrl, nativeWavPath);

        if (controller.signal.aborted) return;
        setProgress(40);

        // Step 2: POST binary via FormData to Worker
        const formData = new FormData();
        formData.append("audio", audioBlob, "audio.wav");
        formData.append("language", language);

        const response = await fetch(WORKER_URL, {
          method: "POST",
          body: formData,
          signal: controller.signal,
        });

        if (controller.signal.aborted) return;
        setProgress(80);

        if (!response.ok) {
          const errBody = await response.json().catch(() => null) as { error?: string } | null;
          throw new Error(errBody?.error || `Worker respondió con ${response.status}`);
        }

        const data = await response.json() as {
          text: string;
          segments: CloudTranscriptionSegment[];
          word_count: number;
        };

        if (controller.signal.aborted) return;

        setTranscriptionText(data.text);
        setSegments(data.segments || []);
        setWordCount(data.word_count || 0);
        setProgress(100);
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          // User cancelled — don't set error
          return;
        }
        const message = err instanceof Error ? err.message : "La transcripción falló.";
        setError(message);
      } finally {
        setIsTranscribing(false);
        abortControllerRef.current = null;
      }
    },
    [reset],
  );

  const downloadTranscription = useCallback(async () => {
    if (!transcriptionText) return;

    const fileContent = buildTranscriptionFileContent(transcriptionText, segments, wordCount);

    if (IS_TAURI) {
      try {
        const { save } = await import("@tauri-apps/plugin-dialog");
        const { writeTextFile } = await import("@tauri-apps/plugin-fs");

        const outputPath = await save({
          defaultPath: "recogni-transcripcion.txt",
          filters: [{ name: "Texto", extensions: ["txt"] }],
        });

        if (!outputPath) return;
        await writeTextFile(outputPath, fileContent);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al guardar la transcripción.");
      }
      return;
    }

    // Browser path: create blob and trigger download
    const blob = new Blob([fileContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "recogni-transcripcion.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [transcriptionText, segments, wordCount]);

  return {
    isTranscribing,
    progress,
    transcriptionText,
    segments,
    wordCount,
    error,
    transcribe,
    downloadTranscription,
    cancel,
    reset,
  };
}
