import { useCallback, useEffect, useRef, useState } from "react";
import type {
  TranscriptionBackend,
  TranscriptionState,
  TranscriptionActions,
  InferenceDevice,
} from "../lib/transcription/types";
import { isTauriRuntime } from "@shared/lib/runtime/isTauriRuntime";
import {
  nativeTranscriptionLoadModel,
  nativeTranscriptionTranscribe,
} from "@shared/lib/runtime/tauriAudioCapture";

const IS_TAURI = isTauriRuntime();

const CHUNK_DURATION_S = 3;
const SAMPLE_RATE = 16000;
const MIN_CHUNK_S = 0.75;
const CHUNK_OVERLAP_S = 1;
const HALLUCINATION_REPEAT_THRESHOLD = 3;
const MIN_UNIQUE_WORDS_RATIO = 0.25;

const CHUNK_OVERLAP_SAMPLES = Math.floor(CHUNK_OVERLAP_S * SAMPLE_RATE);
const MIN_CHUNK_SAMPLES = Math.floor(MIN_CHUNK_S * SAMPLE_RATE);

function normalizeSegment(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Detect hallucinated ASR output (repetitive phrases in mixed languages).
 */
function isHallucination(text: string): boolean {
  if (!text || text.length < 20) return false;
  const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 1);
  if (words.length < 4) return false;

  // Low unique word ratio = hallucination loop
  const unique = new Set(words);
  if (unique.size / words.length < MIN_UNIQUE_WORDS_RATIO) return true;

  // Repeated 3-grams
  const ngrams = new Map<string, number>();
  for (let i = 0; i <= words.length - 3; i++) {
    const gram = words.slice(i, i + 3).join(" ");
    const count = (ngrams.get(gram) ?? 0) + 1;
    ngrams.set(gram, count);
    if (count >= HALLUCINATION_REPEAT_THRESHOLD) return true;
  }

  return false;
}

function mergeWithLastSegment(previous: string, incoming: string): string {
  const normalizedIncoming = normalizeSegment(incoming);
  if (!normalizedIncoming) return previous;

  if (!previous.trim()) {
    return normalizedIncoming;
  }

  const lines = previous.split("\n");
  const lastIndex = lines.length - 1;
  const normalizedLast = normalizeSegment(lines[lastIndex] ?? "");

  if (!normalizedLast) {
    lines[lastIndex] = normalizedIncoming;
    return lines.join("\n");
  }

  if (normalizedIncoming === normalizedLast) {
    return previous;
  }

  // If overlap causes the new segment to extend the previous one, replace last line.
  if (normalizedIncoming.startsWith(normalizedLast)) {
    lines[lastIndex] = normalizedIncoming;
    return lines.join("\n");
  }

  // If new segment is a shorter repeat, ignore it.
  if (normalizedLast.startsWith(normalizedIncoming)) {
    return previous;
  }

  return `${previous}\n${normalizedIncoming}`;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

function toTranscriptionText(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (typeof raw === "object" && raw !== null && "message" in raw) {
    return String((raw as Record<string, unknown>).message);
  }
  return String(raw);
}

/**
 * Unified real-time transcription hook with provider abstraction.
 *
 * Supports multiple backends:
 * - "moonshine-local":  Whisper ONNX via Web Worker (web + desktop)
 * - "moonshine-native": Moonshine ONNX via Rust/ort native (desktop only)
 * - "whisper-native":   whisper.cpp via Tauri (desktop only, future)
 *
 * Drop-in replacement for useWhisperTranscription with the same state interface.
 */
export function useTranscription(
  enabled: boolean,
  stream: MediaStream | null,
  language: string = "es",
  backend: TranscriptionBackend = "moonshine-local",
): TranscriptionState & TranscriptionActions {
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [isModelReady, setIsModelReady] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [finalText, setFinalText] = useState("");
  const [interimText, setInterimText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [activeDevice, setActiveDevice] = useState<InferenceDevice | "native" | null>(null);
  const [activeBackend, setActiveBackend] = useState<TranscriptionBackend | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const audioBufferRef = useRef<Float32Array[]>([]);
  const chunkTimerRef = useRef<number | null>(null);
  const modelReadyRef = useRef(false);
  const isChunkInFlightRef = useRef(false);
  const lastContextRef = useRef("");
  const inferenceTimeoutRef = useRef<number | null>(null);
  const INFERENCE_TIMEOUT_MS = 20_000;
  const backendRef = useRef(backend);
  backendRef.current = backend;

  const isNativeBackend = useCallback(() => {
    return backendRef.current === "moonshine-native" && IS_TAURI;
  }, []);

  const clearInferenceTimeout = useCallback(() => {
    if (inferenceTimeoutRef.current !== null) {
      window.clearTimeout(inferenceTimeoutRef.current);
      inferenceTimeoutRef.current = null;
    }
  }, []);

  const beginChunkProcessing = useCallback(() => {
    setIsProcessing(true);
    setInterimText("Transcribiendo...");
    isChunkInFlightRef.current = true;
  }, []);

  const endChunkProcessing = useCallback((clearModelLoading = false) => {
    setIsProcessing(false);
    isChunkInFlightRef.current = false;
    setInterimText("");
    if (clearModelLoading) {
      setIsModelLoading(false);
    }
    clearInferenceTimeout();
  }, [clearInferenceTimeout]);

  const appendFinalText = useCallback((text?: string) => {
    if (!text || !text.trim() || isHallucination(text)) return;

    setFinalText((prev) => {
      const next = mergeWithLastSegment(prev, text);
      lastContextRef.current = next.split("\n").slice(-3).join(" ");
      return next;
    });
  }, []);

  const getWorker = useCallback(() => {
    if (workerRef.current) return workerRef.current;

    let worker: Worker;

    // whisper-native is not yet implemented — fall back to web worker.
    if (backendRef.current === "whisper-native") {
      console.warn("[useTranscription] whisper-native not yet implemented, using moonshine-local");
    }

    worker = new Worker(
      new URL("../lib/whisper.worker.ts", import.meta.url),
      { type: "module" },
    );

    worker.onerror = (evt) => {
      console.error("[useTranscription] Worker crashed:", evt.message);
      endChunkProcessing();
      setError(evt.message ?? "Worker crashed");
    };

    worker.onmessage = (event: MessageEvent) => {
      const data = event.data as { type: string; text?: string; error?: string; progress?: number };

      switch (data.type) {
        case "loading":
          setIsModelLoading(true);
          setLoadProgress(data.progress ?? 0);
          break;
        case "ready":
          setIsModelLoading(false);
          setIsModelReady(true);
          modelReadyRef.current = true;
          setLoadProgress(100);
          setActiveDevice("wasm");
          setActiveBackend(backendRef.current);
          console.log("[useTranscription] Model ready (web worker)");
          break;
        case "result":
          endChunkProcessing();
          appendFinalText(data.text);
          break;
        case "error":
          endChunkProcessing(true);
          console.error("[useTranscription] Worker error:", data.error);
          setError(data.error ?? "Unknown error");
          break;
      }
    };

    workerRef.current = worker;
    return worker;
  }, [appendFinalText, endChunkProcessing]);

  // ── Native model loading (Moonshine via Rust/ort) ──
  const loadNativeModel = useCallback(async () => {
    if (modelReadyRef.current) return;
    setIsModelLoading(true);
    setLoadProgress(0);
    try {
      console.log("[useTranscription] Loading native Moonshine model...");
      await nativeTranscriptionLoadModel();
      setIsModelLoading(false);
      setIsModelReady(true);
      modelReadyRef.current = true;
      setLoadProgress(100);
      setActiveDevice("native");
      setActiveBackend("moonshine-native");
      console.log("[useTranscription] Native Moonshine model ready");
    } catch (e: unknown) {
      setIsModelLoading(false);
      const msg = toErrorMessage(e);
      console.error("[useTranscription] Native model load error:", msg);
      setError(msg);
    }
  }, []);

  // ── Native transcription via invoke() ──
  const sendChunkNative = useCallback(async (merged: Float32Array) => {
    beginChunkProcessing();

    try {
      const audioArray = Array.from(merged);
      const raw = await nativeTranscriptionTranscribe(audioArray, language);
      const text = toTranscriptionText(raw);
      endChunkProcessing();
      appendFinalText(text);
    } catch (e: unknown) {
      endChunkProcessing();
      const msg = toErrorMessage(e);
      console.error("[useTranscription] Native transcribe error:", msg);
      setError(msg);
    }
  }, [appendFinalText, beginChunkProcessing, endChunkProcessing, language]);

  const sendChunk = useCallback(() => {
    const chunks = audioBufferRef.current;
    if (chunks.length === 0 || !modelReadyRef.current || isChunkInFlightRef.current) return;

    // Merge all buffered chunks into a single Float32Array
    const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
    if (totalLength < MIN_CHUNK_SAMPLES) return;

    const merged = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }

    // Keep overlap for context continuity
    if (CHUNK_OVERLAP_SAMPLES > 0 && merged.length > CHUNK_OVERLAP_SAMPLES) {
      audioBufferRef.current = [merged.slice(merged.length - CHUNK_OVERLAP_SAMPLES)];
    } else {
      audioBufferRef.current = [];
    }

    // ── Native path: send to Rust via invoke() ──
    if (isNativeBackend()) {
      void sendChunkNative(merged);
      return;
    }

    // ── Web Worker path ──
    beginChunkProcessing();

    // Safety timeout: if worker never responds, unblock for next chunk
    clearInferenceTimeout();
    inferenceTimeoutRef.current = window.setTimeout(() => {
      if (isChunkInFlightRef.current) {
        console.warn("[useTranscription] Inference timeout — resetting stuck state");
        endChunkProcessing();
      }
      inferenceTimeoutRef.current = null;
    }, INFERENCE_TIMEOUT_MS);

    const worker = getWorker();
    worker.postMessage({ type: "transcribe", audio: merged, language, context: lastContextRef.current });
  }, [beginChunkProcessing, clearInferenceTimeout, endChunkProcessing, getWorker, isNativeBackend, sendChunkNative, language]);

  const startCapture = useCallback(async (mediaStream: MediaStream) => {
    // Clean up any existing capture
    workletNodeRef.current?.disconnect();
    sourceNodeRef.current?.disconnect();
    if (audioCtxRef.current) {
      void audioCtxRef.current.close();
    }

    const audioCtx = new AudioContext({ sampleRate: SAMPLE_RATE });
    const source = audioCtx.createMediaStreamSource(mediaStream);

    // AudioWorkletNode replaces deprecated ScriptProcessorNode
    // Inline the processor code as a Blob URL to avoid separate file management
    const processorCode = `
      class PcmCaptureProcessor extends AudioWorkletProcessor {
        process(inputs) {
          const input = inputs[0];
          if (input && input[0] && input[0].length > 0) {
            this.port.postMessage(new Float32Array(input[0]));
          }
          return true;
        }
      }
      registerProcessor("pcm-capture-processor", PcmCaptureProcessor);
    `;
    const blob = new Blob([processorCode], { type: "application/javascript" });
    const workletUrl = URL.createObjectURL(blob);

    try {
      await audioCtx.audioWorklet.addModule(workletUrl);
    } finally {
      URL.revokeObjectURL(workletUrl);
    }

    const workletNode = new AudioWorkletNode(audioCtx, "pcm-capture-processor");
    workletNode.port.onmessage = (e: MessageEvent<Float32Array>) => {
      audioBufferRef.current.push(e.data);
    };

    source.connect(workletNode);

    audioCtxRef.current = audioCtx;
    sourceNodeRef.current = source;
    workletNodeRef.current = workletNode;

    // Send chunks at reduced interval (1.5s vs old 3s)
    chunkTimerRef.current = window.setInterval(sendChunk, CHUNK_DURATION_S * 1000);

    console.log("[useTranscription] Audio capture started, sampleRate:", audioCtx.sampleRate, "backend:", backendRef.current);
  }, [sendChunk]);

  const stopCapture = useCallback(() => {
    if (chunkTimerRef.current !== null) {
      window.clearInterval(chunkTimerRef.current);
      chunkTimerRef.current = null;
    }
    clearInferenceTimeout();

    // Send any remaining audio
    sendChunk();

    workletNodeRef.current?.disconnect();
    sourceNodeRef.current?.disconnect();
    workletNodeRef.current = null;
    sourceNodeRef.current = null;

    if (audioCtxRef.current) {
      void audioCtxRef.current.close();
      audioCtxRef.current = null;
    }

    audioBufferRef.current = [];
    setIsProcessing(false);
    isChunkInFlightRef.current = false;
    lastContextRef.current = "";
    setInterimText("");
  }, [clearInferenceTimeout, sendChunk]);

  const terminateWorker = useCallback((resetModelReady: boolean) => {
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }

    if (resetModelReady) {
      modelReadyRef.current = false;
      setIsModelReady(false);
    }
  }, []);

  const clear = useCallback(() => {
    setFinalText("");
    setInterimText("");
    setError(null);
    lastContextRef.current = "";
  }, []);

  // Lifecycle: load model + start/stop capture based on enabled & stream
  useEffect(() => {
    if (!enabled || !stream) {
      stopCapture();
      return;
    }

    // Load model — native or web worker
    if (isNativeBackend()) {
      if (!modelReadyRef.current) {
        void loadNativeModel();
      }
    } else {
      const worker = getWorker();
      if (!modelReadyRef.current) {
        worker.postMessage({ type: "load" });
      }
    }

    startCapture(stream);

    return () => {
      stopCapture();
    };
  }, [enabled, stream, getWorker, isNativeBackend, loadNativeModel, startCapture, stopCapture]);

  // If backend changes while active, terminate old worker so next getWorker() creates new one
  useEffect(() => {
    return () => {
      terminateWorker(true);
    };
  }, [backend, terminateWorker]);

  // Cleanup worker on unmount
  useEffect(() => {
    return () => {
      terminateWorker(false);
    };
  }, [terminateWorker]);

  return {
    isModelLoading,
    isModelReady,
    isProcessing,
    loadProgress,
    finalText,
    interimText,
    error,
    activeDevice,
    activeBackend,
    clear,
  };
}
