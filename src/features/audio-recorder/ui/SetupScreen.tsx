import { MicIcon, MonitorIcon, CheckIcon } from "@shared/ui/icons";
import { formatDuration } from "@shared/lib/utils";
import { isTauriRuntime } from "@shared/lib/runtime/isTauriRuntime";
import { useMicrophonePreview } from "../model/useMicrophonePreview";
import type { AudioRecorderState, AudioRecorderActions } from "../model/types";

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
  >;
  animateIn: boolean;
}

function VisualizerBars({ levels }: { levels: number[] }) {
  return (
    <div className="neo-viz-bars" aria-hidden="true">
      {levels.map((h, i) => (
        <div
          key={i}
          className="neo-viz-bar"
          style={{ height: `${Math.max(h * 100, 2)}%` }}
        />
      ))}
    </div>
  );
}

export function SetupScreen({ state, actions, animateIn }: SetupScreenProps) {
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
  } = actions;

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
      <div className="neo-setup-layout">

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

        <div className={`neo-setup-visualizer ${vizActive ? "is-active" : ""}`}>
          <span className={`neo-viz-badge ${vizActive ? "is-live" : ""}`}>
            {isRecording ? "REC" : isMicPreviewActive ? "LIVE INPUT" : "NO INPUT"}
          </span>
          <VisualizerBars levels={vizLevels} />
        </div>

        <div className="neo-setup-card" role="region" aria-label="Audio Setup">
          <div className="neo-setup-section-title">Seleccionar fuente de audio</div>

          <div className="neo-setup-content">
            {!isSupported && <div className="neo-error" role="alert">Tu dispositivo no soporta grabación de audio.</div>}
            {errorMessage && <div className="neo-error" role="alert">{errorMessage}</div>}

            <section className="neo-setup-section" aria-label="Audio sources">
              <div className="neo-source-options" aria-label="Audio sources">
                <button 
                  type="button"
                  aria-pressed={isMicChecked}
                  className={`neo-source-btn ${isMicChecked ? "active" : ""}`}
                  onClick={toggleMicrophoneSource}
                  disabled={isBusy}
                >
                  <span className="neo-source-content">
                    <span className="neo-source-icon-wrapper" aria-hidden="true">
                      <MicIcon />
                    </span>
                    <span className="neo-source-copy">
                      <span className="neo-source-text">Microphone</span>
                      <span className="neo-source-subtext">External Mic (USB)</span>
                    </span>
                  </span>
                  <span className={`neo-source-state ${isMicChecked ? "is-active" : ""}`} aria-hidden="true">
                    {isMicChecked ? <CheckIcon /> : null}
                  </span>
                </button>

                <button 
                  type="button"
                  aria-pressed={isSystemChecked}
                  className={`neo-source-btn ${isSystemChecked ? "active" : ""}`}
                  onClick={toggleSystemSource}
                  disabled={!isSystemAudioSupported || isBusy}
                  aria-disabled={!isSystemAudioSupported || isBusy}
                >
                  <span className="neo-source-content">
                    <span className="neo-source-icon-wrapper" aria-hidden="true">
                      <MonitorIcon />
                    </span>
                    <span className="neo-source-copy">
                      <span className="neo-source-text">System Audio</span>
                      <span className="neo-source-subtext">Computer sounds</span>
                    </span>
                  </span>
                  <span className={`neo-source-state ${isSystemChecked ? "is-active" : ""}`} aria-hidden="true">
                    {isSystemChecked ? <CheckIcon /> : null}
                  </span>
                </button>
              </div>
            </section>

            {usesMicrophone && !isBusy && (
              <section className="neo-setup-section neo-animate-slide-up" aria-labelledby="device-selection-title">
                <h3 id="device-selection-title" className="neo-setup-label">DISPOSITIVO DE ENTRADA</h3>
                
                <div className="neo-input-group">
                  {shouldShowPermissionAction ? (
                    <button
                      type="button"
                      className="neo-btn-primary"
                      onClick={() => void requestMicrophonePermission()}
                    >
                      PERMITIR ACCESO AL MICRÓFONO
                    </button>
                  ) : availableMicrophones.length > 0 ? (
                    <div className="neo-select-wrapper">
                      <select
                        className="neo-setup-select"
                        value={selectedMicrophoneId ?? ""}
                        onChange={(event) => selectMicrophone(event.currentTarget.value)}
                        aria-label="Seleccionar micrófono"
                      >
                        {availableMicrophones.map((microphone) => (
                          <option key={microphone.deviceId} value={microphone.deviceId}>
                            {microphone.label || `Micrófono ${microphone.deviceId.slice(0, 5)}...`}
                          </option>
                        ))}
                      </select>
                      <div className="neo-select-arrow" aria-hidden="true">▼</div>
                    </div>
                  ) : (
                    <div className="neo-setup-info" role="status">No se encontraron micrófonos.</div>
                  )}
                </div>
              </section>
            )}
          </div>

          <footer className="neo-setup-footer">
            <div className="neo-setup-controls">
              {isIdle && (
                <button
                  type="button"
                  className="neo-setup-rec-btn"
                  onClick={() => void startRecording()}
                  disabled={usesMicrophone && shouldShowPermissionAction}
                >
                  <span className="neo-rec-dot" aria-hidden="true" />
                  REC
                </button>
              )}

              {isRecording && (
                <>
                  <button type="button" className="neo-setup-pause-btn" onClick={pauseRecording}>
                    PAUSE
                  </button>
                  <button type="button" className="neo-setup-stop-btn" onClick={() => void stopRecording()}>
                    STOP
                  </button>
                </>
              )}

              {isPaused && (
                <>
                  <button type="button" className="neo-setup-rec-btn" onClick={resumeRecording}>
                    RESUME
                  </button>
                  <button type="button" className="neo-setup-stop-btn" onClick={() => void stopRecording()}>
                    STOP
                  </button>
                </>
              )}

              {isStopped && (
                <button
                  type="button"
                  className="neo-setup-rec-btn"
                  onClick={() => void startRecording()}
                >
                  <span className="neo-rec-dot" aria-hidden="true" />
                  REC
                </button>
              )}
            </div>
          </footer>
        </div>

        {audioUrl && (
          <div className="neo-setup-playback neo-animate-slide-up">
            <p className="neo-setup-playback-title">GRABACIÓN LISTA</p>
            <audio controls src={audioUrl} className="neo-setup-audio-player" />
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
