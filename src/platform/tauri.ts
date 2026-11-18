import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow, type Theme } from "@tauri-apps/api/window";
import { message } from "@tauri-apps/plugin-dialog";

export { isTauri };

export interface AppInfo {
  name: string;
  version: string;
  identifier: string;
  arch: string;
}

/** Build info from the Rust side; `null` when running in a plain browser. */
export async function getAppInfo(): Promise<AppInfo | null> {
  if (!isTauri()) return null;
  try {
    return await invoke<AppInfo>("app_info");
  } catch (error) {
    console.error("app_info failed", error);
    return null;
  }
}

export async function setNativeWindowTheme(theme: Theme | null): Promise<void> {
  if (!isTauri()) return;
  try {
    await getCurrentWindow().setTheme(theme);
  } catch (error) {
    console.error("setTheme failed", error);
  }
}

/**
 * Performs Edit ▸ Paste natively (desktop app only). The webview receives a
 * trusted paste event with the full clipboard, so formulas and formatting
 * survive. Returns false when unavailable (browser preview).
 */
export async function nativePaste(): Promise<boolean> {
  if (!isTauri()) return false;
  await invoke("native_edit_action", { action: "paste" });
  return true;
}

export async function toggleNativeFullscreen(): Promise<void> {
  if (!isTauri()) return;
  const win = getCurrentWindow();
  await win.setFullscreen(!(await win.isFullscreen()));
}

export async function setNativeWindowTitle(title: string): Promise<void> {
  if (isTauri()) {
    try {
      await getCurrentWindow().setTitle(title);
    } catch (error) {
      console.error("setTitle failed", error);
    }
  }
  document.title = title;
}

/** Native error alert (desktop only); file errors shouldn't hide in the status bar. */
export async function showErrorAlert(text: string): Promise<void> {
  if (!isTauri()) return;
  try {
    await message(text, { title: "MacTuxel", kind: "error" });
  } catch (error) {
    console.error("alert failed", error);
  }
}
