/**
 * R2 storage handlers — upload, list, download, delete.
 */

import type { Env } from "../index";
import { jsonResponse, errorResponse, withCors } from "../index";

export async function handleStorageRequest(
  request: Request,
  env: Env,
  path: string,
): Promise<Response> {
  // POST /api/storage/upload
  if (path === "/api/storage/upload" && request.method === "POST") {
    return handleUpload(request, env);
  }

  // GET /api/storage/list?prefix=audio/
  if (path === "/api/storage/list" && request.method === "GET") {
    return handleList(request, env);
  }

  // GET /api/storage/download?key=audio/...
  if (path === "/api/storage/download" && request.method === "GET") {
    return handleDownload(request, env);
  }

  // DELETE /api/storage/delete
  if (path === "/api/storage/delete" && request.method === "DELETE") {
    return handleDelete(request, env);
  }

  return errorResponse("Storage endpoint not found", 404);
}

async function handleUpload(request: Request, env: Env): Promise<Response> {
  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return errorResponse("No file provided", 400);
  }

  const key = `audio/${Date.now()}-${file.name}`;
  await env.R2_BUCKET.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
    customMetadata: { originalName: file.name },
  });

  return jsonResponse({ key, url: `/api/storage/download?key=${encodeURIComponent(key)}` });
}

async function handleList(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const prefix = url.searchParams.get("prefix") ?? "audio/";

  const listed = await env.R2_BUCKET.list({ prefix, limit: 100 });

  const files = listed.objects.map((obj: R2Object) => ({
    key: obj.key,
    size: obj.size,
    lastModified: obj.uploaded.toISOString(),
  }));

  return jsonResponse({ files, truncated: listed.truncated });
}

async function handleDownload(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const key = url.searchParams.get("key");

  if (!key) {
    return errorResponse("Missing 'key' parameter", 400);
  }

  const object = await env.R2_BUCKET.get(key);

  if (!object) {
    return errorResponse("File not found", 404);
  }

  const headers = new Headers();
  headers.set("Content-Type", object.httpMetadata?.contentType ?? "application/octet-stream");
  headers.set("Content-Length", String(object.size));

  if (object.customMetadata?.originalName) {
    headers.set("Content-Disposition", `attachment; filename="${object.customMetadata.originalName}"`);
  }

  return withCors(new Response(object.body, { headers }));
}

async function handleDelete(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as { key?: string };

  if (!body.key) {
    return errorResponse("Missing 'key' in body", 400);
  }

  await env.R2_BUCKET.delete(body.key);
  return jsonResponse({ deleted: body.key });
}
