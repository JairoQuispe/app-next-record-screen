import { memo, useRef } from "react";
import { useCanvasAnimation } from "./useCanvasAnimation";

interface ScreenSelectionButtonProps {
  onSelectScreen: () => void;
}

type Wave = { x: number; y: number; radius: number; opacity: number };
type Particle = { x: number; y: number; size: number; speedX: number; speedY: number };

const TWO_PI = Math.PI * 2;
let waves: Wave[] = [];
let particles: Particle[] = [];

const makeParticle = (w: number, h: number): Particle => ({
  x: Math.random() * w, y: Math.random() * h,
  size: Math.random() * 3 + 1,
  speedX: (Math.random() - 0.5) * 2, speedY: (Math.random() - 0.5) * 2,
});

export const ScreenSelectionButton = memo(function ScreenSelectionButton({ onSelectScreen }: ScreenSelectionButtonProps) {
  const screenButtonRef = useRef<HTMLButtonElement | null>(null);
  const screenCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useCanvasAnimation(screenButtonRef, screenCanvasRef, {
    onEnter: (_ctx, w, h) => {
      particles = Array.from({ length: 30 }, () => makeParticle(w, h));
      waves = [];
    },
    onDraw: (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);

      if (Math.random() < 0.05) {
        waves.push({ x: Math.min(56, w * 0.15), y: h / 2, radius: 0, opacity: 0.5 });
      }
      waves = waves.filter((wave) => wave.opacity > 0);
      for (const wave of waves) {
        wave.radius += 2;
        wave.opacity -= 0.01;
        ctx.beginPath();
        ctx.arc(wave.x, wave.y, wave.radius, 0, TWO_PI);
        ctx.strokeStyle = `rgba(0, 0, 0, ${Math.max(wave.opacity, 0)})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
      for (const p of particles) {
        p.x += p.speedX;
        p.y += p.speedY;
        if (p.x < 0 || p.x > w || p.y < 0 || p.y > h) Object.assign(p, makeParticle(w, h));
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, TWO_PI);
        ctx.fill();
      }
    },
    onResize: (w, h, isAnimating) => {
      if (isAnimating) particles = particles.map(() => makeParticle(w, h));
    },
  });

  return (
    <button ref={screenButtonRef} className="neo-minimal-btn neo-btn-pink" onClick={onSelectScreen}>
      <div className="neo-capture-corners" aria-hidden="true">
        <span className="neo-corner neo-corner-tl" />
        <span className="neo-corner neo-corner-tr" />
        <span className="neo-corner neo-corner-bl" />
        <span className="neo-corner neo-corner-br" />
      </div>
      <canvas ref={screenCanvasRef} className="neo-screen-canvas" aria-hidden="true" />
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="square"
        strokeLinejoin="miter"
        className="neo-btn-icon-svg"
      >
        <rect x="2" y="3" width="20" height="14" rx="0" ry="0" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
        <path d="m16 7-4 4-4-4" />
      </svg>
      <span className="neo-btn-text">GRABAR AUDIO + PANTALLA</span>
    </button>
  );
});
