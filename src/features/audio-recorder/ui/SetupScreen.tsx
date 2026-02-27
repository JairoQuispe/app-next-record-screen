import { memo, useRef, useEffect, useState } from "react";
import { MicIcon, MonitorIcon } from "@shared/ui/icons";
import { formatDuration } from "@shared/lib/utils";
import { isTauriRuntime } from "@shared/lib/runtime/isTauriRuntime";
import { useMicrophonePreview } from "../model/useMicrophonePreview";
import { useWhisperTranscription } from "../model/useWhisperTranscription";
import { useSpeakerDiarization } from "../model/useSpeakerDiarization";
import { useAudioSettings } from "../model/useAudioSettings";
import { useNoiseSuppression } from "../model/useNoiseSuppression";
import type { AudioRecorderState, AudioRecorderActions, SpeakerSegment, SpeakerStats, ParticipantSummary } from "../model/types";

interface SetupScreenProps {
  state: Pick<
    AudioRecorderState,
    | "isSupported"
    | "isSystemAudioSupported"
    | "errorMessage"
    | "microphonePermission"
    | "availableMicrophones"
    | "selectedMicrophoneId"
    | "audioInputSource"
    | "status"
    | "durationSeconds"
    | "audioUrl"
    | "spectrumLevels"
    | "recordingStream"
    | "denoiseEnabled"
    | "denoiseIntensity"
    | "normalizeEnabled"
  >;
  actions: Pick<
    AudioRecorderActions,
    | "requestMicrophonePermission"
    | "selectMicrophone"
    | "setAudioInputSource"
    | "startRecording"
    | "stopRecording"
    | "pauseRecording"
    | "resumeRecording"
    | "saveRecording"
    | "setDenoiseEnabled"
    | "setDenoiseIntensity"
    | "setNormalizeEnabled"
  >;
  nativeWavPath?: string | null;
  animateIn: boolean;
}

const VisualizerBars = memo(function VisualizerBars({ levels }: { levels: number[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const levelsRef = useRef<number[]>(levels);
  const barsRef = useRef<number[]>([]);

  levelsRef.current = levels;

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const barCount = 40;
    const lerpSpeed = 0.18;
    let animationFrameId: number | null = null;

    if (barsRef.current.length !== barCount) {
      barsRef.current = new Array(barCount).fill(0);
    }

    const resizeCanvas = () => {
      const ratio = window.devicePixelRatio || 1;
      const { width, height } = container.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(width * ratio));
      canvas.height = Math.max(1, Math.floor(height * ratio));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    const drawWaveform = () => {
      const canvasWidth = canvas.clientWidth;
      const canvasHeight = canvas.clientHeight;
      const centerY = canvasHeight / 2;
      const slotWidth = canvasWidth / barCount;
      const barWidth = Math.max(2, slotWidth - 2);
      const maxBarHeight = canvasHeight * 0.88;
      const minBarHeight = 3;

      const currentLevels = levelsRef.current;
      const levelCount = currentLevels.length;
      const bars = barsRef.current;

      context.clearRect(0, 0, canvasWidth, canvasHeight);
      context.fillStyle = "rgba(255, 255, 255, 0.85)";

      for (let i = 0; i < barCount; i++) {
        const li = levelCount > 0 ? Math.floor((i / barCount) * levelCount) : 0;
        const level = levelCount > 0 ? currentLevels[Math.min(li, levelCount - 1)] : 0;
        const targetHeight = Math.max(minBarHeight, level * maxBarHeight);

        bars[i] += (targetHeight - bars[i]) * lerpSpeed;

        const h = bars[i];
        const x = i * slotWidth + (slotWidth - barWidth) / 2;
        const y = centerY - h / 2;

        context.beginPath();
        context.roundRect(x, y, barWidth, h, 2);
        context.fill();
      }

      animationFrameId = requestAnimationFrame(drawWaveform);
    };

    resizeCanvas();
    drawWaveform();

    const resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, []);

  return (
    <div ref={containerRef} className="neo-viz-bars" aria-hidden="true">
      <canvas ref={canvasRef} className="neo-viz-canvas" aria-hidden="true" />
    </div>
  );
});

type TranscriptionTab = "live" | "speakers" | "summary";

function formatMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

const SpeakerSegmentList = memo(function SpeakerSegmentList({ segments }: { segments: SpeakerSegment[] }) {
  if (segments.length === 0) {
    return <p className="neo-diarize-empty">No se detectaron segmentos de hablantes.</p>;
  }

  const speakerColors: Record<string, string> = {};
  const palette = ["#FF40A0", "#39FF14", "#FDC500", "#A37DFF", "#19c4ae"];
  let colorIdx = 0;

  return (
    <div className="neo-diarize-segments">
      {segments.map((seg) => {
        if (!speakerColors[seg.speakerId]) {
          speakerColors[seg.speakerId] = palette[colorIdx % palette.length];
          colorIdx++;
        }
        const color = speakerColors[seg.speakerId];
        return (
          <div key={seg.id} className="neo-diarize-segment">
            <div className="neo-diarize-segment-header">
              <span className="neo-diarize-speaker-badge" style={{ borderColor: color, color }}>
                {seg.speakerId}
              </span>
              <span className="neo-diarize-time">{formatMs(seg.startMs)} — {formatMs(seg.endMs)}</span>
            </div>
            {seg.text && <p className="neo-diarize-segment-text">{seg.text}</p>}
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
            <span className="neo-diarize-stat-item">
              <strong>{formatMs(s.talkTimeMs)}</strong> tiempo
            </span>
            <span className="neo-diarize-stat-item">
              <strong>{s.turns}</strong> turnos
            </span>
            <span className="neo-diarize-stat-item">
              <strong>{s.wordCount}</strong> palabras
            </span>
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

export function SetupScreen({ state, actions, nativeWavPath, animateIn }: SetupScreenProps) {
  const {
    isSupported,
    isSystemAudioSupported,
    errorMessage,
    microphonePermission,
    availableMicrophones,
    selectedMicrophoneId,
    audioInputSource,
    status,
    durationSeconds,
    audioUrl,
    spectrumLevels,
    recordingStream,
    denoiseEnabled,
    denoiseIntensity,
    normalizeEnabled,
  } = state;

  const {
    requestMicrophonePermission,
    selectMicrophone,
    setAudioInputSource,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    saveRecording,
    setDenoiseEnabled,
    setDenoiseIntensity,
    setNormalizeEnabled,
  } = actions;

  const [activeTab, setActiveTab] = useState<TranscriptionTab>("live");
  const [showConfigPanel, setShowConfigPanel] = useState(false);
  const [showGearPanel, setShowGearPanel] = useState(false);
  const [playbackMode, setPlaybackMode] = useState<"original" | "enhanced">("enhanced");

  const noiseSuppression = useNoiseSuppression();

  const { hydrate: hydrateSettings } = useAudioSettings(
    denoiseEnabled,
    denoiseIntensity,
    normalizeEnabled,
    setDenoiseEnabled,
    setDenoiseIntensity,
    setNormalizeEnabled,
  );

  // Hydrate persisted settings on mount
  useEffect(() => {
    hydrateSettings();
  }, [hydrateSettings]);

  const isMicChecked = audioInputSource === "microphone" || audioInputSource === "mixed";
  const isSystemChecked = audioInputSource === "system" || audioInputSource === "mixed";
  const usesMicrophone = audioInputSource === "microphone" || audioInputSource === "mixed";
  const shouldShowPermissionAction =
    isSupported &&
    usesMicrophone &&
    (microphonePermission === "prompt" || microphonePermission === "denied");

  const isRecording = status === "recording";
  const isPaused = status === "paused";
  const isStopped = status === "stopped";
  const isIdle = status === "idle" || status === "error";
  const isBusy = isRecording || isPaused;
  const isTauri = isTauriRuntime();

  const previewEnabled = !isBusy && usesMicrophone && microphonePermission === "granted";
  const { levels: micLevels, isActive: isMicPreviewActive } = useMicrophonePreview(
    previewEnabled,
    selectedMicrophoneId,
  );

  const vizLevels = isBusy ? spectrumLevels : micLevels;
  const vizActive = isBusy || isMicPreviewActive;

  const transcription = useWhisperTranscription(isBusy, recordingStream, "es");
  const diarization = useSpeakerDiarization("es");
  const prevStatusRef = useRef(status);

  const hasExtraContent =
    (isBusy || Boolean(transcription.finalText) || diarization.status !== "idle") ||
    Boolean(audioUrl) ||
    !isSupported ||
    Boolean(errorMessage);

  // Auto-trigger diarization when recording stops and audio is available
  useEffect(() => {
    if (prevStatusRef.current === "recording" || prevStatusRef.current === "paused") {
      if (status === "stopped" && audioUrl) {
        diarization.startDiarization(audioUrl);
        setActiveTab("speakers");

        // Auto-trigger noise suppression if enabled
        if (denoiseEnabled && denoiseIntensity > 0) {
          noiseSuppression.enhance(
            audioUrl,
            nativeWavPath ?? null,
            denoiseIntensity,
            normalizeEnabled,
          );
        }
      }
    }
    prevStatusRef.current = status;
  }, [status, audioUrl]);

  const toggleMicrophoneSource = () => {
    if (isBusy) return;
    if (isMicChecked && isSystemChecked) {
      setAudioInputSource("system");
      return;
    }
    if (!isMicChecked && isSystemChecked) {
      setAudioInputSource("mixed");
      return;
    }
    setAudioInputSource("microphone");
  };

  const toggleSystemSource = () => {
    if (isBusy) return;
    if (!isSystemAudioSupported) return;
    if (isMicChecked && isSystemChecked) {
      setAudioInputSource("microphone");
      return;
    }
    if (isMicChecked && !isSystemChecked) {
      setAudioInputSource("mixed");
      return;
    }
    setAudioInputSource("system");
  };

  const getStatusLabel = () => {
    if (isRecording) return "RECORDING LIVE";
    if (isPaused) return "PAUSED";
    if (isStopped) return "STOPPED";
    return "STANDBY";
  };

  return (
    <main className={`neo-app-shell neo-app-shell--setup neo-animate-enter ${animateIn ? 'is-visible' : ''}`}>
      <div className={`neo-setup-layout ${hasExtraContent ? "is-scrollable" : "is-locked"}`}>

        <div className="neo-setup-hero">
          <span className="neo-setup-hero-label">DURATION</span>
          <span className={`neo-setup-hero-time ${isRecording ? "is-recording" : ""}`} aria-live="polite" aria-atomic="true">
            {formatDuration(durationSeconds)}
          </span>
          <span className={`neo-setup-hero-status ${isRecording ? "is-recording" : ""} ${isPaused ? "is-paused" : ""}`}>
            {isRecording && <span className="neo-setup-hero-dot" aria-hidden="true" />}
            {getStatusLabel()}
          </span>
        </div>

        <div className="neo-setup-rec-controls">
          {showConfigPanel && (isIdle || isStopped) && (
            <div className="neo-config-popup" role="region" aria-label="Audio Setup">
              <div className="neo-config-popup-row">
                <button
                  type="button"
                  aria-pressed={isMicChecked}
                  className={`neo-config-source ${isMicChecked ? "is-on" : ""}`}
                  onClick={toggleMicrophoneSource}
                  disabled={isBusy}
                >
                  <MicIcon />
                  <span>MIC</span>
                </button>

                {isSystemAudioSupported && (
                  <button
                    type="button"
                    aria-pressed={isSystemChecked}
                    className={`neo-config-source ${isSystemChecked ? "is-on" : ""}`}
                    onClick={toggleSystemSource}
                    disabled={!isSystemAudioSupported || isBusy}
                  >
                    <MonitorIcon />
                    <span>SYSTEM</span>
                  </button>
                )}
              </div>

              {usesMicrophone && !isBusy && shouldShowPermissionAction && (
                <button
                  type="button"
                  className="neo-config-permit-btn"
                  onClick={() => void requestMicrophonePermission()}
                >
                  PERMITIR MICRÓFONO
                </button>
              )}

              {usesMicrophone && !isBusy && !shouldShowPermissionAction && availableMicrophones.length > 1 && (
                <div className="neo-config-device">
                  {availableMicrophones.map((microphone) => {
                    const isSelected = microphone.deviceId === selectedMicrophoneId;
                    return (
                      <button
                        key={microphone.deviceId}
                        type="button"
                        className={`neo-config-mic-option ${isSelected ? "is-selected" : ""}`}
                        onClick={() => selectMicrophone(microphone.deviceId)}
                        aria-label={`Seleccionar ${microphone.label}`}
                      >
                        <svg className="neo-config-mic-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="14" height="14" aria-hidden="true">
                          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                        </svg>
                        <span className="neo-config-mic-label">
                          {microphone.label || `Micrófono ${microphone.deviceId.slice(0, 5)}...`}
                        </span>
                        {isSelected && (
                          <svg className="neo-config-mic-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" width="12" height="12" aria-hidden="true">
                            <path d="M5 12l5 5L19 7" />
                          </svg>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {showGearPanel && (isIdle || isStopped) && (
            <div className="neo-config-popup neo-gear-popup" role="region" aria-label="Audio Enhancement">
              <div className="neo-gear-section">
                <div className="neo-gear-row">
                  <span className="neo-gear-label">SUPRIMIR RUIDO</span>
                  <button
                    type="button"
                    className={`neo-gear-toggle ${denoiseEnabled ? "is-on" : ""}`}
                    onClick={() => setDenoiseEnabled(!denoiseEnabled)}
                    aria-pressed={denoiseEnabled}
                    aria-label="Activar supresión de ruido"
                  >
                    <span className="neo-gear-toggle-knob" />
                  </button>
                </div>
                <p className="neo-gear-desc">
                  Elimina ruido de fondo y prioriza las voces humanas usando IA. Ajusta la intensidad para controlar cuánto ruido se suprime.
                </p>

                {denoiseEnabled && (
                  <div className="neo-gear-slider-group">
                    <label className="neo-gear-slider-label" htmlFor="denoise-intensity">
                      INTENSIDAD: <strong>{denoiseIntensity}%</strong>
                    </label>
                    <input
                      id="denoise-intensity"
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={denoiseIntensity}
                      onChange={(e) => setDenoiseIntensity(Number(e.target.value))}
                      className="neo-gear-slider"
                    />
                    <div className="neo-gear-slider-marks">
                      <span>0%</span>
                      <span>50%</span>
                      <span>100%</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="neo-gear-section">
                <div className="neo-gear-row">
                  <span className="neo-gear-label">NORMALIZAR VOLUMEN</span>
                  <button
                    type="button"
                    className={`neo-gear-toggle ${normalizeEnabled ? "is-on" : ""}`}
                    onClick={() => setNormalizeEnabled(!normalizeEnabled)}
                    aria-pressed={normalizeEnabled}
                    aria-label="Activar normalización de volumen"
                  >
                    <span className="neo-gear-toggle-knob" />
                  </button>
                </div>
                <p className="neo-gear-desc">
                  Iguala el volumen del audio para que las partes silenciosas se escuchen mejor sin distorsionar las más fuertes.
                </p>
              </div>
            </div>
          )}

          {isBusy && (
            <div className={`neo-setup-visualizer neo-setup-visualizer--bar ${vizActive ? "is-active" : ""}`}>
              <VisualizerBars levels={vizLevels} />
            </div>
          )}
          <div className="neo-setup-rec-buttons">
            {isIdle && (
              <>
                <button
                  type="button"
                  className="neo-setup-config-btn"
                  onClick={() => setShowConfigPanel(!showConfigPanel)}
                  aria-label="Configuración de fuentes de audio"
                >
                  <MicIcon />
                </button>
                <button
                  type="button"
                  className="neo-setup-rec-btn"
                  onClick={() => void startRecording()}
                  disabled={usesMicrophone && shouldShowPermissionAction}
                >
                </button>
                <button
                  type="button"
                  className="neo-setup-gear-btn"
                  onClick={() => { setShowGearPanel(!showGearPanel); setShowConfigPanel(false); }}
                  aria-label="Configuración de audio"
                >
                  <svg 
                    viewBox="0 0 24 24" 
                    fill="none" 
                    stroke="currentColor" 
                    strokeWidth="2.5" 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    className="neo-gear-icon"
                    width="24"
                    height="24"
                    role="img"
                    aria-hidden="true"
                  >
                    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </svg>
                </button>
              </>
            )}
            {isRecording && (
              <>
                <button
                  type="button"
                  className="neo-setup-config-btn neo-setup-config-btn--pause"
                  onClick={pauseRecording}
                  aria-label="Pausar grabación"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24" aria-hidden="true">
                    <rect x="6" y="4" width="4" height="16" rx="1" />
                    <rect x="14" y="4" width="4" height="16" rx="1" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="neo-setup-rec-btn neo-setup-rec-btn--stop"
                  onClick={() => void stopRecording()}
                >
                </button>
                <button
                  type="button"
                  className="neo-setup-gear-btn neo-setup-gear-btn--stop"
                  onClick={() => void stopRecording()}
                  aria-label="Detener grabación"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24" aria-hidden="true">
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  </svg>
                </button>
              </>
            )}
            {isPaused && (
              <>
                <button
                  type="button"
                  className="neo-setup-config-btn neo-setup-config-btn--resume"
                  onClick={resumeRecording}
                  aria-label="Reanudar grabación"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24" aria-hidden="true">
                    <polygon points="8,5 19,12 8,19" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="neo-setup-rec-btn neo-setup-rec-btn--stop"
                  onClick={() => void stopRecording()}
                >
                </button>
                <button
                  type="button"
                  className="neo-setup-gear-btn neo-setup-gear-btn--stop"
                  onClick={() => void stopRecording()}
                  aria-label="Detener grabación"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24" aria-hidden="true">
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  </svg>
                </button>
              </>
            )}
            {isStopped && (
              <>
                <button
                  type="button"
                  className="neo-setup-config-btn"
                  onClick={() => setShowConfigPanel(!showConfigPanel)}
                  aria-label="Configuración de fuentes de audio"
                >
                  <MicIcon />
                </button>
                <button
                  type="button"
                  className="neo-setup-rec-btn"
                  onClick={() => void startRecording()}
                >
                </button>
                <button
                  type="button"
                  className="neo-setup-gear-btn"
                  onClick={() => { setShowGearPanel(!showGearPanel); setShowConfigPanel(false); }}
                  aria-label="Configuración de audio"
                >
                  <svg 
                    viewBox="0 0 24 24" 
                    fill="none" 
                    stroke="currentColor" 
                    strokeWidth="2.5" 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    className="neo-gear-icon"
                    width="24"
                    height="24"
                    role="img"
                    aria-hidden="true"
                  >
                    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </svg>
                </button>
              </>
            )}
          </div>
        </div>

        {(isBusy || transcription.finalText || diarization.status !== "idle") && (
          <div className="neo-transcription-panel" role="log" aria-live="polite" aria-label="Transcripción">
            <div className="neo-transcription-header">
              <div className="neo-transcription-tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "live"}
                  className={`neo-transcription-tab ${activeTab === "live" ? "is-active" : ""}`}
                  onClick={() => setActiveTab("live")}
                >
                  EN VIVO
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "speakers"}
                  className={`neo-transcription-tab ${activeTab === "speakers" ? "is-active" : ""}`}
                  onClick={() => setActiveTab("speakers")}
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
                  onClick={() => setActiveTab("summary")}
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
        )}

        {!isSupported && <div className="neo-error" role="alert">Tu dispositivo no soporta grabación de audio.</div>}
        {errorMessage && <div className="neo-error" role="alert">{errorMessage}</div>}

        {audioUrl && (
          <div className="neo-setup-playback neo-animate-slide-up">
            <p className="neo-setup-playback-title">GRABACIÓN LISTA</p>

            {noiseSuppression.isProcessing && (
              <div className="neo-enhance-progress">
                <div className="neo-enhance-progress-bar">
                  <div
                    className="neo-enhance-progress-fill"
                    style={{ width: `${noiseSuppression.progress}%` }}
                  />
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
                  onClick={() => setPlaybackMode("original")}
                >
                  ORIGINAL
                </button>
                <button
                  type="button"
                  className={`neo-playback-tab ${playbackMode === "enhanced" ? "is-active" : ""}`}
                  onClick={() => setPlaybackMode("enhanced")}
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

            {isTauri ? (
              <button
                type="button"
                className="neo-setup-save-btn"
                onClick={() => void saveRecording()}
              >
                GUARDAR AUDIO
              </button>
            ) : (
              <a href={audioUrl} download="recogni-audio.webm" className="neo-setup-save-btn">
                DESCARGAR AUDIO
              </a>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
