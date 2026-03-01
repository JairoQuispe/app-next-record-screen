import { useCallback, useEffect, useRef } from "react";
import type { FileStorageService, SaveFileOptions } from "./types";
import { getFileStorageService } from "./createServices";

/**
 * React hook that provides the runtime-appropriate FileStorageService.
 *
 * The service is lazily initialised on first use and cached for the
 * lifetime of the component.
 */
export function useFileStorage() {
  const serviceRef = useRef<FileStorageService | null>(null);
  const initPromiseRef = useRef<Promise<FileStorageService> | null>(null);

  const ensureService = useCallback(async (): Promise<FileStorageService> => {
    if (serviceRef.current) return serviceRef.current;

    if (!initPromiseRef.current) {
      initPromiseRef.current = getFileStorageService().then((svc) => {
        serviceRef.current = svc;
        return svc;
      });
    }

    return initPromiseRef.current;
  }, []);

  // Eagerly warm up the service
  useEffect(() => {
    void ensureService();
  }, [ensureService]);

  const saveFile = useCallback(
    async (data: Uint8Array | Blob, options: SaveFileOptions) => {
      const svc = await ensureService();
      return svc.saveFile(data, options);
    },
    [ensureService],
  );

  const saveTextFile = useCallback(
    async (text: string, options: SaveFileOptions) => {
      const svc = await ensureService();
      return svc.saveTextFile(text, options);
    },
    [ensureService],
  );

  const readFile = useCallback(
    async (pathOrUrl: string) => {
      const svc = await ensureService();
      return svc.readFile(pathOrUrl);
    },
    [ensureService],
  );

  const readFileAsBlob = useCallback(
    async (pathOrUrl: string, mimeType?: string) => {
      const svc = await ensureService();
      return svc.readFileAsBlob(pathOrUrl, mimeType);
    },
    [ensureService],
  );

  return { saveFile, saveTextFile, readFile, readFileAsBlob };
}
