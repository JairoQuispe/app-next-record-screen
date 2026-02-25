import { memo, useMemo } from "react";
import { SettingsIcon, MixerIcon } from "@shared/ui/icons";
import { formatDuration } from "@shared/lib/utils";
import { isTauriRuntime } from "@shared/lib/runtime/isTauriRuntime";
import type { AudioRecorderState, AudioRecorderActions } from "../model/types";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function buildSmoothPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let d = `M ${points[0].x} ${points[0].y}`;

  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    const tension = 0.22;
    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = p1.y + (p2.y - p0.y) * tension;
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = p2.y - (p3.y - p1.y) * tension;

    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }

  return d;
}

function levelsToWavePoints(
  levels: number[],
  width: number,
  baselineY: number,
  amplitude: number,
  direction: 1 | -1,
): Array<{ x: number; y: number }> {
  if (levels.length === 0) return [];

  const step = width / Math.max(1, levels.length - 1);
  return levels.map((level, index) => {
    const x = index * step;
    const y = baselineY + direction * clamp(level, 0, 1) * amplitude;
    return { x, y };
  });
}

const WAVEFORM_WIDTH = 1000;
const WAVEFORM_HEIGHT = 240;
const WAVEFORM_MID = WAVEFORM_HEIGHT / 2;
const WAVEFORM_AMPLITUDE = WAVEFORM_HEIGHT * 0.38;

const WaveformPaths = memo(function WaveformPaths({ levels }: { levels: number[] }) {
  const { topPath, bottomPath } = useMemo(() => {
    const topPoints = levelsToWavePoints(levels, WAVEFORM_WIDTH, WAVEFORM_MID - 8, WAVEFORM_AMPLITUDE, -1);
    const bottomPoints = levelsToWavePoints(levels, WAVEFORM_WIDTH, WAVEFORM_MID + 8, WAVEFORM_AMPLITUDE, 1);
    return {
      topPath: buildSmoothPath(topPoints),
      bottomPath: buildSmoothPath(bottomPoints),
    };
  }, [levels]);

  return (
    <>
      <path className="neo-waveform-path neo-waveform-path--top" d={topPath} />
      <path className="neo-waveform-path neo-waveform-path--bottom" d={bottomPath} />
    </>
  );
});

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
                  <div className="neo-waveform" aria-hidden="true">
                    <svg
                      className="neo-waveform-svg"
                      viewBox="0 0 1000 240"
                      preserveAspectRatio="none"
                      role="presentation"
                      focusable="false"
                    >
                      <WaveformPaths levels={spectrumLevels} />
                    </svg>
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
