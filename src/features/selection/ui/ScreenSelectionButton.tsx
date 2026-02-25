import { useEffect, useRef } from "react";

interface ScreenSelectionButtonProps {
  onSelectScreen: () => void;
}

export function ScreenSelectionButton({ onSelectScreen }: ScreenSelectionButtonProps) {
  const screenButtonRef = useRef<HTMLButtonElement | null>(null);
  const screenCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const button = screenButtonRef.current;
    const canvas = screenCanvasRef.current;

    if (!button || !canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    type Wave = {
      x: number;
      y: number;
      radius: number;
      opacity: number;
    };

    type Particle = {
      x: number;
      y: number;
      size: number;
      speedX: number;
      speedY: number;
    };

    let waves: Wave[] = [];
    let particles: Particle[] = [];
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

    const makeParticle = (canvasWidth: number, canvasHeight: number): Particle => ({
      x: Math.random() * canvasWidth,
      y: Math.random() * canvasHeight,
      size: Math.random() * 3 + 1,
      speedX: (Math.random() - 0.5) * 2,
      speedY: (Math.random() - 0.5) * 2,
    });

    const resetParticle = (particle: Particle, canvasWidth: number, canvasHeight: number) => {
      const reset = makeParticle(canvasWidth, canvasHeight);
      particle.x = reset.x;
      particle.y = reset.y;
      particle.size = reset.size;
      particle.speedX = reset.speedX;
      particle.speedY = reset.speedY;
    };

    const stopAnimation = () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
      context.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    };

    const draw = () => {
      const canvasWidth = canvas.clientWidth;
      const canvasHeight = canvas.clientHeight;

      context.clearRect(0, 0, canvasWidth, canvasHeight);

      if (Math.random() < 0.05) {
        waves.push({
          x: Math.min(56, canvasWidth * 0.15),
          y: canvasHeight / 2,
          radius: 0,
          opacity: 0.5,
        });
      }

      waves = waves.filter((wave) => wave.opacity > 0);
      waves.forEach((wave) => {
        wave.radius += 2;
        wave.opacity -= 0.01;

        context.beginPath();
        context.arc(wave.x, wave.y, wave.radius, 0, Math.PI * 2);
        context.strokeStyle = `rgba(0, 0, 0, ${Math.max(wave.opacity, 0)})`;
        context.lineWidth = 2;
        context.stroke();
      });

      particles.forEach((particle) => {
        particle.x += particle.speedX;
        particle.y += particle.speedY;

        const outOfBounds =
          particle.x < 0 ||
          particle.x > canvasWidth ||
          particle.y < 0 ||
          particle.y > canvasHeight;

        if (outOfBounds) {
          resetParticle(particle, canvasWidth, canvasHeight);
        }

        context.fillStyle = "rgba(0, 0, 0, 0.28)";
        context.beginPath();
        context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        context.fill();
      });

      animationFrameId = requestAnimationFrame(draw);
    };

    const handleEnter = () => {
      resizeCanvas();

      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      particles = Array.from({ length: 30 }, () => makeParticle(width, height));
      waves = [];

      if (animationFrameId === null) {
        draw();
      }
    };

    const handleLeave = () => {
      stopAnimation();
    };

    const resizeObserver = new ResizeObserver(() => {
      resizeCanvas();
      if (animationFrameId !== null) {
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        particles = particles.map(() => makeParticle(width, height));
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
}
