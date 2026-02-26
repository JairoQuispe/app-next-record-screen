import { useCallback, useEffect, useRef, useState } from "react";
import type {
  DiarizationState,
  DiarizationStatus,
  SpeakerSegment,
  SpeakerStats,
  ParticipantSummary,
} from "./types";

const SAMPLE_RATE = 16000;

export interface SpeakerDiarizationActions {
  startDiarization: (audioSource: string | Blob) => void;
  reset: () => void;
  renameSpeaker: (oldId: string, newName: string) => void;
}

interface WorkerResponse {
  type: "diarize-progress" | "diarize-result" | "diarize-error";
  progress?: number;
  stage?: string;
  segments?: SpeakerSegment[];
  speakerStats?: SpeakerStats[];
  participantSummaries?: ParticipantSummary[];
  error?: string;
}

async function fetchAudioAsFloat32(source: string | Blob): Promise<Float32Array> {
  let arrayBuffer: ArrayBuffer;

  if (source instanceof Blob) {
    arrayBuffer = await source.arrayBuffer();
  } else {
    const response = await fetch(source);
    arrayBuffer = await response.arrayBuffer();
  }

  const audioCtx = new OfflineAudioContext(1, 1, SAMPLE_RATE);
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

  // Resample to 16kHz mono
  const offlineCtx = new OfflineAudioContext(1, Math.ceil(audioBuffer.duration * SAMPLE_RATE), SAMPLE_RATE);
  const bufferSource = offlineCtx.createBufferSource();
  bufferSource.buffer = audioBuffer;
  bufferSource.connect(offlineCtx.destination);
  bufferSource.start(0);

  const rendered = await offlineCtx.startRendering();
  return rendered.getChannelData(0);
}

export function useSpeakerDiarization(language: string = "es"): DiarizationState & SpeakerDiarizationActions {
  const [status, setStatus] = useState<DiarizationStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [segments, setSegments] = useState<SpeakerSegment[]>([]);
  const [speakerStats, setSpeakerStats] = useState<SpeakerStats[]>([]);
  const [participantSummaries, setParticipantSummaries] = useState<ParticipantSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState("");

  const workerRef = useRef<Worker | null>(null);
  const speakerNameMapRef = useRef<Map<string, string>>(new Map());

  const getWorker = useCallback(() => {
    if (workerRef.current) return workerRef.current;

    const worker = new Worker(
      new URL("../lib/diarize.worker.ts", import.meta.url),
      { type: "module" },
    );

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const data = event.data;

      switch (data.type) {
        case "diarize-progress":
          setProgress(data.progress ?? 0);
          setStage(data.stage ?? "");
          break;
        case "diarize-result":
          setStatus("done");
          setProgress(100);
          setSegments(data.segments ?? []);
          setSpeakerStats(data.speakerStats ?? []);
          setParticipantSummaries(data.participantSummaries ?? []);
          break;
        case "diarize-error":
          setStatus("error");
          setError(data.error ?? "Unknown diarization error");
          break;
      }
    };

    worker.onerror = (e) => {
      setStatus("error");
      setError(e.message ?? "Worker crashed");
    };

    workerRef.current = worker;
    return worker;
  }, []);

  const startDiarization = useCallback(async (audioSource: string | Blob) => {
    setStatus("processing");
    setProgress(0);
    setError(null);
    setSegments([]);
    setSpeakerStats([]);
    setParticipantSummaries([]);
    speakerNameMapRef.current.clear();

    try {
      const audio = await fetchAudioAsFloat32(audioSource);
      const worker = getWorker();
      worker.postMessage({ type: "diarize", audio, language });
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "Failed to load audio for diarization");
    }
  }, [getWorker, language]);

  const reset = useCallback(() => {
    setStatus("idle");
    setProgress(0);
    setSegments([]);
    setSpeakerStats([]);
    setParticipantSummaries([]);
    setError(null);
    setStage("");
    speakerNameMapRef.current.clear();
  }, []);

  const renameSpeaker = useCallback((oldId: string, newName: string) => {
    speakerNameMapRef.current.set(oldId, newName);

    const rename = (id: string) => speakerNameMapRef.current.get(id) ?? id;

    setSegments((prev) => prev.map((s) => ({ ...s, speakerId: s.speakerId === oldId ? rename(oldId) : s.speakerId })));
    setSpeakerStats((prev) => prev.map((s) => ({ ...s, speakerId: s.speakerId === oldId ? rename(oldId) : s.speakerId })));
    setParticipantSummaries((prev) => prev.map((s) => ({ ...s, speakerId: s.speakerId === oldId ? rename(oldId) : s.speakerId })));
  }, []);

  // Cleanup worker on unmount
  useEffect(() => {
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, []);

  return {
    status,
    progress,
    segments,
    speakerStats,
    participantSummaries,
    error: error,
    stage,
    startDiarization: (source: string | Blob) => void startDiarization(source),
    reset,
    renameSpeaker,
  } as DiarizationState & SpeakerDiarizationActions & { stage: string };
}
