import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { isHallucination, mergeWithLastSegment } from "./transcriptionText";

interface TranscriptionStateMachineOptions {
  setIsProcessing: Dispatch<SetStateAction<boolean>>;
  setInterimText: Dispatch<SetStateAction<string>>;
  setIsModelLoading: Dispatch<SetStateAction<boolean>>;
  setFinalText: Dispatch<SetStateAction<string>>;
  isChunkInFlightRef: MutableRefObject<boolean>;
  lastContextRef: MutableRefObject<string>;
  clearInferenceTimeout: () => void;
}

export function createTranscriptionStateMachine({
  setIsProcessing,
  setInterimText,
  setIsModelLoading,
  setFinalText,
  isChunkInFlightRef,
  lastContextRef,
  clearInferenceTimeout,
}: TranscriptionStateMachineOptions) {
  const beginChunkProcessing = () => {
    setIsProcessing(true);
    setInterimText("Transcribiendo...");
    isChunkInFlightRef.current = true;
  };

  const endChunkProcessing = (clearModelLoading = false) => {
    setIsProcessing(false);
    isChunkInFlightRef.current = false;
    setInterimText("");
    if (clearModelLoading) {
      setIsModelLoading(false);
    }
    clearInferenceTimeout();
  };

  const appendFinalText = (text?: string) => {
    if (!text || !text.trim() || isHallucination(text)) return;

    setFinalText((prev) => {
      const next = mergeWithLastSegment(prev, text);
      lastContextRef.current = next.split("\n").slice(-3).join(" ");
      return next;
    });
  };

  return {
    beginChunkProcessing,
    endChunkProcessing,
    appendFinalText,
  };
}
