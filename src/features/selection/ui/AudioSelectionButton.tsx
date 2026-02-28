import { memo, useRef } from "react";
import { useCanvasAnimation } from "./useCanvasAnimation";

interface AudioSelectionButtonProps {
  onSelectAudio: () => void;
}

type WaveBar = { height: number; targetHeight: number; speed: number };

const BAR_COUNT = 40;
let bars: WaveBar[] = [];

const initBars = (h: number) => {
  const maxH = Math.max(14, h * 0.72);
  bars = Array.from({ length: BAR_COUNT }, () => ({
    height: Math.random() * maxH * 0.45 + 6,
    targetHeight: Math.random() * maxH + 6,
    speed: 0.08 + Math.random() * 0.22,
  }));
};

export const AudioSelectionButton = memo(function AudioSelectionButton({ onSelectAudio }: AudioSelectionButtonProps) {
  const audioButtonRef = useRef<HTMLButtonElement | null>(null);
  const waveformCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useCanvasAnimation(audioButtonRef, waveformCanvasRef, {
    onEnter: (_ctx, _w, h) => initBars(h),
    onDraw: (ctx, w, h) => {
      const centerY = h / 2;
      const slotW = w / BAR_COUNT;
      const barW = Math.max(2, slotW - 2);
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
      for (let i = 0; i < BAR_COUNT; i++) {
        const bar = bars[i];
        if (!bar) continue;
        if (Math.abs(bar.height - bar.targetHeight) < 1) bar.targetHeight = Math.random() * (h * 0.76) + 4;
        bar.height += (bar.targetHeight - bar.height) * bar.speed;
        const x = i * slotW + (slotW - barW) / 2;
        ctx.beginPath();
        ctx.roundRect(x, centerY - bar.height / 2, barW, bar.height, 2);
        ctx.fill();
      }
    },
    onResize: (_w, h, isAnimating) => { if (isAnimating) initBars(h); },
  });

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
});
