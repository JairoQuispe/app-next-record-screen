/**
 * Runtime detection for hybrid Tauri + Cloudflare architecture.
 *
 * - "tauri"      → desktop app with native Rust backend
 * - "cloudflare" → hosted on Cloudflare Pages / Workers
 * - "browser"    → any other web browser
 */

export type Runtime = "tauri" | "cloudflare" | "browser";

let _cached: Runtime | null = null;

export function getRuntime(): Runtime {
  if (_cached) return _cached;

  if (typeof window === "undefined") {
    _cached = "browser";
    return _cached;
  }

  if ("__TAURI_INTERNALS__" in window) {
    _cached = "tauri";
    return _cached;
  }

  const hostname = window.location.hostname;
  if (
    hostname.endsWith(".pages.dev") ||
    hostname.endsWith(".workers.dev") ||
    import.meta.env.VITE_RUNTIME === "cloudflare"
  ) {
    _cached = "cloudflare";
    return _cached;
  }

  _cached = "browser";
  return _cached;
}

export function isTauriRuntime(): boolean {
  return getRuntime() === "tauri";
}

export function isCloudflareRuntime(): boolean {
  return getRuntime() === "cloudflare";
}

export function isWebRuntime(): boolean {
  const rt = getRuntime();
  return rt === "cloudflare" || rt === "browser";
}
