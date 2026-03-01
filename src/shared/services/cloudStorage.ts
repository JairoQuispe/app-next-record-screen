import type { CloudStorageService, CloudStorageItem } from "./types";

/**
 * Cloud storage backed by Cloudflare R2 via Workers API.
 * Only used in Cloudflare / browser runtimes.
 */
export class R2CloudStorageService implements CloudStorageService {
  private readonly _apiBaseUrl: string;

  constructor(apiBaseUrl: string) {
    this._apiBaseUrl = apiBaseUrl;
  }

  private get apiBase(): string {
    return `${this._apiBaseUrl}/api/storage`;
  }

  async upload(data: Blob, fileName: string): Promise<string> {
    const formData = new FormData();
    formData.append("file", data, fileName);

    const response = await fetch(`${this.apiBase}/upload`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => null) as { error?: string } | null;
      throw new Error(err?.error ?? `Upload failed: ${response.status}`);
    }

    const result = await response.json() as { url: string };
    return result.url;
  }

  async list(prefix = "audio/"): Promise<CloudStorageItem[]> {
    const params = new URLSearchParams({ prefix });
    const response = await fetch(`${this.apiBase}/list?${params.toString()}`);

    if (!response.ok) throw new Error(`List failed: ${response.status}`);

    const result = await response.json() as { files: CloudStorageItem[] };
    return result.files;
  }

  async download(key: string): Promise<Blob> {
    const params = new URLSearchParams({ key });
    const response = await fetch(`${this.apiBase}/download?${params.toString()}`);

    if (!response.ok) throw new Error(`Download failed: ${response.status}`);

    return response.blob();
  }

  async delete(key: string): Promise<void> {
    const response = await fetch(`${this.apiBase}/delete`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    });

    if (!response.ok) throw new Error(`Delete failed: ${response.status}`);
  }
}

/**
 * No-op cloud storage for environments where cloud is not available.
 * All operations throw with a descriptive message.
 */
export class NoopCloudStorageService implements CloudStorageService {
  async upload(): Promise<string> {
    throw new Error("Cloud storage is not available in this environment.");
  }

  async list(): Promise<CloudStorageItem[]> {
    return [];
  }

  async download(): Promise<Blob> {
    throw new Error("Cloud storage is not available in this environment.");
  }

  async delete(): Promise<void> {
    throw new Error("Cloud storage is not available in this environment.");
  }
}
