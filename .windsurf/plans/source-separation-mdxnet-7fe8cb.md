# Plan: Source Separation (Voces vs Música/Ruido) con MDX-Net ONNX

Implementar separación de fuentes de audio post-grabación usando modelos MDX-Net ONNX, con soporte para desktop (Rust `ort` crate) y web (`onnxruntime-web`), permitiendo al usuario aislar voces de música/ruido ambiental.

---

## 1. Resumen Técnico

### Modelo Elegido: UVR-MDX-NET-Voc_FT (ONNX)
- **Fuente**: `seanghay/uvr_models` en Hugging Face
- **Tamaño**: ~25MB (modelo ONNX)
- **Tipo**: Red neuronal U-Net entrenada para separación vocal/accompaniment
- **Salida**: 2 stems → **vocals** (voces) y **accompaniment** (música + ruido)
- **Calidad**: ⭐⭐⭐⭐ (muy buena para separación vocal)

### Pipeline de Procesamiento
```
Audio WAV → STFT (espectrograma) → MDX-Net ONNX → Máscara → ISTFT → Stems separados
```

### Requisitos Mínimos del Dispositivo
| Recurso          | Mínimo                    | Recomendado              |
|-------------------|---------------------------|--------------------------|
| **GPU**           | ❌ No requerida            | ✅ Acelera 3-10x          |
| **RAM**           | 4GB libre                 | 8GB+                     |
| **CPU**           | x64 con SSE4.2 / ARM64   | i5/Ryzen 5+              |
| **Tiempo (3 min)**| ~30-60s (CPU)             | ~5-10s (GPU con DirectML)|
| **Disco**         | ~50MB (modelo + cache)    | —                        |

---

## 2. Arquitectura

```
┌──────────────────────────────────────────────────────────────────┐
│                        Frontend (React)                          │
│                                                                  │
│  useSourceSeparation() hook                                      │
│    ├─ Tauri? → invoke("separate_sources", { path, stems })      │
│    └─ Web?   → separate.worker.ts (onnxruntime-web + CDN ONNX)  │
│                                                                  │
│  UI: Gear panel → Toggle "SEPARAR FUENTES"                       │
│       Playback → Tabs: ORIGINAL | VOCES | MÚSICA                 │
│       Progress bar durante procesamiento                         │
├──────────────────────────────────────────────────────────────────┤
│                   Desktop Backend (Rust)                          │
│                                                                  │
│  src-tauri/src/audio/separate.rs                                 │
│    ├─ load_model() → Session (ort crate, lazy init)              │
│    ├─ stft() / istft() → Espectrograma ↔ Audio                  │
│    ├─ separate_wav(input, output_dir) → { vocals, accompaniment }│
│    └─ Soporte DirectML (GPU) si disponible                       │
│                                                                  │
│  src-tauri/src/commands.rs                                       │
│    └─ separate_sources(input_path) → SeparationResult            │
├──────────────────────────────────────────────────────────────────┤
│                     Web Backend (Worker)                          │
│                                                                  │
│  src/features/audio-recorder/lib/separate.worker.ts              │
│    ├─ onnxruntime-web (WASM backend, CDN hosted)                 │
│    ├─ Modelo ONNX descargado lazy desde CDN                      │
│    ├─ STFT/ISTFT en JavaScript (Float32Array)                    │
│    └─ Retorna blobs de audio separado                            │
└──────────────────────────────────────────────────────────────────┘
```

---

## 3. Pasos de Implementación

### Fase A: Backend Rust (Desktop)

#### Paso 1: Agregar dependencia `ort` en Cargo.toml
- Agregar `ort = "2.0.0-rc.11"` con feature `download-binaries`
- Opcional: feature `directml` para aceleración GPU en Windows
- **Impacto en tamaño de binario**: ~5-10MB adicional (ONNX Runtime DLL se descarga en build)

**Archivos a modificar:**
- `src-tauri/Cargo.toml`

#### Paso 2: Módulo `separate.rs` — STFT/ISTFT
- Implementar Short-Time Fourier Transform en Rust puro
  - Ventana Hann, tamaño 4096, hop 1024 (parámetros estándar MDX-Net)
  - STFT: `audio f32[] → Complex spectrograma [frames × freq_bins]`
  - ISTFT: `Complex spectrograma → audio f32[]` con overlap-add
- Usar `rustfft` (ya disponible como transitive dep de nnnoiseless) para FFT eficiente

**Archivos a crear:**
- `src-tauri/src/audio/separate.rs`

#### Paso 3: Carga del modelo ONNX + inferencia
- Cargar modelo desde `$APP_DATA/models/mdxnet_voc_ft.onnx`
- Si no existe, descargarlo desde HuggingFace la primera vez
- `Session::builder()` con `GraphOptimizationLevel::Level3`
- Input: espectrograma magnitud `[1, 2, freq_bins, frames]` (batch, channels, F, T)
- Output: máscara `[1, 2, freq_bins, frames]`
- Aplicar máscara al espectrograma complejo → ISTFT → stems

**Archivos a modificar:**
- `src-tauri/src/audio/separate.rs`

#### Paso 4: Descarga lazy del modelo
- Primer uso: descargar ~25MB desde CDN/HuggingFace
- Guardar en `$APP_DATA/models/`
- Mostrar progreso de descarga al usuario vía eventos Tauri
- Verificar integridad con hash SHA256
- Si ya existe, usar cache local

**Archivos a crear/modificar:**
- `src-tauri/src/audio/separate.rs` (función `ensure_model()`)
- Evento Tauri `model-download-progress`

#### Paso 5: Comando Tauri `separate_sources`
- `separate_sources(input_path: String) → SeparationResult`
- `SeparationResult { vocals_path: String, accompaniment_path: String }`
- Emitir eventos de progreso: `separation-progress { stage, percent }`
- Guardar stems como WAV en `$TEMP/recogni_vocals_*.wav` y `recogni_accompaniment_*.wav`
- Nuevo error variant: `SourceSeparation(String)`

**Archivos a modificar:**
- `src-tauri/src/commands.rs` — nuevo comando
- `src-tauri/src/error.rs` — nuevo variant + código
- `src-tauri/src/lib.rs` — registrar comando
- `src-tauri/src/audio/mod.rs` — exportar módulo

#### Paso 6: Detección de GPU (DirectML)
- Intentar crear sesión con DirectML EP primero
- Fallback a CPU si DirectML no disponible
- Informar al usuario qué backend se está usando
- **NO es requisito** — solo optimización

---

### Fase B: Frontend — IPC Bridge + Hook

#### Paso 7: Bridge Tauri `separateSources()`
- Nueva función en `tauriAudioCapture.ts`
- `separateSources(inputPath: string): Promise<SeparationResult>`
- Listener para `separation-progress` y `model-download-progress`

**Archivos a modificar:**
- `src/shared/lib/runtime/tauriAudioCapture.ts`

#### Paso 8: Types + estado en `useAudioRecorder`
- Nuevo estado: `separationEnabled: boolean`
- Nuevo setter: `setSeparationEnabled()`
- Tipo `SeparationResult { vocalsUrl, accompanimentUrl }`
- Persistencia en `useAudioSettings` (localStorage)

**Archivos a modificar:**
- `src/features/audio-recorder/model/types.ts`
- `src/features/audio-recorder/model/useAudioRecorder.ts`
- `src/features/audio-recorder/model/useAudioSettings.ts`

#### Paso 9: Hook `useSourceSeparation()`
- Similar a `useNoiseSuppression` pero para separación
- Estados: `isProcessing`, `progress`, `stage`, `vocalsUrl`, `accompanimentUrl`, `error`
- Desktop: llama `separateSources()` vía IPC
- Web: llama `separate.worker.ts` (Fase C)
- Manejo de descarga inicial del modelo (primer uso)

**Archivos a crear:**
- `src/features/audio-recorder/model/useSourceSeparation.ts`

---

### Fase C: Web Worker (Browser)

#### Paso 10: `separate.worker.ts`
- Cargar `onnxruntime-web` desde CDN (mismo patrón que whisper.worker.ts)
- Descargar modelo ONNX desde CDN al IndexedDB (cache persistente)
- STFT/ISTFT implementado en JS (Float32Array)
- Mensajes: `load | separate | progress | result | error`
- **No bloqueará la UI** — corre en Web Worker separado

**Archivos a crear:**
- `src/features/audio-recorder/lib/separate.worker.ts`

#### Paso 11: Integrar worker en `useSourceSeparation`
- Detección automática: Tauri → comando nativo, Web → worker
- Progress callbacks unificados para ambas plataformas

**Archivos a modificar:**
- `src/features/audio-recorder/model/useSourceSeparation.ts`

---

### Fase D: UI

#### Paso 12: Gear panel — toggle "SEPARAR FUENTES"
- Nuevo toggle en `neo-gear-popup` (debajo de normalizar)
- Descripción: "Separa las voces de la música y ruido de fondo. Útil para aislar la voz en grabaciones con música."
- Solo visible en idle/stopped (mismo patrón que denoise)
- Primera vez: indicador "Descargará ~25MB"

**Archivos a modificar:**
- `src/features/audio-recorder/ui/SetupScreen.tsx`
- `src/features/audio-recorder/ui/setup/setup.config.css`

#### Paso 13: Playback — tabs ORIGINAL | VOCES | MÚSICA
- Extender los tabs A/B existentes con tercera opción
- Tabs visibles solo si hay stems separados disponibles
- Cada tab cambia el `src` del `<audio>` player
- Diseño Neo-brutalism consistente con tabs existentes

**Archivos a modificar:**
- `src/features/audio-recorder/ui/SetupScreen.tsx`
- `src/features/audio-recorder/ui/setup/setup.config.css`

#### Paso 14: Indicadores de progreso
- Progress bar para descarga del modelo (primer uso)
- Progress bar para procesamiento de separación
- Etapas visibles: "DESCARGANDO MODELO..." → "ANALIZANDO AUDIO..." → "SEPARANDO FUENTES..."
- Reusar componente `neo-enhance-progress` existente

**Archivos a modificar:**
- `src/features/audio-recorder/ui/SetupScreen.tsx`

#### Paso 15: Auto-trigger post-grabación
- Si `separationEnabled` está activo, ejecutar separación automáticamente al detener grabación
- Ejecutar después del denoise (si ambos están activos)
- Orden: grabación → denoise (opcional) → separation (opcional) → playback

**Archivos a modificar:**
- `src/features/audio-recorder/ui/SetupScreen.tsx` (efecto post-stop)

---

## 4. Gestión del Modelo ONNX

### Estrategia de Distribución
| Plataforma | Estrategia |
|------------|-----------|
| **Desktop (Tauri)** | Descarga lazy al `$APP_DATA/models/` en primer uso |
| **Web (Browser)** | Descarga lazy al IndexedDB desde CDN en primer uso |

### URLs del Modelo
- **HuggingFace**: `https://huggingface.co/seanghay/uvr_models/resolve/main/UVR-MDX-NET-Voc_FT.onnx`
- **Fallback CDN**: Mirror en jsDelivr o GitHub Releases si HF no disponible

### Cache
- **Desktop**: `$APP_DATA/models/mdxnet_voc_ft.onnx` (~25MB, persistente)
- **Web**: IndexedDB con key `recogni-mdxnet-model` (~25MB, persistente entre sesiones)
- Verificación SHA256 para integridad

---

## 5. Parámetros del Modelo MDX-Net

| Parámetro | Valor |
|-----------|-------|
| FFT size (n_fft) | 4096 |
| Hop length | 1024 |
| Window | Hann |
| Sample rate | 44100 Hz (resample si es necesario) |
| Input shape | `[1, 2, 2048, T]` (batch, channels, freq_bins, time_frames) |
| Output shape | `[1, 2, 2048, T]` (máscara) |
| Segment length | 256 frames (~6s de audio) con overlap |

### Nota sobre Sample Rate
El audio capturado por WASAPI es 48kHz. MDX-Net espera 44.1kHz.
- **Solución**: Resample 48kHz → 44.1kHz antes de STFT, luego resample 44.1kHz → 48kHz después de ISTFT.
- Usar interpolación lineal simple o `dasp` crate (ya dependencia transitiva).

---

## 6. Estructura de Archivos (resumen)

### Nuevos archivos
```
src-tauri/src/audio/separate.rs           # STFT, ISTFT, carga modelo, inferencia
src/features/audio-recorder/model/useSourceSeparation.ts  # Hook React
src/features/audio-recorder/lib/separate.worker.ts        # Web Worker
```

### Archivos modificados
```
src-tauri/Cargo.toml                      # +ort dependency
src-tauri/src/audio/mod.rs                # +mod separate, exports
src-tauri/src/commands.rs                 # +separate_sources command
src-tauri/src/error.rs                    # +SourceSeparation variant
src-tauri/src/lib.rs                      # +register command
src/shared/lib/runtime/tauriAudioCapture.ts  # +separateSources() bridge
src/features/audio-recorder/model/types.ts   # +separationEnabled state
src/features/audio-recorder/model/useAudioRecorder.ts  # +separation state
src/features/audio-recorder/model/useAudioSettings.ts  # +persistence
src/features/audio-recorder/ui/SetupScreen.tsx          # +UI toggle + tabs
src/features/audio-recorder/ui/setup/setup.config.css   # +CSS styles
src/features/audio-recorder/ui/AudioRecorderPage.tsx    # +pass props
```

---

## 7. Riesgos y Mitigaciones

| Riesgo | Probabilidad | Mitigación |
|--------|-------------|------------|
| Modelo ONNX incompatible con `ort` v2 | Baja | Probar con modelo UVR-MDX-NET-Voc_FT antes de implementar todo |
| STFT/ISTFT con artefactos | Media | Usar ventana Hann + overlap-add estándar, validar con audio conocido |
| Resample 48k→44.1k pierde calidad | Baja | Usar interpolación cúbica o `dasp` resample |
| Modelo ~25MB tarda en descargar | Media | Progress bar + cache persistente + retry con backoff |
| OOM en PCs con poca RAM | Baja | Procesar en segmentos de ~6s con overlap (no todo el audio a la vez) |
| `ort` aumenta tamaño del binario | Cierta | ~5-10MB adicional aceptable para funcionalidad premium |
| Web Worker lento en móvil | Media | Mostrar advertencia de tiempo estimado antes de procesar |

---

## 8. Orden de Implementación Sugerido

| Fase | Pasos | Prioridad | Dependencias |
|------|-------|-----------|-------------|
| **A** | 1-6 | Alta | Ninguna |
| **B** | 7-9 | Alta | Fase A |
| **C** | 10-11 | Media | Fase B (independiente de A para web) |
| **D** | 12-15 | Alta | Fases A+B |

**Tiempo estimado total**: ~3-4 sesiones de implementación

---

## 9. Preguntas Abiertas para el Equipo

1. **¿Modelo específico?** ¿Usar `UVR-MDX-NET-Voc_FT.onnx` (~25MB, mejor calidad vocal) o `UVR-MDX-NET-Inst_HQ_2.onnx` (~20MB, mejor separación instrumental)?
2. **¿Guardar stems?** ¿El botón "GUARDAR AUDIO" debería ofrecer guardar cada stem por separado, o solo el stem activo en playback?
3. **¿Combinar con denoise?** ¿Aplicar denoise sobre el stem de voces separado para doble limpieza?
4. **¿Límite de duración?** ¿Poner límite máximo de audio para separación (ej. 10 min) para evitar procesamiento excesivo?
5. **¿Feature flag?** ¿Ocultar detrás de un feature flag experimental hasta que esté bien probado?
