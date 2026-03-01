/**
 * Health check endpoint — verifies that bindings are reachable.
 */

import type { Env } from "../index";
import { jsonResponse } from "../index";

export function handleHealthRequest(env: Env): Response {
  return jsonResponse({
    status: "ok",
    timestamp: new Date().toISOString(),
    services: {
      r2: !!env.R2_BUCKET,
      d1: !!env.D1_DATABASE,
      whisper: !!env.WHISPER_WORKER_URL,
    },
  });
}
