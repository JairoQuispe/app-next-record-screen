import type { EnvironmentConfig } from "./types";

/**
 * Environment configuration resolved from Vite env variables.
 *
 * In Cloudflare Pages the API lives on the same origin (via Pages Functions
 * or a proxied Workers route).  In development the Worker runs on :8787.
 */
export function getEnvironmentConfig(): EnvironmentConfig {
  const apiBaseUrl =
    (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
    (import.meta.env.DEV ? "http://localhost:8787" : "");

  const whisperWorkerUrl =
    (import.meta.env.VITE_WHISPER_WORKER_URL as string | undefined) ?? null;

  const cloudEnabled =
    (import.meta.env.VITE_CLOUD_ENABLED as string | undefined) === "true" ||
    typeof window !== "undefined" &&
      (window.location.hostname.endsWith(".pages.dev") ||
        window.location.hostname.endsWith(".workers.dev"));

  return { apiBaseUrl, whisperWorkerUrl, cloudEnabled };
}
