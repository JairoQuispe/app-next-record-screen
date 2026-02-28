import { useEffect, useState } from "react";
import { useAudioRecorder } from "../model/useAudioRecorder";
import { SetupScreen } from "./SetupScreen";
import "./audio-recorder.css";

export function AudioRecorderPage() {
  const recorder = useAudioRecorder();
  const [animateIn, setAnimateIn] = useState(false);

  useEffect(() => {
    const frameId = requestAnimationFrame(() => setAnimateIn(true));
    return () => cancelAnimationFrame(frameId);
  }, []);

  return <SetupScreen recorder={recorder} animateIn={animateIn} />;
}
