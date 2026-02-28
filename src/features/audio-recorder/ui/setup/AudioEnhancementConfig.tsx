import { memo } from "react";

interface AudioEnhancementConfigProps {
  denoiseEnabled: boolean;
  denoiseIntensity: number;
  normalizeEnabled: boolean;
  realtimeTranscriptionEnabled: boolean;
  onSetDenoiseEnabled: (v: boolean) => void;
  onSetDenoiseIntensity: (v: number) => void;
  onSetNormalizeEnabled: (v: boolean) => void;
  onSetRealtimeTranscriptionEnabled: (v: boolean) => void;
}

export const AudioEnhancementConfig = memo(function AudioEnhancementConfig({
  denoiseEnabled, denoiseIntensity, normalizeEnabled, realtimeTranscriptionEnabled,
  onSetDenoiseEnabled, onSetDenoiseIntensity, onSetNormalizeEnabled, onSetRealtimeTranscriptionEnabled,
}: AudioEnhancementConfigProps) {
  return (
    <div className="neo-config-popup neo-gear-popup" role="region" aria-label="Audio Enhancement">
      <div className="neo-gear-section">
        <div className="neo-gear-row">
          <span className="neo-gear-label">SUPRIMIR RUIDO</span>
          <button
            type="button"
            className={`neo-gear-toggle ${denoiseEnabled ? "is-on" : ""}`}
            onClick={() => onSetDenoiseEnabled(!denoiseEnabled)}
            aria-pressed={denoiseEnabled}
            aria-label="Activar supresión de ruido"
          >
            <span className="neo-gear-toggle-knob" />
          </button>
        </div>
        <p className="neo-gear-desc">
          Elimina ruido de fondo y prioriza las voces humanas usando IA. Ajusta la intensidad para controlar cuánto ruido se suprime.
        </p>

        {denoiseEnabled && (
          <div className="neo-gear-slider-group">
            <label className="neo-gear-slider-label" htmlFor="denoise-intensity">
              INTENSIDAD: <strong>{denoiseIntensity}%</strong>
            </label>
            <input
              id="denoise-intensity"
              type="range"
              min={0}
              max={100}
              step={5}
              value={denoiseIntensity}
              onChange={(e) => onSetDenoiseIntensity(Number(e.target.value))}
              className="neo-gear-slider"
            />
            <div className="neo-gear-slider-marks">
              <span>0%</span>
              <span>50%</span>
              <span>100%</span>
            </div>
          </div>
        )}
      </div>

      <div className="neo-gear-section">
        <div className="neo-gear-row">
          <span className="neo-gear-label">NORMALIZAR VOLUMEN</span>
          <button
            type="button"
            className={`neo-gear-toggle ${normalizeEnabled ? "is-on" : ""}`}
            onClick={() => onSetNormalizeEnabled(!normalizeEnabled)}
            aria-pressed={normalizeEnabled}
            aria-label="Activar normalización de volumen"
          >
            <span className="neo-gear-toggle-knob" />
          </button>
        </div>
        <p className="neo-gear-desc">
          Iguala el volumen del audio para que las partes silenciosas se escuchen mejor sin distorsionar las más fuertes.
        </p>
      </div>

      <div className="neo-gear-section">
        <div className="neo-gear-row">
          <span className="neo-gear-label">TRANSCRIPCIÓN EN TIEMPO REAL</span>
          <button
            type="button"
            className={`neo-gear-toggle ${realtimeTranscriptionEnabled ? "is-on" : ""}`}
            onClick={() => onSetRealtimeTranscriptionEnabled(!realtimeTranscriptionEnabled)}
            aria-pressed={realtimeTranscriptionEnabled}
            aria-label="Activar transcripción en tiempo real"
          >
            <span className="neo-gear-toggle-knob" />
          </button>
        </div>
        <p className="neo-gear-desc">
          Convierte el audio a texto en tiempo real mientras grabas. Utiliza IA para transcribir voz automáticamente.
        </p>
      </div>
    </div>
  );
});
