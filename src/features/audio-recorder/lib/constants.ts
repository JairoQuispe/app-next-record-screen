export const SPECTRUM_BAR_COUNT = 28;

export const SPECTRUM_ZERO_LEVELS: number[] = new Array(SPECTRUM_BAR_COUNT).fill(0);

export const CANDIDATE_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
  "audio/ogg",
] as const;
