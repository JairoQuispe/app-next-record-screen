export type RecorderStatus = "idle" | "recording" | "paused" | "stopped" | "error";
export type AudioInputSource = "microphone" | "system" | "mixed";

export type MicrophonePermissionStatus = PermissionState | "unknown" | "unsupported";

export interface MicrophoneDeviceOption {
  deviceId: string;
  label: string;
}

export interface AudioRecorderState {
  status: RecorderStatus;
  durationSeconds: number;
  audioUrl: string | null;
  errorMessage: string | null;
  isSupported: boolean;
  isSystemAudioSupported: boolean;
  isMicrophoneEnabled: boolean;
  microphonePermission: MicrophonePermissionStatus;
  availableMicrophones: MicrophoneDeviceOption[];
  selectedMicrophoneId: string | null;
  audioInputSource: AudioInputSource;
  spectrumLevels: number[];
}

export interface AudioRecorderActions {
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  pauseRecording: () => void;
  resumeRecording: () => void;
  toggleMicrophone: () => Promise<void>;
  requestMicrophonePermission: () => Promise<boolean>;
  selectMicrophone: (deviceId: string) => void;
  setAudioInputSource: (source: AudioInputSource) => void;
}
