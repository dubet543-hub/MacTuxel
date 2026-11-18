mod commands;
mod document;
mod edit_actions;

/// Builds and runs the MacTuxel desktop application.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        // After the fs plugin: restores the file access granted in earlier sessions.
        .plugin(tauri_plugin_persisted_scope::init())
        .manage(document::DocumentState::default())
        .setup(|app| {
            // ⌘Q / Dock ▸ Quit / logout with unsaved changes ask first.
            #[cfg(target_os = "macos")]
            document::install_quit_guard(app.handle());
            let _ = app;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app_info,
            edit_actions::native_edit_action,
            document::set_document_edited,
            document::quit_app,
            document::recovery_save,
            document::recovery_load,
            document::recovery_clear,
        ])
        .build(tauri::generate_context!())
        .expect("error while building MacTuxel");

    app.run(|_, _| {});
}

