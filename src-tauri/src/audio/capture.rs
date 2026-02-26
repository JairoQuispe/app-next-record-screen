use crate::error::AppError;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use tauri::{AppHandle, Emitter};

use super::wasapi::{ComGuard, LoopbackSession};
use super::wav::AudioWavWriter;

/// Payload emitted to the frontend every ~100 ms with the current RMS audio level.
#[derive(Clone, serde::Serialize)]
pub struct AudioLevelEvent {
    /// RMS level in 0.0–1.0 range.
    pub level: f32,
}

/// Handle to a running system-audio capture session.
///
/// On drop: signals the capture thread to stop and waits for it to finish.
pub struct SystemAudioHandle {
    stop_flag: Arc<AtomicBool>,
    join_handle: Option<thread::JoinHandle<Result<String, AppError>>>,
}

impl SystemAudioHandle {
    /// Spawn a dedicated capture thread.
    /// `app` is used to emit real-time audio level events to the frontend.
    pub fn start(output_path: String, app: AppHandle) -> Result<Self, AppError> {
        let stop_flag = Arc::new(AtomicBool::new(false));
        let flag_clone = stop_flag.clone();

        let join_handle = thread::Builder::new()
            .name("audio-capture".into())
            .stack_size(512 * 1024) // 512 KB — capture thread needs very little stack
            .spawn(move || run_capture(&output_path, &flag_clone, &app))
            .map_err(|e| AppError::AudioCapture(format!("Spawn capture thread: {e}")))?;

        Ok(Self {
            stop_flag,
            join_handle: Some(join_handle),
        })
    }

    /// Signal the capture thread to stop and return the WAV file path.
    pub fn stop(&mut self) -> Result<String, AppError> {
        self.stop_flag.store(true, Ordering::Release);

        match self.join_handle.take() {
            Some(handle) => handle
                .join()
                .map_err(|_| AppError::CaptureThreadPanicked)?,
            None => Err(AppError::CaptureAlreadyStopped),
        }
    }
}

impl Drop for SystemAudioHandle {
    fn drop(&mut self) {
        self.stop_flag.store(true, Ordering::Release);
        if let Some(handle) = self.join_handle.take() {
            let _ = handle.join();
        }
    }
}

// ── Capture thread ──────────────────────────────────────────────────

fn run_capture(
    output_path: &str,
    stop_flag: &AtomicBool,
    app: &AppHandle,
) -> Result<String, AppError> {
    let _com = ComGuard::init();

    // LoopbackSession has RAII Drop — no manual stop/free needed
    let mut session = unsafe { LoopbackSession::open()? };
    let mut writer = AudioWavWriter::create(output_path, session.format)?;

    unsafe { session.start()? };

    let total_frames = capture_loop(&session, &mut writer, stop_flag, app)?;

    // Session drop → audio_client.Stop() + CoTaskMemFree
    drop(session);

    // Drain is not possible after session drop — all data was already drained
    // in capture_loop's final iteration.

    writer.finalize()?;

    let file_size = std::fs::metadata(output_path).map(|m| m.len()).unwrap_or(0);
    eprintln!("[capture] Done: {total_frames} frames, {file_size} bytes");

    Ok(output_path.to_string())
}

// ── Event-driven capture loop ───────────────────────────────────────

/// Interval (in drain iterations) between emitting audio level events.
/// At ~10 ms per WASAPI buffer, 10 iterations ≈ 100 ms.
const LEVEL_EMIT_INTERVAL: u32 = 10;

fn capture_loop(
    session: &LoopbackSession,
    writer: &mut AudioWavWriter,
    stop_flag: &AtomicBool,
    app: &AppHandle,
) -> Result<u64, AppError> {
    let mut total_frames: u64 = 0;
    let mut iter_count: u32 = 0;
    let mut peak_level: f32 = 0.0;

    while !stop_flag.load(Ordering::Acquire) {
        // Sleep on kernel event instead of busy-polling with thread::sleep
        session.wait_for_buffer();

        let (frames, level) = drain_packets(session, writer)?;
        total_frames += frames;

        // Track peak level across iterations, emit periodically
        if level > peak_level {
            peak_level = level;
        }
        iter_count += 1;

        if iter_count >= LEVEL_EMIT_INTERVAL {
            let _ = app.emit("audio-level", AudioLevelEvent { level: peak_level });
            peak_level = 0.0;
            iter_count = 0;
        }
    }

    // Final drain after stop flag — get any remaining buffered data
    let (frames, _) = drain_packets(session, writer)?;
    total_frames += frames;

    Ok(total_frames)
}

/// Read all available WASAPI packets. Returns (frames_read, max_rms_level).
fn drain_packets(
    session: &LoopbackSession,
    writer: &mut AudioWavWriter,
) -> Result<(u64, f32), AppError> {
    let mut frames_read: u64 = 0;
    let mut max_level: f32 = 0.0;

    loop {
        let packet_length = unsafe {
            session.capture_client.GetNextPacketSize().unwrap_or(0)
        };
        if packet_length == 0 {
            break;
        }

        let mut buffer_ptr = std::ptr::null_mut();
        let mut num_frames: u32 = 0;
        let mut flags: u32 = 0;

        unsafe {
            session
                .capture_client
                .GetBuffer(&mut buffer_ptr, &mut num_frames, &mut flags, None, None)
                .map_err(|e| AppError::AudioCapture(format!("GetBuffer: {e}")))?;
        }

        let frame_count = num_frames as usize;

        // AUDCLNT_BUFFERFLAGS_SILENT = 0x2
        let level = if (flags & 0x2) != 0 {
            writer.write_silence(frame_count)?;
            0.0
        } else {
            unsafe { writer.write_raw(buffer_ptr, frame_count)? }
        };

        if level > max_level {
            max_level = level;
        }
        frames_read += frame_count as u64;

        unsafe {
            let _ = session.capture_client.ReleaseBuffer(num_frames);
        }
    }

    Ok((frames_read, max_level))
}
