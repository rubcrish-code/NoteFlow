mod data;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
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
            data::delete_note,
            data::delete_note_permanently,
            data::delete_tag,
            data::duplicate_note,
            data::export_note_markdown,
            data::export_note_zip,
            data::export_project_zip,
            data::import_backup,
            data::list_archive,
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
            data::store_attachment,
            data::toggle_favorite_note,
            data::update_note_content,
            data::update_tag_color
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
