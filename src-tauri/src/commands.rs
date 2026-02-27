use std::sync::Arc;
use tauri::{AppHandle, State};

use crate::audio::{self, SystemAudioHandle};
use crate::error::AppError;
use crate::AudioCaptureState;

#[tauri::command]
pub async fn start_system_audio_capture(
    app: AppHandle,
    state: State<'_, AudioCaptureState>,
) -> Result<String, AppError> {
    let state_inner = Arc::clone(&state.0);

    tauri::async_runtime::spawn_blocking(move || {
        let mut capture_lock = state_inner
            .lock()
            .map_err(|e| AppError::LockPoisoned(e.to_string()))?;

        if capture_lock.is_some() {
            return Err(AppError::CaptureAlreadyRunning);
        }

        let temp_dir = std::env::temp_dir();
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis();
        let output_path = temp_dir
            .join(format!("recogni_system_audio_{timestamp}.wav"))
            .to_string_lossy()
            .to_string();

        let handle = SystemAudioHandle::start(output_path, app)?;
        *capture_lock = Some(handle);
        Ok("System audio capture started".to_string())
    })
    .await
    .map_err(|e| AppError::AudioCapture(format!("Task join: {e}")))?
}

#[tauri::command]
pub async fn stop_system_audio_capture(
    state: State<'_, AudioCaptureState>,
) -> Result<String, AppError> {
    let state_inner = Arc::clone(&state.0);

    tauri::async_runtime::spawn_blocking(move || {
        let mut capture_lock = state_inner
            .lock()
            .map_err(|e| AppError::LockPoisoned(e.to_string()))?;

        match capture_lock.take() {
            Some(mut handle) => handle.stop(),
            None => Err(AppError::NoCaptureRunning),
        }
    })
    .await
    .map_err(|e| AppError::AudioCapture(format!("Task join: {e}")))?
}

#[tauri::command]
pub async fn enhance_audio(
    input_path: String,
    intensity: f32,
    normalize: bool,
) -> Result<String, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        let temp_dir = std::env::temp_dir();
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis();
        let output_path = temp_dir
            .join(format!("recogni_enhanced_{timestamp}.wav"))
            .to_string_lossy()
            .to_string();

        let intensity = intensity.clamp(0.0, 1.0);
        audio::denoise_wav(&input_path, &output_path, intensity, normalize)
    })
    .await
    .map_err(|e| AppError::AudioEnhance(format!("Task join: {e}")))?
}

#[tauri::command]
pub async fn is_system_audio_available() -> bool {
    tauri::async_runtime::spawn_blocking(audio::check_system_audio_available)
        .await
        .unwrap_or(false)
}
