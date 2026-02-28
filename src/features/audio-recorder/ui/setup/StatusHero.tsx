import { memo } from "react";
import { formatDuration } from "@shared/lib/utils/formatDuration";

interface StatusHeroProps {
  durationSeconds: number;
  isRecording: boolean;
  isPaused: boolean;
  statusLabel: string;
}

export const StatusHero = memo(function StatusHero({ durationSeconds, isRecording, isPaused, statusLabel }: StatusHeroProps) {
  return (
    <div className="neo-setup-hero">
      <span className="neo-setup-hero-label">DURATION</span>
      <span
        className={`neo-setup-hero-time ${isRecording ? "is-recording" : ""}`}
        aria-live="polite"
        aria-atomic="true"
      >
        {formatDuration(durationSeconds)}
      </span>
      <span className={`neo-setup-hero-status ${isRecording ? "is-recording" : ""} ${isPaused ? "is-paused" : ""}`}>
        {isRecording && <span className="neo-setup-hero-dot" aria-hidden="true" />}
        {statusLabel}
      </span>
    </div>
  );
});
