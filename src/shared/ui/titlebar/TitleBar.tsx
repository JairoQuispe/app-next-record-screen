import { useCallback, useMemo, type CSSProperties } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauriRuntime } from "@shared/lib/runtime";
import "./TitleBar.css";

function getAppWindow() {
  if (!isTauriRuntime()) return null;

  try {
    return getCurrentWindow();
  } catch {
    return null;
  }
}

interface TitleBarProps {
  title?: string;
  backgroundColor?: string;
}

export function TitleBar({ title, backgroundColor }: TitleBarProps) {
  const appWindow = useMemo(() => getAppWindow(), []);
  const style = useMemo<CSSProperties | undefined>(
    () => (backgroundColor ? ({ "--neo-titlebar-bg": backgroundColor } as CSSProperties) : undefined),
    [backgroundColor]
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

  if (!isTauriRuntime()) return null;

  return (
    <div className="neo-titlebar" style={style}>
      <div
        className="neo-titlebar-drag"
        data-tauri-drag-region
        onDoubleClick={handleToggleMaximize}
      >
        <span className="neo-titlebar-appname" data-tauri-drag-region>
          {title ?? "RECOGNI"}
        </span>
      </div>

      <div className="neo-titlebar-controls">
        <button
          type="button"
          className="neo-titlebar-btn neo-titlebar-btn--minimize"
          onClick={handleMinimize}
          aria-label="Minimizar"
          title="Minimizar"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path fill="currentColor" d="M19 13H5v-2h14z" />
          </svg>
        </button>

        <button
          type="button"
          className="neo-titlebar-btn neo-titlebar-btn--maximize"
          onClick={handleToggleMaximize}
          aria-label="Maximizar"
          title="Maximizar"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path fill="currentColor" d="M4 4h16v16H4zm2 4v10h12V8z" />
          </svg>
        </button>

        <button
          type="button"
          className="neo-titlebar-btn neo-titlebar-btn--close"
          onClick={handleClose}
          aria-label="Cerrar"
          title="Cerrar"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path
              fill="currentColor"
              d="M13.46 12L19 17.54V19h-1.46L12 13.46L6.46 19H5v-1.46L10.54 12L5 6.46V5h1.46L12 10.54L17.54 5H19v1.46z"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
