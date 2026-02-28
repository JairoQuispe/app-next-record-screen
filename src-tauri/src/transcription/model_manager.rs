use std::fs;
use std::path::{Path, PathBuf};

use crate::error::AppError;

const HF_BASE_URL: &str = "https://huggingface.co";
const MODEL_REPO: &str = "onnx-community/moonshine-base-ONNX";
const MODEL_REVISION: &str = "main";

const ENCODER_FILE: &str = "onnx/encoder_model_quantized.onnx";
const DECODER_FILE: &str = "onnx/decoder_model_merged_quantized.onnx";
const TOKENIZER_FILE: &str = "tokenizer.json";
const CONFIG_FILE: &str = "config.json";

/// ONNX Runtime version matching ort-sys 2.0.0-rc.11
const ORT_VERSION: &str = "1.23.0";

#[cfg(all(target_os = "windows", target_arch = "x86_64"))]
const ORT_DLL_NAME: &str = "onnxruntime.dll";

#[cfg(all(target_os = "windows", target_arch = "x86_64"))]
const ORT_ZIP_URL: &str = "https://github.com/microsoft/onnxruntime/releases/download/v1.23.0/onnxruntime-win-x64-1.23.0.zip";

#[cfg(all(target_os = "windows", target_arch = "x86_64"))]
const ORT_DLL_PATH_IN_ZIP: &str = "onnxruntime-win-x64-1.23.0/lib/onnxruntime.dll";

/// Required model files with their HuggingFace repo paths.
const REQUIRED_FILES: &[&str] = &[ENCODER_FILE, DECODER_FILE, TOKENIZER_FILE, CONFIG_FILE];

pub struct ModelPaths {
    pub encoder: PathBuf,
    pub decoder: PathBuf,
    pub tokenizer: PathBuf,
    pub config: PathBuf,
}

pub struct ModelManager {
    cache_dir: PathBuf,
}

impl ModelManager {
    pub fn new() -> Result<Self, AppError> {
        let cache_dir = Self::default_cache_dir()?;
        Ok(Self { cache_dir })
    }

    fn default_cache_dir() -> Result<PathBuf, AppError> {
        let base = dirs::data_local_dir()
            .or_else(dirs::data_dir)
            .ok_or_else(|| {
                AppError::ModelDownload("Could not determine app data directory".into())
            })?;
        Ok(base.join("recogni").join("models").join("moonshine-base"))
    }

    /// Check if all model files are already cached.
    pub fn is_cached(&self) -> bool {
        REQUIRED_FILES
            .iter()
            .all(|f| self.cache_dir.join(f).exists())
    }

    /// Get paths to cached model files. Returns error if not all files are cached.
    pub fn get_paths(&self) -> Result<ModelPaths, AppError> {
        if !self.is_cached() {
            return Err(AppError::ModelNotLoaded);
        }
        Ok(ModelPaths {
            encoder: self.cache_dir.join(ENCODER_FILE),
            decoder: self.cache_dir.join(DECODER_FILE),
            tokenizer: self.cache_dir.join(TOKENIZER_FILE),
            config: self.cache_dir.join(CONFIG_FILE),
        })
    }

    /// Download all required model files from HuggingFace.
    /// Calls `on_progress(file_index, total_files, bytes_downloaded, total_bytes)`.
    pub fn download<F>(&self, on_progress: F) -> Result<ModelPaths, AppError>
    where
        F: Fn(usize, usize, u64, u64),
    {
        let total_files = REQUIRED_FILES.len();

        for (idx, rel_path) in REQUIRED_FILES.iter().enumerate() {
            let local_path = self.cache_dir.join(rel_path);

            // Skip if already downloaded
            if local_path.exists() {
                on_progress(idx + 1, total_files, 0, 0);
                continue;
            }

            // Ensure parent directory exists
            if let Some(parent) = local_path.parent() {
                fs::create_dir_all(parent).map_err(|e| {
                    AppError::ModelDownload(format!("Failed to create dir {}: {e}", parent.display()))
                })?;
            }

            let url = format!(
                "{HF_BASE_URL}/{MODEL_REPO}/resolve/{MODEL_REVISION}/{rel_path}"
            );

            Self::download_file(&url, &local_path, |downloaded, total| {
                on_progress(idx + 1, total_files, downloaded, total);
            })?;
        }

        self.get_paths()
    }

    fn download_file<F>(url: &str, dest: &Path, on_progress: F) -> Result<(), AppError>
    where
        F: Fn(u64, u64),
    {
        use std::io::Write;

        let client = reqwest::blocking::Client::builder()
            .user_agent("recogni/0.1.0")
            .build()
            .map_err(|e| AppError::ModelDownload(format!("HTTP client error: {e}")))?;

        let response = client
            .get(url)
            .send()
            .map_err(|e| AppError::ModelDownload(format!("Download failed for {url}: {e}")))?;

        if !response.status().is_success() {
            return Err(AppError::ModelDownload(format!(
                "HTTP {} for {url}",
                response.status()
            )));
        }

        let total = response.content_length().unwrap_or(0);
        let mut downloaded: u64 = 0;

        // Write to a temp file first, then rename (atomic-ish)
        let tmp_path = dest.with_extension("tmp");
        let mut file = fs::File::create(&tmp_path).map_err(|e| {
            AppError::ModelDownload(format!("Failed to create {}: {e}", tmp_path.display()))
        })?;

        let bytes = response.bytes().map_err(|e| {
            AppError::ModelDownload(format!("Failed to read response body: {e}"))
        })?;

        // Write in chunks for progress reporting
        let chunk_size = 256 * 1024; // 256 KB
        for chunk in bytes.chunks(chunk_size) {
            file.write_all(chunk).map_err(|e| {
                AppError::ModelDownload(format!("Write error: {e}"))
            })?;
            downloaded += chunk.len() as u64;
            on_progress(downloaded, total);
        }

        file.flush().map_err(|e| {
            AppError::ModelDownload(format!("Flush error: {e}"))
        })?;
        drop(file);

        fs::rename(&tmp_path, dest).map_err(|e| {
            AppError::ModelDownload(format!(
                "Failed to rename {} -> {}: {e}",
                tmp_path.display(),
                dest.display()
            ))
        })?;

        Ok(())
    }

    #[allow(dead_code)]
    pub fn cache_dir(&self) -> &Path {
        &self.cache_dir
    }

    /// Path where the ONNX Runtime DLL should be stored.
    #[cfg(all(target_os = "windows", target_arch = "x86_64"))]
    pub fn ort_dll_path(&self) -> PathBuf {
        self.cache_dir.join(ORT_DLL_NAME)
    }

    /// Ensure the ONNX Runtime shared library is available locally.
    /// Downloads from the official Microsoft GitHub release if not cached.
    /// Returns the absolute path to the DLL.
    #[cfg(all(target_os = "windows", target_arch = "x86_64"))]
    pub fn ensure_onnx_runtime_dll(&self) -> Result<PathBuf, AppError> {
        let dll_path = self.ort_dll_path();
        if dll_path.exists() {
            return Ok(dll_path);
        }

        // Ensure cache dir exists
        fs::create_dir_all(&self.cache_dir).map_err(|e| {
            AppError::ModelDownload(format!("Failed to create cache dir: {e}"))
        })?;

        eprintln!("[ModelManager] Downloading ONNX Runtime v{ORT_VERSION}...");

        let client = reqwest::blocking::Client::builder()
            .user_agent("recogni/0.1.0")
            .build()
            .map_err(|e| AppError::ModelDownload(format!("HTTP client error: {e}")))?;

        let response = client
            .get(ORT_ZIP_URL)
            .send()
            .map_err(|e| AppError::ModelDownload(format!("Failed to download ORT: {e}")))?;

        if !response.status().is_success() {
            return Err(AppError::ModelDownload(format!(
                "HTTP {} downloading ONNX Runtime from {ORT_ZIP_URL}",
                response.status()
            )));
        }

        let zip_bytes = response.bytes().map_err(|e| {
            AppError::ModelDownload(format!("Failed to read ORT zip body: {e}"))
        })?;

        // Extract just the DLL from the zip
        let cursor = std::io::Cursor::new(zip_bytes);
        let mut archive = zip::ZipArchive::new(cursor).map_err(|e| {
            AppError::ModelDownload(format!("Failed to open ORT zip: {e}"))
        })?;

        let mut dll_file = archive.by_name(ORT_DLL_PATH_IN_ZIP).map_err(|e| {
            AppError::ModelDownload(format!(
                "DLL not found in zip at {ORT_DLL_PATH_IN_ZIP}: {e}"
            ))
        })?;

        let tmp_path = dll_path.with_extension("dll.tmp");
        {
            let mut out = fs::File::create(&tmp_path).map_err(|e| {
                AppError::ModelDownload(format!("Failed to create temp DLL: {e}"))
            })?;
            std::io::copy(&mut dll_file, &mut out).map_err(|e| {
                AppError::ModelDownload(format!("Failed to extract DLL: {e}"))
            })?;
        }

        fs::rename(&tmp_path, &dll_path).map_err(|e| {
            AppError::ModelDownload(format!("Failed to rename DLL: {e}"))
        })?;

        eprintln!("[ModelManager] ONNX Runtime DLL cached at {}", dll_path.display());
        Ok(dll_path)
    }
}
