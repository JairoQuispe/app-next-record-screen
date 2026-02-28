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
import { SPECTRUM_BAR_COUNT, SPECTRUM_ZERO_LEVELS, CANDIDATE_MIME_TYPES } from "../lib/constants";

const IS_TAURI = isTauriRuntime();

const IS_BROWSER =
  typeof window !== "undefined" &&
  typeof navigator !== "undefined" &&
  typeof MediaRecorder !== "undefined";

const IS_MEDIA_SUPPORTED =
  IS_BROWSER && !!navigator.mediaDevices?.getUserMedia;

function getSupportedMimeType(): string | undefined {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined") {
    return undefined;
  }

  return CANDIDATE_MIME_TYPES.find((mimeType) => MediaRecorder.isTypeSupported(mimeType));
}

function getPermissionErrorMessage(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError") {
      return "Permission denied. Enable microphone access in the browser/site settings.";
    }

    if (error.name === "NotFoundError") {
      return "No microphone device was found on this system.";
    }

    if (error.name === "NotReadableError") {
      return "Microphone is busy or blocked by another app.";
    }
  }

  return "Microphone permission denied or unavailable.";
}

const SYSTEM_AUDIO_UNAVAILABLE_DEFAULT_MESSAGE =
  "No audio track was received. In the picker, select a screen or tab and enable 'Also share system/tab audio' at the bottom.";

const SYSTEM_AUDIO_UNAVAILABLE_MESSAGES: Record<string, string> = {
  browser:
    "No tab audio was shared. Select a browser tab and check 'Also share tab audio' at the bottom of the picker.",
  window:
    "Window sharing does not include audio. Select the 'Entire Screen' tab in the picker and check 'Also share system audio'.",
  monitor:
    "No system audio was shared. Make sure 'Also share system audio' is checked at the bottom of the screen picker.",
};

function getSystemAudioUnavailableMessage(displaySurface: string | undefined): string {
  if (!displaySurface) {
    return SYSTEM_AUDIO_UNAVAILABLE_DEFAULT_MESSAGE;
  }

  return SYSTEM_AUDIO_UNAVAILABLE_MESSAGES[displaySurface] ?? SYSTEM_AUDIO_UNAVAILABLE_DEFAULT_MESSAGE;
}

function revokeObjectUrlIfBlob(url: string | null): void {
  if (url?.startsWith("blob:")) {
    URL.revokeObjectURL(url);
  }
}

function isRecorderBusy(status: RecorderStatus): boolean {
  return status === "recording" || status === "paused";
}

function isMicrophoneSource(source: AudioInputSource): boolean {
  return source === "microphone" || source === "mixed";
}

function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function stopMediaStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}

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

    mixSourceNodesRef.current.forEach((node) => node.disconnect());
    mixSourceNodesRef.current = [];
    mixDestinationRef.current = null;

    if (mixAudioContextRef.current) {
      void mixAudioContextRef.current.close();
      mixAudioContextRef.current = null;
    }
  }, [stopSpectrumMonitor]);

  const getMicrophoneStream = useCallback(async (): Promise<MediaStream> => {
    const audioConstraints: MediaTrackConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    };

    if (selectedMicrophoneId) {
      audioConstraints.deviceId = { exact: selectedMicrophoneId };
    }

    return navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
  }, [selectedMicrophoneId]);

  const getSystemAudioStream = useCallback(async (): Promise<MediaStream> => {
    if (!isSystemAudioSupported) {
      throw new Error("System audio capture is not supported in this browser/runtime.");
    }

    // Request screen share with system audio enabled.
    // To capture system-wide audio in Chrome/Edge:
    //   - systemAudio: "include" allows capturing audio from the entire system
    //   - preferCurrentTab: false so user picks a screen/tab (not biased to current tab)
    //   - video is required by getDisplayMedia but we only need audio
    //   - The user MUST select "Share system audio" / "Share tab audio" in the picker
    const displayMediaOptions: DisplayMediaStreamOptions & Record<string, unknown> = {
      video: true,
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        suppressLocalAudioPlayback: false,
      } as MediaTrackConstraints,
      systemAudio: "include",
      selfBrowserSurface: "include",
      preferCurrentTab: false,
      surfaceSwitching: "include",
      monitorTypeSurfaces: "include",
    };

    console.log("[getSystemAudioStream] Requesting getDisplayMedia with system audio...");

    const displayStream = await navigator.mediaDevices.getDisplayMedia(displayMediaOptions);
    displayStreamRef.current = displayStream;

    const audioTracks = displayStream.getAudioTracks();
    const videoTracks = displayStream.getVideoTracks();

    console.log(
      "[getSystemAudioStream] Got stream: audioTracks=%d, videoTracks=%d",
      audioTracks.length,
      videoTracks.length,
    );

    if (audioTracks.length === 0) {
      const videoTrack = videoTracks[0];
      const displaySurface = (videoTrack?.getSettings() as MediaTrackSettings & {
        displaySurface?: string;
      })?.displaySurface;

      console.warn("[getSystemAudioStream] No audio tracks! displaySurface=%s", displaySurface);

      displayStream.getTracks().forEach((track) => track.stop());
      displayStreamRef.current = null;
      throw new Error(getSystemAudioUnavailableMessage(displaySurface));
    }

    // DO NOT stop video tracks here.
    // In many browsers, stopping the video track from getDisplayMedia kills the
    // entire capture session, including audio. We keep the displayStream alive
    // in displayStreamRef and clean up everything in clearStream() when recording stops.
    // The video track stays alive but consumes minimal resources.
    const audioOnlyStream = new MediaStream(audioTracks);

    // Monitor track health
    audioTracks[0].onended = () => {
      console.warn("[getSystemAudioStream] Audio track ENDED unexpectedly");
    };

    console.log("[getSystemAudioStream] Audio stream ready (keeping video track alive). Settings:",
      audioTracks[0]?.getSettings(),
    );

    return audioOnlyStream;
  }, [isSystemAudioSupported]);

  const mixAudioStreams = useCallback(
    async (systemStream: MediaStream, micStream: MediaStream): Promise<MediaStream> => {
      if (typeof window === "undefined" || typeof window.AudioContext === "undefined") {
        throw new Error("Web Audio API is not available in this runtime.");
      }

      const audioContext = new window.AudioContext();
      const destination = audioContext.createMediaStreamDestination();

      const systemSource = audioContext.createMediaStreamSource(systemStream);
      const micSource = audioContext.createMediaStreamSource(micStream);

      systemSource.connect(destination);
      micSource.connect(destination);

      mixAudioContextRef.current = audioContext;
      mixDestinationRef.current = destination;
      mixSourceNodesRef.current = [systemSource, micSource];

      return destination.stream;
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

    if (recorder.state !== "inactive") {
      try {
        recorder.requestData();
      } catch {
        // Some browsers can throw if requestData is called at an invalid time.
      }
      recorder.stop();
    }
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

    if (!IS_TAURI) {
      return;
    }

    try {
      setErrorMessage(null);

      const { save } = await import("@tauri-apps/plugin-dialog");
      const { readFile, writeFile } = await import("@tauri-apps/plugin-fs");

      const mimeType = recordedMimeTypeRef.current;
      const isWav = !!nativeWavPathRef.current;

      const extension = isWav
        ? "wav"
        : mimeType?.includes("ogg")
          ? "ogg"
          : mimeType?.includes("mp4")
            ? "mp4"
            : "webm";

      const outputPath = await save({
        defaultPath: `recogni-audio.${extension}`,
        filters: [{ name: "Audio", extensions: [extension] }],
      });

      if (!outputPath) {
        return;
      }

      if (nativeWavPathRef.current) {
        const contents = await readFile(nativeWavPathRef.current);
        await writeFile(outputPath, contents);
        return;
      }

      if (recordedBlobRef.current) {
        const buffer = await recordedBlobRef.current.arrayBuffer();
        const contents = new Uint8Array(buffer);
        await writeFile(outputPath, contents);
        return;
      }

      setErrorMessage("No recording data available to save.");
    } catch (error) {
      setErrorMessage(toErrorMessage(error, "Failed to save recording."));
    }
  }, [audioUrl]);

  const refreshAvailableMicrophones = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      return;
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const microphones = devices
        .filter((device) => device.kind === "audioinput")
        .map((device, index) => ({
          deviceId: device.deviceId,
          label: device.label || `Microphone ${index + 1}`,
        }));

      setAvailableMicrophones(microphones);
      setSelectedMicrophoneId((current) => {
        if (current && microphones.some((microphone) => microphone.deviceId === current)) {
          return current;
        }

        return microphones[0]?.deviceId ?? null;
      });
    } catch {
      setErrorMessage("Unable to list microphones on this device.");
    }
  }, []);

  const requestMicrophonePermission = useCallback(async (): Promise<boolean> => {
    if (!isSupported) {
      setStatus("error");
      setErrorMessage("Audio recording is not supported on this device/browser.");
      return false;
    }

    try {
      setErrorMessage(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicrophonePermission("granted");
      await refreshAvailableMicrophones();
      stream.getTracks().forEach((track) => track.stop());
      return true;
    } catch (error) {
      setMicrophonePermission("denied");
      setStatus("error");
      setErrorMessage(getPermissionErrorMessage(error));
      return false;
    }
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

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        if (chunksRef.current.length === 0) {
          setStatus("error");
          setErrorMessage("No audio data was captured. Verify permissions and selected audio source.");
          clearStream();
          return;
        }

        const actualMimeType = recorder.mimeType || mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: actualMimeType });
        const url = URL.createObjectURL(blob);

        recordedBlobRef.current = blob;
        recordedMimeTypeRef.current = actualMimeType;

        setAudioUrl((previous) => {
          revokeObjectUrlIfBlob(previous);
          return url;
        });

        clearStream();
      };

      recorder.onerror = () => {
        setStatus("error");
        setErrorMessage(
          audioInputSource === "system"
            ? "Failed to capture system audio. The shared screen/tab may have been closed."
            : "Failed to capture audio. Please check microphone permissions.",
        );
        stopTimer();
        setRecordingStream(null);
        clearStream();
      };

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
    if (!isSupported) {
      setMicrophonePermission("unsupported");
      return;
    }

    let isCancelled = false;

    const syncPermissionAndDevices = async () => {
      await refreshAvailableMicrophones();

      if (!navigator.permissions?.query) {
        if (!isCancelled) {
          setMicrophonePermission("unknown");
        }
        return;
      }

      try {
        const permissionStatus = await navigator.permissions.query({
          name: "microphone" as PermissionName,
        });

        if (isCancelled) {
          return;
        }

        permissionStatusRef.current = permissionStatus;
        setMicrophonePermission(permissionStatus.state);
        permissionStatus.onchange = () => {
          setMicrophonePermission(permissionStatus.state);
        };
      } catch {
        if (!isCancelled) {
          setMicrophonePermission("unknown");
        }
      }
    };

    syncPermissionAndDevices();

    const handleDeviceChange = () => {
      void refreshAvailableMicrophones();
    };

    navigator.mediaDevices?.addEventListener?.("devicechange", handleDeviceChange);

    return () => {
      isCancelled = true;
      if (permissionStatusRef.current) {
        permissionStatusRef.current.onchange = null;
      }
      navigator.mediaDevices?.removeEventListener?.("devicechange", handleDeviceChange);
    };
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
