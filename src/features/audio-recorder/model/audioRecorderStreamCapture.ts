import type { MutableRefObject } from "react";
import { getSystemAudioUnavailableMessage } from "./audioRecorderHelpers";

interface MixAudioStreamRefs {
  mixAudioContextRef: MutableRefObject<AudioContext | null>;
  mixDestinationRef: MutableRefObject<MediaStreamAudioDestinationNode | null>;
  mixSourceNodesRef: MutableRefObject<MediaStreamAudioSourceNode[]>;
}

export async function getMicrophoneStream(selectedMicrophoneId: string | null): Promise<MediaStream> {
  const audioConstraints: MediaTrackConstraints = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  };

  if (selectedMicrophoneId) {
    audioConstraints.deviceId = { exact: selectedMicrophoneId };
  }

  return navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
}

export async function getSystemAudioStream(
  isSystemAudioSupported: boolean,
  displayStreamRef: MutableRefObject<MediaStream | null>,
): Promise<MediaStream> {
  if (!isSystemAudioSupported) {
    throw new Error("System audio capture is not supported in this browser/runtime.");
  }

  const displayMediaOptions: DisplayMediaStreamOptions & Record<string, unknown> = {
    video: true,
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      suppressLocalAudioPlayback: false,
    } as MediaTrackConstraints,
    systemAudio: "include",
    selfBrowserSurface: "include",
    preferCurrentTab: false,
    surfaceSwitching: "include",
    monitorTypeSurfaces: "include",
  };

  console.log("[getSystemAudioStream] Requesting getDisplayMedia with system audio...");

  const displayStream = await navigator.mediaDevices.getDisplayMedia(displayMediaOptions);
  displayStreamRef.current = displayStream;

  const audioTracks = displayStream.getAudioTracks();
  const videoTracks = displayStream.getVideoTracks();

  console.log(
    "[getSystemAudioStream] Got stream: audioTracks=%d, videoTracks=%d",
    audioTracks.length,
    videoTracks.length,
  );

  if (audioTracks.length === 0) {
    const videoTrack = videoTracks[0];
    const displaySurface = (videoTrack?.getSettings() as MediaTrackSettings & {
      displaySurface?: string;
    })?.displaySurface;

    console.warn("[getSystemAudioStream] No audio tracks! displaySurface=%s", displaySurface);

    displayStream.getTracks().forEach((track) => track.stop());
    displayStreamRef.current = null;
    throw new Error(getSystemAudioUnavailableMessage(displaySurface));
  }

  const audioOnlyStream = new MediaStream(audioTracks);

  audioTracks[0].onended = () => {
    console.warn("[getSystemAudioStream] Audio track ENDED unexpectedly");
  };

  console.log("[getSystemAudioStream] Audio stream ready (keeping video track alive). Settings:",
    audioTracks[0]?.getSettings(),
  );

  return audioOnlyStream;
}

export async function mixAudioStreams(
  systemStream: MediaStream,
  micStream: MediaStream,
  refs: MixAudioStreamRefs,
): Promise<MediaStream> {
  if (typeof window === "undefined" || typeof window.AudioContext === "undefined") {
    throw new Error("Web Audio API is not available in this runtime.");
  }

  const audioContext = new window.AudioContext();
  const destination = audioContext.createMediaStreamDestination();

  const systemSource = audioContext.createMediaStreamSource(systemStream);
  const micSource = audioContext.createMediaStreamSource(micStream);

  systemSource.connect(destination);
  micSource.connect(destination);

  refs.mixAudioContextRef.current = audioContext;
  refs.mixDestinationRef.current = destination;
  refs.mixSourceNodesRef.current = [systemSource, micSource];

  return destination.stream;
}

export function clearMixedAudioResources(refs: MixAudioStreamRefs): void {
  refs.mixSourceNodesRef.current.forEach((node) => node.disconnect());
  refs.mixSourceNodesRef.current = [];
  refs.mixDestinationRef.current = null;

  if (refs.mixAudioContextRef.current) {
    void refs.mixAudioContextRef.current.close();
    refs.mixAudioContextRef.current = null;
  }
}
