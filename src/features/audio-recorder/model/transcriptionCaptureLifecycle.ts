import type { Dispatch, MutableRefObject, SetStateAction } from "react";

interface TranscriptionCaptureRefs {
  audioCtxRef: MutableRefObject<AudioContext | null>;
  sourceNodeRef: MutableRefObject<MediaStreamAudioSourceNode | null>;
  workletNodeRef: MutableRefObject<AudioWorkletNode | null>;
  audioBufferRef: MutableRefObject<Float32Array[]>;
  chunkTimerRef: MutableRefObject<number | null>;
  isChunkInFlightRef: MutableRefObject<boolean>;
  lastContextRef: MutableRefObject<string>;
}

const WORKLET_PROCESSOR_NAME = "pcm-capture-processor";
const WORKLET_PROCESSOR_CODE = `
  class PcmCaptureProcessor extends AudioWorkletProcessor {
    process(inputs) {
      const input = inputs[0];
      if (input && input[0] && input[0].length > 0) {
        this.port.postMessage(new Float32Array(input[0]));
      }
      return true;
    }
  }
  registerProcessor("pcm-capture-processor", PcmCaptureProcessor);
`;

function disconnectCaptureNodes(refs: TranscriptionCaptureRefs): void {
  refs.workletNodeRef.current?.disconnect();
  refs.sourceNodeRef.current?.disconnect();
  refs.workletNodeRef.current = null;
  refs.sourceNodeRef.current = null;
}

export async function startTranscriptionCapture(
  mediaStream: MediaStream,
  refs: TranscriptionCaptureRefs,
  sendChunk: () => void,
  sampleRate: number,
  chunkDurationSeconds: number,
): Promise<void> {
  disconnectCaptureNodes(refs);

  if (refs.audioCtxRef.current) {
    void refs.audioCtxRef.current.close();
    refs.audioCtxRef.current = null;
  }

  const audioCtx = new AudioContext({ sampleRate });
  const source = audioCtx.createMediaStreamSource(mediaStream);

  const blob = new Blob([WORKLET_PROCESSOR_CODE], { type: "application/javascript" });
  const workletUrl = URL.createObjectURL(blob);

  try {
    await audioCtx.audioWorklet.addModule(workletUrl);
  } finally {
    URL.revokeObjectURL(workletUrl);
  }

  const workletNode = new AudioWorkletNode(audioCtx, WORKLET_PROCESSOR_NAME);
  workletNode.port.onmessage = (e: MessageEvent<Float32Array>) => {
    refs.audioBufferRef.current.push(e.data);
  };

  source.connect(workletNode);

  refs.audioCtxRef.current = audioCtx;
  refs.sourceNodeRef.current = source;
  refs.workletNodeRef.current = workletNode;
  refs.chunkTimerRef.current = window.setInterval(sendChunk, chunkDurationSeconds * 1000);
}

export function stopTranscriptionCapture(
  refs: TranscriptionCaptureRefs,
  sendChunk: () => void,
  clearInferenceTimeout: () => void,
  setIsProcessing: Dispatch<SetStateAction<boolean>>,
  setInterimText: Dispatch<SetStateAction<string>>,
): void {
  if (refs.chunkTimerRef.current !== null) {
    window.clearInterval(refs.chunkTimerRef.current);
    refs.chunkTimerRef.current = null;
  }

  clearInferenceTimeout();
  sendChunk();
  disconnectCaptureNodes(refs);

  if (refs.audioCtxRef.current) {
    void refs.audioCtxRef.current.close();
    refs.audioCtxRef.current = null;
  }

  refs.audioBufferRef.current = [];
  refs.isChunkInFlightRef.current = false;
  refs.lastContextRef.current = "";
  setIsProcessing(false);
  setInterimText("");
}
