import {
  nativeTranscriptionLoadModel,
  nativeTranscriptionTranscribe,
} from "@shared/lib/runtime/tauriAudioCapture";
import { toTranscriptionText } from "./transcriptionText";

export async function loadNativeTranscriptionModel(): Promise<void> {
  await nativeTranscriptionLoadModel();
}

export async function transcribeNativeChunk(
  merged: Float32Array,
  language: string,
): Promise<string> {
  const audioArray = Array.from(merged);
  const raw = await nativeTranscriptionTranscribe(audioArray, language);
  return toTranscriptionText(raw);
}
