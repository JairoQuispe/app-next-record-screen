/**
 * Recogning — Cloudflare Workers API
 *
 * Serves as the backend for the web version of the app when deployed
 * on Cloudflare Pages.  Provides storage (R2), metadata (D1), and
 * proxied transcription endpoints.
 */

import { handleStorageRequest } from "./handlers/storage";
import { handleTranscriptionRequest } from "./handlers/transcription";
import { handleHealthRequest } from "./handlers/health";

export interface Env {
  R2_BUCKET: R2Bucket;
  D1_DATABASE: D1Database;
  WHISPER_WORKER_URL?: string;
}

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function jsonResponse(data: unknown, status = 200): Response {
  return withCors(
    new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function errorResponse(message: string, status = 500): Response {
  return jsonResponse({ error: message }, status);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return withCors(new Response(null, { status: 204 }));
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // Health check
      if (path === "/api/health") {
        return handleHealthRequest(env);
      }

      // Storage routes (R2)
      if (path.startsWith("/api/storage")) {
        return handleStorageRequest(request, env, path);
      }

      // Transcription routes
      if (path.startsWith("/api/transcription")) {
        return handleTranscriptionRequest(request, env);
      }

      return errorResponse("Not Found", 404);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Internal Server Error";
      console.error("[Worker Error]", message);
      return errorResponse(message, 500);
    }
  },
};

export { jsonResponse, errorResponse, withCors };
