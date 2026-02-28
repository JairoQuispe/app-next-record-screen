import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  TranscriptionBackend,
  TranscriptionState,
  TranscriptionActions,
  InferenceDevice,
} from "../lib/transcription/types";
import { isTauriRuntime } from "@shared/lib/runtime/isTauriRuntime";
import { createTranscriptionStateMachine } from "./transcriptionStateMachine";
import { createTranscriptionWorker, terminateTranscriptionWorker } from "./transcriptionWorkerPipeline";
import { loadNativeTranscriptionModel, transcribeNativeChunk } from "./transcriptionProviderRuntime";
import { toErrorMessage } from "./transcriptionText";
import { startTranscriptionCapture, stopTranscriptionCapture } from "./transcriptionCaptureLifecycle";

const IS_TAURI = isTauriRuntime();

const CHUNK_DURATION_S = 3;
const SAMPLE_RATE = 16000;
const MIN_CHUNK_S = 0.75;
const CHUNK_OVERLAP_S = 1;

const CHUNK_OVERLAP_SAMPLES = Math.floor(CHUNK_OVERLAP_S * SAMPLE_RATE);
const MIN_CHUNK_SAMPLES = Math.floor(MIN_CHUNK_S * SAMPLE_RATE);

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

  const { beginChunkProcessing, endChunkProcessing, appendFinalText } = useMemo(
    () =>
      createTranscriptionStateMachine({
        setIsProcessing,
        setInterimText,
        setIsModelLoading,
        setFinalText,
        isChunkInFlightRef,
        lastContextRef,
        clearInferenceTimeout,
      }),
    [clearInferenceTimeout],
  );

  const getWorker = useCallback(() => {
    if (workerRef.current) return workerRef.current;

    const worker = createTranscriptionWorker(backendRef.current, {
      onLoading: (progress) => {
        setIsModelLoading(true);
        setLoadProgress(progress);
      },
      onReady: () => {
        setIsModelLoading(false);
        setIsModelReady(true);
        modelReadyRef.current = true;
        setLoadProgress(100);
        setActiveDevice("wasm");
        setActiveBackend(backendRef.current);
        console.log("[useTranscription] Model ready (web worker)");
      },
      onResult: (text) => {
        endChunkProcessing();
        appendFinalText(text);
      },
      onError: (workerError) => {
        endChunkProcessing(true);
        console.error("[useTranscription] Worker error:", workerError);
        setError(workerError ?? "Unknown error");
      },
      onCrash: (message) => {
        console.error("[useTranscription] Worker crashed:", message);
        endChunkProcessing();
        setError(message);
      },
    });

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
      await loadNativeTranscriptionModel();
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
      const text = await transcribeNativeChunk(merged, language);
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
    await startTranscriptionCapture(
      mediaStream,
      {
        audioCtxRef,
        sourceNodeRef,
        workletNodeRef,
        audioBufferRef,
        chunkTimerRef,
        isChunkInFlightRef,
        lastContextRef,
      },
      sendChunk,
      SAMPLE_RATE,
      CHUNK_DURATION_S,
    );

    console.log(
      "[useTranscription] Audio capture started, sampleRate:",
      audioCtxRef.current?.sampleRate,
      "backend:",
      backendRef.current,
    );
  }, [sendChunk]);

  const stopCapture = useCallback(() => {
    stopTranscriptionCapture(
      {
        audioCtxRef,
        sourceNodeRef,
        workletNodeRef,
        audioBufferRef,
        chunkTimerRef,
        isChunkInFlightRef,
        lastContextRef,
      },
      sendChunk,
      clearInferenceTimeout,
      setIsProcessing,
      setInterimText,
    );
  }, [clearInferenceTimeout, sendChunk]);

  const terminateWorker = useCallback((resetModelReady: boolean) => {
    terminateTranscriptionWorker(workerRef);

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
