mod assets;
mod auto_knowledge;
mod data;
mod document_export;
mod embedding;
mod knowledge;
mod knowledge_agent;
mod llm;
mod project_scope;
mod provider_url;
mod rag;
mod revisions;
mod search;

use tauri::Manager;

fn renderable_asset_mime(mime: &str) -> bool {
    assets::IMAGE_MIME_TYPES.contains(&mime)
}

fn asset_canvas_origin(origin: &str) -> bool {
    let app_origin = matches!(
        origin,
        "http://tauri.localhost" | "https://tauri.localhost" | "tauri://localhost"
    );
    app_origin
        || (cfg!(debug_assertions)
            && matches!(origin, "http://127.0.0.1:1420" | "http://localhost:1420"))
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
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .register_uri_scheme_protocol("noteflow-asset", |context, request| {
            let origin = request
                .headers()
                .get(tauri::http::header::ORIGIN)
                .and_then(|value| value.to_str().ok())
                .filter(|value| asset_canvas_origin(value));
            let asset_id = request.uri().path().trim_start_matches('/');
            let state = context.app_handle().state::<data::AppState>();
            match state.resolve_asset_protocol(asset_id) {
                Ok((path, mime_type)) if renderable_asset_mime(&mime_type) => {
                    match std::fs::read(path) {
                        Ok(bytes) => {
                            let mut response = tauri::http::Response::builder()
                                .header(tauri::http::header::CONTENT_TYPE, mime_type)
                                .header(tauri::http::header::X_CONTENT_TYPE_OPTIONS, "nosniff")
                                .header(
                                    tauri::http::header::CACHE_CONTROL,
                                    "private, max-age=31536000, immutable",
                                )
                                .header(tauri::http::header::VARY, "Origin");
                            if let Some(origin) = origin {
                                response = response.header(
                                    tauri::http::header::ACCESS_CONTROL_ALLOW_ORIGIN,
                                    origin,
                                );
                            }
                            response
                                .body(bytes)
                                .unwrap_or_else(|_| tauri::http::Response::new(Vec::new()))
                        }
                        Err(_) => tauri::http::Response::builder()
                            .status(404)
                            .body(Vec::new())
                            .unwrap_or_else(|_| tauri::http::Response::new(Vec::new())),
                    }
                }
                Ok(_) => tauri::http::Response::builder()
                    .status(404)
                    .body(Vec::new())
                    .unwrap_or_else(|_| tauri::http::Response::new(Vec::new())),
                Err(_) => tauri::http::Response::builder()
                    .status(404)
                    .body(Vec::new())
                    .unwrap_or_else(|_| tauri::http::Response::new(Vec::new())),
            }
        })
        .setup(|app| {
            let state = data::init_state(app)?;
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            assets::get_attachment_policy,
            data::archive_note,
            data::archive_project,
            data::accept_embedding_cloud_consent,
            data::cancel_embedding_indexing,
            data::create_backup,
            data::create_backup_at_path,
            data::create_note,
            data::create_project,
            data::complete_first_run,
            data::dismiss_first_run,
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
            data::export_note_markdown_at_path,
            data::export_project_zip_at_path,
            data::get_note_export_images,
            data::write_note_export_file,
            data::accept_note_ai_privacy,
            data::get_note_ai_status,
            data::get_embedding_index_status,
            data::get_note,
            data::get_first_run_state,
            data::get_ui_settings,
            data::import_backup,
            data::import_markdown,
            data::preview_backup,
            data::list_archive,
            data::list_archived_project_notes,
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
            data::make_note_tag_primary,
            data::move_note_to_project,
            data::remove_note_from_project,
            data::rename_note,
            data::rename_rag_chat,
            data::set_rag_chat_projects,
            data::rename_tag,
            data::restore_archive_item,
            data::restore_note,
            data::restore_note_revision,
            data::open_attachment,
            data::reveal_attachment,
            data::save_llm_provider,
            data::save_embedding_profile,
            data::set_default_llm_provider,
            data::set_note_tag,
            data::store_attachment,
            data::store_attachment_from_path,
            data::test_llm_provider,
            data::test_llm_provider_draft,
            data::test_embedding_provider,
            data::semantic_search,
            data::hybrid_search,
            data::run_note_ai,
            data::run_rag_generation,
            data::plan_rag_question,
            data::save_note_chat_message,
            data::save_rag_chat_message,
            data::toggle_note_pin,
            data::check_llm_provider_key,
            quit_app,
            data::update_note_content,
            data::update_project,
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

#[cfg(test)]
mod security_tests {
    use super::{asset_canvas_origin, renderable_asset_mime};

    #[test]
    fn canvas_cors_only_allows_noteflow_origins() {
        for origin in [
            "http://tauri.localhost",
            "https://tauri.localhost",
            "tauri://localhost",
        ] {
            assert!(asset_canvas_origin(origin));
        }
        for origin in [
            "https://example.com",
            "null",
            "http://tauri.localhost.evil",
            "http://127.0.0.1:9999",
        ] {
            assert!(!asset_canvas_origin(origin));
        }
        assert_eq!(
            asset_canvas_origin("http://127.0.0.1:1420"),
            cfg!(debug_assertions)
        );
    }

    #[test]
    fn custom_asset_protocol_never_serves_active_documents() {
        assert!(renderable_asset_mime("image/png"));
        assert!(renderable_asset_mime("image/jpeg"));
        assert!(renderable_asset_mime("image/webp"));
        for mime in [
            "text/html",
            "image/svg+xml",
            "application/javascript",
            "application/pdf",
            "application/octet-stream",
        ] {
            assert!(!renderable_asset_mime(mime));
        }
    }
}
