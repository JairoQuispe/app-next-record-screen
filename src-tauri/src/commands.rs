use base64::Engine;
use tauri::State;

use crate::audio_capture::{self, SystemAudioHandle};
use crate::error::AppError;
use crate::AudioCaptureState;

#[tauri::command]
pub fn start_system_audio_capture(
    state: State<AudioCaptureState>,
) -> Result<String, AppError> {
    let mut capture_lock = state
        .0
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
        .join(format!("recogni_system_audio_{}.wav", timestamp))
        .to_string_lossy()
        .to_string();

    eprintln!("[commands] start_system_audio_capture -> {}", output_path);

    let handle = SystemAudioHandle::start(output_path)?;
    *capture_lock = Some(handle);
    Ok("System audio capture started".to_string())
}

#[tauri::command]
pub fn stop_system_audio_capture(
    state: State<AudioCaptureState>,
) -> Result<String, AppError> {
    eprintln!("[commands] stop_system_audio_capture called");
    let mut capture_lock = state
        .0
        .lock()
        .map_err(|e| AppError::LockPoisoned(e.to_string()))?;

    match capture_lock.take() {
        Some(mut handle) => {
            let wav_path = handle.stop()?;
            eprintln!("[commands] Reading WAV file: {}", wav_path);

            let wav_bytes = std::fs::read(&wav_path)?;

            eprintln!("[commands] WAV file size: {} bytes", wav_bytes.len());

            // Clean up temp file
            let _ = std::fs::remove_file(&wav_path);

            // Encode as base64 data URL
            let b64 = base64::engine::general_purpose::STANDARD.encode(&wav_bytes);
            let data_url = format!("data:audio/wav;base64,{}", b64);

            eprintln!("[commands] Returning data URL, length={}", data_url.len());
            Ok(data_url)
        }
        None => Err(AppError::NoCaptureRunning),
    }
}

#[tauri::command]
pub fn is_system_audio_available() -> bool {
    audio_capture::check_system_audio_available()
}
