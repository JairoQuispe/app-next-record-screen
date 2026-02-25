import { useMemo } from "react";
import { useAudioRecorder } from "../model/useAudioRecorder";
import { isTauriRuntime } from "../../../shared/lib/runtime/isTauriRuntime";
import "./audio-recorder.css";

function formatDuration(durationSeconds: number): string {
  const minutes = Math.floor(durationSeconds / 60);
  const seconds = durationSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

export function AudioRecorderPage() {
  const {
    status,
    durationSeconds,
    audioUrl,
    errorMessage,
    isSupported,
    isSystemAudioSupported,
    isMicrophoneEnabled,
    microphonePermission,
    availableMicrophones,
    selectedMicrophoneId,
    audioInputSource,
    spectrumLevels,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    toggleMicrophone,
    requestMicrophonePermission,
    selectMicrophone,
    setAudioInputSource,
  } = useAudioRecorder();

  const runtime = useMemo(() => (isTauriRuntime() ? "desktop/mobile (Tauri)" : "browser"), []);

  const usesMicrophone = audioInputSource === "microphone" || audioInputSource === "mixed";
  const canUseSelectedSource = usesMicrophone ? isMicrophoneEnabled : true;
  const canStart = status !== "recording" && status !== "paused" && canUseSelectedSource;
  const canPause = status === "recording";
  const canResume = status === "paused";
  const canStop = status === "recording" || status === "paused";
  const shouldShowPermissionAction =
    isSupported &&
    usesMicrophone &&
    (microphonePermission === "prompt" || microphonePermission === "denied");

  return (
    <main className="neo-app-shell">
      <div className="neo-dashboard">
        <header className="neo-topbar">
          <span className="neo-topbar-label">READY TO ROLL?</span>
          <div className="neo-status-chip">
            <span className={`neo-status-dot ${status === "recording" ? "is-live" : ""}`} />
            {status === "recording" ? "REC_LIVE" : "SYSTEM_STANDBY"}
          </div>
        </header>

        <section className="neo-preview" aria-label="Audio capture surface">
          <div className="neo-grid-overlay" />
          <div className="neo-preview-content">
            <div className="neo-region-frame">
              <span className="neo-region-badge">AUDIO REGION</span>
              <div className="neo-audio-state">
                <p className="neo-audio-state-title">{status.toUpperCase()}</p>
                <p className="neo-audio-state-time">{formatDuration(durationSeconds)}</p>
                <div className="neo-spectrum" aria-hidden>
                  {spectrumLevels.map((level, index) => (
                    <span
                      key={index}
                      className="neo-spectrum-bar"
                      style={{
                        height: `${18 + level * 82}%`,
                        animationDelay: `${(index % 7) * 0.05}s`,
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="neo-controls" aria-label="Recorder controls">
          <button
            type="button"
            className="neo-button neo-side-button"
            onClick={() => {
              void toggleMicrophone();
            }}
            aria-pressed={isMicrophoneEnabled}
            disabled={canStop || !usesMicrophone}
          >
            <span className="neo-icon" aria-hidden>
              <svg viewBox="0 0 64 64" className="neo-mic-svg" role="img" focusable="false">
                <rect x="24" y="9" width="16" height="25" rx="8" fill="none" stroke="currentColor" strokeWidth="4" />
                <line x1="32" y1="37" x2="32" y2="47" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
                <path
                  d="M20 30v2c0 6.6 5.4 12 12 12s12-5.4 12-12v-2"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="4"
                  strokeLinecap="round"
                />
                <line x1="24" y1="52" x2="40" y2="52" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
              </svg>
            </span>
            <span className="neo-label">AUDIO</span>
            <span className={`neo-mic-indicator ${isMicrophoneEnabled ? "on" : "off"}`}>
              {usesMicrophone ? (isMicrophoneEnabled ? "ON" : "OFF") : "N/A"}
            </span>
          </button>

          <div className="neo-main-actions">
            {canStart && (
              <button type="button" className="neo-button neo-record-button" onClick={startRecording}>
                <span className="neo-record-dot" />
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

          <button type="button" className="neo-button neo-side-button" disabled>
            <span className="neo-icon" aria-hidden>
              tune
            </span>
            <span className="neo-label">SETUP</span>
            <span className="neo-soon">SOON</span>
          </button>
        </section>

        <section className="neo-output" aria-live="polite">
          {!isSupported && <p className="neo-error">This runtime does not support MediaRecorder.</p>}
          {errorMessage && <p className="neo-error">{errorMessage}</p>}

          <div className="neo-mic-panel">
            <label className="neo-mic-picker-label">
              Audio source
              <select
                className="neo-mic-picker"
                value={audioInputSource}
                onChange={(event) =>
                  setAudioInputSource(event.currentTarget.value as "microphone" | "system" | "mixed")
                }
                disabled={canStop}
              >
                <option value="microphone">Microphone input</option>
                <option value="system" disabled={!isSystemAudioSupported}>
                  System audio (tab/screen share)
                </option>
                <option value="mixed" disabled={!isSystemAudioSupported}>
                  Mixed (tab audio + microphone)
                </option>
              </select>
            </label>

            {(audioInputSource === "system" || audioInputSource === "mixed") && (
              <p className="neo-mic-meta">
                On web, system audio requires the screen-share picker. Enable "share tab audio" (or similar) in
                browser prompt.
              </p>
            )}

            <p className="neo-mic-meta">
              Microphone permission: <strong>{microphonePermission.toUpperCase()}</strong>
            </p>
            <p className="neo-mic-meta">
              Available microphones: <strong>{availableMicrophones.length}</strong>
            </p>

            {shouldShowPermissionAction && (
              <button
                type="button"
                className="neo-download-link neo-permission-btn"
                onClick={() => {
                  void requestMicrophonePermission();
                }}
              >
                Grant microphone access
              </button>
            )}

            {usesMicrophone && availableMicrophones.length > 0 && (
              <label className="neo-mic-picker-label">
                Input device
                <select
                  className="neo-mic-picker"
                  value={selectedMicrophoneId ?? ""}
                  onChange={(event) => selectMicrophone(event.currentTarget.value)}
                  disabled={canStop}
                >
                  {availableMicrophones.map((microphone) => (
                    <option key={microphone.deviceId} value={microphone.deviceId}>
                      {microphone.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          {audioUrl && (
            <div className="neo-playback-card">
              <p className="neo-playback-title">Last recording ready</p>
              <audio controls src={audioUrl} className="neo-audio-player" />
              <a href={audioUrl} download="recogni-audio.webm" className="neo-download-link">
                Download audio
              </a>
            </div>
          )}
        </section>
      </div>

      <footer className="neo-footer">
        <span>mode: audio_capture // runtime: {runtime}</span>
        <span>cross-platform: web + windows + macos + linux + android + ios</span>
      </footer>
    </main>
  );
}
