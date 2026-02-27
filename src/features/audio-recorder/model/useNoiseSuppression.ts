import { useCallback, useRef, useState } from "react";
import { isTauriRuntime } from "@shared/lib/runtime/isTauriRuntime";
import {
  enhanceAudio,
  convertFilePathToUrl,
} from "@shared/lib/runtime/tauriAudioCapture";

export interface NoiseSuppressionState {
  isProcessing: boolean;
  progress: number;
  enhancedAudioUrl: string | null;
  error: string | null;
}

export interface NoiseSuppressionActions {
  enhance: (
    audioSource: string,
    nativeWavPath: string | null,
    intensity: number,
    normalize: boolean,
  ) => Promise<void>;
  reset: () => void;
}

/**
 * Post-recording noise suppression hook.
 *
 * For **Tauri desktop**: calls `enhance_audio` Rust command on the native WAV.
 * For **web**: placeholder — will be implemented via denoise.worker.ts (Step 10).
 */
export function useNoiseSuppression(): NoiseSuppressionState & NoiseSuppressionActions {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [enhancedAudioUrl, setEnhancedAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const enhancedPathRef = useRef<string | null>(null);

  const reset = useCallback(() => {
    if (enhancedAudioUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(enhancedAudioUrl);
    }
    setIsProcessing(false);
    setProgress(0);
    setEnhancedAudioUrl(null);
    setError(null);
    enhancedPathRef.current = null;
  }, [enhancedAudioUrl]);

  const enhance = useCallback(
    async (
      _audioSource: string,
      nativeWavPath: string | null,
      intensity: number,
      normalize: boolean,
    ) => {
      reset();
      setIsProcessing(true);
      setProgress(10);

      try {
        if (isTauriRuntime() && nativeWavPath) {
          // Desktop path: call Rust enhance_audio command
          setProgress(30);
          const enhancedPath = await enhanceAudio(
            nativeWavPath,
            intensity / 100, // UI is 0-100, Rust expects 0.0-1.0
            normalize,
          );
          enhancedPathRef.current = enhancedPath;
          setProgress(90);

          const assetUrl = convertFilePathToUrl(enhancedPath);
          setEnhancedAudioUrl(assetUrl);
          setProgress(100);
        } else {
          // Web path: will be implemented in Step 10 (denoise.worker.ts)
          // For now, just pass through the original
          setEnhancedAudioUrl(null);
          setError("Noise suppression for web is not yet implemented.");
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Audio enhancement failed.";
        setError(message);
      } finally {
        setIsProcessing(false);
      }
    },
    [reset],
  );

  return {
    isProcessing,
    progress,
    enhancedAudioUrl,
    error,
    enhance,
    reset,
  };
}
