import { useCallback, useEffect, useState } from "react";
import { useAudioRecorder } from "../model/useAudioRecorder";
import { SetupScreen } from "./SetupScreen";
import { RecordingScreen } from "./RecordingScreen";
import "./audio-recorder.css";

export function AudioRecorderPage() {
  const recorder = useAudioRecorder();
  const [isSetupComplete, setIsSetupComplete] = useState(false);
  const [animateIn, setAnimateIn] = useState(false);

  useEffect(() => {
    const frameId = requestAnimationFrame(() => {
      setAnimateIn(true);
    });

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, []);

  const setupState = {
    isSupported: recorder.isSupported,
    isSystemAudioSupported: recorder.isSystemAudioSupported,
    errorMessage: recorder.errorMessage,
    microphonePermission: recorder.microphonePermission,
    availableMicrophones: recorder.availableMicrophones,
    selectedMicrophoneId: recorder.selectedMicrophoneId,
    audioInputSource: recorder.audioInputSource,
  };

  const setupActions = {
    requestMicrophonePermission: recorder.requestMicrophonePermission,
    selectMicrophone: recorder.selectMicrophone,
    setAudioInputSource: recorder.setAudioInputSource,
  };

  const recordingState = {
    status: recorder.status,
    durationSeconds: recorder.durationSeconds,
    audioUrl: recorder.audioUrl,
    isMicrophoneEnabled: recorder.isMicrophoneEnabled,
    audioInputSource: recorder.audioInputSource,
    spectrumLevels: recorder.spectrumLevels,
  };

  const recordingActions = {
    startRecording: recorder.startRecording,
    stopRecording: recorder.stopRecording,
    pauseRecording: recorder.pauseRecording,
    resumeRecording: recorder.resumeRecording,
    saveRecording: recorder.saveRecording,
  };

  const handleContinue = useCallback(() => setIsSetupComplete(true), []);
  const handleBackToSetup = useCallback(() => setIsSetupComplete(false), []);

  if (!isSetupComplete) {
    return (
      <SetupScreen
        state={setupState}
        actions={setupActions}
        animateIn={animateIn}
        onContinue={handleContinue}
      />
    );
  }

  return (
    <RecordingScreen
      state={recordingState}
      actions={recordingActions}
      animateIn={animateIn}
      onBackToSetup={handleBackToSetup}
    />
  );
}
