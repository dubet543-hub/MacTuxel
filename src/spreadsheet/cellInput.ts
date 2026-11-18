import { CellValueType, type ICellData, type Nullable } from "@univerjs/presets";

/** Parses formula-bar text into the value a cell should store. `null` clears the cell. */
export function parseCellInput(text: string): string | number | boolean | null {
  if (text === "") return null;
  if (text.startsWith("=")) return text;
  const trimmed = text.trim();
  if (/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(trimmed)) return Number(trimmed);
  if (/^true$/i.test(trimmed)) return true;
  if (/^false$/i.test(trimmed)) return false;
  return text;
}

/** The editable text of a cell as shown in the formula bar. */
export function cellInputText(cell: Nullable<ICellData>): string {
  if (!cell) return "";
  if (cell.f) return cell.f;
  const v = cell.v;
  if (v === null || v === undefined) {
    const stream = cell.p?.body?.dataStream;
    return stream ? stream.replace(/\r?\n$/, "").replace(/\r$/, "") : "";
  }
  if (cell.t === CellValueType.BOOLEAN) return v === true || v === 1 || String(v).toUpperCase() === "TRUE" ? "TRUE" : "FALSE";
  return String(v);
}

/** Value used for status-bar statistics (booleans are not numbers there). */
export function statValue(cell: Nullable<ICellData>): unknown {
  if (!cell) return null;
  if (cell.t === CellValueType.BOOLEAN) return cell.v === null || cell.v === undefined ? null : Boolean(cell.v);
  if (cell.v === null || cell.v === undefined) return cell.p?.body?.dataStream ? "text" : null;
  if (typeof cell.v === "string" && cell.t === CellValueType.NUMBER && cell.v.trim() !== "" && !Number.isNaN(Number(cell.v))) return Number(cell.v);
  return cell.v;
}
