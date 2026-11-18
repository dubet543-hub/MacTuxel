import type { CellStylePreset } from "../../spreadsheet/SheetController";

/** MacTuxel cell style gallery (original palette). */
export const CELL_STYLES: readonly CellStylePreset[] = [
  { id: "normal", label: "Normal" },
  { id: "good", label: "Good", background: "#dcfce7", color: "#166534" },
  { id: "bad", label: "Bad", background: "#fee2e2", color: "#991b1b" },
  { id: "neutral", label: "Neutral", background: "#fef3c7", color: "#92400e" },
  { id: "note", label: "Note", background: "#fefce8", color: "#525252", italic: true },
  { id: "title", label: "Title", fontSize: 18, bold: true, color: "#0f172a" },
  { id: "heading1", label: "Heading 1", fontSize: 15, bold: true, color: "#0f766e", border: "bottom-thick" },
  { id: "heading2", label: "Heading 2", fontSize: 13, bold: true, color: "#115e59" },
  { id: "accent", label: "Accent", background: "#0d9488", color: "#ffffff", bold: true },
  { id: "total", label: "Total", bold: true, border: "top-double" },
];
