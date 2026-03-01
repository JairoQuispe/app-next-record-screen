/**
 * Service interfaces for the hybrid Tauri + Cloudflare architecture.
 *
 * Each service has a Tauri implementation (native desktop) and a
 * Web implementation (Cloudflare Pages / standard browser).
 */

// ── Audio Recording ──────────────────────────────────────────────

export interface RecordingResult {
  /** Object URL or asset URL pointing to the recorded audio. */
  audioUrl: string;
  /** Raw blob when available (browser recordings). */
  blob: Blob | null;
  /** Local file path when available (Tauri native recordings). */
  filePath: string | null;
  /** MIME type of the recorded audio. */
  mimeType: string;
}

// ── File / Storage ───────────────────────────────────────────────

export interface SaveFileOptions {
  defaultName: string;
  extensions: string[];
  filterLabel?: string;
}

export interface FileStorageService {
  /** Save binary data, returns the destination path/URL. */
  saveFile(data: Uint8Array | Blob, options: SaveFileOptions): Promise<string | null>;
  /** Save text content, returns the destination path/URL. */
  saveTextFile(text: string, options: SaveFileOptions): Promise<string | null>;
  /** Read a file as binary. */
  readFile(pathOrUrl: string): Promise<Uint8Array>;
  /** Read a file as a Blob. */
  readFileAsBlob(pathOrUrl: string, mimeType?: string): Promise<Blob>;
}

// ── Cloud Storage (R2) ──────────────────────────────────────────

export interface CloudStorageService {
  /** Upload a file to cloud storage, returns the public URL. */
  upload(data: Blob, fileName: string): Promise<string>;
  /** List files in cloud storage. */
  list(prefix?: string): Promise<CloudStorageItem[]>;
  /** Download a file from cloud storage. */
  download(key: string): Promise<Blob>;
  /** Delete a file from cloud storage. */
  delete(key: string): Promise<void>;
}

export interface CloudStorageItem {
  key: string;
  size: number;
  lastModified: string;
}

// ── Transcription ───────────────────────────────────────────────

export interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
}

export interface TranscriptionResult {
  text: string;
  segments: TranscriptionSegment[];
  wordCount: number;
}

export interface TranscriptionService {
  /** Transcribe audio from a URL or blob. */
  transcribe(
    audio: Blob | string,
    language: string,
    onProgress?: (progress: number) => void,
    signal?: AbortSignal,
  ): Promise<TranscriptionResult>;
  /** Check if the transcription backend is available. */
  isAvailable(): Promise<boolean>;
}

// ── Environment Config ──────────────────────────────────────────

export interface EnvironmentConfig {
  /** Base URL for the Cloudflare Workers API. */
  apiBaseUrl: string;
  /** Whisper Worker URL for cloud transcription. */
  whisperWorkerUrl: string | null;
  /** Whether cloud features are enabled. */
  cloudEnabled: boolean;
}
