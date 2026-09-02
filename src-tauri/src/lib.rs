mod assets;
mod data;
mod embedding;
mod knowledge;
mod llm;
mod revisions;
mod search;

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
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .register_uri_scheme_protocol("noteflow-asset", |context, request| {
            let asset_id = request.uri().path().trim_start_matches('/');
            let state = context.app_handle().state::<data::AppState>();
            match state.resolve_asset_protocol(asset_id) {
                Ok((path, mime_type)) => match std::fs::read(path) {
                    Ok(bytes) => tauri::http::Response::builder()
                        .header(tauri::http::header::CONTENT_TYPE, mime_type)
                        .header(
                            tauri::http::header::CACHE_CONTROL,
                            "private, max-age=31536000, immutable",
                        )
                        .body(bytes)
                        .unwrap_or_else(|_| tauri::http::Response::new(Vec::new())),
                    Err(_) => tauri::http::Response::builder()
                        .status(404)
                        .body(Vec::new())
                        .unwrap_or_else(|_| tauri::http::Response::new(Vec::new())),
                },
                Err(_) => tauri::http::Response::builder()
                    .status(404)
                    .body(Vec::new())
                    .unwrap_or_else(|_| tauri::http::Response::new(Vec::new())),
            }
        })
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
            data::accept_embedding_cloud_consent,
            data::cancel_embedding_indexing,
            data::create_backup,
            data::create_note,
            data::create_project,
            data::create_rag_chat,
            data::create_tag,
            data::delete_archive_item,
            data::delete_embedding_profile,
            data::delete_llm_provider,
            data::delete_llm_provider_key,
            data::delete_note,
            data::delete_note_permanently,
            data::delete_rag_chat,
            data::delete_tag,
            data::duplicate_note,
            data::export_note_markdown,
            data::export_note_zip,
            data::export_project_zip,
            data::accept_note_ai_privacy,
            data::get_note_ai_status,
            data::get_embedding_index_status,
            data::get_note,
            data::get_ui_settings,
            data::import_backup,
            data::preview_backup,
            data::list_archive,
            data::list_embedding_profiles,
            data::list_embedding_models,
            data::list_note_chat_messages,
            data::list_llm_models,
            data::list_llm_models_for_draft,
            data::list_llm_providers,
            data::list_notes,
            data::search_notes,
            data::rebuild_search_index,
            data::rebuild_embedding_index,
            data::rebuild_knowledge_chunks,
            data::reconcile_knowledge_chunks,
            data::sync_knowledge_chunks_for_note,
            data::get_knowledge_documents,
            data::get_knowledge_document_by_note_id,
            data::get_knowledge_chunk_state,
            data::get_knowledge_chunks_by_note_id,
            data::get_knowledge_chunks_by_note_ids,
            data::get_knowledge_index_status,
            data::get_neighbor_knowledge_chunks,
            data::list_projects,
            data::list_rag_chat_messages,
            data::list_rag_chats,
            data::list_tags,
            data::load_workspace,
            data::merge_tags,
            data::move_note_to_project,
            data::rename_note,
            data::rename_rag_chat,
            data::rename_tag,
            data::restore_archive_item,
            data::restore_note,
            data::restore_note_revision,
            data::open_attachment,
            data::reveal_attachment,
            data::save_llm_provider,
            data::save_embedding_profile,
            data::set_default_llm_provider,
            data::store_attachment,
            data::store_attachment_from_path,
            data::test_llm_provider,
            data::test_llm_provider_draft,
            data::test_embedding_provider,
            data::semantic_search,
            data::hybrid_search,
            data::run_note_ai,
            data::save_note_chat_message,
            data::save_rag_chat_message,
            data::toggle_note_pin,
            data::check_llm_provider_key,
            quit_app,
            data::update_note_content,
            data::update_embedding_index,
            data::update_ui_settings,
            data::update_tag,
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
