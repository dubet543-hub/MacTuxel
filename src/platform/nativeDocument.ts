import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauri } from "./tauri";

/** Shows/hides the dot in the window's close button and arms the ⌘Q guard. */
export async function setDocumentEdited(edited: boolean): Promise<void> {
  if (!isTauri()) return;
  try {
    await invoke("set_document_edited", { edited });
  } catch (error) {
    console.error("set_document_edited failed", error);
  }
}

export async function quitApp(): Promise<void> {
  if (isTauri()) await invoke("quit_app");
}

/**
 * Runs `confirm` before the window closes (red button, ⌘W) or the app quits (⌘Q).
 * `confirm` resolves true to let it happen. Returns an unsubscribe function.
 */
export function guardWindowClose(shouldAsk: () => boolean, confirm: () => Promise<boolean>): () => void {
  if (!isTauri()) {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!shouldAsk()) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }

  const disposers: Promise<() => void>[] = [];
  disposers.push(
    getCurrentWindow().onCloseRequested(async (event) => {
      if (!shouldAsk()) return;
      if (!(await confirm())) event.preventDefault();
    }),
  );
  // The native side blocks ⌘Q while the document is edited and asks us instead.
  disposers.push(
    listen("mactuxel://quit-requested", async () => {
      if (await confirm()) await quitApp();
    }),
  );
  return () => {
    for (const d of disposers) void d.then((off) => off());
  };
}

export interface FileDropHandlers {
  onEnter: (paths: string[]) => void;
  onLeave: () => void;
  onDrop: (paths: string[]) => void;
}

/** Native file drag-and-drop (desktop). Dropped files are granted file access by the fs plugin. */
export function listenForFileDrops(handlers: FileDropHandlers): () => void {
  if (!isTauri()) return () => {};
  const off = getCurrentWebview().onDragDropEvent((event) => {
    const p = event.payload;
    if (p.type === "enter") handlers.onEnter(p.paths);
    else if (p.type === "leave") handlers.onLeave();
    else if (p.type === "drop") handlers.onDrop(p.paths);
  });
  return () => void off.then((fn) => fn());
}
