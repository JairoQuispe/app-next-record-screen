export type RecorderStatus = "idle" | "recording" | "paused" | "stopped" | "error";
export type AudioInputSource = "microphone" | "system" | "mixed";

export type MicrophonePermissionStatus = PermissionState | "unknown" | "unsupported";

export interface SpeakerSegment {
  id: string;
  speakerId: string;
  startMs: number;
  endMs: number;
  text: string;
  confidence?: number;
}

export interface SpeakerStats {
  speakerId: string;
  talkTimeMs: number;
  turns: number;
  wordCount: number;
}

export interface ParticipantSummary {
  speakerId: string;
  headline: string;
  bulletPoints: string[];
  keywords: string[];
}

export type DiarizationStatus = "idle" | "processing" | "done" | "error";

export interface DiarizationState {
  status: DiarizationStatus;
  progress: number;
  stage: string;
  segments: SpeakerSegment[];
  speakerStats: SpeakerStats[];
  participantSummaries: ParticipantSummary[];
  error: string | null;
}

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
  recordingStream: MediaStream | null;
  denoiseEnabled: boolean;
  denoiseIntensity: number;
  normalizeEnabled: boolean;
}

export interface AudioRecorderActions {
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  pauseRecording: () => void;
  resumeRecording: () => void;
  saveRecording: () => Promise<void>;
  toggleMicrophone: () => Promise<void>;
  requestMicrophonePermission: () => Promise<boolean>;
  selectMicrophone: (deviceId: string) => void;
  setAudioInputSource: (source: AudioInputSource) => void;
  setDenoiseEnabled: (enabled: boolean) => void;
  setDenoiseIntensity: (intensity: number) => void;
  setNormalizeEnabled: (enabled: boolean) => void;
}
