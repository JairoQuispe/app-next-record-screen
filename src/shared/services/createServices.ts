import { getRuntime } from "../lib/runtime/getRuntime";
import type { FileStorageService, CloudStorageService } from "./types";

/**
 * Lazily create the correct FileStorageService for the current runtime.
 *
 * - Tauri  → native file-system via plugins
 * - Web    → browser download / fetch
 */
export async function createFileStorageService(): Promise<FileStorageService> {
  const runtime = getRuntime();

  if (runtime === "tauri") {
    const { TauriFileStorageService } = await import("./fileStorage.tauri");
    return new TauriFileStorageService();
  }

  const { WebFileStorageService } = await import("./fileStorage.web");
  return new WebFileStorageService();
}

/**
 * Lazily create the correct CloudStorageService for the current runtime.
 *
 * - Cloudflare / browser with cloud enabled → R2 via Workers API
 * - Tauri or cloud disabled                 → no-op stub
 */
export async function createCloudStorageService(): Promise<CloudStorageService> {
  const { getEnvironmentConfig } = await import("./environment");
  const config = getEnvironmentConfig();

  if (config.cloudEnabled) {
    const { R2CloudStorageService } = await import("./cloudStorage");
    return new R2CloudStorageService(config.apiBaseUrl);
  }

  const { NoopCloudStorageService } = await import("./cloudStorage");
  return new NoopCloudStorageService();
}

// ── Singleton cache ──────────────────────────────────────────────

let _fileStorage: FileStorageService | null = null;
let _cloudStorage: CloudStorageService | null = null;

/**
 * Get or create the FileStorageService singleton for the current runtime.
 */
export async function getFileStorageService(): Promise<FileStorageService> {
  if (!_fileStorage) {
    _fileStorage = await createFileStorageService();
  }
  return _fileStorage;
}

/**
 * Get or create the CloudStorageService singleton for the current runtime.
 */
export async function getCloudStorageService(): Promise<CloudStorageService> {
  if (!_cloudStorage) {
    _cloudStorage = await createCloudStorageService();
  }
  return _cloudStorage;
}
