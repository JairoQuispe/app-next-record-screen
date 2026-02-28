import { memo, useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { isTauriRuntime } from "@shared/lib/runtime/isTauriRuntime";
import "./TitleBar.css";

const IS_TAURI = isTauriRuntime();

type WindowControls = {
  minimize(): Promise<void>;
  toggleMaximize(): Promise<void>;
  close(): Promise<void>;
};

const minimizeIcon = (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
    <path fill="currentColor" d="M19 13H5v-2h14z" />
  </svg>
);

const maximizeIcon = (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
    <path fill="currentColor" d="M4 4h16v16H4zm2 4v10h12V8z" />
  </svg>
);

const closeIcon = (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
    <path
      fill="currentColor"
      d="M13.46 12L19 17.54V19h-1.46L12 13.46L6.46 19H5v-1.46L10.54 12L5 6.46V5h1.46L12 10.54L17.54 5H19v1.46z"
    />
  </svg>
);

interface TitleBarProps {
  title?: string;
  backgroundColor?: string;
  leftAction?: ReactNode;
}

export const TitleBar = memo(function TitleBar({ title, backgroundColor, leftAction }: TitleBarProps) {
  const [appWindow, setAppWindow] = useState<WindowControls | null>(null);

  useEffect(() => {
    if (!IS_TAURI) return;

    let mounted = true;

    (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        if (mounted) {
          setAppWindow(getCurrentWindow());
        }
      } catch (error) {
        console.error("[TitleBar] Failed to load Tauri window API", error);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);
  const resolvedTitle = title ?? "RECOGNI";
  const isHomeTitle = !title || resolvedTitle === "RECOGNI";
  const style = useMemo<CSSProperties | undefined>(
    () =>
      ({
        "--neo-titlebar-bg": backgroundColor,
        "--neo-titlebar-fg": isHomeTitle ? "#ffffff" : "#000000",
      } as CSSProperties),
    [backgroundColor, isHomeTitle]
  );

  const handleMinimize = useCallback(async () => {
    await appWindow?.minimize();
  }, [appWindow]);

  const handleToggleMaximize = useCallback(async () => {
    await appWindow?.toggleMaximize();
  }, [appWindow]);

  const handleClose = useCallback(async () => {
    await appWindow?.close();
  }, [appWindow]);

  if (!IS_TAURI) return null;

  return (
    <div className="neo-titlebar" style={style}>
      <div
        className="neo-titlebar-drag"
        data-tauri-drag-region
        onDoubleClick={handleToggleMaximize}
      >
        <div className="neo-titlebar-left" data-tauri-drag-region>
          {leftAction ? (
            <div className="neo-titlebar-left-action">{leftAction}</div>
          ) : null}
          <span className="neo-titlebar-appname" data-tauri-drag-region>
            {resolvedTitle}
          </span>
        </div>
      </div>

      <div className="neo-titlebar-controls">
        <button
          type="button"
          className="neo-titlebar-btn neo-titlebar-btn--minimize"
          onClick={handleMinimize}
          aria-label="Minimizar"
          title="Minimizar"
        >
          {minimizeIcon}
        </button>

        <button
          type="button"
          className="neo-titlebar-btn neo-titlebar-btn--maximize"
          onClick={handleToggleMaximize}
          aria-label="Maximizar"
          title="Maximizar"
        >
          {maximizeIcon}
        </button>

        <button
          type="button"
          className="neo-titlebar-btn neo-titlebar-btn--close"
          onClick={handleClose}
          aria-label="Cerrar"
          title="Cerrar"
        >
          {closeIcon}
        </button>
      </div>
    </div>
  );
});
