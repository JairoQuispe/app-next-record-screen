const HALLUCINATION_REPEAT_THRESHOLD = 3;
const MIN_UNIQUE_WORDS_RATIO = 0.25;

function normalizeSegment(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Detect hallucinated ASR output (repetitive phrases in mixed languages).
 */
export function isHallucination(text: string): boolean {
  if (!text || text.length < 20) return false;
  const words = text.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  if (words.length < 4) return false;

  const unique = new Set(words);
  if (unique.size / words.length < MIN_UNIQUE_WORDS_RATIO) return true;

  const ngrams = new Map<string, number>();
  for (let i = 0; i <= words.length - 3; i += 1) {
    const gram = words.slice(i, i + 3).join(" ");
    const count = (ngrams.get(gram) ?? 0) + 1;
    ngrams.set(gram, count);
    if (count >= HALLUCINATION_REPEAT_THRESHOLD) return true;
  }

  return false;
}

export function mergeWithLastSegment(previous: string, incoming: string): string {
  const normalizedIncoming = normalizeSegment(incoming);
  if (!normalizedIncoming) return previous;

  if (!previous.trim()) {
    return normalizedIncoming;
  }

  const lines = previous.split("\n");
  const lastIndex = lines.length - 1;
  const normalizedLast = normalizeSegment(lines[lastIndex] ?? "");

  if (!normalizedLast) {
    lines[lastIndex] = normalizedIncoming;
    return lines.join("\n");
  }

  if (normalizedIncoming === normalizedLast) {
    return previous;
  }

  if (normalizedIncoming.startsWith(normalizedLast)) {
    lines[lastIndex] = normalizedIncoming;
    return lines.join("\n");
  }

  if (normalizedLast.startsWith(normalizedIncoming)) {
    return previous;
  }

  return `${previous}\n${normalizedIncoming}`;
}

export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

export function toTranscriptionText(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (typeof raw === "object" && raw !== null && "message" in raw) {
    return String((raw as Record<string, unknown>).message);
  }
  return String(raw);
}
