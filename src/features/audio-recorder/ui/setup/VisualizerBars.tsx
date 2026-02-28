import { memo, useRef, useEffect } from "react";

export const VisualizerBars = memo(function VisualizerBars({ levels }: { levels: number[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const levelsRef = useRef<number[]>(levels);
  const barsRef = useRef<number[]>([]);

  levelsRef.current = levels;

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const barCount = 40;
    const lerpSpeed = 0.18;
    let animationFrameId: number | null = null;

    if (barsRef.current.length !== barCount) {
      barsRef.current = new Array(barCount).fill(0);
    }

    const resizeCanvas = () => {
      const ratio = window.devicePixelRatio || 1;
      const { width, height } = container.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(width * ratio));
      canvas.height = Math.max(1, Math.floor(height * ratio));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    const drawWaveform = () => {
      const canvasWidth = canvas.clientWidth;
      const canvasHeight = canvas.clientHeight;
      const centerY = canvasHeight / 2;
      const slotWidth = canvasWidth / barCount;
      const barWidth = Math.max(2, slotWidth - 2);
      const maxBarHeight = canvasHeight * 0.88;
      const minBarHeight = 3;

      const currentLevels = levelsRef.current;
      const levelCount = currentLevels.length;
      const bars = barsRef.current;

      context.clearRect(0, 0, canvasWidth, canvasHeight);
      context.fillStyle = "rgba(255, 255, 255, 0.85)";

      for (let i = 0; i < barCount; i++) {
        const li = levelCount > 0 ? Math.floor((i / barCount) * levelCount) : 0;
        const level = levelCount > 0 ? currentLevels[Math.min(li, levelCount - 1)] : 0;
        const targetHeight = Math.max(minBarHeight, level * maxBarHeight);

        bars[i] += (targetHeight - bars[i]) * lerpSpeed;

        const h = bars[i];
        const x = i * slotWidth + (slotWidth - barWidth) / 2;
        const y = centerY - h / 2;

        context.beginPath();
        context.roundRect(x, y, barWidth, h, 2);
        context.fill();
      }

      animationFrameId = requestAnimationFrame(drawWaveform);
    };

    resizeCanvas();
    drawWaveform();

    const resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, []);

  return (
    <div ref={containerRef} className="neo-viz-bars" aria-hidden="true">
      <canvas ref={canvasRef} className="neo-viz-canvas" aria-hidden="true" />
    </div>
  );
});
