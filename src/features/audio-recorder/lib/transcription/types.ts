/**
 * Shared types for the hybrid transcription provider system.
 *
 * Supports multiple backends:
 * - "moonshine-local":  Whisper ONNX model running in WASM (web + desktop)
 * - "moonshine-native": Moonshine ONNX via Rust/ort (desktop only, native speed)
 * - "whisper-native":   whisper.cpp via Rust/Tauri commands (desktop only, future)
 */

// ── Backend identifiers ──

export type TranscriptionBackend = "moonshine-local" | "moonshine-native" | "whisper-native";

// ── Device used for inference ──

export type InferenceDevice = "webgpu" | "wasm" | "native";

// ── Configuration ──

export interface TranscriptionConfig {
  backend: TranscriptionBackend;
  language: string;
  /** How often (seconds) to send audio chunks to the model. Default 1.5 */
  chunkInterval?: number;
}

// ── Results ──

export interface TranscriptionResult {
  text: string;
  isFinal: boolean;
  language?: string;
  timestamp?: number;
}

// ── Worker messages (Moonshine) ──

export interface MoonshineWorkerRequest {
  type: "load" | "transcribe";
  audio?: Float32Array;
  language?: string;
  context?: string;
}

export interface MoonshineWorkerResponse {
  type: "loading" | "ready" | "result" | "error";
  text?: string;
  error?: string;
  progress?: number;
  device?: InferenceDevice;
}

// ── Worker messages (VAD) ──

export interface VadWorkerRequest {
  type: "load" | "process";
  audio?: Float32Array;
}

export interface VadWorkerResponse {
  type: "ready" | "result" | "error";
  /** Array of voiced segments: [startSample, endSample][] */
  segments?: [number, number][];
  /** Whether the chunk contains speech */
  isSpeech?: boolean;
  error?: string;
}

// ── Hook state (mirrors existing WhisperTranscriptionState for drop-in replacement) ──

export interface TranscriptionState {
  isModelLoading: boolean;
  isModelReady: boolean;
  isProcessing: boolean;
  loadProgress: number;
  finalText: string;
  interimText: string;
  error: string | null;
  /** Which inference device is active */
  activeDevice: InferenceDevice | "native" | null;
  /** Which backend is currently in use */
  activeBackend: TranscriptionBackend | null;
}

export interface TranscriptionActions {
  clear: () => void;
}
