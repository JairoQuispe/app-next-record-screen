import type { AudioInputSource, RecorderStatus } from "./types";
import { CANDIDATE_MIME_TYPES } from "../lib/constants";

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

export function getSupportedMimeType(): string | undefined {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined") {
    return undefined;
  }

  return CANDIDATE_MIME_TYPES.find((mimeType) => MediaRecorder.isTypeSupported(mimeType));
}

export function getPermissionErrorMessage(error: unknown): string {
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

export function getSystemAudioUnavailableMessage(displaySurface: string | undefined): string {
  if (!displaySurface) {
    return SYSTEM_AUDIO_UNAVAILABLE_DEFAULT_MESSAGE;
  }

  return SYSTEM_AUDIO_UNAVAILABLE_MESSAGES[displaySurface] ?? SYSTEM_AUDIO_UNAVAILABLE_DEFAULT_MESSAGE;
}

export function revokeObjectUrlIfBlob(url: string | null): void {
  if (url?.startsWith("blob:")) {
    URL.revokeObjectURL(url);
  }
}

export function isRecorderBusy(status: RecorderStatus): boolean {
  return status === "recording" || status === "paused";
}

export function isMicrophoneSource(source: AudioInputSource): boolean {
  return source === "microphone" || source === "mixed";
}

export function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function stopMediaStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}
