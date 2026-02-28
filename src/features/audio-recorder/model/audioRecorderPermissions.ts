import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { MicrophoneDeviceOption, MicrophonePermissionStatus, RecorderStatus } from "./types";
import { getPermissionErrorMessage } from "./audioRecorderHelpers";

interface RefreshAvailableMicrophonesOptions {
  setAvailableMicrophones: Dispatch<SetStateAction<MicrophoneDeviceOption[]>>;
  setSelectedMicrophoneId: Dispatch<SetStateAction<string | null>>;
  setErrorMessage: Dispatch<SetStateAction<string | null>>;
}

export async function refreshAvailableMicrophones({
  setAvailableMicrophones,
  setSelectedMicrophoneId,
  setErrorMessage,
}: RefreshAvailableMicrophonesOptions): Promise<void> {
  if (!navigator.mediaDevices?.enumerateDevices) {
    return;
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const microphones = devices
      .filter((device) => device.kind === "audioinput")
      .map((device, index) => ({
        deviceId: device.deviceId,
        label: device.label || `Microphone ${index + 1}`,
      }));

    setAvailableMicrophones(microphones);
    setSelectedMicrophoneId((current) => {
      if (current && microphones.some((microphone) => microphone.deviceId === current)) {
        return current;
      }

      return microphones[0]?.deviceId ?? null;
    });
  } catch {
    setErrorMessage("Unable to list microphones on this device.");
  }
}

interface RequestMicrophonePermissionOptions {
  isSupported: boolean;
  setStatus: Dispatch<SetStateAction<RecorderStatus>>;
  setErrorMessage: Dispatch<SetStateAction<string | null>>;
  setMicrophonePermission: Dispatch<SetStateAction<MicrophonePermissionStatus>>;
  onRefreshAvailableMicrophones: () => Promise<void>;
}

export async function requestMicrophonePermission({
  isSupported,
  setStatus,
  setErrorMessage,
  setMicrophonePermission,
  onRefreshAvailableMicrophones,
}: RequestMicrophonePermissionOptions): Promise<boolean> {
  if (!isSupported) {
    setStatus("error");
    setErrorMessage("Audio recording is not supported on this device/browser.");
    return false;
  }

  try {
    setErrorMessage(null);
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    setMicrophonePermission("granted");
    await onRefreshAvailableMicrophones();
    stream.getTracks().forEach((track) => track.stop());
    return true;
  } catch (error) {
    setMicrophonePermission("denied");
    setStatus("error");
    setErrorMessage(getPermissionErrorMessage(error));
    return false;
  }
}

interface SyncPermissionAndDevicesOptions {
  isSupported: boolean;
  permissionStatusRef: MutableRefObject<PermissionStatus | null>;
  onRefreshAvailableMicrophones: () => Promise<void>;
  setMicrophonePermission: Dispatch<SetStateAction<MicrophonePermissionStatus>>;
}

export function createPermissionAndDevicesSync(
  {
    isSupported,
    permissionStatusRef,
    onRefreshAvailableMicrophones,
    setMicrophonePermission,
  }: SyncPermissionAndDevicesOptions,
): () => void {
  if (!isSupported) {
    setMicrophonePermission("unsupported");
    return () => {};
  }

  let isCancelled = false;

  const syncPermissionAndDevices = async () => {
    await onRefreshAvailableMicrophones();

    if (!navigator.permissions?.query) {
      if (!isCancelled) {
        setMicrophonePermission("unknown");
      }
      return;
    }

    try {
      const permissionStatus = await navigator.permissions.query({
        name: "microphone" as PermissionName,
      });

      if (isCancelled) {
        return;
      }

      permissionStatusRef.current = permissionStatus;
      setMicrophonePermission(permissionStatus.state);
      permissionStatus.onchange = () => {
        setMicrophonePermission(permissionStatus.state);
      };
    } catch {
      if (!isCancelled) {
        setMicrophonePermission("unknown");
      }
    }
  };

  void syncPermissionAndDevices();

  const handleDeviceChange = () => {
    void onRefreshAvailableMicrophones();
  };

  navigator.mediaDevices?.addEventListener?.("devicechange", handleDeviceChange);

  return () => {
    isCancelled = true;
    if (permissionStatusRef.current) {
      permissionStatusRef.current.onchange = null;
    }
    navigator.mediaDevices?.removeEventListener?.("devicechange", handleDeviceChange);
  };
}
