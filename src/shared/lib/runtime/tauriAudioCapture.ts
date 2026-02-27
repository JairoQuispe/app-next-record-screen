import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { isTauriRuntime } from "./isTauriRuntime";

export interface AudioLevelEvent {
  level: number;
}

export async function startNativeSystemAudioCapture(): Promise<string> {
  if (!isTauriRuntime()) {
    throw new Error("Native system audio capture is only available in Tauri runtime.");
  }
  return invoke<string>("start_system_audio_capture");
}

export async function stopNativeSystemAudioCapture(): Promise<string> {
  if (!isTauriRuntime()) {
    throw new Error("Native system audio capture is only available in Tauri runtime.");
  }
  return invoke<string>("stop_system_audio_capture");
}

export async function isNativeSystemAudioAvailable(): Promise<boolean> {
  if (!isTauriRuntime()) {
    return false;
  }
  try {
    return await invoke<boolean>("is_system_audio_available");
  } catch {
    return false;
  }
}

export function convertFilePathToUrl(filePath: string): string {
  return convertFileSrc(filePath);
}

export async function enhanceAudio(
  inputPath: string,
  intensity: number,
  normalize: boolean,
): Promise<string> {
  if (!isTauriRuntime()) {
    throw new Error("Audio enhancement is only available in Tauri runtime.");
  }
  return invoke<string>("enhance_audio", {
    inputPath,
    intensity: Math.max(0, Math.min(1, intensity)),
    normalize,
  });
}

/// Subscribe to real-time audio level events from the Rust capture thread.
/// Returns an unlisten function to call when recording stops.
export async function listenToAudioLevels(
  callback: (level: number) => void,
): Promise<UnlistenFn> {
  return listen<AudioLevelEvent>("audio-level", (event) => {
    callback(event.payload.level);
  });
}
