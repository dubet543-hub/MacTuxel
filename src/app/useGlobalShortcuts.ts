import { useEffect, useRef } from "react";
import { isTauri } from "../platform/tauri";
import type { SheetController } from "../spreadsheet/SheetController";

export interface ShortcutHandlers {
  newDocument: () => unknown;
  openDocument: () => unknown;
  saveDocument: () => unknown;
  saveDocumentAs: () => unknown;
  canUseFiles: boolean;
}

/** True when focus is in one of MacTuxel's own text fields (name box, formula bar, dialogs). */
function inAppTextField(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  if (el.closest?.(".sheet-mount")) return false; // the grid's hidden editor
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable;
}

/**
 * MacTuxel-level shortcuts, in the capture phase. Shortcuts the grid engine
 * already binds are deliberately NOT handled here, or they would fire twice:
 * ⌘B/I/U, ⇧⌘X, ⇧⌘. ⇧⌘, (font size), ⌘D/⌘R (fill), ⌘Z/⌘Y, ⌘C/X/V, ⌘A, arrows.
 * (The engine binds ⌘= ⌘- ⌘0 to a no-op, so zoom is ours.)
 */
export function useGlobalShortcuts(controller: SheetController | null, handlers: ShortcutHandlers) {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const h = ref.current;
      const c = controller;
      const key = e.key.toLowerCase();
      let action: (() => unknown) | null = null;

      if (e.key === "Escape" && c?.getState().painting) {
        action = () => c.cancelFormatPainter();
      } else if (e.key === "F9" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        action = () => c?.recalculate();
      } else if (e.metaKey && !e.ctrlKey && !e.altKey) {
        const shift = e.shiftKey;
        // File commands work everywhere, even inside text fields. In the desktop app the
        // menu bar owns these accelerators, so handling them here too would fire twice.
        if (isTauri() && ["n", "o", "s"].includes(key)) return;
        if (key === "n" && !shift) action = h.newDocument;
        else if (key === "o" && !shift && h.canUseFiles) action = h.openDocument;
        else if (key === "s" && h.canUseFiles) action = shift ? h.saveDocumentAs : h.saveDocument;
        else if (!inAppTextField(e.target) && c) {
          // `e.code` keeps these layout-stable when Shift changes the character.
          if (e.code === "Equal" && !shift) action = () => c.setZoom(c.getState().zoom + 0.1);
          else if (e.code === "Minus" && !shift) action = () => c.setZoom(c.getState().zoom - 0.1);
          else if (e.code === "Digit0" && !shift) action = () => c.setZoom(1);
          else if (key === "z" && shift) action = () => c.redo(); // macOS convention; the engine only binds ⌘Y
          else if (key === "t" && shift) action = () => c.autoSum("SUM");
          else if (e.code === "Digit5" && shift) action = () => c.percentFormat();
        }
      }

      if (!action) return;
      e.preventDefault();
      e.stopPropagation();
      void action();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [controller]);
}
