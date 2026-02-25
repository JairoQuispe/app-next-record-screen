mod audio_capture;
mod commands;
mod error;

use audio_capture::SystemAudioHandle;
use std::sync::Mutex;

pub struct AudioCaptureState(pub Mutex<Option<SystemAudioHandle>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AudioCaptureState(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            commands::start_system_audio_capture,
            commands::stop_system_audio_capture,
            commands::is_system_audio_available,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
