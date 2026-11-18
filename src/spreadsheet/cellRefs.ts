/** Helpers for A1-style references used by the Name Box. */

export interface CellAddress {
  row: number; // 0-based
  col: number; // 0-based
}

export interface RangeAddress {
  start: CellAddress;
  end: CellAddress;
}

export const MAX_COLUMNS = 16384; // XFD
export const MAX_ROWS = 1048576;

export function columnLabel(col: number): string {
  let n = col + 1;
  let label = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    label = String.fromCharCode(65 + rem) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label;
}

export function columnIndex(label: string): number {
  let n = 0;
  for (const ch of label.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export function cellLabel(row: number, col: number): string {
  return `${columnLabel(col)}${row + 1}`;
}

const CELL = /^\$?([A-Za-z]{1,3})\$?(\d{1,7})$/;

function parseCell(text: string): CellAddress | null {
  const m = CELL.exec(text.trim());
  if (!m) return null;
  const col = columnIndex(m[1]);
  const row = Number(m[2]) - 1;
  if (row < 0 || row >= MAX_ROWS || col < 0 || col >= MAX_COLUMNS) return null;
  return { row, col };
}

/** Parses "B7", "$B$7", "a1:c3" (any corner order). Returns null if invalid. */
export function parseRangeRef(text: string): RangeAddress | null {
  const parts = text.trim().split(":");
  if (parts.length < 1 || parts.length > 2) return null;
  const a = parseCell(parts[0]);
  const b = parts.length === 2 ? parseCell(parts[1]) : a;
  if (!a || !b) return null;
  return {
    start: { row: Math.min(a.row, b.row), col: Math.min(a.col, b.col) },
    end: { row: Math.max(a.row, b.row), col: Math.max(a.col, b.col) },
  };
}

export function rangeLabel(range: RangeAddress): string {
  const start = cellLabel(range.start.row, range.start.col);
  const end = cellLabel(range.end.row, range.end.col);
  return start === end ? start : `${start}:${end}`;
}
