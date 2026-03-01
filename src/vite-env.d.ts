/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WHISPER_WORKER_URL?: string;
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_RUNTIME?: string;
  readonly VITE_CLOUD_ENABLED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
