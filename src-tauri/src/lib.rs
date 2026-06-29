mod data;
mod llm;

use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    thread,
    time::Duration,
};
use tauri::Manager;

const CLOSE_REQUEST_FALLBACK_TIMEOUT: Duration = Duration::from_secs(7);

#[derive(Clone)]
struct CloseRequestGuard {
    is_active: Arc<AtomicBool>,
}

impl CloseRequestGuard {
    fn new() -> Self {
        Self {
            is_active: Arc::new(AtomicBool::new(false)),
        }
    }

    fn schedule_fallback(&self) {
        if self.is_active.swap(true, Ordering::SeqCst) {
            return;
        }

        thread::spawn(move || {
            thread::sleep(CLOSE_REQUEST_FALLBACK_TIMEOUT);
            // Last resort: the frontend close flow has already had time to flush and quit.
            std::process::exit(0);
        });
    }
}

fn exit_process(app_handle: &tauri::AppHandle) -> ! {
    app_handle.cleanup_before_exit();
    std::process::exit(0);
}

#[tauri::command]
fn quit_app(app_handle: tauri::AppHandle) {
    exit_process(&app_handle);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let close_guard = CloseRequestGuard::new();

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .on_window_event({
            let close_guard = close_guard.clone();
            move |window, event| {
                if window.label() == "main"
                    && matches!(event, tauri::WindowEvent::CloseRequested { .. })
                {
                    close_guard.schedule_fallback();
                }
            }
        })
        .setup(|app| {
            let state = data::init_state(app)?;
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            data::archive_note,
            data::create_backup,
            data::create_note,
            data::create_project,
            data::create_tag,
            data::delete_archive_item,
            data::delete_llm_provider,
            data::delete_llm_provider_key,
            data::delete_note,
            data::delete_note_permanently,
            data::delete_tag,
            data::duplicate_note,
            data::export_note_markdown,
            data::export_note_zip,
            data::export_project_zip,
            data::get_ui_settings,
            data::import_backup,
            data::list_archive,
            data::list_llm_models,
            data::list_llm_providers,
            data::list_notes,
            data::list_projects,
            data::list_tags,
            data::load_workspace,
            data::merge_tags,
            data::move_note_to_project,
            data::rename_note,
            data::rename_tag,
            data::restore_archive_item,
            data::restore_note,
            data::save_llm_provider,
            data::set_default_llm_provider,
            data::store_attachment,
            data::test_llm_provider,
            data::toggle_note_pin,
            data::check_llm_provider_key,
            quit_app,
            data::update_note_content,
            data::update_ui_settings,
            data::update_tag_color
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        if let tauri::RunEvent::WindowEvent {
            label,
            event: tauri::WindowEvent::Destroyed,
            ..
        } = event
        {
            if label == "main" {
                exit_process(app_handle);
            }
        }
    });
}
