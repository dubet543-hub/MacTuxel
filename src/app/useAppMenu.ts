import { useEffect, useRef } from "react";
import { Menu, MenuItem, PredefinedMenuItem, Submenu } from "@tauri-apps/api/menu";
import { isTauri } from "../platform/tauri";
import type { RecentFile } from "../platform/recentFiles";
import type { SheetController } from "../spreadsheet/SheetController";

export interface MenuActions {
  newDocument(): unknown;
  openDocument(): unknown;
  openRecent(path: string): unknown;
  clearRecent(): unknown;
  saveDocument(): unknown;
  saveDocumentAs(): unknown;
  exportCsv(): unknown;
  showCompatibilityReport(): unknown;
  showAbout(): unknown;
  showShortcuts(): unknown;
  showFunctions(): unknown;
}

/** True when focus is in one of MacTuxel's own text fields rather than the grid. */
function inTextField(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el || el.closest(".sheet-mount")) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable;
}

/**
 * The macOS menu bar. File shortcuts (⌘N ⌘O ⌘S ⇧⌘S) live here as accelerators in
 * the desktop app. Undo/Redo/Cut/Copy/Select All are routed to the grid (or to the
 * focused text field), because WebKit's built-in actions would target the grid's
 * hidden editor instead of the spreadsheet. Paste stays native: it delivers a
 * trusted paste event the grid handles with full formatting.
 */
export function useAppMenu(controller: SheetController | null, actions: MenuActions, recent: RecentFile[], hasIssues: boolean) {
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const controllerRef = useRef(controller);
  controllerRef.current = controller;

  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    const a = () => actionsRef.current;
    const c = () => controllerRef.current;
    const item = (text: string, action: () => unknown, accelerator?: string, enabled = true) =>
      MenuItem.new({ text, accelerator, enabled, action: () => void action() });
    const sep = () => PredefinedMenuItem.new({ item: "Separator" });
    const edit = (fallback: string, gridAction: (ctl: SheetController) => unknown) => () => {
      const ctl = c();
      if (inTextField() || !ctl) document.execCommand(fallback);
      else void gridAction(ctl);
    };

    void (async () => {
      const recentItems = recent.length
        ? [
            ...(await Promise.all(recent.map((r) => item(r.name, () => a().openRecent(r.path))))),
            await sep(),
            await item("Clear Menu", () => a().clearRecent()),
          ]
        : [await item("No Recent Files", () => undefined, undefined, false)];

      const menu = await Menu.new({
        items: [
          await Submenu.new({
            text: "MacTuxel",
            items: [
              await item("About MacTuxel", () => a().showAbout()),
              await sep(),
              await PredefinedMenuItem.new({ item: "Services" }),
              await sep(),
              await PredefinedMenuItem.new({ item: "Hide" }),
              await PredefinedMenuItem.new({ item: "HideOthers" }),
              await PredefinedMenuItem.new({ item: "ShowAll" }),
              await sep(),
              await PredefinedMenuItem.new({ item: "Quit" }),
            ],
          }),
          await Submenu.new({
            text: "File",
            items: [
              await item("New", () => a().newDocument(), "CmdOrCtrl+N"),
              await item("Open…", () => a().openDocument(), "CmdOrCtrl+O"),
              await Submenu.new({ text: "Open Recent", items: recentItems }),
              await sep(),
              await PredefinedMenuItem.new({ item: "CloseWindow" }),
              await item("Save", () => a().saveDocument(), "CmdOrCtrl+S"),
              await item("Save As…", () => a().saveDocumentAs(), "Shift+CmdOrCtrl+S"),
              await item("Export as CSV…", () => a().exportCsv()),
              await sep(),
              await item("Compatibility Report…", () => a().showCompatibilityReport(), undefined, hasIssues),
            ],
          }),
          await Submenu.new({
            text: "Edit",
            items: [
              await item("Undo", edit("undo", (ctl) => ctl.undo()), "CmdOrCtrl+Z"),
              await item("Redo", edit("redo", (ctl) => ctl.redo()), "Shift+CmdOrCtrl+Z"),
              await sep(),
              await item("Cut", edit("cut", (ctl) => ctl.cut()), "CmdOrCtrl+X"),
              await item("Copy", edit("copy", (ctl) => ctl.copy()), "CmdOrCtrl+C"),
              await PredefinedMenuItem.new({ item: "Paste" }),
              await item("Select All", edit("selectAll", (ctl) => ctl.selectAll()), "CmdOrCtrl+A"),
            ],
          }),
          await Submenu.new({
            text: "View",
            items: [
              await item("Zoom In", () => c()?.setZoom(c()!.getState().zoom + 0.1)),
              await item("Zoom Out", () => c()?.setZoom(c()!.getState().zoom - 0.1)),
              await item("Actual Size", () => c()?.setZoom(1)),
              await sep(),
              // The standard item, so macOS doesn't add a second "Enter Full Screen".
              await PredefinedMenuItem.new({ item: "Fullscreen" }),
            ],
          }),
          await (async () => {
            const windowMenu = await Submenu.new({
              text: "Window",
              items: [
                await PredefinedMenuItem.new({ item: "Minimize" }),
                await PredefinedMenuItem.new({ item: "Maximize", text: "Zoom" }),
                await sep(),
                await PredefinedMenuItem.new({ item: "BringAllToFront" }),
              ],
            });
            await windowMenu.setAsWindowsMenuForNSApp();
            return windowMenu;
          })(),
          await (async () => {
            const help = await Submenu.new({
              text: "Help",
              items: [await item("Keyboard Shortcuts", () => a().showShortcuts()), await item("Function Reference", () => a().showFunctions())],
            });
            await help.setAsHelpMenuForNSApp();
            return help;
          })(),
        ],
      });
      if (!cancelled) await menu.setAsAppMenu();
    })().catch((error) => console.error("Couldn't build the menu bar", error));

    return () => {
      cancelled = true;
    };
  }, [recent, hasIssues]);
}
