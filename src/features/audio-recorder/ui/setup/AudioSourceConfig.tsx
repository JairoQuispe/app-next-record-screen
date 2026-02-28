import { memo } from "react";
import { MicIcon } from "@shared/ui/icons/MicIcon";
import { MonitorIcon } from "@shared/ui/icons/MonitorIcon";

const micOptionIcon = (
  <svg className="neo-config-mic-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="14" height="14" aria-hidden="true">
    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
  </svg>
);

const checkIcon = (
  <svg className="neo-config-mic-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" width="12" height="12" aria-hidden="true">
    <path d="M5 12l5 5L19 7" />
  </svg>
);

interface AudioSourceConfigProps {
  isMicChecked: boolean;
  isSystemChecked: boolean;
  isSystemAudioSupported: boolean;
  usesMicrophone: boolean;
  shouldShowPermissionAction: boolean;
  isBusy: boolean;
  availableMicrophones: Array<{ deviceId: string; label: string }>;
  selectedMicrophoneId: string | null;
  onToggleMic: () => void;
  onToggleSystem: () => void;
  onRequestPermission: () => void;
  onSelectMicrophone: (deviceId: string) => void;
}

export const AudioSourceConfig = memo(function AudioSourceConfig({
  isMicChecked, isSystemChecked, isSystemAudioSupported,
  usesMicrophone, shouldShowPermissionAction, isBusy,
  availableMicrophones, selectedMicrophoneId,
  onToggleMic, onToggleSystem, onRequestPermission, onSelectMicrophone,
}: AudioSourceConfigProps) {
  return (
    <div className="neo-config-popup" role="region" aria-label="Audio Setup">
      <div className="neo-config-popup-row">
        <button
          type="button"
          aria-pressed={isMicChecked}
          className={`neo-config-source ${isMicChecked ? "is-on" : ""}`}
          onClick={onToggleMic}
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
            onClick={onToggleSystem}
            disabled={!isSystemAudioSupported || isBusy}
          >
            <MonitorIcon />
            <span>SYSTEM</span>
          </button>
        )}
      </div>

      {usesMicrophone && !isBusy && shouldShowPermissionAction && (
        <button type="button" className="neo-config-permit-btn" onClick={onRequestPermission}>
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
                onClick={() => onSelectMicrophone(microphone.deviceId)}
                aria-label={`Seleccionar ${microphone.label}`}
              >
                {micOptionIcon}
                <span className="neo-config-mic-label">
                  {microphone.label || `Micrófono ${microphone.deviceId.slice(0, 5)}...`}
                </span>
                {isSelected ? checkIcon : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
});
