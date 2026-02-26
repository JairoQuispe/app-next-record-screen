import { useCallback, useEffect, useRef, useState } from "react";

export interface WhisperTranscriptionState {
  isModelLoading: boolean;
  isModelReady: boolean;
  isProcessing: boolean;
  loadProgress: number;
  finalText: string;
  interimText: string;
  error: string | null;
}

export interface WhisperTranscriptionActions {
  clear: () => void;
}

const CHUNK_DURATION_S = 3;
const CHUNK_OVERLAP_S = 1;
const SAMPLE_RATE = 16000;
const MIN_CHUNK_S = 0.75;

const CHUNK_OVERLAP_SAMPLES = Math.floor(CHUNK_OVERLAP_S * SAMPLE_RATE);
const MIN_CHUNK_SAMPLES = Math.floor(MIN_CHUNK_S * SAMPLE_RATE);

function normalizeSegment(text: string): string {
  return text.replace(/\s+/g, " ").trim();
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

/**
 * Real-time transcription using Whisper (ONNX) running in a Web Worker.
 *
 * Captures audio from the provided `MediaStream`, resamples to 16kHz mono,
 * and sends chunks to the Whisper worker every `CHUNK_DURATION_S` seconds.
 *
 * Works with ANY audio source (microphone, system audio, mixed).
 */
export function useWhisperTranscription(
  enabled: boolean,
  stream: MediaStream | null,
  language: string = "es",
): WhisperTranscriptionState & WhisperTranscriptionActions {
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [isModelReady, setIsModelReady] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [finalText, setFinalText] = useState("");
  const [interimText, setInterimText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const silentGainRef = useRef<GainNode | null>(null);
  const audioBufferRef = useRef<Float32Array[]>([]);
  const chunkTimerRef = useRef<number | null>(null);
  const modelReadyRef = useRef(false);
  const isChunkInFlightRef = useRef(false);

  const getWorker = useCallback(() => {
    if (workerRef.current) return workerRef.current;

    const worker = new Worker(
      new URL("../lib/whisper.worker.ts", import.meta.url),
      { type: "module" },
    );

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
          console.log("[WhisperTranscription] Model ready");
          break;
        case "result":
          setIsProcessing(false);
          isChunkInFlightRef.current = false;
          if (data.text && data.text.trim()) {
            setInterimText("");
            setFinalText((prev) => mergeWithLastSegment(prev, data.text ?? ""));
          }
          break;
        case "error":
          setIsProcessing(false);
          isChunkInFlightRef.current = false;
          setIsModelLoading(false);
          console.error("[WhisperTranscription] Worker error:", data.error);
          setError(data.error ?? "Unknown error");
          break;
      }
    };

    workerRef.current = worker;
    return worker;
  }, []);

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

    if (CHUNK_OVERLAP_SAMPLES > 0 && merged.length > CHUNK_OVERLAP_SAMPLES) {
      audioBufferRef.current = [merged.slice(merged.length - CHUNK_OVERLAP_SAMPLES)];
    } else {
      audioBufferRef.current = [];
    }

    setIsProcessing(true);
    setInterimText("Transcribiendo...");
    isChunkInFlightRef.current = true;

    const worker = getWorker();
    worker.postMessage({ type: "transcribe", audio: merged, language });
  }, [getWorker, language]);

  const startCapture = useCallback((mediaStream: MediaStream) => {
    // Clean up any existing capture
    processorRef.current?.disconnect();
    silentGainRef.current?.disconnect();
    sourceNodeRef.current?.disconnect();
    if (audioCtxRef.current) {
      void audioCtxRef.current.close();
    }

    const audioCtx = new AudioContext({ sampleRate: SAMPLE_RATE });
    const source = audioCtx.createMediaStreamSource(mediaStream);

    // ScriptProcessorNode for capturing raw PCM data
    // bufferSize=4096 at 16kHz ≈ 256ms per callback
    const processor = audioCtx.createScriptProcessor(4096, 1, 1);
    const silentGain = audioCtx.createGain();
    silentGain.gain.value = 0;

    processor.onaudioprocess = (e: AudioProcessingEvent) => {
      const inputData = e.inputBuffer.getChannelData(0);
      audioBufferRef.current.push(new Float32Array(inputData));
    };

    source.connect(processor);
    processor.connect(silentGain);
    silentGain.connect(audioCtx.destination);

    audioCtxRef.current = audioCtx;
    sourceNodeRef.current = source;
    processorRef.current = processor;
    silentGainRef.current = silentGain;

    // Send chunks to the worker periodically
    chunkTimerRef.current = window.setInterval(sendChunk, CHUNK_DURATION_S * 1000);

    console.log("[WhisperTranscription] Audio capture started, sampleRate:", audioCtx.sampleRate);
  }, [sendChunk]);

  const stopCapture = useCallback(() => {
    if (chunkTimerRef.current !== null) {
      window.clearInterval(chunkTimerRef.current);
      chunkTimerRef.current = null;
    }

    // Send any remaining audio
    sendChunk();

    processorRef.current?.disconnect();
    silentGainRef.current?.disconnect();
    sourceNodeRef.current?.disconnect();
    processorRef.current = null;
    silentGainRef.current = null;
    sourceNodeRef.current = null;

    if (audioCtxRef.current) {
      void audioCtxRef.current.close();
      audioCtxRef.current = null;
    }

    audioBufferRef.current = [];
    isChunkInFlightRef.current = false;
    setInterimText("");
  }, [sendChunk]);

  const clear = useCallback(() => {
    setFinalText("");
    setInterimText("");
    setError(null);
  }, []);

  // Lifecycle: load model + start/stop capture based on enabled & stream
  useEffect(() => {
    if (!enabled || !stream) {
      stopCapture();
      return;
    }

    // Load model if not already loaded
    const worker = getWorker();
    if (!modelReadyRef.current) {
      worker.postMessage({ type: "load" });
    }

    startCapture(stream);

    return () => {
      stopCapture();
    };
  }, [enabled, stream, getWorker, startCapture, stopCapture]);

  // Cleanup worker on unmount
  useEffect(() => {
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, []);

  return {
    isModelLoading,
    isModelReady,
    isProcessing,
    loadProgress,
    finalText,
    interimText,
    error,
    clear,
  };
}
