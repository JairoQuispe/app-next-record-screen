#[cfg(windows)]
mod wasapi;
#[cfg(windows)]
mod wav;
#[cfg(windows)]
mod capture;
mod enhance;

#[cfg(windows)]
pub use capture::SystemAudioHandle;
pub use enhance::{denoise_wav, RealtimeDenoiser};

#[cfg(windows)]
pub fn check_system_audio_available() -> bool {
    wasapi::check_available()
}

// ── Non-Windows stubs ───────────────────────────────────────────────
#[cfg(not(windows))]
pub struct SystemAudioHandle;

#[cfg(not(windows))]
impl SystemAudioHandle {
    pub fn start(_output_path: String) -> Result<Self, crate::error::AppError> {
        Err(crate::error::AppError::AudioCapture(
            "System audio capture is only supported on Windows".into(),
        ))
    }

    pub fn stop(&mut self) -> Result<String, crate::error::AppError> {
        Err(crate::error::AppError::AudioCapture(
            "System audio capture is only supported on Windows".into(),
        ))
    }
}

#[cfg(not(windows))]
pub fn check_system_audio_available() -> bool {
    false
}
