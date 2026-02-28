import { useCallback, useEffect, useRef } from "react";
import type { TranscriptionBackend } from "../lib/transcription/types";

const STORAGE_KEY = "recogni-audio-settings";

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
    const parsed = JSON.parse(raw) as Partial<AudioSettings>;
    return {
      denoiseEnabled: typeof parsed.denoiseEnabled === "boolean" ? parsed.denoiseEnabled : DEFAULTS.denoiseEnabled,
      denoiseIntensity: typeof parsed.denoiseIntensity === "number" ? parsed.denoiseIntensity : DEFAULTS.denoiseIntensity,
      normalizeEnabled: typeof parsed.normalizeEnabled === "boolean" ? parsed.normalizeEnabled : DEFAULTS.normalizeEnabled,
      transcriptionEnabled: typeof parsed.transcriptionEnabled === "boolean" ? parsed.transcriptionEnabled : DEFAULTS.transcriptionEnabled,
      transcriptionBackend: parsed.transcriptionBackend === "moonshine-local" || parsed.transcriptionBackend === "whisper-native" ? parsed.transcriptionBackend : DEFAULTS.transcriptionBackend,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveSettings(settings: AudioSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage full or unavailable — silently ignore
  }
}

/**
 * Synchronise denoise/normalize settings with localStorage.
 *
 * Call `hydrate()` once on mount to push persisted values into the
 * recorder state. After that the hook auto-saves whenever the values
 * change (debounced to avoid thrashing).
 */
export function useAudioSettings(
  denoiseEnabled: boolean,
  denoiseIntensity: number,
  normalizeEnabled: boolean,
  transcriptionEnabled: boolean,
  transcriptionBackend: TranscriptionBackend,
  setDenoiseEnabled: (v: boolean) => void,
  setDenoiseIntensity: (v: number) => void,
  setNormalizeEnabled: (v: boolean) => void,
  setTranscriptionEnabled: (v: boolean) => void,
  setTranscriptionBackend: (v: TranscriptionBackend) => void,
): { hydrate: () => void } {
  const saveTimerRef = useRef<number | null>(null);

  const hydrate = useCallback(() => {
    const saved = loadSettings();
    setDenoiseEnabled(saved.denoiseEnabled);
    setDenoiseIntensity(saved.denoiseIntensity);
    setNormalizeEnabled(saved.normalizeEnabled);
    setTranscriptionEnabled(saved.transcriptionEnabled);
    setTranscriptionBackend(saved.transcriptionBackend);
  }, [setDenoiseEnabled, setDenoiseIntensity, setNormalizeEnabled, setTranscriptionEnabled, setTranscriptionBackend]);

  // Auto-save on change (debounced 500ms)
  useEffect(() => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = window.setTimeout(() => {
      saveSettings({ denoiseEnabled, denoiseIntensity, normalizeEnabled, transcriptionEnabled, transcriptionBackend });
    }, 500);

    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, [denoiseEnabled, denoiseIntensity, normalizeEnabled, transcriptionEnabled, transcriptionBackend]);

  return { hydrate };
}
