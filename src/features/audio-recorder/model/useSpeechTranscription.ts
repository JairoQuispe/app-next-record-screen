import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Extends the global Window interface for the vendor-prefixed
 * SpeechRecognition constructor used in Chrome / Edge / Tauri-webview.
 */
interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
  readonly message: string;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  const Ctor = (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as SpeechRecognitionCtor | null;
  console.log("[SpeechTranscription] Ctor available:", !!Ctor);
  return Ctor;
}

export interface TranscriptionState {
  /** Whether the Web Speech API is available in this runtime */
  isSupported: boolean;
  /** Whether recognition is currently listening */
  isListening: boolean;
  /** Accumulated final transcript lines */
  finalText: string;
  /** Current interim (partial) transcript while speaking */
  interimText: string;
  /** Last error message, if any */
  error: string | null;
}

export interface TranscriptionActions {
  start: () => void;
  stop: () => void;
  clear: () => void;
}

const DEFAULT_LANG = "es-ES";

/**
 * Real-time speech-to-text using the Web Speech API (SpeechRecognition).
 *
 * - `enabled`: master switch — when false the recognizer stops and is cleaned up.
 * - `lang`: BCP-47 language tag (default `"es-ES"`).
 *
 * Returns transcription state (final + interim text) and start/stop/clear actions.
 *
 * Works in Chrome, Edge, and Chromium-based Tauri webviews.
 * Degrades gracefully: `isSupported = false` on Firefox / Safari / unsupported runtimes.
 */
export function useSpeechTranscription(
  enabled: boolean,
  lang: string = DEFAULT_LANG,
): TranscriptionState & TranscriptionActions {
  const Ctor = getSpeechRecognitionCtor();
  const isSupported = Ctor !== null;

  const [isListening, setIsListening] = useState(false);
  const [finalText, setFinalText] = useState("");
  const [interimText, setInterimText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const wantListeningRef = useRef(false);
  const restartingRef = useRef(false);

  const cleanup = useCallback(() => {
    wantListeningRef.current = false;
    restartingRef.current = false;
    const rec = recognitionRef.current;
    if (rec) {
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      try { rec.abort(); } catch { /* ignore */ }
      recognitionRef.current = null;
    }
    setIsListening(false);
    setInterimText("");
  }, []);

  const createRecognition = useCallback(() => {
    if (!Ctor) return null;

    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = lang;
    rec.maxAlternatives = 1;

    rec.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      let finalChunk = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript;
        if (result.isFinal) {
          finalChunk += transcript;
        } else {
          interim += transcript;
        }
      }

      if (finalChunk) {
        setFinalText((prev) => prev + (prev ? "\n" : "") + finalChunk.trim());
      }
      setInterimText(interim);
    };

    rec.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.log("[SpeechTranscription] onerror:", event.error, event.message);
      // "no-speech" and "aborted" are expected during normal usage
      if (event.error === "no-speech" || event.error === "aborted") return;
      setError(event.error);
      setIsListening(false);
    };

    rec.onend = () => {
      console.log("[SpeechTranscription] onend, wantListening:", wantListeningRef.current);
      setInterimText("");
      // Auto-restart if we still want to be listening (continuous mode can stop unexpectedly)
      if (wantListeningRef.current && !restartingRef.current) {
        restartingRef.current = true;
        setTimeout(() => {
          restartingRef.current = false;
          if (wantListeningRef.current && recognitionRef.current) {
            try {
              recognitionRef.current.start();
            } catch {
              setIsListening(false);
            }
          } else {
            setIsListening(false);
          }
        }, 300);
      } else if (!restartingRef.current) {
        setIsListening(false);
      }
    };

    return rec;
  }, [Ctor, lang]);

  const start = useCallback(() => {
    if (!isSupported) return;
    setError(null);

    // Reuse or create
    if (!recognitionRef.current) {
      recognitionRef.current = createRecognition();
    }

    const rec = recognitionRef.current;
    if (!rec) return;

    wantListeningRef.current = true;
    try {
      console.log("[SpeechTranscription] calling rec.start(), lang:", rec.lang);
      rec.start();
      setIsListening(true);
      console.log("[SpeechTranscription] started successfully");
    } catch (e) {
      console.error("[SpeechTranscription] start error:", e);
    }
  }, [createRecognition, isSupported]);

  const stop = useCallback(() => {
    wantListeningRef.current = false;
    const rec = recognitionRef.current;
    if (rec) {
      try { rec.stop(); } catch { /* ignore */ }
    }
    setIsListening(false);
    setInterimText("");
  }, []);

  const clear = useCallback(() => {
    setFinalText("");
    setInterimText("");
    setError(null);
  }, []);

  // Auto-start when enabled, auto-stop when disabled or unmount
  useEffect(() => {
    if (enabled) {
      start();
    } else {
      cleanup();
    }
    return cleanup;
  }, [enabled, cleanup, start]);

  // Recreate recognition when lang changes while listening
  useEffect(() => {
    if (isListening && recognitionRef.current) {
      recognitionRef.current.lang = lang;
    }
  }, [lang, isListening]);

  return {
    isSupported,
    isListening,
    finalText,
    interimText,
    error,
    start,
    stop,
    clear,
  };
}
