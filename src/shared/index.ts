export { formatDuration } from "./lib/utils";
export { isTauriRuntime } from "./lib/runtime";
export { getRuntime, isCloudflareRuntime, isWebRuntime } from "./lib/runtime";
export type { Runtime } from "./lib/runtime";
export {
  startNativeSystemAudioCapture,
  stopNativeSystemAudioCapture,
  isNativeSystemAudioAvailable,
  convertFilePathToUrl,
} from "./lib/runtime";
