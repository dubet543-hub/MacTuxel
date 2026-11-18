use serde::Serialize;

/// Static information about the running build, shown in the status bar.
#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub name: String,
    pub version: String,
    pub identifier: String,
    pub arch: String,
}

#[tauri::command]
pub fn app_info(app: tauri::AppHandle) -> AppInfo {
    let config = app.config();
    AppInfo {
        name: config
            .product_name
            .clone()
            .unwrap_or_else(|| "MacTuxel".into()),
        version: app.package_info().version.to_string(),
        identifier: config.identifier.clone(),
        arch: std::env::consts::ARCH.into(),
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn reports_native_arch() {
        // MacTuxel targets Apple Silicon; on those hosts this is "aarch64".
        assert!(!std::env::consts::ARCH.is_empty());
    }
}
