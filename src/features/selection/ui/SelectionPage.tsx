import { memo } from "react";
import { AudioSelectionButton } from "./AudioSelectionButton";
import { ScreenSelectionButton } from "./ScreenSelectionButton";
import { AnonButton } from "./AnonButton";
import "./SelectionPage.css";

interface SelectionPageProps {
  onSelectAudio: () => void;
  onSelectScreen: () => void;
  onAnonClick?: () => void;
}

export const SelectionPage = memo(function SelectionPage({ onSelectAudio, onSelectScreen, onAnonClick }: SelectionPageProps) {
  return (
    <div className="neo-selection-wrapper">
      {onAnonClick && <AnonButton onClick={onAnonClick} />}
      <main className="neo-selection-container">
        <div className="neo-minimal-actions">
          <AudioSelectionButton onSelectAudio={onSelectAudio} />
          <ScreenSelectionButton onSelectScreen={onSelectScreen} />
        </div>
      </main>
    </div>
  );
});
