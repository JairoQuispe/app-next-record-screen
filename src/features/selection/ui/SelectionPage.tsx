import "./SelectionPage.css";

interface SelectionPageProps {
  onSelectAudio: () => void;
  onSelectScreen: () => void;
}

export function SelectionPage({ onSelectAudio, onSelectScreen }: SelectionPageProps) {
  return (
    <div className="neo-selection-wrapper">
      <main className="neo-selection-container">
        <div className="neo-minimal-actions">
          <button 
            className="neo-minimal-btn neo-btn-pink" 
            onClick={onSelectAudio}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" strokeLinejoin="miter" className="neo-btn-icon-svg">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="22" />
              <line x1="8" y1="22" x2="16" y2="22" />
            </svg>
            <span className="neo-btn-text">GRABAR AUDIO</span>
          </button>

          <button 
            className="neo-minimal-btn neo-btn-green" 
            onClick={onSelectScreen}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" strokeLinejoin="miter" className="neo-btn-icon-svg">
              <rect x="2" y="3" width="20" height="14" rx="0" ry="0" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
              <path d="m16 7-4 4-4-4" />
            </svg>
            <span className="neo-btn-text">GRABAR AUDIO + PANTALLA</span>
          </button>
        </div>
      </main>
    </div>
  );
}
