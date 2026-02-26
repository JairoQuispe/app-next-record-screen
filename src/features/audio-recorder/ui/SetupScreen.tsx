import { MicIcon, MonitorIcon, CheckIcon } from "@shared/ui/icons";
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
  >;
  actions: Pick<
    AudioRecorderActions,
    "requestMicrophonePermission" | "selectMicrophone" | "setAudioInputSource"
  >;
  animateIn: boolean;
  onContinue: () => void;
}

export function SetupScreen({ state, actions, animateIn, onContinue }: SetupScreenProps) {
  const {
    isSupported,
    isSystemAudioSupported,
    errorMessage,
    microphonePermission,
    availableMicrophones,
    selectedMicrophoneId,
    audioInputSource,
  } = state;

  const { requestMicrophonePermission, selectMicrophone, setAudioInputSource } = actions;

  const isMicChecked = audioInputSource === "microphone" || audioInputSource === "mixed";
  const isSystemChecked = audioInputSource === "system" || audioInputSource === "mixed";
  const usesMicrophone = audioInputSource === "microphone" || audioInputSource === "mixed";
  const shouldShowPermissionAction =
    isSupported &&
    usesMicrophone &&
    (microphonePermission === "prompt" || microphonePermission === "denied");

  const toggleMicrophoneSource = () => {
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
    if (!isSystemAudioSupported) {
      return;
    }

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

  return (
    <main className={`neo-app-shell neo-app-shell--setup neo-animate-enter ${animateIn ? 'is-visible' : ''}`}>
      <div className="neo-setup-layout">
        
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
                disabled={!isSystemAudioSupported}
                aria-disabled={!isSystemAudioSupported}
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

          {usesMicrophone && (
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
          <button 
            type="button"
            className="neo-btn-action neo-btn-green neo-setup-start"
            onClick={onContinue}
            disabled={usesMicrophone && shouldShowPermissionAction}
            aria-disabled={usesMicrophone && shouldShowPermissionAction}
          >
            CONTINUAR A GRABACIÓN →
          </button>
        </footer>
        </div>
      </div>
    </main>
  );
}
