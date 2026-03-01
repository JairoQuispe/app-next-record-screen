/**
 * Transcription handler — proxies audio to a Whisper Worker.
 */

import type { Env } from "../index";
import { jsonResponse, errorResponse } from "../index";

export async function handleTranscriptionRequest(
  request: Request,
  env: Env,
): Promise<Response> {
  if (request.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  const whisperUrl = env.WHISPER_WORKER_URL;

  if (!whisperUrl) {
    return errorResponse("Transcription service is not configured", 503);
  }

  try {
    const formData = await request.formData();
    const audio = formData.get("audio") as File | null;
    const language = (formData.get("language") as string) ?? "es";

    if (!audio) {
      return errorResponse("No audio file provided", 400);
    }

    // Forward to the Whisper Worker
    const proxyForm = new FormData();
    proxyForm.append("audio", audio, audio.name);
    proxyForm.append("language", language);

    const whisperResponse = await fetch(whisperUrl, {
      method: "POST",
      body: proxyForm,
    });

    if (!whisperResponse.ok) {
      const errBody = await whisperResponse.json().catch(() => null) as { error?: string } | null;
      return errorResponse(
        errBody?.error ?? `Whisper Worker responded with ${whisperResponse.status}`,
        whisperResponse.status,
      );
    }

    const result = await whisperResponse.json();
    return jsonResponse(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Transcription failed";
    return errorResponse(message, 500);
  }
}
