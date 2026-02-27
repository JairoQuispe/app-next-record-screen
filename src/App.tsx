import { lazy, Suspense, useCallback, useState } from "react";
import { SelectionPage } from "@features/selection";
import { TitleBar } from "@shared/ui/titlebar/TitleBar";
import { isTauriRuntime } from "@shared/lib/runtime";
import "./App.css";

const AudioRecorderPage = lazy(() =>
  import("@features/audio-recorder/ui/AudioRecorderPage").then((m) => ({ default: m.AudioRecorderPage }))
);

type AppMode = "selection" | "audio" | "screen";
type TitleBarState = {
  title?: string;
  backgroundColor?: string;
};

function App() {
  const [mode, setMode] = useState<AppMode>("selection");
  const [titleBarState, setTitleBarState] = useState<TitleBarState>({});

  const setViewTransition = useCallback((transition?: string) => {
    if (typeof document === "undefined") return;

    if (transition) {
      document.documentElement.dataset.viewTransition = transition;
    } else {
      delete document.documentElement.dataset.viewTransition;
    }
  }, []);

  const navigateTo = useCallback((newMode: AppMode) => {
    if (newMode === "selection") {
      setTitleBarState({});
      setViewTransition();
    }
    // Check if the browser supports View Transitions API
    if (!document.startViewTransition) {
      setMode(newMode);
      return;
    }

    // With View Transitions API
    document.startViewTransition(() => {
      setMode(newMode);
    });
  }, [setViewTransition]);

  const handleSelectAudio = useCallback(() => {
    if (isTauriRuntime()) {
      setTitleBarState({
        title: "GRABAR AUDIO",
        backgroundColor: "#19c4ae",
      });
    }
    setViewTransition("audio-setup");
    navigateTo("audio");
  }, [navigateTo, setViewTransition]);

  const handleSelectScreen = useCallback(() => {
    if (isTauriRuntime()) {
      setTitleBarState({
        title: "GRABAR AUDIO + PANTALLA",
        backgroundColor: "var(--electric-purple)",
      });
    }
    navigateTo("screen");
  }, [navigateTo]);

  const handleBackToSelection = useCallback(() => {
    navigateTo("selection");
  }, [navigateTo]);

  const backButton = (
    <button className="neo-titlebar-back" onClick={handleBackToSelection}>
      <span className="neo-back-icon">←</span> VOLVER
    </button>
  );

  const isTauri = isTauriRuntime();

  if (mode === "audio") {
    return (
      <>
        <TitleBar
          title={titleBarState.title}
          backgroundColor={titleBarState.backgroundColor}
          leftAction={backButton}
        />
        <div className="neo-app-container">
          {!isTauri && (
            <button className="neo-back-button" onClick={handleBackToSelection}>
              <svg className="neo-back-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" width="18" height="18" aria-hidden="true">
                <path d="M19 12H5" />
                <path d="M12 19l-7-7 7-7" />
              </svg>
              <span className="neo-back-label">VOLVER</span>
            </button>
          )}
          <Suspense fallback={null}>
            <AudioRecorderPage />
          </Suspense>
        </div>
      </>
    );
  }

  if (mode === "screen") {
    return (
      <>
        <TitleBar
          title={titleBarState.title}
          backgroundColor={titleBarState.backgroundColor}
          leftAction={backButton}
        />
        <div className="neo-app-container">
          {!isTauri && (
            <button className="neo-back-button" onClick={handleBackToSelection}>
              <svg className="neo-back-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" width="18" height="18" aria-hidden="true">
                <path d="M19 12H5" />
                <path d="M12 19l-7-7 7-7" />
              </svg>
              <span className="neo-back-label">VOLVER</span>
            </button>
          )}
          <div className="neo-temp-placeholder">
            <div className="neo-badge">PRÓXIMAMENTE</div>
            <h2>GRABACIÓN DE PANTALLA</h2>
            <p>Esta función estará disponible en la próxima actualización.</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <TitleBar title={titleBarState.title} backgroundColor={titleBarState.backgroundColor} />
      <SelectionPage
        onSelectAudio={handleSelectAudio}
        onSelectScreen={handleSelectScreen}
      />
    </>
  );
}

export default App;
