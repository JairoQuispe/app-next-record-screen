import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { AudioInputSource, RecorderStatus } from "./types";
import { revokeObjectUrlIfBlob } from "./audioRecorderHelpers";

interface WireMediaRecorderHandlersOptions {
  recorder: MediaRecorder;
  mimeType: string | undefined;
  chunksRef: MutableRefObject<Blob[]>;
  recordedBlobRef: MutableRefObject<Blob | null>;
  recordedMimeTypeRef: MutableRefObject<string | null>;
  audioInputSource: AudioInputSource;
  setStatus: Dispatch<SetStateAction<RecorderStatus>>;
  setErrorMessage: Dispatch<SetStateAction<string | null>>;
  setRecordingStream: Dispatch<SetStateAction<MediaStream | null>>;
  setAudioUrl: Dispatch<SetStateAction<string | null>>;
  clearStream: () => void;
  stopTimer: () => void;
}

export function wireMediaRecorderHandlers({
  recorder,
  mimeType,
  chunksRef,
  recordedBlobRef,
  recordedMimeTypeRef,
  audioInputSource,
  setStatus,
  setErrorMessage,
  setRecordingStream,
  setAudioUrl,
  clearStream,
  stopTimer,
}: WireMediaRecorderHandlersOptions): void {
  recorder.ondataavailable = (event: BlobEvent) => {
    if (event.data.size > 0) {
      chunksRef.current.push(event.data);
    }
  };

  recorder.onstop = () => {
    if (chunksRef.current.length === 0) {
      setStatus("error");
      setErrorMessage("No audio data was captured. Verify permissions and selected audio source.");
      clearStream();
      return;
    }

    const actualMimeType = recorder.mimeType || mimeType || "audio/webm";
    const blob = new Blob(chunksRef.current, { type: actualMimeType });
    const url = URL.createObjectURL(blob);

    recordedBlobRef.current = blob;
    recordedMimeTypeRef.current = actualMimeType;

    setAudioUrl((previous) => {
      revokeObjectUrlIfBlob(previous);
      return url;
    });

    clearStream();
  };

  recorder.onerror = () => {
    setStatus("error");
    setErrorMessage(
      audioInputSource === "system"
        ? "Failed to capture system audio. The shared screen/tab may have been closed."
        : "Failed to capture audio. Please check microphone permissions.",
    );
    stopTimer();
    setRecordingStream(null);
    clearStream();
  };
}

export function stopRecorder(recorder: MediaRecorder | null): void {
  if (!recorder || recorder.state === "inactive") {
    return;
  }

  try {
    recorder.requestData();
  } catch {
    // Some browsers can throw if requestData is called at an invalid time.
  }

  recorder.stop();
}
