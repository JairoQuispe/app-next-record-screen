import { useMemo } from "react";
import { SettingsIcon, MixerIcon } from "@shared/ui/icons";
import { formatDuration } from "@shared/lib/utils";
import { isTauriRuntime } from "@shared/lib/runtime/isTauriRuntime";
import type { AudioRecorderState, AudioRecorderActions } from "../model/types";

interface RecordingScreenProps {
  state: Pick<
    AudioRecorderState,
    | "status"
    | "durationSeconds"
    | "audioUrl"
    | "isMicrophoneEnabled"
    | "audioInputSource"
    | "spectrumLevels"
  >;
  actions: Pick<
    AudioRecorderActions,
    "startRecording" | "stopRecording" | "pauseRecording" | "resumeRecording"
  >;
  animateIn: boolean;
  onBackToSetup: () => void;
}

export function RecordingScreen({ state, actions, animateIn, onBackToSetup }: RecordingScreenProps) {
  const {
    status,
    durationSeconds,
    audioUrl,
    isMicrophoneEnabled,
    audioInputSource,
    spectrumLevels,
  } = state;

  const { startRecording, stopRecording, pauseRecording, resumeRecording } = actions;

  const runtime = useMemo(() => (isTauriRuntime() ? "desktop/mobile (Tauri)" : "browser"), []);

  const usesMicrophone = audioInputSource === "microphone" || audioInputSource === "mixed";
  const canStart = status !== "recording" && status !== "paused";
  const canPause = status === "recording";
  const canResume = status === "paused";
  const canStop = status === "recording" || status === "paused";

  return (
    <main className={`neo-app-shell neo-animate-enter ${animateIn ? 'is-visible' : ''}`}>
      <div className="neo-dashboard">
        <header className="neo-topbar neo-topbar--recording">
          <div className="neo-topbar-meta">
            <span className="neo-topbar-label">READY TO ROLL?</span>
            <span className="neo-topbar-mode">MODE: {audioInputSource.toUpperCase()}</span>
          </div>
          <div className="neo-status-chip" aria-live="polite">
            <span className={`neo-status-dot ${status === "recording" ? "is-live" : ""}`} aria-hidden="true" />
            {status === "recording" ? "REC_LIVE" : "SYSTEM_STANDBY"}
          </div>
        </header>

        <div className="neo-recording-layout">
          <section className="neo-preview neo-preview--recording" aria-label="Audio capture surface">
            <div className="neo-grid-overlay" aria-hidden="true" />
            <div className="neo-preview-content">
              <div className="neo-region-frame">
                <span className="neo-region-badge">AUDIO REGION</span>
                <div className="neo-audio-state">
                  <p className="neo-audio-state-title" aria-live="polite">{status.toUpperCase()}</p>
                  <p className="neo-audio-state-time" aria-live="polite" aria-atomic="true">{formatDuration(durationSeconds)}</p>
                  <div className="neo-spectrum" aria-hidden="true">
                    {spectrumLevels.map((level, index) => (
                      <span
                        key={index}
                        className="neo-spectrum-bar"
                        style={{
                          height: `${10 + level * 90}%`,
                          opacity: 0.35 + level * 0.65,
                          transform: `scaleY(${0.55 + level * 0.9})`,
                          filter: `brightness(${0.8 + level * 0.9}) saturate(${1 + level * 0.8})`,
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <aside className="neo-control-panel" aria-label="Recorder controls">
            <div className="neo-side-actions">
              <button
                type="button"
                className="neo-button neo-side-button"
                onClick={onBackToSetup}
                aria-label="Volver a configuración"
              >
                <span className="neo-icon" aria-hidden="true"><SettingsIcon /></span>
                <span className="neo-label">SETUP</span>
                <span className={`neo-mic-indicator ${isMicrophoneEnabled ? "on" : "off"}`} aria-hidden="true">
                  {usesMicrophone ? (isMicrophoneEnabled ? "ON" : "OFF") : "SYS"}
                </span>
              </button>

              <button type="button" className="neo-button neo-side-button" disabled aria-disabled="true">
                <span className="neo-icon" aria-hidden="true">
                  <MixerIcon />
                </span>
                <span className="neo-label">MIXER</span>
                <span className="neo-soon">SOON</span>
              </button>
            </div>

            <section className="neo-controls neo-controls--stack" aria-label="Main recording actions">
              <div className="neo-main-actions">
                {canStart && (
                  <button type="button" className="neo-button neo-record-button" onClick={startRecording}>
                    <span className="neo-record-dot" aria-hidden="true" />
                    REC
                  </button>
                )}

                {canPause && (
                  <button type="button" className="neo-button neo-record-button" onClick={pauseRecording}>
                    PAUSE
                  </button>
                )}

                {canResume && (
                  <button type="button" className="neo-button neo-record-button" onClick={resumeRecording}>
                    RESUME
                  </button>
                )}

                {canStop && (
                  <button type="button" className="neo-button neo-stop-button" onClick={stopRecording}>
                    STOP
                  </button>
                )}
              </div>
            </section>
          </aside>
        </div>

        <section className="neo-output" aria-live="polite">
          {audioUrl && (
            <div className="neo-playback-card neo-animate-slide-up">
              <p className="neo-playback-title">GRABACIÓN LISTA</p>
              <audio controls src={audioUrl} className="neo-audio-player" />
              <a href={audioUrl} download="recogni-audio.webm" className="neo-download-link">
                DESCARGAR AUDIO
              </a>
            </div>
          )}
          {!audioUrl && <p className="neo-output-placeholder">Realiza una grabación para ver aquí la previsualización final.</p>}
        </section>

        <footer className="neo-footer neo-footer--inside">
          <span>mode: audio_capture // runtime: {runtime}</span>
          <span>cross-platform: web + windows + macos + linux + android + ios</span>
        </footer>
      </div>
    </main>
  );
}
