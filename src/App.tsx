import { useState } from "react";
import { AudioRecorderPage } from "@features/audio-recorder";
import { SelectionPage } from "@features/selection";
import "./App.css";

type AppMode = "selection" | "audio" | "screen";

function App() {
  const [mode, setMode] = useState<AppMode>("selection");

  const navigateTo = (newMode: AppMode) => {
    // Check if the browser supports View Transitions API
    if (!document.startViewTransition) {
      setMode(newMode);
      return;
    }

    // With View Transitions API
    document.startViewTransition(() => {
      setMode(newMode);
    });
  };

  if (mode === "audio") {
    return (
      <div className="neo-app-container">
        <button className="neo-back-button" onClick={() => navigateTo("selection")}>
          <span className="neo-back-icon">←</span> VOLVER
        </button>
        <AudioRecorderPage />
      </div>
    );
  }

  if (mode === "screen") {
    return (
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
    );
  }

  return (
    <SelectionPage 
      onSelectAudio={() => navigateTo("audio")} 
      onSelectScreen={() => navigateTo("screen")} 
    />
  );
}

export default App;
