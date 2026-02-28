import { memo } from "react";
import { AudioSelectionButton } from "./AudioSelectionButton";
import { ScreenSelectionButton } from "./ScreenSelectionButton";
import "./SelectionPage.css";

interface SelectionPageProps {
  onSelectAudio: () => void;
  onSelectScreen: () => void;
}

export const SelectionPage = memo(function SelectionPage({ onSelectAudio, onSelectScreen }: SelectionPageProps) {
  return (
    <div className="neo-selection-wrapper">
      <main className="neo-selection-container">
        <div className="neo-minimal-actions">
          <AudioSelectionButton onSelectAudio={onSelectAudio} />
          <ScreenSelectionButton onSelectScreen={onSelectScreen} />
        </div>
      </main>
    </div>
  );
});
