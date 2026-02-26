import { pipeline, env } from "@huggingface/transformers";

env.allowLocalModels = false;

const WHISPER_MODEL = "onnx-community/whisper-base";
const SAMPLE_RATE = 16000;

// Diarization parameters
const FRAME_SIZE = 512;
const HOP_SIZE = 256;
const SEGMENT_WINDOW_S = 1.5;
const SEGMENT_HOP_S = 0.75;
const MIN_SEGMENT_MS = 500;
const MERGE_GAP_MS = 600;
const VAD_ENERGY_THRESHOLD = 0.005;
const SEGMENT_PADDING_MS = 200;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let whisperPipeline: any = null;

interface DiarizeMessage {
  type: "diarize";
  audio: Float32Array;
  language: string;
  numSpeakers?: number;
}

interface DiarizeSegment {
  id: string;
  speakerId: string;
  startMs: number;
  endMs: number;
  text: string;
}

interface SpeakerStats {
  speakerId: string;
  talkTimeMs: number;
  turns: number;
  wordCount: number;
}

interface ParticipantSummary {
  speakerId: string;
  headline: string;
  bulletPoints: string[];
  keywords: string[];
}

interface DiarizeResponse {
  type: "diarize-progress" | "diarize-result" | "diarize-error";
  progress?: number;
  stage?: string;
  segments?: DiarizeSegment[];
  speakerStats?: SpeakerStats[];
  participantSummaries?: ParticipantSummary[];
  error?: string;
}

function postMsg(msg: DiarizeResponse) {
  self.postMessage(msg);
}

// ── Audio Feature Extraction ──

function computeEnergy(frame: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < frame.length; i++) {
    sum += frame[i] * frame[i];
  }
  return sum / frame.length;
}

function computeZeroCrossingRate(frame: Float32Array): number {
  let crossings = 0;
  for (let i = 1; i < frame.length; i++) {
    if ((frame[i] >= 0) !== (frame[i - 1] >= 0)) {
      crossings++;
    }
  }
  return crossings / (frame.length - 1);
}

function computeSpectralCentroid(magnitudes: Float64Array, sampleRate: number, fftSize: number): number {
  let weightedSum = 0;
  let totalMag = 0;
  for (let i = 0; i < magnitudes.length; i++) {
    const freq = (i * sampleRate) / fftSize;
    weightedSum += freq * magnitudes[i];
    totalMag += magnitudes[i];
  }
  return totalMag > 0 ? weightedSum / totalMag : 0;
}

function computeSpectralRolloff(magnitudes: Float64Array, threshold: number = 0.85): number {
  let totalEnergy = 0;
  for (let i = 0; i < magnitudes.length; i++) {
    totalEnergy += magnitudes[i] * magnitudes[i];
  }
  let cumEnergy = 0;
  for (let i = 0; i < magnitudes.length; i++) {
    cumEnergy += magnitudes[i] * magnitudes[i];
    if (cumEnergy >= threshold * totalEnergy) {
      return i / magnitudes.length;
    }
  }
  return 1.0;
}

function computeMFCCBands(magnitudes: Float64Array, numBands: number = 13): Float64Array {
  const bands = new Float64Array(numBands);
  const binCount = magnitudes.length;
  const bandSize = Math.floor(binCount / numBands);

  for (let b = 0; b < numBands; b++) {
    const start = b * bandSize;
    const end = Math.min(start + bandSize, binCount);
    let sum = 0;
    for (let i = start; i < end; i++) {
      sum += magnitudes[i];
    }
    bands[b] = sum / (end - start);
  }

  // Apply log transform (pseudo-MFCC)
  for (let b = 0; b < numBands; b++) {
    bands[b] = Math.log(1 + bands[b] * 1000);
  }
  return bands;
}

function simpleFFT(frame: Float32Array): Float64Array {
  const n = frame.length;
  const magnitudes = new Float64Array(n / 2);

  // Apply Hann window + compute DFT magnitudes for key bins
  const windowed = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    windowed[i] = frame[i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
  }

  for (let k = 0; k < n / 2; k++) {
    let real = 0;
    let imag = 0;
    for (let t = 0; t < n; t++) {
      const angle = (2 * Math.PI * k * t) / n;
      real += windowed[t] * Math.cos(angle);
      imag -= windowed[t] * Math.sin(angle);
    }
    magnitudes[k] = Math.sqrt(real * real + imag * imag) / n;
  }
  return magnitudes;
}

// Feature vector for a segment window
interface FeatureVector {
  startMs: number;
  endMs: number;
  features: Float64Array;
  hasVoice: boolean;
}

function extractFeatures(audio: Float32Array): FeatureVector[] {
  const windowSamples = Math.floor(SEGMENT_WINDOW_S * SAMPLE_RATE);
  const hopSamples = Math.floor(SEGMENT_HOP_S * SAMPLE_RATE);
  const vectors: FeatureVector[] = [];

  for (let start = 0; start + windowSamples <= audio.length; start += hopSamples) {
    const window = audio.subarray(start, start + windowSamples);
    const startMs = Math.round((start / SAMPLE_RATE) * 1000);
    const endMs = Math.round(((start + windowSamples) / SAMPLE_RATE) * 1000);

    // Extract frame-level features and average
    const numFrames = Math.floor((windowSamples - FRAME_SIZE) / HOP_SIZE) + 1;
    let totalEnergy = 0;
    let totalZCR = 0;
    let totalCentroid = 0;
    let totalRolloff = 0;
    const avgBands = new Float64Array(13);

    for (let f = 0; f < numFrames; f++) {
      const frameStart = f * HOP_SIZE;
      const frame = window.subarray(frameStart, frameStart + FRAME_SIZE);

      totalEnergy += computeEnergy(frame);
      totalZCR += computeZeroCrossingRate(frame);

      const mags = simpleFFT(frame);
      totalCentroid += computeSpectralCentroid(mags, SAMPLE_RATE, FRAME_SIZE);
      totalRolloff += computeSpectralRolloff(mags);

      const bands = computeMFCCBands(mags);
      for (let b = 0; b < 13; b++) {
        avgBands[b] += bands[b];
      }
    }

    const inv = 1 / Math.max(1, numFrames);
    const energy = totalEnergy * inv;
    const zcr = totalZCR * inv;
    const centroid = totalCentroid * inv;
    const rolloff = totalRolloff * inv;

    // 17-dim feature vector: energy, zcr, centroid, rolloff, 13 MFCC bands
    const features = new Float64Array(17);
    features[0] = energy;
    features[1] = zcr;
    features[2] = centroid / SAMPLE_RATE;
    features[3] = rolloff;
    for (let b = 0; b < 13; b++) {
      features[4 + b] = avgBands[b] * inv;
    }

    vectors.push({
      startMs,
      endMs,
      features,
      hasVoice: energy > VAD_ENERGY_THRESHOLD,
    });
  }

  return vectors;
}

// ── Clustering (Agglomerative, cosine distance) ──

function cosineDistance(a: Float64Array, b: Float64Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 1;
  return 1 - dot / denom;
}

function agglomerativeClustering(
  vectors: FeatureVector[],
  numClusters: number,
): number[] {
  const n = vectors.length;
  if (n === 0) return [];
  if (n <= numClusters) return vectors.map((_, i) => i);

  // Initialize: each point is its own cluster
  const labels = new Array(n).fill(0).map((_, i) => i);
  const active = new Set<number>();
  for (let i = 0; i < n; i++) active.add(i);

  // Cluster centroids (start as copies of feature vectors)
  const centroids: Float64Array[] = vectors.map((v) => new Float64Array(v.features));
  const clusterSizes = new Array(n).fill(1);

  let currentClusters = n;

  while (currentClusters > numClusters) {
    let minDist = Infinity;
    let mergeA = -1;
    let mergeB = -1;

    const activeArr = Array.from(active);
    for (let i = 0; i < activeArr.length; i++) {
      for (let j = i + 1; j < activeArr.length; j++) {
        const d = cosineDistance(centroids[activeArr[i]], centroids[activeArr[j]]);
        if (d < minDist) {
          minDist = d;
          mergeA = activeArr[i];
          mergeB = activeArr[j];
        }
      }
    }

    if (mergeA === -1) break;

    // Merge B into A
    const sizeA = clusterSizes[mergeA];
    const sizeB = clusterSizes[mergeB];
    const newSize = sizeA + sizeB;
    for (let d = 0; d < centroids[mergeA].length; d++) {
      centroids[mergeA][d] = (centroids[mergeA][d] * sizeA + centroids[mergeB][d] * sizeB) / newSize;
    }
    clusterSizes[mergeA] = newSize;

    // Update all labels pointing to mergeB
    for (let i = 0; i < n; i++) {
      if (labels[i] === mergeB) labels[i] = mergeA;
    }
    active.delete(mergeB);
    currentClusters--;
  }

  // Remap labels to 0..numClusters-1
  const uniqueLabels = [...new Set(labels)];
  const remap = new Map<number, number>();
  uniqueLabels.forEach((l, i) => remap.set(l, i));
  return labels.map((l) => remap.get(l) ?? 0);
}

// ── Estimate number of speakers using silhouette-like heuristic ──

function estimateNumSpeakers(vectors: FeatureVector[]): number {
  const voiced = vectors.filter((v) => v.hasVoice);
  if (voiced.length < 4) return 1;

  let bestK = 2;
  let bestScore = -Infinity;

  for (let k = 2; k <= Math.min(5, Math.floor(voiced.length / 2)); k++) {
    const labels = agglomerativeClustering(voiced, k);
    let totalSil = 0;
    let count = 0;

    for (let i = 0; i < voiced.length; i++) {
      // Compute average intra-cluster distance
      let intraSum = 0;
      let intraCount = 0;
      let minInterAvg = Infinity;

      for (let j = 0; j < voiced.length; j++) {
        if (i === j) continue;
        const d = cosineDistance(voiced[i].features, voiced[j].features);
        if (labels[j] === labels[i]) {
          intraSum += d;
          intraCount++;
        }
      }
      const a = intraCount > 0 ? intraSum / intraCount : 0;

      // Compute average distance to nearest other cluster
      const clusterDists = new Map<number, { sum: number; count: number }>();
      for (let j = 0; j < voiced.length; j++) {
        if (labels[j] === labels[i]) continue;
        const entry = clusterDists.get(labels[j]) ?? { sum: 0, count: 0 };
        entry.sum += cosineDistance(voiced[i].features, voiced[j].features);
        entry.count++;
        clusterDists.set(labels[j], entry);
      }

      for (const [, entry] of clusterDists) {
        const avg = entry.sum / entry.count;
        if (avg < minInterAvg) minInterAvg = avg;
      }

      const b = minInterAvg === Infinity ? 0 : minInterAvg;
      const sil = b > 0 || a > 0 ? (b - a) / Math.max(a, b) : 0;
      totalSil += sil;
      count++;
    }

    const avgSil = count > 0 ? totalSil / count : 0;
    if (avgSil > bestScore) {
      bestScore = avgSil;
      bestK = k;
    }
  }

  // If silhouette is very low, likely 1 speaker
  if (bestScore < 0.1) return 1;
  return bestK;
}

// ── Segment construction and merging ──

interface RawSegment {
  speakerId: string;
  startMs: number;
  endMs: number;
}

function buildSegments(vectors: FeatureVector[], labels: number[]): RawSegment[] {
  const segments: RawSegment[] = [];
  let currentLabel = -1;
  let segStart = 0;
  let segEnd = 0;
  let voiceIdx = 0;

  for (let i = 0; i < vectors.length; i++) {
    if (!vectors[i].hasVoice) continue;

    const label = labels[voiceIdx];
    voiceIdx++;

    if (label !== currentLabel) {
      if (currentLabel !== -1) {
        segments.push({
          speakerId: `SPEAKER_${String(currentLabel).padStart(2, "0")}`,
          startMs: segStart,
          endMs: segEnd,
        });
      }
      currentLabel = label;
      segStart = vectors[i].startMs;
    }
    segEnd = vectors[i].endMs;
  }

  if (currentLabel !== -1) {
    segments.push({
      speakerId: `SPEAKER_${String(currentLabel).padStart(2, "0")}`,
      startMs: segStart,
      endMs: segEnd,
    });
  }

  return segments;
}

function mergeShortSegments(segments: RawSegment[]): RawSegment[] {
  if (segments.length <= 1) return segments;

  const merged: RawSegment[] = [segments[0]];

  for (let i = 1; i < segments.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = segments[i];

    // Merge with previous if same speaker and gap is small
    if (curr.speakerId === prev.speakerId && (curr.startMs - prev.endMs) < MERGE_GAP_MS) {
      prev.endMs = curr.endMs;
      continue;
    }

    // Absorb very short segments into previous speaker
    if ((curr.endMs - curr.startMs) < MIN_SEGMENT_MS) {
      prev.endMs = curr.endMs;
      continue;
    }

    merged.push(curr);
  }

  return merged;
}

// ── Whisper re-transcription per segment ──

async function loadWhisperIfNeeded() {
  if (whisperPipeline) return;
  whisperPipeline = await (pipeline as Function)(
    "automatic-speech-recognition",
    WHISPER_MODEL,
    {
      dtype: "q8",
      device: "wasm",
      progress_callback: (progress: Record<string, unknown>) => {
        if (typeof progress.progress === "number") {
          postMsg({ type: "diarize-progress", progress: Math.round(progress.progress * 0.3), stage: "loading-model" });
        }
      },
    },
  );
}

async function transcribeSegment(audio: Float32Array, startMs: number, endMs: number, language: string): Promise<string> {
  if (!whisperPipeline) return "";

  const startSample = Math.max(0, Math.floor(((startMs - SEGMENT_PADDING_MS) / 1000) * SAMPLE_RATE));
  const endSample = Math.min(audio.length, Math.ceil(((endMs + SEGMENT_PADDING_MS) / 1000) * SAMPLE_RATE));

  if (endSample - startSample < SAMPLE_RATE * 0.3) return "";

  const chunk = audio.slice(startSample, endSample);

  try {
    const result = await whisperPipeline(chunk, {
      language,
      task: "transcribe",
      chunk_length_s: 12,
      stride_length_s: 3,
    });

    const text = Array.isArray(result)
      ? result.map((r: { text: string }) => r.text).join(" ")
      : (result as { text: string }).text;
    return text.trim();
  } catch {
    return "";
  }
}

// ── Metrics + Summary ──

function computeSpeakerStats(segments: DiarizeSegment[]): SpeakerStats[] {
  const statsMap = new Map<string, SpeakerStats>();

  for (const seg of segments) {
    const existing = statsMap.get(seg.speakerId) ?? {
      speakerId: seg.speakerId,
      talkTimeMs: 0,
      turns: 0,
      wordCount: 0,
    };
    existing.talkTimeMs += seg.endMs - seg.startMs;
    existing.turns += 1;
    existing.wordCount += seg.text.split(/\s+/).filter(Boolean).length;
    statsMap.set(seg.speakerId, existing);
  }

  return Array.from(statsMap.values()).sort((a, b) => b.talkTimeMs - a.talkTimeMs);
}

function generateSummaries(segments: DiarizeSegment[]): ParticipantSummary[] {
  const speakerTexts = new Map<string, string[]>();
  for (const seg of segments) {
    if (!seg.text.trim()) continue;
    const texts = speakerTexts.get(seg.speakerId) ?? [];
    texts.push(seg.text);
    speakerTexts.set(seg.speakerId, texts);
  }

  const summaries: ParticipantSummary[] = [];

  for (const [speakerId, texts] of speakerTexts) {
    const allText = texts.join(" ");
    const words = allText.toLowerCase().split(/\s+/).filter(Boolean);

    // Extract keywords by frequency (exclude common stopwords)
    const stopwords = new Set([
      "el", "la", "los", "las", "un", "una", "unos", "unas", "de", "del", "al",
      "en", "y", "o", "a", "que", "es", "se", "no", "si", "por", "con", "para",
      "su", "lo", "como", "más", "pero", "sus", "le", "ya", "fue", "este", "ha",
      "me", "sin", "sobre", "ser", "también", "entre", "cuando", "muy", "son",
      "the", "is", "are", "was", "were", "be", "been", "being", "have", "has",
      "had", "do", "does", "did", "will", "would", "could", "should", "may",
      "might", "shall", "can", "and", "or", "but", "in", "on", "at", "to",
      "for", "of", "with", "by", "from", "not", "this", "that", "it", "as",
    ]);

    const freq = new Map<string, number>();
    for (const w of words) {
      if (w.length < 3 || stopwords.has(w)) continue;
      freq.set(w, (freq.get(w) ?? 0) + 1);
    }
    const keywords = [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([w]) => w);

    // Extract bullet points: longest/most informative sentences
    const sentences = allText
      .split(/[.!?]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 10);
    const bulletPoints = sentences
      .sort((a, b) => b.split(/\s+/).length - a.split(/\s+/).length)
      .slice(0, 3);

    // Headline: first sentence or first N words
    const headline = sentences.length > 0
      ? sentences[0].slice(0, 100)
      : allText.slice(0, 100);

    summaries.push({
      speakerId,
      headline,
      bulletPoints,
      keywords,
    });
  }

  return summaries;
}

// ── Main pipeline ──

async function diarize(audio: Float32Array, language: string, numSpeakers?: number) {
  try {
    postMsg({ type: "diarize-progress", progress: 5, stage: "extracting-features" });

    // 1. Extract features
    const vectors = extractFeatures(audio);
    const voiced = vectors.filter((v) => v.hasVoice);

    if (voiced.length < 2) {
      // Not enough voiced content for diarization
      postMsg({ type: "diarize-progress", progress: 30, stage: "loading-model" });
      await loadWhisperIfNeeded();
      postMsg({ type: "diarize-progress", progress: 60, stage: "transcribing" });

      const text = await transcribeSegment(audio, 0, (audio.length / SAMPLE_RATE) * 1000, language);
      const segments: DiarizeSegment[] = [{
        id: "seg-0",
        speakerId: "SPEAKER_00",
        startMs: 0,
        endMs: Math.round((audio.length / SAMPLE_RATE) * 1000),
        text,
      }];

      postMsg({
        type: "diarize-result",
        segments,
        speakerStats: computeSpeakerStats(segments),
        participantSummaries: generateSummaries(segments),
      });
      return;
    }

    postMsg({ type: "diarize-progress", progress: 15, stage: "clustering" });

    // 2. Determine number of speakers
    const k = numSpeakers ?? estimateNumSpeakers(voiced);

    // 3. Cluster voiced segments
    const labels = agglomerativeClustering(voiced, k);

    // 4. Build and merge segments
    const rawSegments = buildSegments(vectors, labels);
    const mergedSegments = mergeShortSegments(rawSegments);

    postMsg({ type: "diarize-progress", progress: 30, stage: "loading-model" });

    // 5. Load Whisper for re-transcription
    await loadWhisperIfNeeded();

    postMsg({ type: "diarize-progress", progress: 40, stage: "transcribing" });

    // 6. Re-transcribe each segment
    const diarizedSegments: DiarizeSegment[] = [];
    for (let i = 0; i < mergedSegments.length; i++) {
      const seg = mergedSegments[i];
      const progress = 40 + Math.round((i / mergedSegments.length) * 50);
      postMsg({ type: "diarize-progress", progress, stage: "transcribing" });

      const text = await transcribeSegment(audio, seg.startMs, seg.endMs, language);
      diarizedSegments.push({
        id: `seg-${i}`,
        speakerId: seg.speakerId,
        startMs: seg.startMs,
        endMs: seg.endMs,
        text,
      });
    }

    postMsg({ type: "diarize-progress", progress: 95, stage: "summarizing" });

    // 7. Compute stats and summaries
    const speakerStats = computeSpeakerStats(diarizedSegments);
    const participantSummaries = generateSummaries(diarizedSegments);

    postMsg({
      type: "diarize-result",
      segments: diarizedSegments,
      speakerStats,
      participantSummaries,
    });
  } catch (e) {
    postMsg({
      type: "diarize-error",
      error: e instanceof Error ? e.message : "Diarization failed",
    });
  }
}

self.onmessage = (event: MessageEvent<DiarizeMessage>) => {
  const { type, audio, language, numSpeakers } = event.data;
  if (type === "diarize" && audio) {
    void diarize(audio, language ?? "es", numSpeakers);
  }
};
