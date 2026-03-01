import type { FileStorageService, SaveFileOptions } from "./types";

/**
 * File storage backed by Tauri's native file-system plugins.
 * All imports are dynamic so the module is tree-shaken when unused.
 */
export class TauriFileStorageService implements FileStorageService {
  async saveFile(data: Uint8Array | Blob, options: SaveFileOptions): Promise<string | null> {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeFile } = await import("@tauri-apps/plugin-fs");

    const outputPath = await save({
      defaultPath: options.defaultName,
      filters: [{ name: options.filterLabel ?? "File", extensions: options.extensions }],
    });

    if (!outputPath) return null;

    const bytes = data instanceof Blob
      ? new Uint8Array(await data.arrayBuffer())
      : data;

    await writeFile(outputPath, bytes);
    return outputPath;
  }

  async saveTextFile(text: string, options: SaveFileOptions): Promise<string | null> {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeTextFile } = await import("@tauri-apps/plugin-fs");

    const outputPath = await save({
      defaultPath: options.defaultName,
      filters: [{ name: options.filterLabel ?? "Text", extensions: options.extensions }],
    });

    if (!outputPath) return null;

    await writeTextFile(outputPath, text);
    return outputPath;
  }

  async readFile(filePath: string): Promise<Uint8Array> {
    const { readFile } = await import("@tauri-apps/plugin-fs");
    return readFile(filePath);
  }

  async readFileAsBlob(filePath: string, mimeType = "application/octet-stream"): Promise<Blob> {
    const bytes = await this.readFile(filePath);
    return new Blob([bytes.buffer as ArrayBuffer], { type: mimeType });
  }
}
