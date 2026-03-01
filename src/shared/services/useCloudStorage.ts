import { useCallback, useEffect, useRef, useState } from "react";
import type { CloudStorageService, CloudStorageItem } from "./types";
import { getCloudStorageService } from "./createServices";

/**
 * React hook that provides the runtime-appropriate CloudStorageService.
 *
 * Returns no-op stubs when cloud features are not available (e.g. Tauri
 * desktop without cloud enabled).
 */
export function useCloudStorage() {
  const serviceRef = useRef<CloudStorageService | null>(null);
  const initPromiseRef = useRef<Promise<CloudStorageService> | null>(null);
  const [isAvailable, setIsAvailable] = useState(false);

  const ensureService = useCallback(async (): Promise<CloudStorageService> => {
    if (serviceRef.current) return serviceRef.current;

    if (!initPromiseRef.current) {
      initPromiseRef.current = getCloudStorageService().then((svc) => {
        serviceRef.current = svc;
        return svc;
      });
    }

    return initPromiseRef.current;
  }, []);

  useEffect(() => {
    void ensureService().then((svc) => {
      // Check if this is a real service (not NoopCloudStorageService)
      svc.list("__probe__").then(() => setIsAvailable(true)).catch(() => setIsAvailable(false));
    });
  }, [ensureService]);

  const upload = useCallback(
    async (data: Blob, fileName: string) => {
      const svc = await ensureService();
      return svc.upload(data, fileName);
    },
    [ensureService],
  );

  const list = useCallback(
    async (prefix?: string): Promise<CloudStorageItem[]> => {
      const svc = await ensureService();
      return svc.list(prefix);
    },
    [ensureService],
  );

  const download = useCallback(
    async (key: string) => {
      const svc = await ensureService();
      return svc.download(key);
    },
    [ensureService],
  );

  const deleteFile = useCallback(
    async (key: string) => {
      const svc = await ensureService();
      return svc.delete(key);
    },
    [ensureService],
  );

  return { isAvailable, upload, list, download, deleteFile };
}
