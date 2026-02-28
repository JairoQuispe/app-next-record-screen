use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
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

    #[error("Audio enhancement error: {0}")]
    AudioEnhance(String),

    #[error("Transcription error: {0}")]
    Transcription(String),

    #[error("Model download error: {0}")]
    ModelDownload(String),

    #[error("Model not loaded")]
    ModelNotLoaded,
}

impl AppError {
    /// Return a stable error code for the frontend.
    pub fn code(&self) -> &'static str {
        match self {
            Self::LockPoisoned(_) => "LOCK_POISONED",
            Self::CaptureAlreadyRunning => "CAPTURE_ALREADY_RUNNING",
            Self::NoCaptureRunning => "NO_CAPTURE_RUNNING",
            Self::CaptureAlreadyStopped => "CAPTURE_ALREADY_STOPPED",
            Self::CaptureThreadPanicked => "CAPTURE_THREAD_PANICKED",
            Self::Io(_) => "IO_ERROR",
            Self::AudioCapture(_) => "AUDIO_CAPTURE_ERROR",
            Self::WavEncode(_) => "WAV_ENCODE_ERROR",
            Self::AudioEnhance(_) => "AUDIO_ENHANCE_ERROR",
            Self::Transcription(_) => "TRANSCRIPTION_ERROR",
            Self::ModelDownload(_) => "MODEL_DOWNLOAD_ERROR",
            Self::ModelNotLoaded => "MODEL_NOT_LOADED",
        }
    }
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::ser::Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut state = serializer.serialize_struct("AppError", 2)?;
        state.serialize_field("code", self.code())?;
        state.serialize_field("message", &self.to_string())?;
        state.end()
    }
}
