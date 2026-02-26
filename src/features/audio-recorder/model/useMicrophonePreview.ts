import { useCallback, useEffect, useRef, useState } from "react";

const PREVIEW_BAR_COUNT = 48;
const PREVIEW_INTERVAL_MS = 80;

const ZERO_LEVELS: number[] = Array.from({ length: PREVIEW_BAR_COUNT }, () => 0);

/**
 * Opens a temporary microphone stream and returns real-time frequency levels
 * via an AnalyserNode. Automatically cleans up when `enabled` becomes false
 * or the component unmounts.
 */
export function useMicrophonePreview(
  enabled: boolean,
  deviceId: string | null,
): { levels: number[]; isActive: boolean } {
  const [levels, setLevels] = useState<number[]>(ZERO_LEVELS);
  const [isActive, setIsActive] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const timerRef = useRef<number | null>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }

    sourceRef.current?.disconnect();
    analyserRef.current?.disconnect();
    sourceRef.current = null;
    analyserRef.current = null;

    if (audioCtxRef.current) {
      void audioCtxRef.current.close();
      audioCtxRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    setLevels(ZERO_LEVELS);
    setIsActive(false);
  }, []);

  useEffect(() => {
    if (!enabled) {
      cleanup();
      return;
    }

    if (
      typeof window === "undefined" ||
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      return;
    }

    let cancelled = false;

    const start = async () => {
      try {
        const constraints: MediaStreamConstraints = {
          audio: deviceId
            ? { deviceId: { exact: deviceId }, echoCancellation: true, noiseSuppression: true }
            : { echoCancellation: true, noiseSuppression: true },
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;

        const audioCtx = new AudioContext();
        const analyser = audioCtx.createAnalyser();
        const source = audioCtx.createMediaStreamSource(stream);

        analyser.fftSize = 128;
        analyser.smoothingTimeConstant = 0.75;
        source.connect(analyser);

        audioCtxRef.current = audioCtx;
        analyserRef.current = analyser;
        sourceRef.current = source;

        const frequencyData = new Uint8Array(analyser.frequencyBinCount);
        const binCount = frequencyData.length;
        const bucketSize = Math.max(1, Math.floor(binCount / PREVIEW_BAR_COUNT));

        setIsActive(true);

        timerRef.current = window.setInterval(() => {
          analyser.getByteFrequencyData(frequencyData);
          const next: number[] = new Array(PREVIEW_BAR_COUNT);

          for (let i = 0; i < PREVIEW_BAR_COUNT; i++) {
            const start = i * bucketSize;
            const end = i === PREVIEW_BAR_COUNT - 1 ? binCount : start + bucketSize;
            let sum = 0;

            for (let j = start; j < end; j++) {
              sum += frequencyData[j];
            }

            next[i] = end > start ? sum / ((end - start) * 255) : 0;
          }

          setLevels(next);
        }, PREVIEW_INTERVAL_MS);
      } catch {
        // Permission denied or device unavailable — stay silent
        if (!cancelled) {
          setIsActive(false);
        }
      }
    };

    void start();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [enabled, deviceId, cleanup]);

  // Cleanup on unmount
  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  return { levels, isActive };
}
