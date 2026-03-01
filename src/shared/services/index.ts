// ── Types ────────────────────────────────────────────────────────
export type {
  RecordingResult,
  SaveFileOptions,
  FileStorageService,
  CloudStorageService,
  CloudStorageItem,
  TranscriptionSegment,
  TranscriptionResult,
  TranscriptionService,
  EnvironmentConfig,
} from "./types";

// ── Service Factories ────────────────────────────────────────────
export {
  createFileStorageService,
  createCloudStorageService,
  getFileStorageService,
  getCloudStorageService,
} from "./createServices";

// ── React Hooks ──────────────────────────────────────────────────
export { useFileStorage } from "./useFileStorage";
export { useCloudStorage } from "./useCloudStorage";
