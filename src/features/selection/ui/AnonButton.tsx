import { memo } from "react";
import "./AnonButton.css";

interface AnonButtonProps {
  onClick: () => void;
  variant?: "full" | "mask";
  position?: "top-center" | "top-right" | "titlebar-controls" | "titlebar-left";
}

export const AnonButton = memo(function AnonButton({
  onClick,
  variant = "full",
  position = "top-center",
}: AnonButtonProps) {
  const buttonClassName = [
    "neo-anon-btn",
    variant === "mask" ? "neo-anon-btn--mask" : "",
    position === "top-right" ? "neo-anon-btn--top-right" : "",
    position === "titlebar-controls" ? "neo-anon-btn--titlebar-controls" : "",
    position === "titlebar-left" ? "neo-anon-btn--titlebar-left" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      className={buttonClassName}
      onClick={onClick}
      type="button"
    >
      <span className="neo-anon-btn-icon" aria-hidden="true">
        <svg
          className="icon-anon"
          viewBox="0 0 100 120"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path fillRule="evenodd" clipRule="evenodd" d="
                      M 50 4 C 20 4 4 25 4 55 C 4 80 18 102 30 110 C 38 115 45 118 50 118 C 55 118 62 115 70 110 C 82 102 96 80 96 55 C 96 25 80 4 50 4 Z
                      M 22 46 C 30 42 38 43 45 47 C 40 50 32 50 22 46 Z
                      M 78 46 C 70 42 62 43 55 47 C 60 50 68 50 78 46 Z
                      M 18 36 C 25 24 38 30 45 35 C 35 29 25 31 18 36 Z
                      M 82 36 C 75 24 62 30 55 35 C 65 29 75 31 82 36 Z
                      M 46 64 C 50 62 54 64 54 68 C 50 67 46 68 46 64 Z
                      M 50 75 C 40 75 25 79 12 68 C 25 85 40 85 50 82 C 60 85 75 85 88 68 C 75 79 60 75 50 75 Z
                      M 44 95 C 48 91 52 91 56 95 C 54 110 52 114 50 114 C 48 114 46 110 44 95 Z
                      M 14 62 C 20 80 32 88 42 92 C 30 85 18 75 14 62 Z
                      M 86 62 C 80 80 68 88 58 92 C 70 85 82 75 86 62 Z
                  " fill="currentColor" />
        </svg>
        <svg
          className="icon-user"
          viewBox="0 0 100 120"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path fillRule="evenodd" clipRule="evenodd" d="
                      M 50 10 C 35 10 25 20 25 35 C 25 50 35 60 50 60 C 65 60 75 50 75 35 C 75 20 65 10 50 10 Z
                      M 50 65 C 25 65 10 75 10 90 L 10 110 L 90 110 L 90 90 C 90 75 75 65 50 65 Z
                  " fill="currentColor" />
        </svg>
      </span>
      {variant === "full" && (
        <span className="neo-anon-btn-text" aria-live="polite">
          <span className="text-anon">Anon</span>
          <span className="text-user">Ingresar</span>
        </span>
      )}
    </button>
  );
});
