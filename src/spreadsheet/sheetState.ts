import { emptyStats, type SelectionStats } from "./selectionStats";

export type HAlign = "general" | "left" | "center" | "right";
export type VAlign = "general" | "top" | "middle" | "bottom";

export interface CellStyleState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  fontFamily: string;
  fontSize: number;
  fontColor: string | null;
  background: string | null;
  hAlign: HAlign;
  vAlign: VAlign;
  wrap: boolean;
  rotation: number;
}

export interface SheetTab {
  id: string;
  name: string;
  color: string | null;
}

export interface SelectionBounds {
  startRow: number;
  endRow: number;
  startColumn: number;
  endColumn: number;
}

export interface SheetUIState {
  ready: boolean;
  sheets: SheetTab[];
  activeSheetId: string | null;
  activeCell: { row: number; col: number };
  /** Name Box text: the active cell, e.g. "B4". */
  nameBox: string;
  /** Primary selection, e.g. "B4:D9". */
  selectionLabel: string;
  selection: SelectionBounds;
  /** Formula bar text for the active cell (live while editing in-cell). */
  cellInput: string;
  editing: boolean;
  style: CellStyleState;
  numberFormat: string;
  merged: boolean;
  stats: SelectionStats;
  zoom: number;
  gridlines: boolean;
  frozen: { rows: number; cols: number };
  /** Format Painter is armed and waiting for a target selection. */
  painting: boolean;
}

export const DEFAULT_FONT_FAMILY = "Arial";
export const DEFAULT_FONT_SIZE = 11;

export const DEFAULT_STYLE: CellStyleState = {
  bold: false,
  italic: false,
  underline: false,
  strikethrough: false,
  fontFamily: DEFAULT_FONT_FAMILY,
  fontSize: DEFAULT_FONT_SIZE,
  fontColor: null,
  background: null,
  hAlign: "general",
  vAlign: "general",
  wrap: false,
  rotation: 0,
};

export const INITIAL_SHEET_STATE: SheetUIState = {
  ready: false,
  sheets: [],
  activeSheetId: null,
  activeCell: { row: 0, col: 0 },
  nameBox: "A1",
  selectionLabel: "A1",
  selection: { startRow: 0, endRow: 0, startColumn: 0, endColumn: 0 },
  cellInput: "",
  editing: false,
  style: DEFAULT_STYLE,
  numberFormat: "General",
  merged: false,
  stats: emptyStats(1),
  zoom: 1,
  gridlines: true,
  frozen: { rows: 0, cols: 0 },
  painting: false,
};
