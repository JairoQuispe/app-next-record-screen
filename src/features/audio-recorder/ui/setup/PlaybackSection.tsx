import { memo } from "react";
import { isTauriRuntime } from "@shared/lib/runtime/isTauriRuntime";
import type { CloudTranscriptionState, CloudTranscriptionActions } from "../../model/useCloudTranscription";

const IS_TAURI = isTauriRuntime();

interface NoiseSuppressionState {
  isProcessing: boolean;
  progress: number;
  error: string | null;
  enhancedAudioUrl: string | null;
}

interface PlaybackSectionProps {
  audioUrl: string;
  nativeWavPath: string | null;
  noiseSuppression: NoiseSuppressionState;
  cloudTranscription: CloudTranscriptionState & CloudTranscriptionActions;
  playbackMode: "original" | "enhanced";
  onSetPlaybackMode: (mode: "original" | "enhanced") => void;
  onSave: () => void;
}

export const PlaybackSection = memo(function PlaybackSection({
  audioUrl, nativeWavPath, noiseSuppression, cloudTranscription, playbackMode, onSetPlaybackMode, onSave,
}: PlaybackSectionProps) {
  return (
    <div className="neo-setup-playback neo-animate-slide-up">
      <p className="neo-setup-playback-title">GRABACIÓN LISTA</p>

      {noiseSuppression.isProcessing && (
        <div className="neo-enhance-progress">
          <div className="neo-enhance-progress-bar">
            <div className="neo-enhance-progress-fill" style={{ width: `${noiseSuppression.progress}%` }} />
          </div>
          <span className="neo-enhance-progress-label">
            MEJORANDO AUDIO... {noiseSuppression.progress}%
          </span>
        </div>
      )}

      {noiseSuppression.error && (
        <div className="neo-enhance-error">{noiseSuppression.error}</div>
      )}

      {noiseSuppression.enhancedAudioUrl && !noiseSuppression.isProcessing && (
        <div className="neo-playback-tabs">
          <button
            type="button"
            className={`neo-playback-tab ${playbackMode === "original" ? "is-active" : ""}`}
            onClick={() => onSetPlaybackMode("original")}
          >
            ORIGINAL
          </button>
          <button
            type="button"
            className={`neo-playback-tab ${playbackMode === "enhanced" ? "is-active" : ""}`}
            onClick={() => onSetPlaybackMode("enhanced")}
          >
            MEJORADO
          </button>
        </div>
      )}

      <audio
        controls
        src={
          playbackMode === "enhanced" && noiseSuppression.enhancedAudioUrl
            ? noiseSuppression.enhancedAudioUrl
            : audioUrl
        }
        className="neo-setup-audio-player"
      />

      {IS_TAURI ? (
        <button type="button" className="neo-setup-save-btn" onClick={onSave}>
          GUARDAR AUDIO
        </button>
      ) : (
        <a href={audioUrl} download="recogni-audio.webm" className="neo-setup-save-btn">
          DESCARGAR AUDIO
        </a>
      )}

      {/* ── Cloud Transcription ── */}
      {cloudTranscription.isTranscribing && (
        <div className="neo-transcribe-progress">
          <div className="neo-transcribe-progress-bar">
            <div className="neo-transcribe-progress-fill" style={{ width: `${cloudTranscription.progress}%` }} />
          </div>
          <span className="neo-transcribe-progress-label">
            TRANSCRIBIENDO... {cloudTranscription.progress}%
          </span>
        </div>
      )}

      {cloudTranscription.error && (
        <div className="neo-enhance-error">{cloudTranscription.error}</div>
      )}

      {cloudTranscription.isTranscribing ? (
        <button
          type="button"
          className="neo-setup-transcribe-btn neo-setup-transcribe-btn--cancel"
          onClick={cloudTranscription.cancel}
        >
          CANCELAR TRANSCRIPCIÓN
        </button>
      ) : cloudTranscription.transcriptionText ? (
        <button
          type="button"
          className="neo-setup-transcribe-btn neo-setup-transcribe-btn--done"
          onClick={() => void cloudTranscription.downloadTranscription()}
        >
          DESCARGAR TRANSCRIPCIÓN
        </button>
      ) : (
        <button
          type="button"
          className="neo-setup-transcribe-btn"
          onClick={() => void cloudTranscription.transcribe(audioUrl, nativeWavPath)}
        >
          DESCARGAR TRANSCRIPCIÓN
        </button>
      )}
    </div>
  );
});
