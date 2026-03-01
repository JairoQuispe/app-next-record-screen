import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AudioInputSource,
  AudioRecorderActions,
  AudioRecorderState,
  MicrophoneDeviceOption,
  MicrophonePermissionStatus,
  RecorderStatus,
} from "./types";
import { isTauriRuntime } from "@shared/lib/runtime/isTauriRuntime";
import {
  startNativeSystemAudioCapture,
  stopNativeSystemAudioCapture,
  isNativeSystemAudioAvailable,
  convertFilePathToUrl,
  listenToAudioLevels,
} from "@shared/lib/runtime/tauriAudioCapture";
import { SPECTRUM_BAR_COUNT, SPECTRUM_ZERO_LEVELS } from "../lib/constants";
import {
  getPermissionErrorMessage,
  getSupportedMimeType,
  isMicrophoneSource,
  isRecorderBusy,
  revokeObjectUrlIfBlob,
  stopMediaStream,
  toErrorMessage,
} from "./audioRecorderHelpers";
import {
  createPermissionAndDevicesSync,
  refreshAvailableMicrophones as refreshAvailableMicrophonesImpl,
  requestMicrophonePermission as requestMicrophonePermissionImpl,
} from "./audioRecorderPermissions";
import {
  clearMixedAudioResources,
  getMicrophoneStream as getMicrophoneStreamImpl,
  getSystemAudioStream as getSystemAudioStreamImpl,
  mixAudioStreams as mixAudioStreamsImpl,
} from "./audioRecorderStreamCapture";
import { stopRecorder, wireMediaRecorderHandlers } from "./audioRecorderLifecycle";

const IS_TAURI = isTauriRuntime();

const IS_BROWSER =
  typeof window !== "undefined" &&
  typeof navigator !== "undefined" &&
  typeof MediaRecorder !== "undefined";

const IS_MEDIA_SUPPORTED =
  IS_BROWSER && !!navigator.mediaDevices?.getUserMedia;

export function useAudioRecorder(): AudioRecorderState & AudioRecorderActions {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isMicrophoneEnabled, setIsMicrophoneEnabled] = useState(true);
  const [microphonePermission, setMicrophonePermission] =
    useState<MicrophonePermissionStatus>("unknown");
  const [availableMicrophones, setAvailableMicrophones] = useState<MicrophoneDeviceOption[]>([]);
  const [selectedMicrophoneId, setSelectedMicrophoneId] = useState<string | null>(null);
  const [audioInputSource, setAudioInputSourceState] = useState<AudioInputSource>("microphone");
  const [spectrumLevels, setSpectrumLevels] = useState<number[]>(
    () => SPECTRUM_ZERO_LEVELS,
  );
  const [recordingStream, setRecordingStream] = useState<MediaStream | null>(null);
  const [denoiseEnabled, setDenoiseEnabled] = useState(false);
  const [denoiseIntensity, setDenoiseIntensityState] = useState(65);
  const [normalizeEnabled, setNormalizeEnabled] = useState(false);
  const [transcriptionEnabled, setTranscriptionEnabled] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const displayStreamRef = useRef<MediaStream | null>(null);
  const microphoneStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordedBlobRef = useRef<Blob | null>(null);
  const recordedMimeTypeRef = useRef<string | null>(null);
  const nativeWavPathRef = useRef<string | null>(null);
  const timerRef = useRef<number | null>(null);
  const permissionStatusRef = useRef<PermissionStatus | null>(null);
  const spectrumAudioContextRef = useRef<AudioContext | null>(null);
  const mixAudioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const spectrumTimerRef = useRef<number | null>(null);
  const mixDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const mixSourceNodesRef = useRef<MediaStreamAudioSourceNode[]>([]);
  const nativeCaptureActiveRef = useRef(false);
  const nativeUnlistenRef = useRef<(() => void) | null>(null);

  const isSupported = IS_MEDIA_SUPPORTED;

  const [isSystemAudioSupported, setIsSystemAudioSupported] = useState(() => {
    if (IS_TAURI) return true;
    return IS_BROWSER && !!navigator.mediaDevices?.getDisplayMedia;
  });

  useEffect(() => {
    if (IS_TAURI) {
      isNativeSystemAudioAvailable().then((available) => {
        setIsSystemAudioSupported(available);
      });
    }
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    stopTimer();
    timerRef.current = window.setInterval(() => {
      setDurationSeconds((previous) => previous + 1);
    }, 1000);
  }, [stopTimer]);

  const stopSpectrumMonitor = useCallback(() => {
    if (spectrumTimerRef.current !== null) {
      window.clearInterval(spectrumTimerRef.current);
      spectrumTimerRef.current = null;
    }

    sourceNodeRef.current?.disconnect();
    analyserRef.current?.disconnect();

    sourceNodeRef.current = null;
    analyserRef.current = null;

    if (spectrumAudioContextRef.current) {
      void spectrumAudioContextRef.current.close();
      spectrumAudioContextRef.current = null;
    }

    setSpectrumLevels(SPECTRUM_ZERO_LEVELS);
  }, []);

  const startSpectrumMonitor = useCallback(
    (stream: MediaStream) => {
      stopSpectrumMonitor();

      if (typeof window === "undefined" || typeof window.AudioContext === "undefined") {
        return;
      }

      const audioContext = new window.AudioContext();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);

      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);

      const frequencyData = new Uint8Array(analyser.frequencyBinCount);
      const dataLength = frequencyData.length;
      const bucketSize = Math.floor(dataLength / SPECTRUM_BAR_COUNT);

      spectrumAudioContextRef.current = audioContext;
      analyserRef.current = analyser;
      sourceNodeRef.current = source;

      spectrumTimerRef.current = window.setInterval(() => {
        analyser.getByteFrequencyData(frequencyData);
        const nextLevels: number[] = new Array(SPECTRUM_BAR_COUNT);

        for (let bucketIndex = 0; bucketIndex < SPECTRUM_BAR_COUNT; bucketIndex += 1) {
          const start = bucketIndex * bucketSize;
          const end = bucketIndex === SPECTRUM_BAR_COUNT - 1 ? dataLength : start + bucketSize;
          let sum = 0;

          for (let i = start; i < end; i += 1) {
            sum += frequencyData[i];
          }

          nextLevels[bucketIndex] = end > start ? sum / ((end - start) * 255) : 0;
        }

        setSpectrumLevels(nextLevels);
      }, 120);
    },
    [stopSpectrumMonitor],
  );

  const clearStream = useCallback(() => {
    stopSpectrumMonitor();
    setRecordingStream(null);

    stopMediaStream(streamRef.current);
    streamRef.current = null;

    stopMediaStream(displayStreamRef.current);
    displayStreamRef.current = null;

    stopMediaStream(microphoneStreamRef.current);
    microphoneStreamRef.current = null;

    clearMixedAudioResources({
      mixAudioContextRef,
      mixDestinationRef,
      mixSourceNodesRef,
    });
  }, [stopSpectrumMonitor]);

  const getMicrophoneStream = useCallback(async (): Promise<MediaStream> => {
    return getMicrophoneStreamImpl(selectedMicrophoneId);
  }, [selectedMicrophoneId]);

  const getSystemAudioStream = useCallback(async (): Promise<MediaStream> => {
    return getSystemAudioStreamImpl(isSystemAudioSupported, displayStreamRef);
  }, [isSystemAudioSupported]);

  const mixAudioStreams = useCallback(
    async (systemStream: MediaStream, micStream: MediaStream): Promise<MediaStream> => {
      return mixAudioStreamsImpl(systemStream, micStream, {
        mixAudioContextRef,
        mixDestinationRef,
        mixSourceNodesRef,
      });
    },
    [],
  );

  const resetRecordingData = useCallback(() => {
    chunksRef.current = [];
    recordedBlobRef.current = null;
    recordedMimeTypeRef.current = null;
    nativeWavPathRef.current = null;
    setDurationSeconds(0);
    setAudioUrl((previous) => {
      revokeObjectUrlIfBlob(previous);
      return null;
    });
  }, []);

  const startNativeSpectrum = useCallback(() => {
    if (nativeUnlistenRef.current) return;
    listenToAudioLevels((level) => {
      // Spread a single RMS level into SPECTRUM_BAR_COUNT bars with
      // a natural-looking bell-curve distribution centred on the middle.
      const mid = (SPECTRUM_BAR_COUNT - 1) / 2;
      const nextLevels: number[] = new Array(SPECTRUM_BAR_COUNT);
      for (let i = 0; i < SPECTRUM_BAR_COUNT; i++) {
        const dist = Math.abs(i - mid) / mid; // 0 at centre, 1 at edges
        const scale = 1.0 - dist * 0.6; // edges are 60 % quieter
        nextLevels[i] = Math.min(1, level * scale * (0.85 + Math.random() * 0.3));
      }
      setSpectrumLevels(nextLevels);
    }).then((unlisten) => {
      nativeUnlistenRef.current = unlisten;
    });
  }, []);

  const stopNativeSpectrum = useCallback(() => {
    if (nativeUnlistenRef.current) {
      nativeUnlistenRef.current();
      nativeUnlistenRef.current = null;
    }
    setSpectrumLevels(SPECTRUM_ZERO_LEVELS);
  }, []);

  const stopRecording = useCallback(async () => {
    stopTimer();
    stopNativeSpectrum();

    // Handle native system audio capture stop
    console.log("[useAudioRecorder] stopRecording: nativeActive=%s, source=%s", nativeCaptureActiveRef.current, audioInputSource);
    if (nativeCaptureActiveRef.current) {
      try {
        const wavFilePath = await stopNativeSystemAudioCapture();
        console.log("[useAudioRecorder] Got WAV path:", wavFilePath);
        nativeCaptureActiveRef.current = false;
        nativeWavPathRef.current = wavFilePath;

        // If there's also a MediaRecorder running (mixed mode), stop it too
        const recorder = mediaRecorderRef.current;
        if (recorder && recorder.state !== "inactive") {
          recorder.stop();
        }

        // For pure system audio, convert file path to asset protocol URL
        // so the webview loads the WAV directly from disk (zero IPC overhead).
        if (audioInputSource === "system") {
          const assetUrl = convertFilePathToUrl(wavFilePath);
          console.log("[useAudioRecorder] Setting asset URL:", assetUrl);
          setAudioUrl((previous) => {
            revokeObjectUrlIfBlob(previous);
            return assetUrl;
          });
        }
        // For mixed mode, the MediaRecorder onstop handler sets the mic audio URL
      } catch (error) {
        nativeCaptureActiveRef.current = false;
        setErrorMessage(toErrorMessage(error, "Failed to stop system audio capture."));
      }

      clearStream();
      setStatus("stopped");
      return;
    }

    // Standard browser path
    const recorder = mediaRecorderRef.current;

    if (!recorder) {
      return;
    }

    stopRecorder(recorder);
    setStatus("stopped");
  }, [audioInputSource, clearStream, stopNativeSpectrum, stopTimer]);

  const pauseRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder?.state === "recording") {
      recorder.pause();
      stopTimer();
      setStatus("paused");
    }
  }, [stopTimer]);

  const resumeRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder?.state === "paused") {
      recorder.resume();
      startTimer();
      setStatus("recording");
    }
  }, [startTimer]);

  const saveRecording = useCallback(async () => {
    if (!audioUrl) {
      return;
    }

    try {
      setErrorMessage(null);

      const { getFileStorageService } = await import("@shared/services/createServices");
      const fileStorage = await getFileStorageService();

      const mimeType = recordedMimeTypeRef.current;
      const isWav = !!nativeWavPathRef.current;

      const extension = isWav
        ? "wav"
        : mimeType?.includes("ogg")
          ? "ogg"
          : mimeType?.includes("mp4")
            ? "mp4"
            : "webm";

      // Get the data to save
      let data: Uint8Array | Blob;

      if (nativeWavPathRef.current) {
        data = await fileStorage.readFile(nativeWavPathRef.current);
      } else if (recordedBlobRef.current) {
        data = recordedBlobRef.current;
      } else {
        setErrorMessage("No recording data available to save.");
        return;
      }

      const result = await fileStorage.saveFile(data, {
        defaultName: `recogni-audio.${extension}`,
        extensions: [extension],
        filterLabel: "Audio",
      });

      if (!result) {
        return;
      }
    } catch (error) {
      setErrorMessage(toErrorMessage(error, "Failed to save recording."));
    }
  }, [audioUrl]);

  const refreshAvailableMicrophones = useCallback(async () => {
    await refreshAvailableMicrophonesImpl({
      setAvailableMicrophones,
      setSelectedMicrophoneId,
      setErrorMessage,
    });
  }, []);

  const requestMicrophonePermission = useCallback(async (): Promise<boolean> => {
    return requestMicrophonePermissionImpl({
      isSupported,
      setStatus,
      setErrorMessage,
      setMicrophonePermission,
      onRefreshAvailableMicrophones: refreshAvailableMicrophones,
    });
  }, [isSupported, refreshAvailableMicrophones]);

  const getAudioStream = useCallback(async (): Promise<MediaStream> => {
    if (audioInputSource === "system") {
      return getSystemAudioStream();
    }

    if (audioInputSource === "mixed") {
      const systemStream = await getSystemAudioStream();
      const micStream = await getMicrophoneStream();
      microphoneStreamRef.current = micStream;
      return mixAudioStreams(systemStream, micStream);
    }

    return getMicrophoneStream();
  }, [audioInputSource, getMicrophoneStream, getSystemAudioStream, mixAudioStreams]);

  const startRecording = useCallback(async () => {
    const isNativeSystemOnly = IS_TAURI && audioInputSource === "system";
    const sourceUsesMicrophone = isMicrophoneSource(audioInputSource);

    if (!isSupported && !isNativeSystemOnly) {
      console.error("[startRecording] Not supported, aborting");
      setStatus("error");
      setErrorMessage("Audio recording is not supported on this device/browser.");
      return;
    }

    if (sourceUsesMicrophone && !isMicrophoneEnabled) {
      setStatus("error");
      setErrorMessage("Microphone is disabled. Enable it before recording.");
      return;
    }

    if (sourceUsesMicrophone && microphonePermission !== "granted") {
      const hasPermission = await requestMicrophonePermission();
      if (!hasPermission) {
        return;
      }
    }

    // Native system audio capture path (Tauri desktop)
    const useNativeSystemCapture = IS_TAURI && audioInputSource === "system";

    try {
      setErrorMessage(null);
      resetRecordingData();

      if (useNativeSystemCapture) {
        // Pure system audio: use native Rust capture only
        console.log("[useAudioRecorder] Starting native system audio capture...");
        await startNativeSystemAudioCapture();
        nativeCaptureActiveRef.current = true;

        // For real-time transcription on desktop, we also try to open a web
        // system-audio stream and feed it to Whisper. If it fails (picker
        // canceled / unsupported), native recording still continues.
        let hasRealtimeTranscriptionStream = false;
        try {
          const transcriptionStream = await getSystemAudioStream();
          streamRef.current = transcriptionStream;
          setRecordingStream(transcriptionStream);
          startSpectrumMonitor(transcriptionStream);
          hasRealtimeTranscriptionStream = true;
        } catch (transcriptionStreamError) {
          console.warn(
            "[useAudioRecorder] Real-time transcription stream unavailable for native system capture:",
            transcriptionStreamError,
          );
          setRecordingStream(null);
        }

        setStatus("recording");
        setDurationSeconds(0);
        startTimer();
        if (!hasRealtimeTranscriptionStream) {
          startNativeSpectrum();
        }
        return;
      }

      // Standard browser path
      const stream = await getAudioStream();
      startSpectrumMonitor(stream);

      if (audioInputSource === "microphone") {
        setMicrophonePermission("granted");
      }
      await refreshAvailableMicrophones();

      const mimeType = getSupportedMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      streamRef.current = stream;
      setRecordingStream(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      wireMediaRecorderHandlers({
        recorder,
        mimeType,
        chunksRef,
        recordedBlobRef,
        recordedMimeTypeRef,
        audioInputSource,
        setStatus,
        setErrorMessage,
        setRecordingStream,
        setAudioUrl,
        clearStream,
        stopTimer,
      });

      recorder.start(1000);
      console.log("[startRecording] MediaRecorder started with 1s timeslice, mimeType=%s", recorder.mimeType);
      setStatus("recording");
      setDurationSeconds(0);
      startTimer();
    } catch (error) {
      console.error("[startRecording] CATCH error:", error);
      setStatus("error");
      setErrorMessage(toErrorMessage(error, getPermissionErrorMessage(error)));
      stopTimer();
      stopNativeSpectrum();
      clearStream();
      if (nativeCaptureActiveRef.current) {
        stopNativeSystemAudioCapture().catch(() => {});
        nativeCaptureActiveRef.current = false;
      }
    }
  }, [
    audioInputSource,
    clearStream,
    getAudioStream,
    isMicrophoneEnabled,
    isSupported,
    microphonePermission,
    refreshAvailableMicrophones,
    requestMicrophonePermission,
    resetRecordingData,
    getSystemAudioStream,
    startNativeSpectrum,
    startSpectrumMonitor,
    startTimer,
    stopNativeSpectrum,
    stopTimer,
  ]);

  const toggleMicrophone = useCallback(async () => {
    if (isRecorderBusy(status)) {
      return;
    }

    if (audioInputSource === "system") {
      return;
    }

    if (isMicrophoneEnabled) {
      setIsMicrophoneEnabled(false);
      setErrorMessage(null);
      return;
    }

    const hasPermission = await requestMicrophonePermission();
    setIsMicrophoneEnabled(hasPermission);
  }, [audioInputSource, isMicrophoneEnabled, requestMicrophonePermission, status]);

  const selectMicrophone = useCallback((deviceId: string) => {
    setSelectedMicrophoneId(deviceId);
    setErrorMessage(null);
  }, []);

  const setAudioInputSource = useCallback((source: AudioInputSource) => {
    if (isRecorderBusy(status)) {
      return;
    }

    setAudioInputSourceState(source);
    setErrorMessage(null);
  }, [status]);

  const setDenoiseIntensity = useCallback((intensity: number) => {
    setDenoiseIntensityState(Math.max(0, Math.min(100, intensity)));
  }, []);

  useEffect(() => {
    return createPermissionAndDevicesSync({
      isSupported,
      permissionStatusRef,
      onRefreshAvailableMicrophones: refreshAvailableMicrophones,
      setMicrophonePermission,
    });
  }, [isSupported, refreshAvailableMicrophones]);

  useEffect(() => {
    return () => {
      stopTimer();
      clearStream();
      stopSpectrumMonitor();
      stopNativeSpectrum();
      if (audioUrl) {
        revokeObjectUrlIfBlob(audioUrl);
      }
    };
  }, [audioUrl, clearStream, stopNativeSpectrum, stopSpectrumMonitor, stopTimer]);

  return {
    status,
    durationSeconds,
    audioUrl,
    errorMessage,
    isSupported,
    isSystemAudioSupported,
    isMicrophoneEnabled,
    microphonePermission,
    availableMicrophones,
    selectedMicrophoneId,
    audioInputSource,
    spectrumLevels,
    recordingStream,
    denoiseEnabled,
    denoiseIntensity,
    normalizeEnabled,
    transcriptionEnabled,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    saveRecording,
    toggleMicrophone,
    requestMicrophonePermission,
    selectMicrophone,
    setAudioInputSource,
    setDenoiseEnabled,
    setDenoiseIntensity,
    setNormalizeEnabled,
    setTranscriptionEnabled,
  };
}
