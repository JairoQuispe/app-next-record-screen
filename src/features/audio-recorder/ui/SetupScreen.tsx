import { useSetupScreen } from "../model/useSetupScreen";
import { VisualizerBars } from "./setup/VisualizerBars";
import { StatusHero } from "./setup/StatusHero";
import { AudioSourceConfig } from "./setup/AudioSourceConfig";
import { AudioEnhancementConfig } from "./setup/AudioEnhancementConfig";
import { RecordingButtons } from "./setup/RecordingButtons";
import { TranscriptionPanel } from "./setup/TranscriptionPanel";
import { PlaybackSection } from "./setup/PlaybackSection";
import type { AudioRecorderState, AudioRecorderActions } from "../model/types";

interface SetupScreenProps {
  recorder: AudioRecorderState & AudioRecorderActions;
  nativeWavPath?: string | null;
  animateIn: boolean;
}

export function SetupScreen({ recorder, nativeWavPath, animateIn }: SetupScreenProps) {
  const s = useSetupScreen({ recorder, nativeWavPath });

  return (
    <main className={`neo-app-shell neo-app-shell--setup neo-animate-enter ${animateIn ? 'is-visible' : ''}`}>
      <div className={`neo-setup-layout ${s.hasExtraContent ? "is-scrollable" : "is-locked"}`}>

        <StatusHero
          durationSeconds={s.durationSeconds}
          isRecording={s.isRecording}
          isPaused={s.isPaused}
          statusLabel={s.statusLabel}
        />

        <div className="neo-setup-rec-controls">
          {s.showConfigPanel && (s.isIdle || s.isStopped) && (
            <AudioSourceConfig
              isMicChecked={s.isMicChecked}
              isSystemChecked={s.isSystemChecked}
              isSystemAudioSupported={s.isSystemAudioSupported}
              usesMicrophone={s.usesMicrophone}
              shouldShowPermissionAction={s.shouldShowPermissionAction}
              isBusy={s.isBusy}
              availableMicrophones={s.availableMicrophones}
              selectedMicrophoneId={s.selectedMicrophoneId}
              onToggleMic={s.toggleMic}
              onToggleSystem={s.toggleSystem}
              onRequestPermission={() => void s.requestMicrophonePermission()}
              onSelectMicrophone={s.selectMicrophone}
            />
          )}

          {s.showGearPanel && (s.isIdle || s.isStopped) && (
            <AudioEnhancementConfig
              denoiseEnabled={s.denoiseEnabled}
              denoiseIntensity={s.denoiseIntensity}
              normalizeEnabled={s.normalizeEnabled}
              realtimeTranscriptionEnabled={s.transcriptionEnabled}
              onSetDenoiseEnabled={s.setDenoiseEnabled}
              onSetDenoiseIntensity={s.setDenoiseIntensity}
              onSetNormalizeEnabled={s.setNormalizeEnabled}
              onSetRealtimeTranscriptionEnabled={s.setTranscriptionEnabled}
            />
          )}

          {s.isBusy && (
            <div className={`neo-setup-visualizer neo-setup-visualizer--bar ${s.vizActive ? "is-active" : ""}`}>
              <VisualizerBars levels={s.vizLevels} />
            </div>
          )}

          <RecordingButtons
            isIdle={s.isIdle}
            isStopped={s.isStopped}
            isRecording={s.isRecording}
            isPaused={s.isPaused}
            disableStart={s.usesMicrophone && s.shouldShowPermissionAction}
            onToggleConfig={s.toggleConfigPanel}
            onToggleGear={s.toggleGearPanel}
            onStart={() => void s.startRecording()}
            onStop={() => void s.stopRecording()}
            onPause={s.pauseRecording}
            onResume={s.resumeRecording}
          />
        </div>

        {(s.isBusy || s.transcription.finalText || s.diarization.status !== "idle") && (
          <TranscriptionPanel
            activeTab={s.activeTab}
            onSetActiveTab={s.setActiveTab}
            transcription={s.transcription}
            diarization={s.diarization}
            isBusy={s.isBusy}
          />
        )}

        {!s.isSupported && <div className="neo-error" role="alert">Tu dispositivo no soporta grabación de audio.</div>}
        {s.errorMessage && <div className="neo-error" role="alert">{s.errorMessage}</div>}

        {s.audioUrl && (
          <PlaybackSection
            audioUrl={s.audioUrl}
            nativeWavPath={nativeWavPath ?? null}
            noiseSuppression={s.noiseSuppression}
            cloudTranscription={s.cloudTranscription}
            playbackMode={s.playbackMode}
            onSetPlaybackMode={s.setPlaybackMode}
            onSave={() => void s.saveRecording()}
          />
        )}
      </div>
    </main>
  );
}
