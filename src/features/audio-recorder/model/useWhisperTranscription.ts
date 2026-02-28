/**
 * @deprecated Use `useTranscription` instead — this is a thin compatibility wrapper.
 */
import { useTranscription } from "./useTranscription";
import type { TranscriptionState, TranscriptionActions } from "../lib/transcription/types";

export type WhisperTranscriptionState = Omit<TranscriptionState, "activeDevice" | "activeBackend">;
export type WhisperTranscriptionActions = TranscriptionActions;

export function useWhisperTranscription(
  enabled: boolean,
  stream: MediaStream | null,
  language: string = "es",
): WhisperTranscriptionState & WhisperTranscriptionActions {
  const { activeDevice: _, activeBackend: __, ...rest } = useTranscription(enabled, stream, language, "moonshine-local");
  return rest;
}
