import { useCallback, useRef, useEffect, useState } from "react";
import { useMicrophonePreview } from "./useMicrophonePreview";
import { useTranscription } from "./useTranscription";
import { useSpeakerDiarization } from "./useSpeakerDiarization";
import { useAudioSettings } from "./useAudioSettings";
import { useNoiseSuppression } from "./useNoiseSuppression";
import { useCloudTranscription } from "./useCloudTranscription";
import type { AudioRecorderState, AudioRecorderActions } from "./types";
import type { TranscriptionTab } from "../ui/setup/TranscriptionPanel";

interface UseSetupScreenOptions {
  recorder: AudioRecorderState & AudioRecorderActions;
  nativeWavPath?: string | null;
}

export function useSetupScreen({ recorder, nativeWavPath }: UseSetupScreenOptions) {
  const {
    isSupported, isSystemAudioSupported, errorMessage, microphonePermission,
    availableMicrophones, selectedMicrophoneId, audioInputSource, status,
    durationSeconds, audioUrl, spectrumLevels, recordingStream,
    denoiseEnabled, denoiseIntensity, normalizeEnabled, transcriptionEnabled,
    requestMicrophonePermission, selectMicrophone, setAudioInputSource,
    startRecording, stopRecording, pauseRecording, resumeRecording,
    saveRecording, setDenoiseEnabled, setDenoiseIntensity, setNormalizeEnabled, setTranscriptionEnabled,
  } = recorder;

  // ── UI state ──
  const [activeTab, setActiveTab] = useState<TranscriptionTab>("live");
  const [showConfigPanel, setShowConfigPanel] = useState(false);
  const [showGearPanel, setShowGearPanel] = useState(false);
  const [playbackMode, setPlaybackMode] = useState<"original" | "enhanced">("enhanced");

  // ── Hooks ──
  const noiseSuppression = useNoiseSuppression();
  const cloudTranscription = useCloudTranscription();

  const { hydrate: hydrateSettings } = useAudioSettings({
    values: { denoiseEnabled, denoiseIntensity, normalizeEnabled, transcriptionEnabled },
    setters: { setDenoiseEnabled, setDenoiseIntensity, setNormalizeEnabled, setTranscriptionEnabled },
  });

  useEffect(() => { hydrateSettings(); }, [hydrateSettings]);

  // ── Derived state ──
  const isMicChecked = audioInputSource === "microphone" || audioInputSource === "mixed";
  const isSystemChecked = audioInputSource === "system" || audioInputSource === "mixed";
  const usesMicrophone = audioInputSource === "microphone" || audioInputSource === "mixed";
  const shouldShowPermissionAction =
    isSupported && usesMicrophone &&
    (microphonePermission === "prompt" || microphonePermission === "denied");

  const isRecording = status === "recording";
  const isPaused = status === "paused";
  const isStopped = status === "stopped";
  const isIdle = status === "idle" || status === "error";
  const isBusy = isRecording || isPaused;

  // ── Mic preview & visualizer levels ──
  const previewEnabled = !isBusy && usesMicrophone && microphonePermission === "granted";
  const { levels: micLevels, isActive: isMicPreviewActive } = useMicrophonePreview(
    previewEnabled, selectedMicrophoneId,
  );
  const vizLevels = isBusy ? spectrumLevels : micLevels;
  const vizActive = isBusy || isMicPreviewActive;

  // ── Transcription & diarization ──
  const transcription = useTranscription(isBusy, recordingStream, "es");
  const diarization = useSpeakerDiarization("es");
  const prevStatusRef = useRef(status);

  const hasExtraContent =
    isBusy || Boolean(transcription.finalText) || diarization.status !== "idle" ||
    Boolean(audioUrl) || !isSupported || Boolean(errorMessage);

  // ── Auto-trigger diarization + noise suppression on stop ──
  useEffect(() => {
    if (prevStatusRef.current === "recording" || prevStatusRef.current === "paused") {
      if (status === "stopped" && audioUrl) {
        diarization.startDiarization(audioUrl);
        setActiveTab("speakers");
        if (denoiseEnabled && denoiseIntensity > 0) {
          noiseSuppression.enhance(audioUrl, nativeWavPath ?? null, denoiseIntensity, normalizeEnabled);
        }
      }
    }
    prevStatusRef.current = status;
  }, [status, audioUrl]);

  // ── Source toggles (stable callbacks for memoized children) ──
  const toggleMic = useCallback(() => {
    if (isBusy) return;
    if (isMicChecked && isSystemChecked) { setAudioInputSource("system"); return; }
    if (!isMicChecked && isSystemChecked) { setAudioInputSource("mixed"); return; }
    setAudioInputSource("microphone");
  }, [isBusy, isMicChecked, isSystemChecked, setAudioInputSource]);

  const toggleSystem = useCallback(() => {
    if (isBusy || !isSystemAudioSupported) return;
    if (isMicChecked && isSystemChecked) { setAudioInputSource("microphone"); return; }
    if (isMicChecked && !isSystemChecked) { setAudioInputSource("mixed"); return; }
    setAudioInputSource("system");
  }, [isBusy, isSystemAudioSupported, isMicChecked, isSystemChecked, setAudioInputSource]);

  // ── Panel toggles (stable callbacks) ──
  const toggleConfigPanel = useCallback(() => setShowConfigPanel((v) => !v), []);
  const toggleGearPanel = useCallback(() => { setShowGearPanel((v) => !v); setShowConfigPanel(false); }, []);

  // ── Status label ──
  const statusLabel = isRecording ? "RECORDING LIVE" : isPaused ? "PAUSED" : isStopped ? "STOPPED" : "STANDBY";

  return {
    // recorder passthrough
    isSupported, isSystemAudioSupported, errorMessage, durationSeconds, audioUrl,
    availableMicrophones, selectedMicrophoneId,
    denoiseEnabled, denoiseIntensity, normalizeEnabled, transcriptionEnabled,
    setDenoiseEnabled, setDenoiseIntensity, setNormalizeEnabled, setTranscriptionEnabled,
    requestMicrophonePermission, selectMicrophone,
    startRecording, stopRecording, pauseRecording, resumeRecording, saveRecording,
    // derived
    isMicChecked, isSystemChecked, usesMicrophone, shouldShowPermissionAction,
    isRecording, isPaused, isStopped, isIdle, isBusy,
    hasExtraContent, statusLabel,
    // visualizer
    vizLevels, vizActive,
    // panels
    showConfigPanel, showGearPanel, toggleConfigPanel, toggleGearPanel,
    activeTab, setActiveTab,
    playbackMode, setPlaybackMode,
    // source toggles
    toggleMic, toggleSystem,
    // sub-hooks
    transcription, diarization, noiseSuppression, cloudTranscription,
  } as const;
}
