import { useEffect, useState } from "react";
import { useAudioRecorder } from "../model/useAudioRecorder";
import { SetupScreen } from "./SetupScreen";
import "./audio-recorder.css";

export function AudioRecorderPage() {
  const recorder = useAudioRecorder();
  const [animateIn, setAnimateIn] = useState(false);

  useEffect(() => {
    const frameId = requestAnimationFrame(() => {
      setAnimateIn(true);
    });

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, []);

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
        status: recorder.status,
        durationSeconds: recorder.durationSeconds,
        audioUrl: recorder.audioUrl,
        spectrumLevels: recorder.spectrumLevels,
        recordingStream: recorder.recordingStream,
      }}
      actions={{
        requestMicrophonePermission: recorder.requestMicrophonePermission,
        selectMicrophone: recorder.selectMicrophone,
        setAudioInputSource: recorder.setAudioInputSource,
        startRecording: recorder.startRecording,
        stopRecording: recorder.stopRecording,
        pauseRecording: recorder.pauseRecording,
        resumeRecording: recorder.resumeRecording,
        saveRecording: recorder.saveRecording,
      }}
      animateIn={animateIn}
    />
  );
}
