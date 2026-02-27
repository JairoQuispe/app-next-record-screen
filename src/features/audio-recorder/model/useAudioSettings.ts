import { useCallback, useEffect, useRef } from "react";

const STORAGE_KEY = "recogni-audio-settings";

interface AudioSettings {
  denoiseEnabled: boolean;
  denoiseIntensity: number;
  normalizeEnabled: boolean;
}

const DEFAULTS: AudioSettings = {
  denoiseEnabled: false,
  denoiseIntensity: 65,
  normalizeEnabled: false,
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
  setDenoiseEnabled: (v: boolean) => void,
  setDenoiseIntensity: (v: number) => void,
  setNormalizeEnabled: (v: boolean) => void,
): { hydrate: () => void } {
  const saveTimerRef = useRef<number | null>(null);

  const hydrate = useCallback(() => {
    const saved = loadSettings();
    setDenoiseEnabled(saved.denoiseEnabled);
    setDenoiseIntensity(saved.denoiseIntensity);
    setNormalizeEnabled(saved.normalizeEnabled);
  }, [setDenoiseEnabled, setDenoiseIntensity, setNormalizeEnabled]);

  // Auto-save on change (debounced 500ms)
  useEffect(() => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = window.setTimeout(() => {
      saveSettings({ denoiseEnabled, denoiseIntensity, normalizeEnabled });
    }, 500);

    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, [denoiseEnabled, denoiseIntensity, normalizeEnabled]);

  return { hydrate };
}
