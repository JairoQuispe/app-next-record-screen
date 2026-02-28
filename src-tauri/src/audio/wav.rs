use crate::error::AppError;
use std::fs::File;
use std::io::{BufWriter, Seek, SeekFrom, Write};

use super::wasapi::AudioFormat;

// WAV header constants
const RIFF: &[u8; 4] = b"RIFF";
const WAVE: &[u8; 4] = b"WAVE";
const FMT_: &[u8; 4] = b"fmt ";
const DATA: &[u8; 4] = b"data";
// WAVE_FORMAT_IEEE_FLOAT
const WAVE_FORMAT_FLOAT: u16 = 3;

/// Zero-overhead WAV writer.
///
/// Writes a 44-byte header at creation, then streams raw f32 PCM bytes
/// directly to a `BufWriter<File>`. No per-sample function calls, no
/// bounds checks — just `memcpy` via `write_all`.
///
/// On `finalize()`, seeks back and patches the header with the final size.
pub struct AudioWavWriter {
    writer: BufWriter<File>,
    format: AudioFormat,
    data_bytes_written: u64,
}

/// Size of the BufWriter internal buffer.
/// 256 KB ≈ 1.3 s of stereo 48 kHz f32 audio → one syscall per ~1 s.
const BUF_CAPACITY: usize = 256 * 1024;

impl AudioWavWriter {
    /// Create a new WAV file at `path`. Writes the header immediately.
    pub fn create(path: &str, format: AudioFormat) -> Result<Self, AppError> {
        let file = File::create(path)
            .map_err(|e| AppError::WavEncode(format!("Create WAV file: {e}")))?;
        let mut writer = BufWriter::with_capacity(BUF_CAPACITY, file);

        // Write placeholder header — finalize() patches the sizes
        Self::write_header(&mut writer, &format, 0)?;

        Ok(Self {
            writer,
            format,
            data_bytes_written: 0,
        })
    }

    /// Write the 44-byte WAV header. `data_size` can be 0 for the initial write.
    fn write_header(w: &mut impl Write, fmt: &AudioFormat, data_size: u32) -> Result<(), AppError> {
        let channels = fmt.channels;
        let sample_rate = fmt.sample_rate;
        let bits_per_sample: u16 = 32; // always write f32
        let block_align = channels * (bits_per_sample / 8);
        let byte_rate = sample_rate * block_align as u32;
        let chunk_size = 36 + data_size;

        let mut header = [0u8; 44];
        header[0..4].copy_from_slice(RIFF);
        header[4..8].copy_from_slice(&chunk_size.to_le_bytes());
        header[8..12].copy_from_slice(WAVE);
        header[12..16].copy_from_slice(FMT_);
        header[16..20].copy_from_slice(&16u32.to_le_bytes()); // fmt chunk size
        header[20..22].copy_from_slice(&WAVE_FORMAT_FLOAT.to_le_bytes());
        header[22..24].copy_from_slice(&channels.to_le_bytes());
        header[24..28].copy_from_slice(&sample_rate.to_le_bytes());
        header[28..32].copy_from_slice(&byte_rate.to_le_bytes());
        header[32..34].copy_from_slice(&block_align.to_le_bytes());
        header[34..36].copy_from_slice(&bits_per_sample.to_le_bytes());
        header[36..40].copy_from_slice(DATA);
        header[40..44].copy_from_slice(&data_size.to_le_bytes());

        w.write_all(&header)
            .map_err(|e| AppError::WavEncode(format!("Write WAV header: {e}")))
    }

    /// Write silence for `frame_count` frames.
    ///
    /// Uses a stack-allocated zero buffer to avoid heap allocation in the
    /// capture hot path (rule: no allocations in audio capture loop).
    #[inline]
    pub fn write_silence(&mut self, frame_count: usize) -> Result<(), AppError> {
        const ZERO_BUF: [u8; 4096] = [0u8; 4096];
        let mut remaining = frame_count * self.format.channels as usize * 4;
        while remaining > 0 {
            let n = remaining.min(ZERO_BUF.len());
            self.writer.write_all(&ZERO_BUF[..n])
                .map_err(|e| AppError::WavEncode(format!("Write silence: {e}")))?;
            remaining -= n;
        }
        self.data_bytes_written += (frame_count * self.format.channels as usize * 4) as u64;
        Ok(())
    }

    /// Write raw WASAPI audio data, converting to f32 if needed.
    /// Returns the RMS level (0.0–1.0) of the written audio for spectrum visualization.
    ///
    /// # Safety
    /// `ptr` must point to valid audio data of at least `frame_count` frames.
    #[inline]
    pub unsafe fn write_raw(&mut self, ptr: *const u8, frame_count: usize) -> Result<f32, AppError> {
        let channels = self.format.channels as usize;
        let sample_count = frame_count * channels;

        if self.format.is_float && self.format.bits_per_sample == 32 {
            // Fast path: source is already f32 — raw memcpy
            let byte_len = sample_count * 4;
            // SAFETY: caller guarantees ptr is valid for byte_len bytes of f32 audio
            let bytes = unsafe { std::slice::from_raw_parts(ptr, byte_len) };
            let samples = unsafe { std::slice::from_raw_parts(ptr as *const f32, sample_count) };
            let rms = compute_rms(samples);
            self.writer.write_all(bytes)
                .map_err(|e| AppError::WavEncode(format!("Write audio: {e}")))?;
            self.data_bytes_written += byte_len as u64;
            Ok(rms)
        } else if !self.format.is_float && self.format.bits_per_sample == 16 {
            // Convert i16 → f32
            // SAFETY: caller guarantees ptr is valid for sample_count i16 samples
            let src = unsafe { std::slice::from_raw_parts(ptr as *const i16, sample_count) };
            let mut buf = Vec::with_capacity(sample_count);
            for &s in src {
                buf.push(s as f32 / 32768.0);
            }
            let rms = compute_rms(&buf);
            // SAFETY: buf is a valid Vec<f32> we just created; reinterpreting as bytes
            let bytes = unsafe { std::slice::from_raw_parts(buf.as_ptr() as *const u8, sample_count * 4) };
            self.writer.write_all(bytes)
                .map_err(|e| AppError::WavEncode(format!("Write audio: {e}")))?;
            self.data_bytes_written += (sample_count * 4) as u64;
            Ok(rms)
        } else {
            // Fallback: treat as f32
            let byte_len = sample_count * 4;
            // SAFETY: caller guarantees ptr is valid for byte_len bytes
            let bytes = unsafe { std::slice::from_raw_parts(ptr, byte_len) };
            let samples = unsafe { std::slice::from_raw_parts(ptr as *const f32, sample_count) };
            let rms = compute_rms(samples);
            self.writer.write_all(bytes)
                .map_err(|e| AppError::WavEncode(format!("Write audio: {e}")))?;
            self.data_bytes_written += byte_len as u64;
            Ok(rms)
        }
    }

    /// Flush the buffer, seek back, and patch the WAV header with final sizes.
    pub fn finalize(mut self) -> Result<(), AppError> {
        self.writer.flush()
            .map_err(|e| AppError::WavEncode(format!("Flush: {e}")))?;

        // Clamp to u32 max (WAV format limit ~4 GB)
        let data_size = self.data_bytes_written.min(u32::MAX as u64) as u32;

        self.writer.seek(SeekFrom::Start(0))
            .map_err(|e| AppError::WavEncode(format!("Seek: {e}")))?;

        Self::write_header(&mut self.writer, &self.format, data_size)?;

        self.writer.flush()
            .map_err(|e| AppError::WavEncode(format!("Final flush: {e}")))?;

        Ok(())
    }
}

/// Compute RMS level of f32 samples, clamped to 0.0–1.0.
#[inline]
fn compute_rms(samples: &[f32]) -> f32 {
    if samples.is_empty() {
        return 0.0;
    }
    // Sample every 4th value for speed — RMS doesn't need every sample
    let step = 4;
    let mut sum = 0.0f64;
    let mut count = 0u32;
    let mut i = 0;
    while i < samples.len() {
        let s = samples[i] as f64;
        sum += s * s;
        count += 1;
        i += step;
    }
    let rms = (sum / count as f64).sqrt() as f32;
    rms.min(1.0)
}
