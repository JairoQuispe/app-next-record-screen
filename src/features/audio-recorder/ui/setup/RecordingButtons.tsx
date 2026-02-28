import { memo } from "react";
import { MicIcon } from "@shared/ui/icons/MicIcon";

const gearSvg = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="neo-gear-icon" width="24" height="24" role="img" aria-hidden="true">
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const pauseSvg = (
  <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24" aria-hidden="true">
    <rect x="6" y="4" width="4" height="16" rx="1" />
    <rect x="14" y="4" width="4" height="16" rx="1" />
  </svg>
);

const resumeSvg = (
  <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24" aria-hidden="true">
    <polygon points="8,5 19,12 8,19" />
  </svg>
);

const stopSvg = (
  <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24" aria-hidden="true">
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </svg>
);

interface RecordingButtonsProps {
  isIdle: boolean;
  isStopped: boolean;
  isRecording: boolean;
  isPaused: boolean;
  disableStart: boolean;
  onToggleConfig: () => void;
  onToggleGear: () => void;
  onStart: () => void;
  onStop: () => void;
  onPause: () => void;
  onResume: () => void;
}

export const RecordingButtons = memo(function RecordingButtons({
  isIdle, isStopped, isRecording, isPaused, disableStart,
  onToggleConfig, onToggleGear, onStart, onStop, onPause, onResume,
}: RecordingButtonsProps) {
  return (
    <div className="neo-setup-rec-buttons">
      {(isIdle || isStopped) && (
        <>
          <button type="button" className="neo-setup-config-btn" onClick={onToggleConfig} aria-label="Configuración de fuentes de audio">
            <MicIcon />
          </button>
          <button type="button" className="neo-setup-rec-btn" onClick={onStart} disabled={disableStart} />
          <button type="button" className="neo-setup-gear-btn" onClick={onToggleGear} aria-label="Configuración de audio">
            {gearSvg}
          </button>
        </>
      )}
      {isRecording && (
        <>
          <button type="button" className="neo-setup-config-btn neo-setup-config-btn--pause" onClick={onPause} aria-label="Pausar grabación">{pauseSvg}</button>
          <button type="button" className="neo-setup-rec-btn neo-setup-rec-btn--stop" onClick={onStop} />
          <button type="button" className="neo-setup-gear-btn neo-setup-gear-btn--stop" onClick={onStop} aria-label="Detener grabación">{stopSvg}</button>
        </>
      )}
      {isPaused && (
        <>
          <button type="button" className="neo-setup-config-btn neo-setup-config-btn--resume" onClick={onResume} aria-label="Reanudar grabación">{resumeSvg}</button>
          <button type="button" className="neo-setup-rec-btn neo-setup-rec-btn--stop" onClick={onStop} />
          <button type="button" className="neo-setup-gear-btn neo-setup-gear-btn--stop" onClick={onStop} aria-label="Detener grabación">{stopSvg}</button>
        </>
      )}
    </div>
  );
});
