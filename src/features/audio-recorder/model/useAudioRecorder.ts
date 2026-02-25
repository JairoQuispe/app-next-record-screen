import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AudioInputSource,
  AudioRecorderActions,
  AudioRecorderState,
  MicrophoneDeviceOption,
  MicrophonePermissionStatus,
  RecorderStatus,
} from "./types";

const CANDIDATE_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
  "audio/ogg",
];

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

function getSystemAudioUnavailableMessage(displaySurface: string | undefined): string {
  if (displaySurface === "browser") {
    return "No tab audio was shared. In the picker, select a browser tab and enable 'Share tab audio'.";
  }

  if (displaySurface === "window" || displaySurface === "monitor") {
    return "System audio was not provided for the selected window/screen. Try sharing a browser tab and enable 'Share tab audio'.";
  }

  return "No system audio track was shared. In the picker, enable 'Share tab audio' or equivalent option.";
}

export function useAudioRecorder(): AudioRecorderState & AudioRecorderActions {
  const SPECTRUM_BAR_COUNT = 28;

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
  const [spectrumLevels, setSpectrumLevels] = useState<number[]>(() =>
    Array.from({ length: SPECTRUM_BAR_COUNT }, () => 0),
  );

  const streamRef = useRef<MediaStream | null>(null);
  const displayStreamRef = useRef<MediaStream | null>(null);
  const microphoneStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const permissionStatusRef = useRef<PermissionStatus | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const spectrumTimerRef = useRef<number | null>(null);
  const mixDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const mixSourceNodesRef = useRef<MediaStreamAudioSourceNode[]>([]);

  const isSupported = useMemo(() => {
    return (
      typeof window !== "undefined" &&
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia &&
      typeof MediaRecorder !== "undefined"
    );
  }, []);

  const isSystemAudioSupported = useMemo(() => {
    return (
      typeof window !== "undefined" &&
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices?.getDisplayMedia &&
      typeof MediaRecorder !== "undefined"
    );
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

    if (audioContextRef.current) {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }

    mixDestinationRef.current = null;
    mixSourceNodesRef.current = [];

    setSpectrumLevels(Array.from({ length: SPECTRUM_BAR_COUNT }, () => 0));
  }, [SPECTRUM_BAR_COUNT]);

  const startSpectrumMonitor = useCallback(
    (stream: MediaStream) => {
      stopSpectrumMonitor();

      if (typeof window === "undefined" || typeof window.AudioContext === "undefined") {
        return;
      }

      const audioContext = new window.AudioContext();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);
      const frequencyData = new Uint8Array(analyser.frequencyBinCount);

      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      sourceNodeRef.current = source;

      spectrumTimerRef.current = window.setInterval(() => {
        analyser.getByteFrequencyData(frequencyData);
        const bucketSize = Math.floor(frequencyData.length / SPECTRUM_BAR_COUNT);
        const nextLevels: number[] = [];

        for (let bucketIndex = 0; bucketIndex < SPECTRUM_BAR_COUNT; bucketIndex += 1) {
          const start = bucketIndex * bucketSize;
          const end = bucketIndex === SPECTRUM_BAR_COUNT - 1 ? frequencyData.length : start + bucketSize;
          let sum = 0;

          for (let i = start; i < end; i += 1) {
            sum += frequencyData[i];
          }

          const avg = end > start ? sum / (end - start) : 0;
          nextLevels.push(avg / 255);
        }

        setSpectrumLevels(nextLevels);
      }, 70);
    },
    [SPECTRUM_BAR_COUNT, stopSpectrumMonitor],
  );

  const clearStream = useCallback(() => {
    stopSpectrumMonitor();

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (displayStreamRef.current) {
      displayStreamRef.current.getTracks().forEach((track) => track.stop());
      displayStreamRef.current = null;
    }

    if (microphoneStreamRef.current) {
      microphoneStreamRef.current.getTracks().forEach((track) => track.stop());
      microphoneStreamRef.current = null;
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

    const displayMediaOptions = {
      video: {
        frameRate: 30,
      },
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        suppressLocalAudioPlayback: false,
      },
      systemAudio: "include",
      selfBrowserSurface: "include",
      preferCurrentTab: true,
      surfaceSwitching: "include",
    } as MediaStreamConstraints & Record<string, unknown>;

    const displayStream = await navigator.mediaDevices.getDisplayMedia(displayMediaOptions);
    displayStreamRef.current = displayStream;

    const audioTracks = displayStream.getAudioTracks();
    if (audioTracks.length === 0) {
      const videoTrack = displayStream.getVideoTracks()[0];
      const displaySurface = (videoTrack?.getSettings() as MediaTrackSettings & {
        displaySurface?: string;
      })?.displaySurface;
      displayStream.getTracks().forEach((track) => track.stop());
      displayStreamRef.current = null;
      throw new Error(getSystemAudioUnavailableMessage(displaySurface));
    }

    displayStream.getVideoTracks().forEach((track) => track.stop());
    return new MediaStream(audioTracks);
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

      audioContextRef.current = audioContext;
      mixDestinationRef.current = destination;
      mixSourceNodesRef.current = [systemSource, micSource];

      return destination.stream;
    },
    [],
  );

  const resetRecordingData = useCallback(() => {
    chunksRef.current = [];
    setDurationSeconds(0);
    setAudioUrl((previous) => {
      if (previous) {
        URL.revokeObjectURL(previous);
      }
      return null;
    });
  }, []);

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;

    if (!recorder) {
      return;
    }

    if (recorder.state !== "inactive") {
      recorder.stop();
    }

    stopTimer();
    clearStream();
    setStatus("stopped");
  }, [clearStream, stopTimer]);

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
    if (!isSupported) {
      setStatus("error");
      setErrorMessage("Audio recording is not supported on this device/browser.");
      return;
    }

    if ((audioInputSource === "microphone" || audioInputSource === "mixed") && !isMicrophoneEnabled) {
      setStatus("error");
      setErrorMessage("Microphone is disabled. Enable it before recording.");
      return;
    }

    if ((audioInputSource === "microphone" || audioInputSource === "mixed") && microphonePermission !== "granted") {
      const hasPermission = await requestMicrophonePermission();
      if (!hasPermission) {
        return;
      }
    }

    try {
      setErrorMessage(null);
      resetRecordingData();

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
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const actualMimeType = recorder.mimeType || mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: actualMimeType });
        const url = URL.createObjectURL(blob);

        setAudioUrl((previous) => {
          if (previous) {
            URL.revokeObjectURL(previous);
          }
          return url;
        });

        clearStream();
      };

      recorder.onerror = () => {
        setStatus("error");
        setErrorMessage("Failed to capture audio. Please check microphone permissions.");
        stopTimer();
        clearStream();
      };

      recorder.start();
      setStatus("recording");
      setDurationSeconds(0);
      startTimer();
    } catch (error) {
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : getPermissionErrorMessage(error));
      stopTimer();
      clearStream();
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
    startTimer,
    stopTimer,
  ]);

  const toggleMicrophone = useCallback(async () => {
    if (status === "recording" || status === "paused") {
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
    if (status === "recording" || status === "paused") {
      return;
    }

    setAudioInputSourceState(source);
    setErrorMessage(null);
  }, [status]);

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
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl, clearStream, stopSpectrumMonitor, stopTimer]);

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
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    toggleMicrophone,
    requestMicrophonePermission,
    selectMicrophone,
    setAudioInputSource,
  };
}
