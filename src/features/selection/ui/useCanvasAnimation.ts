import { useEffect, useRef, type RefObject } from "react";

interface CanvasAnimationCallbacks {
  onEnter: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  onDraw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  onResize?: (w: number, h: number, isAnimating: boolean) => void;
}

/**
 * Shared canvas animation hook for selection buttons.
 * Handles DPI-aware resize, ResizeObserver, mouseenter/leave/blur events, and cleanup.
 */
export function useCanvasAnimation(
  buttonRef: RefObject<HTMLButtonElement | null>,
  canvasRef: RefObject<HTMLCanvasElement | null>,
  callbacks: CanvasAnimationCallbacks,
): void {
  const cbRef = useRef(callbacks);
  cbRef.current = callbacks;

  useEffect(() => {
    const button = buttonRef.current;
    const canvas = canvasRef.current;
    if (!button || !canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let frameId: number | null = null;

    const resize = () => {
      const ratio = window.devicePixelRatio || 1;
      const { width, height } = button.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(width * ratio));
      canvas.height = Math.max(1, Math.floor(height * ratio));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    const stop = () => {
      if (frameId !== null) { cancelAnimationFrame(frameId); frameId = null; }
      ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    };

    const loop = () => {
      cbRef.current.onDraw(ctx, canvas.clientWidth, canvas.clientHeight);
      frameId = requestAnimationFrame(loop);
    };

    const handleEnter = () => {
      resize();
      cbRef.current.onEnter(ctx, canvas.clientWidth, canvas.clientHeight);
      if (frameId === null) loop();
    };

    const handleLeave = () => stop();

    const observer = new ResizeObserver(() => {
      resize();
      cbRef.current.onResize?.(canvas.clientWidth, canvas.clientHeight, frameId !== null);
    });

    observer.observe(button);
    button.addEventListener("mouseenter", handleEnter);
    button.addEventListener("mouseleave", handleLeave);
    button.addEventListener("blur", handleLeave);
    resize();

    return () => {
      observer.disconnect();
      button.removeEventListener("mouseenter", handleEnter);
      button.removeEventListener("mouseleave", handleLeave);
      button.removeEventListener("blur", handleLeave);
      stop();
    };
  }, [buttonRef, canvasRef]);
}
