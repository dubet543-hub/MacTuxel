//! Document state the native side needs: the unsaved-changes flag (for the
//! window's "edited" dot and the ⌘Q guard) and crash-recovery snapshots.

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter, Manager, Runtime, WebviewWindow};

/// Whether the open document has unsaved changes.
#[derive(Default)]
pub struct DocumentState {
    edited: AtomicBool,
}

impl DocumentState {
    pub fn is_edited(&self) -> bool {
        self.edited.load(Ordering::SeqCst)
    }
}

/// Event sent to the window when the user quits (⌘Q) with unsaved changes.
pub const QUIT_REQUESTED_EVENT: &str = "mactuxel://quit-requested";

#[tauri::command]
pub fn set_document_edited<R: Runtime>(window: WebviewWindow<R>, state: tauri::State<'_, DocumentState>, edited: bool) {
    state.edited.store(edited, Ordering::SeqCst);
    set_window_edited_dot(&window, edited);
}

#[cfg(target_os = "macos")]
fn set_window_edited_dot<R: Runtime>(window: &WebviewWindow<R>, edited: bool) {
    let Ok(ptr) = window.ns_window() else { return };
    let ptr = ptr as usize;
    let _ = window.run_on_main_thread(move || {
        // SAFETY: `ns_window` returns the live NSWindow for this webview window;
        // we only send it a standard setter on the main thread.
        let ns_window = unsafe { &*(ptr as *const objc2_app_kit::NSWindow) };
        ns_window.setDocumentEdited(edited);
    });
}

#[cfg(not(target_os = "macos"))]
fn set_window_edited_dot<R: Runtime>(_window: &WebviewWindow<R>, _edited: bool) {}

/// Exits after the frontend has handled unsaved changes (saved or discarded).
#[tauri::command]
pub fn quit_app<R: Runtime>(app: AppHandle<R>, state: tauri::State<'_, DocumentState>) {
    // Clear the flag first, or the terminate request below would be held again.
    state.edited.store(false, Ordering::SeqCst);
    app.exit(0);
}

/// Returns true (and asks the window) when a quit must wait for the user.
pub fn should_block_quit<R: Runtime>(app: &AppHandle<R>) -> bool {
    let edited = app.try_state::<DocumentState>().is_some_and(|s| s.is_edited());
    if edited {
        let _ = app.emit(QUIT_REQUESTED_EVENT, ());
    }
    edited
}

// ---------------------------------------------------------------------------
// Quit guard (⌘Q, Dock ▸ Quit, logout)
// ---------------------------------------------------------------------------

/// macOS asks the app delegate `applicationShouldTerminate:` before quitting.
/// The windowing layer's delegate doesn't implement it (it only handles
/// `applicationWillTerminate:`), so ⌘Q would quit without asking. This adds
/// the method at startup — only if the delegate doesn't already have one — and
/// cancels the quit while the document has unsaved changes; the window then
/// shows Save / Don't Save / Cancel and calls `quit_app` when it may proceed.
#[cfg(target_os = "macos")]
pub fn install_quit_guard(app: &AppHandle<tauri::Wry>) {
    use objc2::runtime::{AnyClass, AnyObject, Imp, Sel};
    use objc2::{ffi, sel, MainThreadMarker};
    use objc2_app_kit::NSApplication;
    use std::sync::OnceLock;

    static APP: OnceLock<AppHandle<tauri::Wry>> = OnceLock::new();
    const NS_TERMINATE_CANCEL: usize = 0;
    const NS_TERMINATE_NOW: usize = 1;

    extern "C-unwind" fn should_terminate(_this: *mut AnyObject, _cmd: Sel, _sender: *mut AnyObject) -> usize {
        match APP.get() {
            Some(app) if should_block_quit(app) => NS_TERMINATE_CANCEL,
            _ => NS_TERMINATE_NOW,
        }
    }

    let _ = APP.set(app.clone());
    let Some(mtm) = MainThreadMarker::new() else { return };
    let ns_app = NSApplication::sharedApplication(mtm);
    let Some(delegate) = ns_app.delegate() else {
        eprintln!("MacTuxel: no NSApplication delegate; quit guard not installed");
        return;
    };
    let object: &AnyObject = delegate.as_ref();
    let class: &AnyClass = object.class();
    let selector = sel!(applicationShouldTerminate:);
    if class.instance_method(selector).is_some() {
        return; // never override an existing implementation
    }
    // SAFETY: `should_terminate` matches the selector's ABI: (id self, SEL _cmd, id sender) -> NSUInteger,
    // described by the type encoding "Q@:@". The class is the live delegate class on the main thread.
    unsafe {
        let imp: Imp = std::mem::transmute(should_terminate as extern "C-unwind" fn(*mut AnyObject, Sel, *mut AnyObject) -> usize);
        ffi::class_addMethod(class as *const AnyClass as *mut AnyClass, selector, imp, c"Q@:@".as_ptr());
    }
}

// ---------------------------------------------------------------------------
// Recovery snapshots (one slot, in the app's local data folder)
// ---------------------------------------------------------------------------

fn recovery_file<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("recovery");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("session.json"))
}

#[tauri::command]
pub fn recovery_save<R: Runtime>(app: AppHandle<R>, snapshot: String) -> Result<(), String> {
    let file = recovery_file(&app)?;
    let tmp = file.with_extension("json.tmp");
    // Write then rename, so a crash mid-write never leaves a torn snapshot.
    std::fs::write(&tmp, snapshot.as_bytes()).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &file).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn recovery_load<R: Runtime>(app: AppHandle<R>) -> Result<Option<String>, String> {
    let file = recovery_file(&app)?;
    match std::fs::read_to_string(&file) {
        Ok(text) => Ok(Some(text)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn recovery_clear<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    let file = recovery_file(&app)?;
    match std::fs::remove_file(&file) {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.to_string()),
        _ => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn edited_flag_defaults_to_clean() {
        let s = DocumentState::default();
        assert!(!s.is_edited());
        s.edited.store(true, Ordering::SeqCst);
        assert!(s.is_edited());
    }
}
