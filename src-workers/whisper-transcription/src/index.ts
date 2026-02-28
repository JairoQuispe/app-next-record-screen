/**
 * Cloudflare Worker — Whisper-large-v3-turbo transcription proxy.
 *
 * Receives POST with FormData containing:
 *   - audio: binary audio file (WAV, WebM, etc.)
 *   - language: BCP-47 language code (default "es")
 *
 * Calls @cf/openai/whisper-large-v3-turbo via Workers AI binding.
 * Returns JSON { text, segments, word_count }.
 */

import { Buffer } from "node:buffer";

interface Env {
  AI: Ai;
}

interface WhisperSegment {
  start: number;
  end: number;
  text: string;
}

interface WhisperResult {
  text: string;
  word_count?: number;
  words?: Array<{ word: string; start: number; end: number }>;
  vtt?: string;
}

interface TranscriptionResponse {
  text: string;
  segments: WhisperSegment[];
  word_count: number;
}

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}

/**
 * Parse VTT output from Whisper into structured segments.
 */
function parseVttSegments(vtt: string): WhisperSegment[] {
  const segments: WhisperSegment[] = [];
  const lines = vtt.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const match = line.match(
      /(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})\.(\d{3})/
    );
    if (match) {
      const start =
        parseInt(match[1]) * 3600 +
        parseInt(match[2]) * 60 +
        parseInt(match[3]) +
        parseInt(match[4]) / 1000;
      const end =
        parseInt(match[5]) * 3600 +
        parseInt(match[6]) * 60 +
        parseInt(match[7]) +
        parseInt(match[8]) / 1000;

      const textLines: string[] = [];
      for (let j = i + 1; j < lines.length; j++) {
        const textLine = lines[j].trim();
        if (textLine === "") break;
        textLines.push(textLine);
      }
      const text = textLines.join(" ").trim();
      if (text) {
        segments.push({ start, end, text });
      }
    }
  }

  return segments;
}

const MAX_AUDIO_BYTES = 25_000_000; // 25MB max

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method !== "POST") {
      return errorResponse("Method not allowed. Use POST.", 405);
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return errorResponse("Invalid request. Expected multipart FormData with 'audio' file.");
    }

    const audioEntry = formData.get("audio");
    if (!audioEntry || typeof audioEntry === "string") {
      return errorResponse("Missing 'audio' file in form data.");
    }
    const audioFile = audioEntry as unknown as Blob;

    const language = (formData.get("language") as string) || "es";

    try {
      const audioBuffer = await audioFile.arrayBuffer();

      if (audioBuffer.byteLength > MAX_AUDIO_BYTES) {
        return errorResponse(
          `Audio file too large (${(audioBuffer.byteLength / 1_000_000).toFixed(1)}MB). Max ${MAX_AUDIO_BYTES / 1_000_000}MB.`,
          413,
        );
      }

      // Convert to base64 using Node.js Buffer — exact pattern from official CF docs
      const base64Audio = Buffer.from(audioBuffer).toString("base64");

      const runner = env.AI as unknown as {
        run: (model: string, input: Record<string, unknown>) => Promise<unknown>;
      };

      const result = await runner.run("@cf/openai/whisper-large-v3-turbo", {
        audio: base64Audio,
        language,
      }) as WhisperResult;

      const fullText = (result.text || "").trim();
      const segments = result.vtt ? parseVttSegments(result.vtt) : [];
      const wordCount = fullText.split(/\s+/).filter(Boolean).length;

      const response: TranscriptionResponse = {
        text: fullText,
        segments,
        word_count: wordCount,
      };

      return jsonResponse(response);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Transcription failed.";
      console.error("Transcription error:", message);
      return errorResponse(`Transcription failed: ${message}`, 500);
    }
  },
} satisfies ExportedHandler<Env>;
