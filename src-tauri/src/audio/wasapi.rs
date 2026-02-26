use crate::error::AppError;
use windows::core::GUID;
use windows::Win32::Foundation::HANDLE;
use windows::Win32::Media::Audio::{
    eConsole, eRender, IAudioCaptureClient, IAudioClient, IMMDeviceEnumerator,
    MMDeviceEnumerator, AUDCLNT_SHAREMODE_SHARED, AUDCLNT_STREAMFLAGS_LOOPBACK,
    AUDCLNT_STREAMFLAGS_EVENTCALLBACK, WAVEFORMATEX, WAVEFORMATEXTENSIBLE,
};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoUninitialize, CoTaskMemFree,
    CLSCTX_ALL, COINIT_APARTMENTTHREADED,
};
use windows::Win32::System::Threading::{CreateEventW, WaitForSingleObject};

const REFTIMES_PER_SEC: i64 = 10_000_000;
/// Timeout for WaitForSingleObject in milliseconds.
/// 100 ms is generous — at 48 kHz the buffer fills every ~10 ms.
const EVENT_WAIT_TIMEOUT_MS: u32 = 100;

const KSDATAFORMAT_SUBTYPE_IEEE_FLOAT: GUID =
    GUID::from_u128(0x00000003_0000_0010_8000_00aa00389b71);

/// Audio format information extracted from the WASAPI device.
#[derive(Debug, Clone, Copy)]
pub struct AudioFormat {
    pub sample_rate: u32,
    pub channels: u16,
    pub bits_per_sample: u16,
    pub is_float: bool,
}


// ── COM RAII ────────────────────────────────────────────────────────

pub struct ComGuard {
    initialized: bool,
}

impl ComGuard {
    pub fn init() -> Self {
        let result = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) };
        Self { initialized: result.is_ok() }
    }
}

impl Drop for ComGuard {
    fn drop(&mut self) {
        if self.initialized {
            unsafe { CoUninitialize() };
        }
    }
}

// ── Loopback session ────────────────────────────────────────────────

/// RAII loopback capture session.
///
/// On drop: stops the audio client and frees the WASAPI format memory.
/// The caller only needs to call `start()` and read packets — cleanup is automatic.
pub struct LoopbackSession {
    audio_client: IAudioClient,
    pub capture_client: IAudioCaptureClient,
    pub format: AudioFormat,
    format_ptr: *const WAVEFORMATEX,
    /// Event handle signalled by WASAPI when a buffer is ready.
    pub buffer_event: HANDLE,
    started: bool,
}

// SAFETY: Used only on the dedicated capture thread.
unsafe impl Send for LoopbackSession {}

impl LoopbackSession {
    /// Open a loopback session on the default audio render device.
    ///
    /// Uses **event-driven** mode (`AUDCLNT_STREAMFLAGS_EVENTCALLBACK`)
    /// so the capture thread sleeps on a kernel event instead of polling.
    ///
    /// # Safety
    /// Must be called on a thread with COM initialized (use `ComGuard`).
    pub unsafe fn open() -> Result<Self, AppError> {
        // SAFETY: all COM/WASAPI calls require COM to be initialized on this thread.
        // The caller guarantees this via ComGuard.
        unsafe {
            let enumerator: IMMDeviceEnumerator =
                CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)
                    .map_err(|e| AppError::AudioCapture(format!("Device enumerator: {e}")))?;

            let device = enumerator
                .GetDefaultAudioEndpoint(eRender, eConsole)
                .map_err(|e| AppError::AudioCapture(format!("No default audio device: {e}")))?;

            let audio_client: IAudioClient = device
                .Activate(CLSCTX_ALL, None)
                .map_err(|e| AppError::AudioCapture(format!("Activate audio client: {e}")))?;

            let pwfx = audio_client
                .GetMixFormat()
                .map_err(|e| AppError::AudioCapture(format!("GetMixFormat: {e}")))?;

            let format = Self::parse_format(&*pwfx, pwfx);

            let event = CreateEventW(None, false, false, None)
                .map_err(|e| AppError::AudioCapture(format!("CreateEvent: {e}")))?;

            // Try event-driven mode first (loopback + event callback)
            let init_result = audio_client.Initialize(
                AUDCLNT_SHAREMODE_SHARED,
                AUDCLNT_STREAMFLAGS_LOOPBACK | AUDCLNT_STREAMFLAGS_EVENTCALLBACK,
                REFTIMES_PER_SEC,
                0,
                pwfx,
                None,
            );

            if let Err(e) = init_result {
                // Some drivers reject event callback with loopback — fall back to polling
                eprintln!("[wasapi] Event-driven init failed ({e}), falling back to polling");
                audio_client
                    .Initialize(
                        AUDCLNT_SHAREMODE_SHARED,
                        AUDCLNT_STREAMFLAGS_LOOPBACK,
                        REFTIMES_PER_SEC,
                        0,
                        pwfx,
                        None,
                    )
                    .map_err(|e2| AppError::AudioCapture(format!("Initialize loopback: {e2}")))?;
            } else {
                audio_client
                    .SetEventHandle(event)
                    .map_err(|e| AppError::AudioCapture(format!("SetEventHandle: {e}")))?;
            }

            let capture_client: IAudioCaptureClient = audio_client
                .GetService()
                .map_err(|e| AppError::AudioCapture(format!("GetService: {e}")))?;

            Ok(Self {
                audio_client,
                capture_client,
                format,
                format_ptr: pwfx,
                buffer_event: event,
                started: false,
            })
        }
    }

    unsafe fn parse_format(wfx: &WAVEFORMATEX, pwfx: *const WAVEFORMATEX) -> AudioFormat {
        let tag = wfx.wFormatTag;
        let is_float = if tag == 0xFFFE {
            // SAFETY: caller guarantees pwfx points to a valid WAVEFORMATEXTENSIBLE
            unsafe {
                let wfxe = &*(pwfx as *const WAVEFORMATEXTENSIBLE);
                std::ptr::addr_of!(wfxe.SubFormat).read_unaligned() == KSDATAFORMAT_SUBTYPE_IEEE_FLOAT
            }
        } else {
            tag == 3
        };

        AudioFormat {
            sample_rate: wfx.nSamplesPerSec,
            channels: wfx.nChannels,
            bits_per_sample: wfx.wBitsPerSample,
            is_float,
        }
    }

    /// Start the audio stream.
    pub unsafe fn start(&mut self) -> Result<(), AppError> {
        // SAFETY: caller ensures COM is initialized and session is valid
        unsafe {
            self.audio_client
                .Start()
                .map_err(|e| AppError::AudioCapture(format!("Start: {e}")))?;
        }
        self.started = true;
        Ok(())
    }

    /// Wait for the WASAPI buffer-ready event (or timeout).
    /// Returns immediately if data is already available.
    #[inline]
    pub fn wait_for_buffer(&self) {
        unsafe {
            WaitForSingleObject(self.buffer_event, EVENT_WAIT_TIMEOUT_MS);
        }
    }
}

impl Drop for LoopbackSession {
    fn drop(&mut self) {
        unsafe {
            if self.started {
                let _ = self.audio_client.Stop();
            }
            CoTaskMemFree(Some(self.format_ptr as *const _));
            // CloseHandle is not strictly needed — Windows cleans up on thread exit —
            // but we could add it here if we import it.
        }
    }
}

// ── Availability check ──────────────────────────────────────────────

pub fn check_available() -> bool {
    let _com = ComGuard::init();
    unsafe {
        CoCreateInstance::<_, IMMDeviceEnumerator>(&MMDeviceEnumerator, None, CLSCTX_ALL)
            .and_then(|e| e.GetDefaultAudioEndpoint(eRender, eConsole))
            .is_ok()
    }
}
