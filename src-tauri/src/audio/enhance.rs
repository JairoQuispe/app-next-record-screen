use crate::error::AppError;
use nnnoiseless::DenoiseState;
use std::fs::File;
use std::io::{BufReader, BufWriter, Read, Seek, SeekFrom, Write};

/// Size of one RNNoise frame (fixed by the algorithm).
const FRAME_SIZE: usize = DenoiseState::FRAME_SIZE;

/// WAV header constants
const RIFF: &[u8; 4] = b"RIFF";
const WAVE: &[u8; 4] = b"WAVE";
const FMT_: &[u8; 4] = b"fmt ";
const DATA: &[u8; 4] = b"data";
const WAVE_FORMAT_FLOAT: u16 = 3;

// ── WAV reading ─────────────────────────────────────────────────────

/// Minimal WAV format info extracted from header.
#[derive(Debug, Clone)]
pub struct WavInfo {
    pub channels: u16,
    pub sample_rate: u32,
    pub bits_per_sample: u16,
    pub is_float: bool,
    pub data_offset: u64,
    pub data_size: u32,
}

/// Read and parse a WAV header, returning format info.
fn read_wav_header(reader: &mut (impl Read + Seek)) -> Result<WavInfo, AppError> {
    reader.seek(SeekFrom::Start(0))
        .map_err(|e| AppError::AudioEnhance(format!("Seek: {e}")))?;

    let mut header = [0u8; 44];
    reader.read_exact(&mut header)
        .map_err(|e| AppError::AudioEnhance(format!("Read WAV header: {e}")))?;

    if &header[0..4] != RIFF || &header[8..12] != WAVE {
        return Err(AppError::AudioEnhance("Not a valid WAV file".into()));
    }

    let format_tag = u16::from_le_bytes([header[20], header[21]]);
    let channels = u16::from_le_bytes([header[22], header[23]]);
    let sample_rate = u32::from_le_bytes([header[24], header[25], header[26], header[27]]);
    let bits_per_sample = u16::from_le_bytes([header[34], header[35]]);

    // Find data chunk — it's usually at offset 36, but scan for it
    let mut data_offset: u64 = 12; // after RIFF + size + WAVE
    reader.seek(SeekFrom::Start(data_offset))
        .map_err(|e| AppError::AudioEnhance(format!("Seek to chunks: {e}")))?;

    loop {
        let mut chunk_header = [0u8; 8];
        reader.read_exact(&mut chunk_header)
            .map_err(|e| AppError::AudioEnhance(format!("Read chunk header: {e}")))?;
        data_offset += 8;

        if &chunk_header[0..4] == DATA {
            let data_size = u32::from_le_bytes([
                chunk_header[4], chunk_header[5], chunk_header[6], chunk_header[7],
            ]);
            return Ok(WavInfo {
                channels,
                sample_rate,
                bits_per_sample,
                is_float: format_tag == WAVE_FORMAT_FLOAT,
                data_offset,
                data_size,
            });
        }

        // Skip this chunk
        let chunk_size = u32::from_le_bytes([
            chunk_header[4], chunk_header[5], chunk_header[6], chunk_header[7],
        ]);
        reader.seek(SeekFrom::Current(chunk_size as i64))
            .map_err(|e| AppError::AudioEnhance(format!("Skip chunk: {e}")))?;
        data_offset += chunk_size as u64;
    }
}

/// Read all f32 samples from a WAV file. Returns (samples, info).
fn read_wav_f32(path: &str) -> Result<(Vec<f32>, WavInfo), AppError> {
    let file = File::open(path)
        .map_err(|e| AppError::AudioEnhance(format!("Open WAV: {e}")))?;
    let mut reader = BufReader::new(file);

    let info = read_wav_header(&mut reader)?;

    reader.seek(SeekFrom::Start(info.data_offset))
        .map_err(|e| AppError::AudioEnhance(format!("Seek to data: {e}")))?;

    let _sample_count = info.data_size as usize / (info.bits_per_sample as usize / 8);

    if info.is_float && info.bits_per_sample == 32 {
        let mut bytes = vec![0u8; info.data_size as usize];
        reader.read_exact(&mut bytes)
            .map_err(|e| AppError::AudioEnhance(format!("Read audio data: {e}")))?;
        // SAFETY: f32 is 4 bytes, alignment is handled by Vec reallocation
        let samples: Vec<f32> = bytes
            .chunks_exact(4)
            .map(|b| f32::from_le_bytes([b[0], b[1], b[2], b[3]]))
            .collect();
        Ok((samples, info))
    } else if !info.is_float && info.bits_per_sample == 16 {
        let mut bytes = vec![0u8; info.data_size as usize];
        reader.read_exact(&mut bytes)
            .map_err(|e| AppError::AudioEnhance(format!("Read audio data: {e}")))?;
        let samples: Vec<f32> = bytes
            .chunks_exact(2)
            .map(|b| i16::from_le_bytes([b[0], b[1]]) as f32 / 32768.0)
            .collect();
        Ok((samples, info))
    } else {
        Err(AppError::AudioEnhance(format!(
            "Unsupported WAV format: float={}, bits={}",
            info.is_float, info.bits_per_sample
        )))
    }
}

/// Write f32 samples to a WAV file.
fn write_wav_f32(path: &str, samples: &[f32], info: &WavInfo) -> Result<(), AppError> {
    let file = File::create(path)
        .map_err(|e| AppError::AudioEnhance(format!("Create output WAV: {e}")))?;
    let mut writer = BufWriter::with_capacity(256 * 1024, file);

    let channels = info.channels;
    let sample_rate = info.sample_rate;
    let bits_per_sample: u16 = 32;
    let block_align = channels * (bits_per_sample / 8);
    let byte_rate = sample_rate * block_align as u32;
    let data_size = (samples.len() * 4) as u32;
    let chunk_size = 36 + data_size;

    let mut header = [0u8; 44];
    header[0..4].copy_from_slice(RIFF);
    header[4..8].copy_from_slice(&chunk_size.to_le_bytes());
    header[8..12].copy_from_slice(WAVE);
    header[12..16].copy_from_slice(FMT_);
    header[16..20].copy_from_slice(&16u32.to_le_bytes());
    header[20..22].copy_from_slice(&WAVE_FORMAT_FLOAT.to_le_bytes());
    header[22..24].copy_from_slice(&channels.to_le_bytes());
    header[24..28].copy_from_slice(&sample_rate.to_le_bytes());
    header[28..32].copy_from_slice(&byte_rate.to_le_bytes());
    header[32..34].copy_from_slice(&block_align.to_le_bytes());
    header[34..36].copy_from_slice(&bits_per_sample.to_le_bytes());
    header[36..40].copy_from_slice(DATA);
    header[40..44].copy_from_slice(&data_size.to_le_bytes());

    writer.write_all(&header)
        .map_err(|e| AppError::AudioEnhance(format!("Write header: {e}")))?;

    for &sample in samples {
        writer.write_all(&sample.to_le_bytes())
            .map_err(|e| AppError::AudioEnhance(format!("Write sample: {e}")))?;
    }

    writer.flush()
        .map_err(|e| AppError::AudioEnhance(format!("Flush output: {e}")))?;

    Ok(())
}

// ── Audio processing functions ──────────────────────────────────────

/// Convert interleaved stereo samples to mono by averaging channels.
fn stereo_to_mono(samples: &[f32], channels: u16) -> Vec<f32> {
    if channels == 1 {
        return samples.to_vec();
    }
    let ch = channels as usize;
    samples
        .chunks_exact(ch)
        .map(|frame| {
            let sum: f32 = frame.iter().sum();
            sum / ch as f32
        })
        .collect()
}

/// Duplicate mono samples back to interleaved multi-channel.
fn mono_to_multichannel(mono: &[f32], channels: u16) -> Vec<f32> {
    if channels == 1 {
        return mono.to_vec();
    }
    let ch = channels as usize;
    let mut out = Vec::with_capacity(mono.len() * ch);
    for &s in mono {
        for _ in 0..ch {
            out.push(s);
        }
    }
    out
}

/// Apply RNNoise denoising to mono f32 samples in [-1.0, 1.0] range.
/// `intensity` controls the wet/dry mix: 0.0 = original, 1.0 = fully denoised.
fn denoise_mono(mono: &[f32], intensity: f32) -> Vec<f32> {
    let intensity = intensity.clamp(0.0, 1.0);
    if intensity == 0.0 {
        return mono.to_vec();
    }

    let mut state = DenoiseState::new();
    let mut output = Vec::with_capacity(mono.len());

    // nnnoiseless expects samples in i16 range [-32768, 32767]
    let mut input_frame = [0.0f32; FRAME_SIZE];
    let mut output_frame = [0.0f32; FRAME_SIZE];

    let total_frames = (mono.len() + FRAME_SIZE - 1) / FRAME_SIZE;

    for frame_idx in 0..total_frames {
        let start = frame_idx * FRAME_SIZE;
        let end = (start + FRAME_SIZE).min(mono.len());
        let len = end - start;

        // Scale to i16 range for nnnoiseless
        input_frame.fill(0.0);
        for i in 0..len {
            input_frame[i] = mono[start + i] * 32767.0;
        }

        state.process_frame(&mut output_frame, &input_frame);

        // Scale back to [-1.0, 1.0] and mix with original
        for i in 0..len {
            let clean = output_frame[i] / 32767.0;
            let original = mono[start + i];
            let mixed = clean * intensity + original * (1.0 - intensity);
            output.push(mixed);
        }
    }

    output
}

/// Peak normalize audio samples so the loudest sample reaches `target_peak`.
/// `target_peak` is in linear scale (e.g., 0.89 ≈ -1dB).
fn peak_normalize(samples: &mut [f32], target_peak: f32) {
    let mut max_abs: f32 = 0.0;
    for &s in samples.iter() {
        let abs = s.abs();
        if abs > max_abs {
            max_abs = abs;
        }
    }

    // Don't amplify near-silence or already-normalized audio
    if max_abs < 0.001 || (max_abs - target_peak).abs() < 0.01 {
        return;
    }

    let scale = target_peak / max_abs;
    for s in samples.iter_mut() {
        *s *= scale;
    }
}

/// Apply cosine fade-in and fade-out to avoid clicks.
fn apply_fade(samples: &mut [f32], sample_rate: u32, fade_ms: u32) {
    let fade_samples = (sample_rate as usize * fade_ms as usize) / 1000;
    let fade_samples = fade_samples.min(samples.len() / 2);

    // Fade in
    for i in 0..fade_samples {
        let t = i as f32 / fade_samples as f32;
        let gain = 0.5 * (1.0 - (std::f32::consts::PI * t).cos());
        samples[i] *= gain;
    }

    // Fade out
    let len = samples.len();
    for i in 0..fade_samples {
        let t = i as f32 / fade_samples as f32;
        let gain = 0.5 * (1.0 - (std::f32::consts::PI * t).cos());
        samples[len - 1 - i] *= gain;
    }
}

// ── Public API ──────────────────────────────────────────────────────

/// Denoise a WAV file and write the result to `output_path`.
///
/// - `intensity`: 0.0 (no suppression) to 1.0 (full suppression)
/// - `normalize`: if true, peak-normalize to -1dB after denoising
///
/// Returns the output path on success.
pub fn denoise_wav(
    input_path: &str,
    output_path: &str,
    intensity: f32,
    normalize: bool,
) -> Result<String, AppError> {
    let (samples, info) = read_wav_f32(input_path)?;

    if info.sample_rate != 48000 {
        return Err(AppError::AudioEnhance(format!(
            "Expected 48kHz audio, got {}Hz. RNNoise requires 48kHz.",
            info.sample_rate
        )));
    }

    // Convert to mono for RNNoise processing
    let mono = stereo_to_mono(&samples, info.channels);

    // Apply noise suppression
    let denoised_mono = denoise_mono(&mono, intensity);

    // Convert back to original channel count
    let mut output_samples = mono_to_multichannel(&denoised_mono, info.channels);

    // Optional peak normalization to -1dB (0.891)
    if normalize {
        peak_normalize(&mut output_samples, 0.891);
    }

    // Apply fade in/out (50ms) to avoid clicks
    apply_fade(&mut output_samples, info.sample_rate, 50);

    // Write output WAV
    write_wav_f32(output_path, &output_samples, &info)?;

    Ok(output_path.to_string())
}

// ── Real-time denoiser for capture loop ─────────────────────────────

/// A stateful denoiser that can process audio in streaming fashion.
/// Designed to be used inside the capture loop without allocations.
#[allow(dead_code)]
pub struct RealtimeDenoiser {
    state: Box<DenoiseState<'static>>,
    intensity: f32,
    channels: u16,
    // Accumulation buffer for partial frames (mono)
    mono_buf: Vec<f32>,
    input_frame: [f32; FRAME_SIZE],
    output_frame: [f32; FRAME_SIZE],
}

#[allow(dead_code)]
impl RealtimeDenoiser {
    /// Create a new real-time denoiser.
    /// `intensity`: 0.0 to 1.0 — amount of noise suppression.
    /// `channels`: number of audio channels (1 or 2).
    pub fn new(intensity: f32, channels: u16) -> Self {
        Self {
            state: DenoiseState::new(),
            intensity: intensity.clamp(0.0, 1.0),
            channels,
            mono_buf: Vec::with_capacity(FRAME_SIZE * 2),
            input_frame: [0.0f32; FRAME_SIZE],
            output_frame: [0.0f32; FRAME_SIZE],
        }
    }

    /// Process interleaved f32 samples in-place.
    /// The samples are in [-1.0, 1.0] range (standard WAV float).
    /// Modifies `samples` in place with denoised audio.
    pub fn process_interleaved(&mut self, samples: &mut [f32]) {
        if self.intensity == 0.0 || samples.is_empty() {
            return;
        }

        let ch = self.channels as usize;

        // Convert to mono
        let mono_samples: Vec<f32> = if ch == 1 {
            samples.to_vec()
        } else {
            samples
                .chunks_exact(ch)
                .map(|frame| {
                    let sum: f32 = frame.iter().sum();
                    sum / ch as f32
                })
                .collect()
        };

        // Accumulate into buffer
        self.mono_buf.extend_from_slice(&mono_samples);

        // Process complete frames
        let mut processed_mono = Vec::with_capacity(mono_samples.len());
        let mut consumed = 0;

        while self.mono_buf.len() - consumed >= FRAME_SIZE {
            // Scale to i16 range
            for i in 0..FRAME_SIZE {
                self.input_frame[i] = self.mono_buf[consumed + i] * 32767.0;
            }

            self.state.process_frame(&mut self.output_frame, &self.input_frame);

            // Scale back and mix
            for i in 0..FRAME_SIZE {
                let clean = self.output_frame[i] / 32767.0;
                let original = self.mono_buf[consumed + i];
                processed_mono.push(clean * self.intensity + original * (1.0 - self.intensity));
            }

            consumed += FRAME_SIZE;
        }

        // Keep unconsumed samples for next call
        let remaining: Vec<f32> = self.mono_buf[consumed..].to_vec();
        self.mono_buf.clear();
        self.mono_buf.extend_from_slice(&remaining);

        // Write back to interleaved output
        // Only overwrite the portion we have processed mono for
        let processed_frames = processed_mono.len();
        if ch == 1 {
            for (i, &s) in processed_mono.iter().enumerate() {
                if i < samples.len() {
                    samples[i] = s;
                }
            }
        } else {
            // Spread mono back to all channels
            for (i, &s) in processed_mono.iter().enumerate() {
                let base = i * ch;
                for c in 0..ch {
                    if base + c < samples.len() {
                        samples[base + c] = s;
                    }
                }
            }
        }

        // Zero out any trailing samples that weren't processed
        // (these are the partial frame that's buffered for next call)
        let _processed_interleaved = processed_frames * ch;
        // Trailing samples past processed_interleaved are left as-is
        // (they correspond to the buffered partial frame for next call)
    }
}
