//! Lets ribbon buttons trigger the same native editing actions as the
//! Edit menu. WKWebView turns `paste:` into a trusted DOM `paste` event with
//! the full clipboard (HTML + text), which the grid handles exactly like ⌘V,
//! without the async Clipboard API's permission prompt.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EditAction {
    Paste,
}

impl EditAction {
    pub fn parse(name: &str) -> Option<Self> {
        match name {
            "paste" => Some(Self::Paste),
            _ => None,
        }
    }
}

#[tauri::command]
pub fn native_edit_action(app: tauri::AppHandle, action: String) -> Result<(), String> {
    let action = EditAction::parse(&action).ok_or_else(|| format!("unsupported edit action: {action}"))?;
    app.run_on_main_thread(move || send(action)).map_err(|e| e.to_string())
}

#[cfg(target_os = "macos")]
fn send(action: EditAction) {
    use objc2::sel;
    use objc2_app_kit::NSApplication;
    use objc2::MainThreadMarker;

    let Some(mtm) = MainThreadMarker::new() else { return };
    let app = NSApplication::sharedApplication(mtm);
    let selector = match action {
        EditAction::Paste => sel!(paste:),
    };
    // SAFETY: standard responder-chain action with nil target and sender,
    // dispatched on the main thread (guaranteed by MainThreadMarker).
    unsafe {
        app.sendAction_to_from(selector, None, None);
    }
}

#[cfg(not(target_os = "macos"))]
fn send(_action: EditAction) {}

#[cfg(test)]
mod tests {
    use super::EditAction;

    #[test]
    fn parses_only_supported_actions() {
        assert_eq!(EditAction::parse("paste"), Some(EditAction::Paste));
        assert_eq!(EditAction::parse("selectAll"), None);
        assert_eq!(EditAction::parse(""), None);
    }
}
