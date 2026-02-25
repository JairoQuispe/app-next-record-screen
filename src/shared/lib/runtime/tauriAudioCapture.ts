import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { isTauriRuntime } from "./isTauriRuntime";

export async function startNativeSystemAudioCapture(): Promise<string> {
  if (!isTauriRuntime()) {
    throw new Error("Native system audio capture is only available in Tauri runtime.");
  }
  console.log("[tauriAudioCapture] Invoking start_system_audio_capture...");
  const result = await invoke<string>("start_system_audio_capture");
  console.log("[tauriAudioCapture] start result:", result);
  return result;
}

export async function stopNativeSystemAudioCapture(): Promise<string> {
  if (!isTauriRuntime()) {
    throw new Error("Native system audio capture is only available in Tauri runtime.");
  }
  console.log("[tauriAudioCapture] Invoking stop_system_audio_capture...");
  const result = await invoke<string>("stop_system_audio_capture");
  console.log("[tauriAudioCapture] stop result (wav path):", result);
  return result;
}

export async function isNativeSystemAudioAvailable(): Promise<boolean> {
  if (!isTauriRuntime()) {
    return false;
  }
  try {
    const available = await invoke<boolean>("is_system_audio_available");
    console.log("[tauriAudioCapture] is_system_audio_available:", available);
    return available;
  } catch (e) {
    console.error("[tauriAudioCapture] is_system_audio_available error:", e);
    return false;
  }
}

export function convertFilePathToUrl(filePath: string): string {
  const url = convertFileSrc(filePath);
  console.log("[tauriAudioCapture] convertFilePathToUrl:", filePath, "->", url);
  return url;
}
