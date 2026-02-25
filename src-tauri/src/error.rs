use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
#[allow(dead_code)]
pub enum AppError {
    #[error("Lock error: {0}")]
    LockPoisoned(String),

    #[error("Audio capture is already running")]
    CaptureAlreadyRunning,

    #[error("No audio capture is running")]
    NoCaptureRunning,

    #[error("Capture already stopped")]
    CaptureAlreadyStopped,

    #[error("Audio capture thread panicked")]
    CaptureThreadPanicked,

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Audio capture error: {0}")]
    AudioCapture(String),

    #[error("WAV encoding error: {0}")]
    WavEncode(String),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::ser::Serializer,
    {
        serializer.serialize_str(self.to_string().as_ref())
    }
}
