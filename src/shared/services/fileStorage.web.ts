import type { FileStorageService, SaveFileOptions } from "./types";

/**
 * File storage for browser / Cloudflare Pages environments.
 * Uses the browser download mechanism and fetch for reading.
 */
export class WebFileStorageService implements FileStorageService {
  async saveFile(data: Uint8Array | Blob, options: SaveFileOptions): Promise<string | null> {
    const blob = data instanceof Blob
      ? data
      : new Blob([data.buffer as ArrayBuffer]);

    const url = URL.createObjectURL(blob);

    try {
      this.triggerDownload(url, options.defaultName);
      return options.defaultName;
    } finally {
      // Revoke after a short delay so the browser has time to start the download
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
  }

  async saveTextFile(text: string, options: SaveFileOptions): Promise<string | null> {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    return this.saveFile(blob, options);
  }

  async readFile(url: string): Promise<Uint8Array> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch file: ${response.status}`);
    const buffer = await response.arrayBuffer();
    return new Uint8Array(buffer);
  }

  async readFileAsBlob(url: string, mimeType = "application/octet-stream"): Promise<Blob> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch file: ${response.status}`);
    const blob = await response.blob();
    return mimeType ? new Blob([blob], { type: mimeType }) : blob;
  }

  private triggerDownload(url: string, fileName: string): void {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  }
}
