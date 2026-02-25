import { useState, useEffect } from "react";
import { useAudioRecorder } from "../model/useAudioRecorder";
import { SetupScreen } from "./SetupScreen";
import { RecordingScreen } from "./RecordingScreen";
import "./audio-recorder.css";

export function AudioRecorderPage() {
  const recorder = useAudioRecorder();
  const [isSetupComplete, setIsSetupComplete] = useState(false);
  const [animateIn, setAnimateIn] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => {
      setAnimateIn(true);
    });
  }, []);

  if (!isSetupComplete) {
    return (
      <SetupScreen
        state={{
          isSupported: recorder.isSupported,
          isSystemAudioSupported: recorder.isSystemAudioSupported,
          errorMessage: recorder.errorMessage,
          microphonePermission: recorder.microphonePermission,
          availableMicrophones: recorder.availableMicrophones,
          selectedMicrophoneId: recorder.selectedMicrophoneId,
          audioInputSource: recorder.audioInputSource,
        }}
        actions={{
          requestMicrophonePermission: recorder.requestMicrophonePermission,
          selectMicrophone: recorder.selectMicrophone,
          setAudioInputSource: recorder.setAudioInputSource,
        }}
        animateIn={animateIn}
        onContinue={() => setIsSetupComplete(true)}
      />
    );
  }

  return (
    <RecordingScreen
      state={{
        status: recorder.status,
        durationSeconds: recorder.durationSeconds,
        audioUrl: recorder.audioUrl,
        isMicrophoneEnabled: recorder.isMicrophoneEnabled,
        audioInputSource: recorder.audioInputSource,
        spectrumLevels: recorder.spectrumLevels,
      }}
      actions={{
        startRecording: recorder.startRecording,
        stopRecording: recorder.stopRecording,
        pauseRecording: recorder.pauseRecording,
        resumeRecording: recorder.resumeRecording,
      }}
      animateIn={animateIn}
      onBackToSetup={() => setIsSetupComplete(false)}
    />
  );
}
