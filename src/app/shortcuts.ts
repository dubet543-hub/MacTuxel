/** Keyboard shortcuts shown in Help ▸ Keyboard Shortcuts. Every entry is implemented and tested. */
export interface ShortcutInfo {
  keys: string;
  action: string;
}

export interface ShortcutSection {
  title: string;
  items: ShortcutInfo[];
}

export const SHORTCUT_SECTIONS: readonly ShortcutSection[] = [
  {
    title: "File",
    items: [
      { keys: "⌘N", action: "New workbook" },
      { keys: "⌘O", action: "Open…" },
      { keys: "⌘S", action: "Save" },
      { keys: "⇧⌘S", action: "Save As…" },
    ],
  },
  {
    title: "Navigate & select",
    items: [
      { keys: "← → ↑ ↓", action: "Move the active cell" },
      { keys: "⇧ + arrow", action: "Extend the selection" },
      { keys: "⇥ / ⇧⇥", action: "Move right / left" },
      { keys: "↩ / ⇧↩", action: "Commit and move down / up" },
      { keys: "⌘A", action: "Select all" },
    ],
  },
  {
    title: "Edit",
    items: [
      { keys: "Type", action: "Replace the cell's contents" },
      { keys: "⎋", action: "Cancel editing" },
      { keys: "⌫", action: "Clear contents" },
      { keys: "⌘Z / ⇧⌘Z", action: "Undo / Redo" },
      { keys: "⌘C / ⌘X / ⌘V", action: "Copy / Cut / Paste" },
      { keys: "⌘D", action: "Fill down" },
      { keys: "⌘R", action: "Fill right" },
      { keys: "⇧⌘T", action: "AutoSum" },
    ],
  },
  {
    title: "Format",
    items: [
      { keys: "⌘B / ⌘I / ⌘U", action: "Bold / Italic / Underline" },
      { keys: "⇧⌘X", action: "Strikethrough" },
      { keys: "⇧⌘. / ⇧⌘,", action: "Increase / Decrease font size" },
      { keys: "⇧⌘%", action: "Percent style" },
    ],
  },
  {
    title: "View",
    items: [
      { keys: "⌘= / ⌘- / ⌘0", action: "Zoom in / out / 100%" },
      { keys: "F9", action: "Calculate now" },
      { keys: "⌃⌘F", action: "Full screen (desktop app)" },
    ],
  },
];
