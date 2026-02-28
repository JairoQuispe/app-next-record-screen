import { memo, useMemo } from "react";
import type { SpeakerSegment, SpeakerStats, ParticipantSummary } from "../../model/types";
import type { TranscriptionState, TranscriptionActions } from "../../lib/transcription/types";

type TranscriptionTab = "live" | "speakers" | "summary";

function formatMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

// --- Sub-panels (memoized) ---

const SPEAKER_PALETTE = ["#FF40A0", "#39FF14", "#FDC500", "#A37DFF", "#19c4ae"] as const;

const SpeakerSegmentList = memo(function SpeakerSegmentList({ segments }: { segments: SpeakerSegment[] }) {
  const speakerColors = useMemo(() => {
    const colors: Record<string, string> = {};
    let idx = 0;
    for (const seg of segments) {
      if (!colors[seg.speakerId]) {
        colors[seg.speakerId] = SPEAKER_PALETTE[idx % SPEAKER_PALETTE.length];
        idx++;
      }
    }
    return colors;
  }, [segments]);

  if (segments.length === 0) {
    return <p className="neo-diarize-empty">No se detectaron segmentos de hablantes.</p>;
  }

  return (
    <div className="neo-diarize-segments">
      {segments.map((seg) => {
        const color = speakerColors[seg.speakerId];
        return (
          <div key={seg.id} className="neo-diarize-segment">
            <div className="neo-diarize-segment-header">
              <span className="neo-diarize-speaker-badge" style={{ borderColor: color, color }}>
                {seg.speakerId}
              </span>
              <span className="neo-diarize-time">{formatMs(seg.startMs)} — {formatMs(seg.endMs)}</span>
            </div>
            {seg.text ? <p className="neo-diarize-segment-text">{seg.text}</p> : null}
          </div>
        );
      })}
    </div>
  );
});

const SpeakerStatsPanel = memo(function SpeakerStatsPanel({ stats }: { stats: SpeakerStats[] }) {
  if (stats.length === 0) return null;
  return (
    <div className="neo-diarize-stats">
      {stats.map((s) => (
        <div key={s.speakerId} className="neo-diarize-stat-card">
          <span className="neo-diarize-stat-speaker">{s.speakerId}</span>
          <div className="neo-diarize-stat-metrics">
            <span className="neo-diarize-stat-item"><strong>{formatMs(s.talkTimeMs)}</strong> tiempo</span>
            <span className="neo-diarize-stat-item"><strong>{s.turns}</strong> turnos</span>
            <span className="neo-diarize-stat-item"><strong>{s.wordCount}</strong> palabras</span>
          </div>
        </div>
      ))}
    </div>
  );
});

const ParticipantSummaryPanel = memo(function ParticipantSummaryPanel({ summaries, stats }: { summaries: ParticipantSummary[]; stats: SpeakerStats[] }) {
  if (summaries.length === 0) {
    return <p className="neo-diarize-empty">No hay resumen disponible.</p>;
  }
  return (
    <div className="neo-diarize-summaries">
      {summaries.map((s) => {
        const speakerStat = stats.find((st) => st.speakerId === s.speakerId);
        return (
          <div key={s.speakerId} className="neo-diarize-summary-card">
            <div className="neo-diarize-summary-header">
              <span className="neo-diarize-summary-speaker">{s.speakerId}</span>
              {speakerStat && (
                <span className="neo-diarize-summary-time">{formatMs(speakerStat.talkTimeMs)}</span>
              )}
            </div>
            {s.headline && <p className="neo-diarize-summary-headline">{s.headline}</p>}
            {s.bulletPoints.length > 0 && (
              <ul className="neo-diarize-summary-bullets">
                {s.bulletPoints.map((bp, i) => <li key={i}>{bp}</li>)}
              </ul>
            )}
            {s.keywords.length > 0 && (
              <div className="neo-diarize-summary-keywords">
                {s.keywords.map((kw) => (
                  <span key={kw} className="neo-diarize-keyword">{kw}</span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
});

// --- Diarization state type ---

interface DiarizationState {
  status: "idle" | "processing" | "done" | "error";
  progress: number;
  stage?: string;
  segments: SpeakerSegment[];
  speakerStats: SpeakerStats[];
  participantSummaries: ParticipantSummary[];
  error: string | null;
}

// --- Main panel ---

interface TranscriptionPanelProps {
  activeTab: TranscriptionTab;
  onSetActiveTab: (tab: TranscriptionTab) => void;
  transcription: TranscriptionState & TranscriptionActions;
  diarization: DiarizationState;
  isBusy: boolean;
}

export type { TranscriptionTab };

export function TranscriptionPanel({
  activeTab, onSetActiveTab, transcription, diarization, isBusy,
}: TranscriptionPanelProps) {
  return (
    <div className="neo-transcription-panel" role="log" aria-live="polite" aria-label="Transcripción">
      <div className="neo-transcription-header">
        <div className="neo-transcription-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "live"}
            className={`neo-transcription-tab ${activeTab === "live" ? "is-active" : ""}`}
            onClick={() => onSetActiveTab("live")}
          >
            EN VIVO
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "speakers"}
            className={`neo-transcription-tab ${activeTab === "speakers" ? "is-active" : ""}`}
            onClick={() => onSetActiveTab("speakers")}
          >
            HABLANTES
            {diarization.status === "processing" && (
              <span className="neo-tab-badge">{diarization.progress}%</span>
            )}
            {diarization.status === "done" && (
              <span className="neo-tab-badge neo-tab-badge--done">{diarization.segments.length}</span>
            )}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "summary"}
            className={`neo-transcription-tab ${activeTab === "summary" ? "is-active" : ""}`}
            onClick={() => onSetActiveTab("summary")}
          >
            RESUMEN
          </button>
        </div>
        {activeTab === "live" && (
          <>
            {(transcription.isModelReady && isBusy) && <span className="neo-transcription-dot" aria-hidden="true" />}
            {transcription.isModelLoading && (
              <span className="neo-transcription-progress">Cargando modelo ({transcription.loadProgress}%)</span>
            )}
            {transcription.finalText && (
              <button type="button" className="neo-transcription-clear" onClick={transcription.clear}>
                LIMPIAR
              </button>
            )}
          </>
        )}
      </div>

      {activeTab === "live" && (
        <div className="neo-transcription-body">
          {transcription.finalText && (
            <p className="neo-transcription-final">{transcription.finalText}</p>
          )}
          {transcription.interimText && (
            <p className="neo-transcription-interim">{transcription.interimText}</p>
          )}
          {!transcription.finalText && !transcription.interimText && !transcription.isModelLoading && (
            <p className="neo-transcription-placeholder">
              {transcription.isProcessing ? "Transcribiendo..." : "Esperando audio..."}
            </p>
          )}
          {transcription.error && (
            <p className="neo-transcription-error">{transcription.error}</p>
          )}
        </div>
      )}

      {activeTab === "speakers" && (
        <div className="neo-transcription-body neo-transcription-body--tall">
          {diarization.status === "processing" && (
            <div className="neo-diarize-progress">
              <div className="neo-diarize-progress-bar">
                <div className="neo-diarize-progress-fill" style={{ width: `${diarization.progress}%` }} />
              </div>
              <span className="neo-diarize-progress-label">
                {diarization.stage === "extracting-features" && "Extrayendo características de audio..."}
                {diarization.stage === "clustering" && "Identificando hablantes..."}
                {diarization.stage === "loading-model" && "Cargando modelo de transcripción..."}
                {diarization.stage === "transcribing" && "Transcribiendo segmentos..."}
                {diarization.stage === "summarizing" && "Generando resumen..."}
                {!diarization.stage && "Procesando..."}
              </span>
            </div>
          )}
          {diarization.status === "done" && (
            <>
              <SpeakerStatsPanel stats={diarization.speakerStats} />
              <SpeakerSegmentList segments={diarization.segments} />
            </>
          )}
          {diarization.status === "error" && (
            <p className="neo-transcription-error">{diarization.error}</p>
          )}
          {diarization.status === "idle" && (
            <p className="neo-diarize-empty">
              La diarización se ejecutará automáticamente al detener la grabación.
            </p>
          )}
        </div>
      )}

      {activeTab === "summary" && (
        <div className="neo-transcription-body neo-transcription-body--tall">
          {diarization.status === "done" && (
            <ParticipantSummaryPanel
              summaries={diarization.participantSummaries}
              stats={diarization.speakerStats}
            />
          )}
          {diarization.status === "processing" && (
            <p className="neo-diarize-empty">Procesando diarización ({diarization.progress}%)...</p>
          )}
          {(diarization.status === "idle" || diarization.status === "error") && (
            <p className="neo-diarize-empty">
              {diarization.status === "error" ? diarization.error : "El resumen estará disponible tras la diarización."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
