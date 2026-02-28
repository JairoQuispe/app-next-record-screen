import { useCallback, useEffect, useRef } from "react";
import type { TranscriptionBackend } from "../lib/transcription/types";

const STORAGE_KEY = "recogni-audio-settings";
const VALID_BACKENDS = new Set<TranscriptionBackend>(["moonshine-local", "moonshine-native", "whisper-native"]);

interface AudioSettings {
  denoiseEnabled: boolean;
  denoiseIntensity: number;
  normalizeEnabled: boolean;
  transcriptionEnabled: boolean;
  transcriptionBackend: TranscriptionBackend;
}

const DEFAULTS: AudioSettings = {
  denoiseEnabled: false,
  denoiseIntensity: 65,
  normalizeEnabled: false,
  transcriptionEnabled: false,
  transcriptionBackend: "moonshine-local",
};

function loadSettings(): AudioSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const p = JSON.parse(raw) as Partial<AudioSettings>;
    return {
      denoiseEnabled: typeof p.denoiseEnabled === "boolean" ? p.denoiseEnabled : DEFAULTS.denoiseEnabled,
      denoiseIntensity: typeof p.denoiseIntensity === "number" ? p.denoiseIntensity : DEFAULTS.denoiseIntensity,
      normalizeEnabled: typeof p.normalizeEnabled === "boolean" ? p.normalizeEnabled : DEFAULTS.normalizeEnabled,
      transcriptionEnabled: typeof p.transcriptionEnabled === "boolean" ? p.transcriptionEnabled : DEFAULTS.transcriptionEnabled,
      transcriptionBackend: VALID_BACKENDS.has(p.transcriptionBackend as TranscriptionBackend) ? p.transcriptionBackend! : DEFAULTS.transcriptionBackend,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export interface AudioSettingsOptions {
  values: Pick<AudioSettings, "denoiseEnabled" | "denoiseIntensity" | "normalizeEnabled" | "transcriptionEnabled">;
  setters: {
    setDenoiseEnabled: (v: boolean) => void;
    setDenoiseIntensity: (v: number) => void;
    setNormalizeEnabled: (v: boolean) => void;
    setTranscriptionEnabled: (v: boolean) => void;
  };
}

/**
 * Synchronise denoise/normalize settings with localStorage.
 *
 * Call `hydrate()` once on mount to push persisted values into the
 * recorder state. After that the hook auto-saves whenever the values
 * change (debounced to avoid thrashing).
 */
export function useAudioSettings({ values, setters }: AudioSettingsOptions): { hydrate: () => void } {
  const { denoiseEnabled, denoiseIntensity, normalizeEnabled, transcriptionEnabled } = values;
  const { setDenoiseEnabled, setDenoiseIntensity, setNormalizeEnabled, setTranscriptionEnabled } = setters;
  const saveTimerRef = useRef<number | null>(null);

  const hydrate = useCallback(() => {
    const saved = loadSettings();
    setDenoiseEnabled(saved.denoiseEnabled);
    setDenoiseIntensity(saved.denoiseIntensity);
    setNormalizeEnabled(saved.normalizeEnabled);
    setTranscriptionEnabled(saved.transcriptionEnabled);
  }, [setDenoiseEnabled, setDenoiseIntensity, setNormalizeEnabled, setTranscriptionEnabled]);

  // Auto-save on change (debounced 500ms)
  useEffect(() => {
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ denoiseEnabled, denoiseIntensity, normalizeEnabled, transcriptionEnabled })); } catch { /* ignore */ }
    }, 500);
    return () => { if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current); };
  }, [denoiseEnabled, denoiseIntensity, normalizeEnabled, transcriptionEnabled]);

  return { hydrate };
}
