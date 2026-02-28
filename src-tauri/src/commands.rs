use std::sync::Arc;
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use crate::audio::{self, SystemAudioHandle};
use crate::error::AppError;
use crate::transcription::MoonshineEngine;
use crate::AudioCaptureState;
use crate::TranscriptionState;

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

// ── Transcription commands ──────────────────────────────────────────

#[derive(Serialize, Clone)]
pub struct ModelDownloadProgress {
    pub file_index: usize,
    pub total_files: usize,
    pub bytes_downloaded: u64,
    pub total_bytes: u64,
}

#[derive(Serialize)]
pub struct TranscriptionModelInfo {
    pub loaded: bool,
    pub cached: bool,
}

#[tauri::command]
pub async fn transcription_load_model(
    app: AppHandle,
    state: State<'_, TranscriptionState>,
) -> Result<TranscriptionModelInfo, AppError> {
    let state_inner = Arc::clone(&state.0);

    tauri::async_runtime::spawn_blocking(move || {
        let mut lock = state_inner
            .lock()
            .map_err(|e| AppError::LockPoisoned(e.to_string()))?;

        // Already loaded
        if lock.is_some() {
            return Ok(TranscriptionModelInfo {
                loaded: true,
                cached: true,
            });
        }

        let engine = MoonshineEngine::download_and_load(|file_idx, total, downloaded, total_bytes| {
            let _ = app.emit("model-download-progress", ModelDownloadProgress {
                file_index: file_idx,
                total_files: total,
                bytes_downloaded: downloaded,
                total_bytes: total_bytes,
            });
        })?;

        *lock = Some(engine);

        Ok(TranscriptionModelInfo {
            loaded: true,
            cached: true,
        })
    })
    .await
    .map_err(|e| AppError::Transcription(format!("Task join: {e}")))?
}

#[tauri::command]
pub async fn transcription_transcribe(
    state: State<'_, TranscriptionState>,
    audio: Vec<f32>,
    language: String,
) -> Result<String, AppError> {
    let state_inner = Arc::clone(&state.0);

    tauri::async_runtime::spawn_blocking(move || {
        let mut lock = state_inner
            .lock()
            .map_err(|e| AppError::LockPoisoned(e.to_string()))?;

        match lock.as_mut() {
            Some(engine) => engine.transcribe(&audio, &language),
            None => Err(AppError::ModelNotLoaded),
        }
    })
    .await
    .map_err(|e| AppError::Transcription(format!("Task join: {e}")))?
}

#[tauri::command]
pub async fn transcription_unload_model(
    state: State<'_, TranscriptionState>,
) -> Result<(), AppError> {
    let mut lock = state.0
        .lock()
        .map_err(|e| AppError::LockPoisoned(e.to_string()))?;

    *lock = None;
    Ok(())
}

#[tauri::command]
pub async fn transcription_model_status(
    state: State<'_, TranscriptionState>,
) -> Result<TranscriptionModelInfo, AppError> {
    let lock = state.0
        .lock()
        .map_err(|e| AppError::LockPoisoned(e.to_string()))?;

    let loaded = lock.is_some();

    let cached = crate::transcription::ModelManager::new()
        .map(|m| m.is_cached())
        .unwrap_or(false);

    Ok(TranscriptionModelInfo { loaded, cached })
}
