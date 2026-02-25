#[cfg(windows)]
mod wasapi_loopback {
    use hound::{WavSpec, WavWriter};
    use std::io::BufWriter;
    use std::fs::File;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;
    use std::thread;
    use windows::core::GUID;
    use windows::Win32::Media::Audio::{
        eConsole, eRender, IAudioCaptureClient, IAudioClient, IMMDeviceEnumerator,
        MMDeviceEnumerator, AUDCLNT_SHAREMODE_SHARED, AUDCLNT_STREAMFLAGS_LOOPBACK,
        WAVEFORMATEX, WAVEFORMATEXTENSIBLE,
    };
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_ALL,
        COINIT_APARTMENTTHREADED,
    };

    const REFTIMES_PER_SEC: i64 = 10_000_000;

    // KSDATAFORMAT_SUBTYPE_IEEE_FLOAT
    const KSDATAFORMAT_SUBTYPE_IEEE_FLOAT: GUID = GUID::from_u128(
        0x00000003_0000_0010_8000_00aa00389b71,
    );

    pub struct SystemAudioHandle {
        stop_flag: Arc<AtomicBool>,
        join_handle: Option<thread::JoinHandle<Result<String, String>>>,
    }

    impl From<String> for crate::error::AppError {
        fn from(s: String) -> Self {
            crate::error::AppError::AudioCapture(s)
        }
    }

    impl SystemAudioHandle {
        pub fn start(output_path: String) -> Result<Self, String> {
            let stop_flag = Arc::new(AtomicBool::new(false));
            let flag_clone = stop_flag.clone();
            let path_clone = output_path.clone();

            eprintln!("[audio_capture] Starting system audio capture to: {}", output_path);

            let join_handle = thread::spawn(move || -> Result<String, String> {
                unsafe { capture_thread(&path_clone, &flag_clone) }
            });

            Ok(SystemAudioHandle {
                stop_flag,
                join_handle: Some(join_handle),
            })
        }

        pub fn stop(&mut self) -> Result<String, String> {
            eprintln!("[audio_capture] Stop requested");
            self.stop_flag.store(true, Ordering::SeqCst);

            if let Some(handle) = self.join_handle.take() {
                match handle.join() {
                    Ok(result) => {
                        eprintln!("[audio_capture] Capture thread finished: {:?}", result);
                        result
                    }
                    Err(_) => Err("Audio capture thread panicked".to_string()),
                }
            } else {
                Err("Capture already stopped".to_string())
            }
        }
    }

    unsafe fn capture_thread(
        output_path: &str,
        stop_flag: &AtomicBool,
    ) -> Result<String, String> {
        // Initialize COM on this thread as STA (apartment-threaded)
        // Using COINIT_APARTMENTTHREADED because audio device APIs work best with STA
        let com_result = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let com_initialized = com_result.is_ok();
        if !com_initialized {
            // Might already be initialized — try to proceed anyway
            eprintln!("[audio_capture] CoInitializeEx returned {:?}, proceeding anyway", com_result);
        }

        let result = capture_loop(output_path, stop_flag);

        if com_initialized {
            CoUninitialize();
        }

        result
    }

    unsafe fn capture_loop(
        output_path: &str,
        stop_flag: &AtomicBool,
    ) -> Result<String, String> {
        // Create device enumerator
        let enumerator: IMMDeviceEnumerator =
            CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)
                .map_err(|e| format!("Failed to create device enumerator: {}", e))?;

        eprintln!("[audio_capture] Device enumerator created");

        // Get default audio render (output) device
        let device = enumerator
            .GetDefaultAudioEndpoint(eRender, eConsole)
            .map_err(|e| format!("No default audio output device: {}", e))?;

        eprintln!("[audio_capture] Got default audio endpoint");

        // Activate IAudioClient
        let audio_client: IAudioClient = device
            .Activate(CLSCTX_ALL, None)
            .map_err(|e| format!("Failed to activate audio client: {}", e))?;

        // Get the mix format (the format the device is currently using)
        let pwfx = audio_client
            .GetMixFormat()
            .map_err(|e| format!("Failed to get mix format: {}", e))?;

        let wfx = &*pwfx;
        let sample_rate = wfx.nSamplesPerSec;
        let channels = wfx.nChannels;
        let bits_per_sample = wfx.wBitsPerSample;

        let format_tag = { wfx.wFormatTag };

        eprintln!(
            "[audio_capture] Format: {}Hz, {} ch, {} bits, tag=0x{:04X}",
            sample_rate, channels, bits_per_sample, format_tag
        );

        // Determine if the format is float
        let is_float = if format_tag == 0xFFFE {
            let wfxe = &*(pwfx as *const WAVEFORMATEX as *const WAVEFORMATEXTENSIBLE);
            let sub_format = std::ptr::addr_of!(wfxe.SubFormat).read_unaligned();
            sub_format == KSDATAFORMAT_SUBTYPE_IEEE_FLOAT
        } else {
            format_tag == 3 // WAVE_FORMAT_IEEE_FLOAT
        };

        eprintln!("[audio_capture] is_float={}", is_float);

        // Initialize audio client for loopback capture
        audio_client
            .Initialize(
                AUDCLNT_SHAREMODE_SHARED,
                AUDCLNT_STREAMFLAGS_LOOPBACK,
                REFTIMES_PER_SEC,
                0,
                pwfx,
                None,
            )
            .map_err(|e| format!("Failed to initialize audio client for loopback: {}", e))?;

        eprintln!("[audio_capture] Audio client initialized for loopback");

        // Get capture client
        let capture_client: IAudioCaptureClient = audio_client
            .GetService()
            .map_err(|e| format!("Failed to get capture client: {}", e))?;

        // Create WAV writer — always write as 32-bit float for simplicity
        let wav_spec = WavSpec {
            channels,
            sample_rate,
            bits_per_sample: 32,
            sample_format: hound::SampleFormat::Float,
        };

        let mut writer: WavWriter<BufWriter<File>> = WavWriter::create(output_path, wav_spec)
            .map_err(|e| format!("Failed to create WAV file: {}", e))?;

        // Start capturing
        audio_client
            .Start()
            .map_err(|e| format!("Failed to start audio capture: {}", e))?;

        eprintln!("[audio_capture] Capture started! Looping...");

        let mut total_frames: u64 = 0;

        // Capture loop — poll every 10ms for low latency
        while !stop_flag.load(Ordering::SeqCst) {
            std::thread::sleep(std::time::Duration::from_millis(10));

            // Read all available packets
            loop {
                let packet_length = capture_client
                    .GetNextPacketSize()
                    .map_err(|e| format!("GetNextPacketSize failed: {}", e))?;

                if packet_length == 0 {
                    break;
                }

                let mut buffer_ptr = std::ptr::null_mut();
                let mut num_frames_available = 0u32;
                let mut flags = 0u32;

                capture_client
                    .GetBuffer(
                        &mut buffer_ptr,
                        &mut num_frames_available,
                        &mut flags,
                        None,
                        None,
                    )
                    .map_err(|e| format!("GetBuffer failed: {}", e))?;

                let frame_count = num_frames_available as usize;
                let sample_count = frame_count * channels as usize;

                // AUDCLNT_BUFFERFLAGS_SILENT = 0x2
                let is_silent = (flags & 0x2) != 0;

                if is_silent {
                    for _ in 0..sample_count {
                        let _ = writer.write_sample(0.0f32);
                    }
                } else if is_float && bits_per_sample == 32 {
                    let data = std::slice::from_raw_parts(
                        buffer_ptr as *const f32,
                        sample_count,
                    );
                    for &sample in data {
                        let _ = writer.write_sample(sample);
                    }
                } else if !is_float && bits_per_sample == 16 {
                    // Convert i16 to f32 for the WAV writer
                    let data = std::slice::from_raw_parts(
                        buffer_ptr as *const i16,
                        sample_count,
                    );
                    for &sample in data {
                        let _ = writer.write_sample(sample as f32 / 32768.0);
                    }
                } else {
                    // Fallback: treat as f32
                    let data = std::slice::from_raw_parts(
                        buffer_ptr as *const f32,
                        sample_count,
                    );
                    for &sample in data {
                        let _ = writer.write_sample(sample);
                    }
                }

                total_frames += frame_count as u64;

                capture_client
                    .ReleaseBuffer(num_frames_available)
                    .map_err(|e| format!("ReleaseBuffer failed: {}", e))?;
            }
        }

        eprintln!("[audio_capture] Stop flag received, total_frames={}", total_frames);

        // Stop capture
        let _ = audio_client.Stop();

        // Flush remaining data
        loop {
            let packet_length = capture_client
                .GetNextPacketSize()
                .unwrap_or(0);

            if packet_length == 0 {
                break;
            }

            let mut buffer_ptr = std::ptr::null_mut();
            let mut num_frames_available = 0u32;
            let mut flags = 0u32;

            if capture_client
                .GetBuffer(
                    &mut buffer_ptr,
                    &mut num_frames_available,
                    &mut flags,
                    None,
                    None,
                )
                .is_ok()
            {
                let frame_count = num_frames_available as usize;
                let sample_count = frame_count * channels as usize;
                let is_silent = (flags & 0x2) != 0;

                if !is_silent && is_float && bits_per_sample == 32 {
                    let data = std::slice::from_raw_parts(
                        buffer_ptr as *const f32,
                        sample_count,
                    );
                    for &sample in data {
                        let _ = writer.write_sample(sample);
                    }
                }
                total_frames += frame_count as u64;

                let _ = capture_client.ReleaseBuffer(num_frames_available);
            } else {
                break;
            }
        }

        // Free the format memory
        windows::Win32::System::Com::CoTaskMemFree(Some(pwfx as *const _ as *const _));

        // Finalize WAV
        writer
            .finalize()
            .map_err(|e| format!("Failed to finalize WAV: {}", e))?;

        let file_size = std::fs::metadata(output_path).map(|m| m.len()).unwrap_or(0);
        eprintln!(
            "[audio_capture] WAV finalized: {} frames, file size {} bytes, path: {}",
            total_frames, file_size, output_path
        );

        Ok(output_path.to_string())
    }

    pub fn check_available() -> bool {
        unsafe {
            let com_result = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
            let com_initialized = com_result.is_ok();

            let result: Result<IMMDeviceEnumerator, _> =
                CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL);

            let available = match result {
                Ok(enumerator) => enumerator
                    .GetDefaultAudioEndpoint(eRender, eConsole)
                    .is_ok(),
                Err(_) => false,
            };

            eprintln!("[audio_capture] check_available={}", available);

            if com_initialized {
                CoUninitialize();
            }
            available
        }
    }
}

// Re-export for use in lib.rs
#[cfg(windows)]
pub use wasapi_loopback::SystemAudioHandle;

#[cfg(windows)]
pub fn check_system_audio_available() -> bool {
    wasapi_loopback::check_available()
}

#[cfg(not(windows))]
pub struct SystemAudioHandle;

#[cfg(not(windows))]
impl SystemAudioHandle {
    pub fn start(_output_path: String) -> Result<Self, String> {
        Err("System audio capture is only supported on Windows.".to_string())
    }

    pub fn stop(&mut self) -> Result<String, String> {
        Err("System audio capture is only supported on Windows.".to_string())
    }
}

#[cfg(not(windows))]
pub fn check_system_audio_available() -> bool {
    false
}
