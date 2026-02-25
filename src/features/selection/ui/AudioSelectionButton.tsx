import { useEffect, useRef } from "react";

interface AudioSelectionButtonProps {
  onSelectAudio: () => void;
}

export function AudioSelectionButton({ onSelectAudio }: AudioSelectionButtonProps) {
  const audioButtonRef = useRef<HTMLButtonElement | null>(null);
  const waveformCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const button = audioButtonRef.current;
    const canvas = waveformCanvasRef.current;

    if (!button || !canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    type WaveBar = {
      height: number;
      targetHeight: number;
      speed: number;
    };

    const barCount = 40;
    let bars: WaveBar[] = [];
    let animationFrameId: number | null = null;

    const resizeCanvas = () => {
      const ratio = window.devicePixelRatio || 1;
      const { width, height } = button.getBoundingClientRect();

      canvas.width = Math.max(1, Math.floor(width * ratio));
      canvas.height = Math.max(1, Math.floor(height * ratio));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    const initBars = () => {
      const maxHeight = Math.max(14, canvas.clientHeight * 0.72);
      bars = Array.from({ length: barCount }, () => ({
        height: Math.random() * maxHeight * 0.45 + 6,
        targetHeight: Math.random() * maxHeight + 6,
        speed: 0.08 + Math.random() * 0.22,
      }));
    };

    const stopAnimation = () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
      context.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    };

    const drawWaveform = () => {
      const canvasWidth = canvas.clientWidth;
      const canvasHeight = canvas.clientHeight;
      const centerY = canvasHeight / 2;
      const slotWidth = canvasWidth / barCount;
      const barWidth = Math.max(2, slotWidth - 2);

      context.clearRect(0, 0, canvasWidth, canvasHeight);
      context.fillStyle = "rgba(0, 0, 0, 0.28)";

      bars.forEach((bar, index) => {
        if (Math.abs(bar.height - bar.targetHeight) < 1) {
          bar.targetHeight = Math.random() * (canvasHeight * 0.76) + 4;
        }

        bar.height += (bar.targetHeight - bar.height) * bar.speed;

        const x = index * slotWidth + (slotWidth - barWidth) / 2;
        const y = centerY - bar.height / 2;

        context.beginPath();
        context.roundRect(x, y, barWidth, bar.height, 2);
        context.fill();
      });

      animationFrameId = requestAnimationFrame(drawWaveform);
    };

    const handleEnter = () => {
      resizeCanvas();
      initBars();
      if (animationFrameId === null) {
        drawWaveform();
      }
    };

    const handleLeave = () => {
      stopAnimation();
    };

    const resizeObserver = new ResizeObserver(() => {
      resizeCanvas();
      if (animationFrameId !== null) {
        initBars();
      }
    });

    resizeObserver.observe(button);
    button.addEventListener("mouseenter", handleEnter);
    button.addEventListener("mouseleave", handleLeave);
    button.addEventListener("blur", handleLeave);
    resizeCanvas();

    return () => {
      resizeObserver.disconnect();
      button.removeEventListener("mouseenter", handleEnter);
      button.removeEventListener("mouseleave", handleLeave);
      button.removeEventListener("blur", handleLeave);
      stopAnimation();
    };
  }, []);

  return (
    <button ref={audioButtonRef} className="neo-minimal-btn neo-btn-green" onClick={onSelectAudio}>
      <canvas ref={waveformCanvasRef} className="neo-waveform-canvas" aria-hidden="true" />
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="square"
        strokeLinejoin="miter"
        className="neo-btn-icon-svg"
      >
        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="22" />
        <line x1="8" y1="22" x2="16" y2="22" />
      </svg>
      <span className="neo-btn-text">GRABAR AUDIO</span>
    </button>
  );
}
