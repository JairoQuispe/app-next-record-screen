use std::path::Path;

use ort::session::Session;
use ort::value::Value;

use crate::error::AppError;
use super::model_manager::{ModelManager, ModelPaths};

/// Moonshine model config extracted from config.json.
struct MoonshineConfig {
    eos_token_id: i64,
    decoder_start_token_id: i64,
    decoder_num_key_value_heads: usize,
    decoder_num_hidden_layers: usize,
    hidden_size: usize,
    max_position_embeddings: usize,
}

impl MoonshineConfig {
    fn dim_kv(&self) -> usize {
        self.hidden_size / self.decoder_num_key_value_heads
    }

    fn from_json(path: &Path) -> Result<Self, AppError> {
        let content = std::fs::read_to_string(path)
            .map_err(|e| AppError::Transcription(format!("Failed to read config: {e}")))?;
        let json: serde_json::Value = serde_json::from_str(&content)
            .map_err(|e| AppError::Transcription(format!("Failed to parse config: {e}")))?;

        Ok(Self {
            eos_token_id: json["eos_token_id"]
                .as_i64()
                .unwrap_or(50257),
            decoder_start_token_id: json["decoder_start_token_id"]
                .as_i64()
                .unwrap_or(50257),
            decoder_num_key_value_heads: json["decoder_num_key_value_heads"]
                .as_u64()
                .unwrap_or(8) as usize,
            decoder_num_hidden_layers: json["decoder_num_hidden_layers"]
                .as_u64()
                .unwrap_or(8) as usize,
            hidden_size: json["hidden_size"]
                .as_u64()
                .unwrap_or(416) as usize,
            max_position_embeddings: json["max_position_embeddings"]
                .as_u64()
                .unwrap_or(2048) as usize,
        })
    }
}

/// Named KV cache entry: shape + flat data.
struct KvEntry {
    name: String,
    shape: Vec<i64>,
    data: Vec<f32>,
}

pub struct MoonshineEngine {
    encoder_session: Session,
    decoder_session: Session,
    tokenizer: tokenizers::Tokenizer,
    config: MoonshineConfig,
}

impl MoonshineEngine {
    /// Load the Moonshine model from cached ONNX files.
    pub fn load(paths: &ModelPaths) -> Result<Self, AppError> {
        let config = MoonshineConfig::from_json(&paths.config)?;

        let encoder_session = Session::builder()
            .map_err(|e| AppError::Transcription(format!("ORT session builder error: {e}")))?
            .with_intra_threads(4)
            .map_err(|e| AppError::Transcription(format!("ORT thread config error: {e}")))?
            .commit_from_file(&paths.encoder)
            .map_err(|e| AppError::Transcription(format!("Failed to load encoder: {e}")))?;

        let decoder_session = Session::builder()
            .map_err(|e| AppError::Transcription(format!("ORT session builder error: {e}")))?
            .with_intra_threads(4)
            .map_err(|e| AppError::Transcription(format!("ORT thread config error: {e}")))?
            .commit_from_file(&paths.decoder)
            .map_err(|e| AppError::Transcription(format!("Failed to load decoder: {e}")))?;

        let tokenizer = tokenizers::Tokenizer::from_file(&paths.tokenizer)
            .map_err(|e| AppError::Transcription(format!("Failed to load tokenizer: {e}")))?;

        Ok(Self {
            encoder_session,
            decoder_session,
            tokenizer,
            config,
        })
    }

    /// Download model if needed and load it.
    pub fn download_and_load<F>(on_progress: F) -> Result<Self, AppError>
    where
        F: Fn(usize, usize, u64, u64),
    {
        let manager = ModelManager::new()?;

        // Ensure ONNX Runtime DLL is available (load-dynamic requires it at runtime)
        #[cfg(all(target_os = "windows", target_arch = "x86_64"))]
        {
            let dll_path = manager.ensure_onnx_runtime_dll()?;
            std::env::set_var("ORT_DYLIB_PATH", &dll_path);
        }

        let paths = if manager.is_cached() {
            manager.get_paths()?
        } else {
            manager.download(on_progress)?
        };

        Self::load(&paths)
    }

    /// Transcribe raw PCM audio (f32, 16kHz, mono).
    pub fn transcribe(&mut self, audio: &[f32], _language: &str) -> Result<String, AppError> {
        if audio.is_empty() {
            return Ok(String::new());
        }

        if !has_voice_activity(audio) {
            return Ok(String::new());
        }

        let normalized = normalize_audio(audio);
        let audio_len = normalized.len();

        // 1. Run encoder: input shape [1, audio_len]
        let encoder_input = Value::from_array(([1, audio_len as i64], normalized))
            .map_err(|e| AppError::Transcription(format!("Encoder input error: {e}")))?;

        let encoder_outputs = self.encoder_session
            .run(ort::inputs!["input_values" => encoder_input])
            .map_err(|e| AppError::Transcription(format!("Encoder run error: {e}")))?;

        // Extract encoder hidden states — shared across all decoder steps (never mutated)
        let (enc_shape, enc_data) = encoder_outputs[0]
            .try_extract_tensor::<f32>()
            .map_err(|e| AppError::Transcription(format!("Encoder output extract error: {e}")))?;
        let enc_shape_vec: Vec<i64> = enc_shape.iter().copied().collect();
        let enc_data_vec: Vec<f32> = enc_data.to_vec();

        // 2. Prepare KV cache
        let num_layers = self.config.decoder_num_hidden_layers;
        let num_heads = self.config.decoder_num_key_value_heads;
        let dim_kv = self.config.dim_kv();

        let audio_seconds = audio_len as f64 / 16000.0;
        let max_len = ((audio_seconds * 6.0) as usize)
            .min(self.config.max_position_embeddings)
            .max(1);

        let mut generated_tokens: Vec<i64> = vec![self.config.decoder_start_token_id];

        // Initialize KV cache with placeholder shape [1, num_heads, 1, dim_kv].
        // ONNX Runtime requires all dimensions >= 1. On step 0 the model uses
        // use_cache_branch=false, so these placeholder values are ignored.
        let mut kv_cache: Vec<KvEntry> = Vec::new();
        for layer in 0..num_layers {
            for module in &["decoder", "encoder"] {
                for kv in &["key", "value"] {
                    kv_cache.push(KvEntry {
                        name: format!("past_key_values.{layer}.{module}.{kv}"),
                        shape: vec![1, num_heads as i64, 1, dim_kv as i64],
                        data: vec![0.0f32; num_heads * dim_kv],
                    });
                }
            }
        }

        // 3. Autoregressive decoding
        for step in 0..max_len {
            let use_cache = step > 0;
            let last_token = *generated_tokens.last().unwrap();

            // Build inputs as Vec<(name, Value)>
            let input_ids_val = Value::from_array(([1i64, 1], vec![last_token]))
                .map_err(|e| AppError::Transcription(format!("Input IDs error: {e}")))?;

            // Re-wrap the same data without cloning the full tensor — ort requires
            // owned Vec, so we must clone, but we pre-allocated enc_data_vec once.
            // Future: if ort adds Value::from_slice this clone can be removed entirely.
            let enc_hs_val = Value::from_array((enc_shape_vec.as_slice(), enc_data_vec.clone()))
                .map_err(|e| AppError::Transcription(format!("Encoder HS error: {e}")))?;

            let cache_flag_val = Value::from_array(([1i64], vec![use_cache]))
                .map_err(|e| AppError::Transcription(format!("Cache flag error: {e}")))?;

            let mut inputs: Vec<(String, ort::value::DynValue)> = vec![
                ("input_ids".into(), input_ids_val.into_dyn()),
                ("encoder_hidden_states".into(), enc_hs_val.into_dyn()),
                ("use_cache_branch".into(), cache_flag_val.into_dyn()),
            ];

            for entry in &kv_cache {
                let val = Value::from_array((entry.shape.as_slice(), entry.data.clone()))
                    .map_err(|e| AppError::Transcription(format!("KV cache error for {}: {e}", entry.name)))?;
                inputs.push((entry.name.clone(), val.into_dyn()));
            }

            let decoder_outputs = self.decoder_session
                .run(inputs)
                .map_err(|e| AppError::Transcription(format!("Decoder run error at step {step}: {e}")))?;

            // Extract logits
            let (logits_shape, logits_data) = decoder_outputs[0]
                .try_extract_tensor::<f32>()
                .map_err(|e| AppError::Transcription(format!("Logits extract error: {e}")))?;

            let vocab_size: usize = *logits_shape.last().unwrap_or(&1) as usize;
            let offset: usize = logits_data.len().saturating_sub(vocab_size);
            let next_token: i64 = logits_data[offset..]
                .iter()
                .enumerate()
                .max_by(|(_, a), (_, b)| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal))
                .map_or(self.config.eos_token_id, |(i, _)| i as i64);

            if next_token == self.config.eos_token_id {
                break;
            }

            generated_tokens.push(next_token);

            // Update KV cache
            for (j, entry) in kv_cache.iter_mut().enumerate() {
                let output_idx = j + 1;
                if output_idx < decoder_outputs.len() {
                    // For encoder KV: only update on first step
                    // For decoder KV: always update
                    if !use_cache || entry.name.contains("decoder") {
                        let (shape, data) = decoder_outputs[output_idx]
                            .try_extract_tensor::<f32>()
                            .map_err(|e| AppError::Transcription(format!("KV output error: {e}")))?;
                        entry.shape = shape.iter().copied().collect::<Vec<i64>>();
                        entry.data = data.to_vec();
                    }
                }
            }
        }

        // 4. Decode tokens
        let token_ids: Vec<u32> = generated_tokens.iter()
            .skip(1)
            .map(|&t| t as u32)
            .collect();

        let text = self.tokenizer
            .decode(&token_ids, true)
            .map_err(|e| AppError::Transcription(format!("Tokenizer decode error: {e}")))?;

        let trimmed = text.trim().to_string();

        if is_hallucination(&trimmed) {
            return Ok(String::new());
        }

        Ok(trimmed)
    }
}

/// Simple RMS voice activity detection.
fn has_voice_activity(audio: &[f32]) -> bool {
    const VAD_RMS_THRESHOLD: f32 = 0.015;
    const STEP: usize = 4;

    let (sum_sq, count) = audio.iter().step_by(STEP).fold(
        (0.0f64, 0usize),
        |(sum, cnt), &s| (sum + (s as f64) * (s as f64), cnt + 1),
    );
    let rms = (sum_sq / count.max(1) as f64).sqrt() as f32;
    rms >= VAD_RMS_THRESHOLD
}

/// Normalize audio to target peak.
fn normalize_audio(audio: &[f32]) -> Vec<f32> {
    const TARGET: f32 = 0.95;
    const MIN_PEAK: f32 = 0.01;

    let peak = audio.iter().map(|s| s.abs()).fold(0.0f32, f32::max);
    if !(MIN_PEAK..TARGET).contains(&peak) {
        return audio.to_vec();
    }
    let scale = TARGET / peak;
    audio.iter().map(|s| s * scale).collect()
}

/// Detect hallucinated ASR output (repetitive phrases).
fn is_hallucination(text: &str) -> bool {
    if text.len() < 20 {
        return false;
    }

    let lower = text.to_lowercase();
    let words: Vec<&str> = lower
        .split_whitespace()
        .filter(|w| w.len() > 1)
        .collect();

    if words.len() < 4 {
        return false;
    }

    // Low unique word ratio
    let unique: std::collections::HashSet<&str> = words.iter().copied().collect();
    if (unique.len() as f64 / words.len() as f64) < 0.25 {
        return true;
    }

    // Repeated 3-grams — use tuple keys to avoid String allocation per n-gram
    let mut ngrams: std::collections::HashMap<(&str, &str, &str), u32> =
        std::collections::HashMap::new();
    for window in words.windows(3) {
        let count = ngrams.entry((window[0], window[1], window[2])).or_insert(0);
        *count += 1;
        if *count >= 3 {
            return true;
        }
    }

    false
}
