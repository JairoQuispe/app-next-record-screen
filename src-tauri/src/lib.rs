mod audio;
mod commands;
mod error;
mod tray;

use std::sync::{Arc, Mutex};

pub struct AudioCaptureState(pub Arc<Mutex<Option<audio::SystemAudioHandle>>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            tray::setup(app)?;
            Ok(())
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .manage(AudioCaptureState(Arc::new(Mutex::new(None))))
        .invoke_handler(tauri::generate_handler![
            commands::start_system_audio_capture,
            commands::stop_system_audio_capture,
            commands::is_system_audio_available,
            commands::enhance_audio,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
