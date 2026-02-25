import { useCallback, useState } from "react";
import { AudioRecorderPage } from "@features/audio-recorder";
import { SelectionPage } from "@features/selection";
import { TitleBar } from "@shared/ui/titlebar/TitleBar";
import { isTauriRuntime } from "@shared/lib/runtime";
import "./App.css";

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
        backgroundColor: "var(--hot-pink)",
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

  if (mode === "audio") {
    return (
      <>
        <TitleBar title={titleBarState.title} backgroundColor={titleBarState.backgroundColor} />
        <div className="neo-app-container">
          <button className="neo-back-button" onClick={() => navigateTo("selection")}>
            <span className="neo-back-icon">←</span> VOLVER
          </button>
          <AudioRecorderPage />
        </div>
      </>
    );
  }

  if (mode === "screen") {
    return (
      <>
        <TitleBar title={titleBarState.title} backgroundColor={titleBarState.backgroundColor} />
        <div className="neo-app-container">
          <button className="neo-back-button" onClick={() => navigateTo("selection")}>
            <span className="neo-back-icon">←</span> VOLVER
          </button>
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
