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

const TARGET_SAMPLE_RATE = 16_000;

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
 * Downsample audio to 16kHz mono 16-bit WAV for cloud transcription.
 * Reduces ~28MB (stereo 48kHz f32) → ~2.3MB (mono 16kHz i16).
 */
async function downsampleToWav(audioBlob: Blob): Promise<Blob> {
  const arrayBuffer = await audioBlob.arrayBuffer();
  const audioCtx = new AudioContext();
  const decoded = await audioCtx.decodeAudioData(arrayBuffer);
  await audioCtx.close();

  // Resample to 16kHz mono via OfflineAudioContext
  const numSamples = Math.ceil(decoded.duration * TARGET_SAMPLE_RATE);
  const offline = new OfflineAudioContext(1, numSamples, TARGET_SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start(0);
  const rendered = await offline.startRendering();

  const pcm = rendered.getChannelData(0);

  // Encode as 16-bit PCM WAV
  const dataBytes = pcm.length * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeString(view, 8, "WAVE");

  // fmt chunk
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);           // chunk size
  view.setUint16(20, 1, true);            // PCM
  view.setUint16(22, 1, true);            // mono
  view.setUint32(24, TARGET_SAMPLE_RATE, true);
  view.setUint32(28, TARGET_SAMPLE_RATE * 2, true); // byte rate
  view.setUint16(32, 2, true);            // block align
  view.setUint16(34, 16, true);           // bits per sample

  // data chunk
  writeString(view, 36, "data");
  view.setUint32(40, dataBytes, true);

  // Write PCM samples as int16
  let offset = 44;
  for (let i = 0; i < pcm.length; i++) {
    const clamped = Math.max(-1, Math.min(1, pcm[i]));
    view.setInt16(offset, clamped * 0x7FFF, true);
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
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
        setProgress(15);
        const rawBlob = await readAudioAsBlob(audioUrl, nativeWavPath);

        if (controller.signal.aborted) return;

        // Step 2: Downsample to 16kHz mono 16-bit WAV (reduces ~28MB → ~2MB)
        setProgress(30);
        const audioBlob = await downsampleToWav(rawBlob);

        if (controller.signal.aborted) return;
        setProgress(50);

        // Step 3: POST binary via FormData to Worker
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
          defaultPath: "recogning-transcripcion.txt",
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
    a.download = "recogning-transcripcion.txt";
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
