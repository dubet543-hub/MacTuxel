import { SSF, read, utils, write, type CellObject, type WorkBook, type WorkSheet } from "xlsx";
import {
  BooleanNumber,
  CellValueType,
  defaultTheme,
  type ICellData,
  type IStyleData,
  type IWorkbookData,
  type IWorksheetData,
  type Nullable,
} from "@univerjs/presets";
import { DEFAULT_COLUMN_COUNT, DEFAULT_ROW_COUNT, newUnitId } from "../spreadsheet/blankWorkbook";

/**
 * SheetJS ⇄ Univer core: values, formulas, merges, sheet names and visibility.
 * With `formats: true` it also carries SheetJS's number formats and row/column
 * sizes (used for XLS, ODS and CSV). For XLSX, the OOXML layer in ./ooxml adds
 * full cell formatting and exact sizes on top of `formats: false`.
 */

/**
 * Translates a formula's relative references by a row/column offset.
 * The app passes Univer's `FFormula.moveFormulaRefOffset`; it is needed to
 * expand Univer shared formulas (`si`) into per-cell formulas on export.
 */
export type MoveFormulaFn = (formula: string, columnOffset: number, rowOffset: number) => string;

export interface ConvertOptions {
  /** Include SheetJS number formats and row/column sizes. */
  formats: boolean;
}

export function extensionOf(path: string): string {
  const base = path.split(/[\\/]/).pop() ?? path;
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
}

export function baseName(path: string): string {
  const base = path.split(/[\\/]/).pop() ?? path;
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(0, dot) : base;
}

export function fileNameOf(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

/** Excel's 1904 date system starts 1,462 days after the 1900 system. */
export const DATE1904_OFFSET = 1462;

/** Error codes as SheetJS stores them in `t: "e"` cells. */
const ERROR_CODES: Record<string, number> = {
  "#NULL!": 0x00,
  "#DIV/0!": 0x07,
  "#VALUE!": 0x0f,
  "#REF!": 0x17,
  "#NAME?": 0x1d,
  "#NUM!": 0x24,
  "#N/A": 0x2a,
  "#GETTING_DATA": 0x2b,
};

export function isDateFormat(pattern: string | undefined | null): boolean {
  if (!pattern || pattern === "General") return false;
  try {
    return Boolean(SSF.is_date(pattern));
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Import: SheetJS -> Univer
// ---------------------------------------------------------------------------

export function readWithSheetJS(bytes: Uint8Array, opts: { csv?: boolean } = {}): WorkBook {
  if (opts.csv) {
    // Decode as UTF-8 text (with BOM stripped) so non-ASCII CSV survives.
    const text = new TextDecoder("utf-8").decode(bytes).replace(/^﻿/, "");
    return read(text, { type: "string", cellFormula: false, cellNF: true, cellDates: false, raw: false });
  }
  return read(bytes, { type: "array", cellFormula: true, cellNF: true, cellDates: false });
}

export function sheetjsToUniver(wb: WorkBook, name: string, options: ConvertOptions = { formats: true }): Partial<IWorkbookData> {
  const styles: Record<string, Nullable<IStyleData>> = {};
  const styleIdByPattern = new Map<string, string>();
  const styleFor = (pattern: string | undefined): string | undefined => {
    if (!options.formats || !pattern || pattern === "General") return undefined;
    let id = styleIdByPattern.get(pattern);
    if (!id) {
      id = `nf${styleIdByPattern.size + 1}`;
      styleIdByPattern.set(pattern, id);
      styles[id] = { n: { pattern } };
    }
    return id;
  };
  const date1904 = Boolean(wb.Workbook?.WBProps?.date1904);

  const sheetOrder: string[] = [];
  const sheets: Record<string, Partial<IWorksheetData>> = {};

  const names = wb.SheetNames.length > 0 ? wb.SheetNames : ["Sheet1"];
  names.forEach((sheetName, index) => {
    const ws: WorkSheet = wb.Sheets[sheetName] ?? {};
    const id = newUnitId("sheet");
    const cellData: Record<number, Record<number, ICellData>> = {};
    let maxRow = -1;
    let maxCol = -1;

    for (const address of Object.keys(ws)) {
      if (address.startsWith("!")) continue;
      const cell = ws[address] as CellObject;
      const { r, c } = utils.decode_cell(address);
      const converted = cellToUniver(cell, styleFor, options.formats && date1904);
      if (!converted) continue;
      (cellData[r] ??= {})[c] = converted;
      maxRow = Math.max(maxRow, r);
      maxCol = Math.max(maxCol, c);
    }

    const mergeData = (ws["!merges"] ?? []).map((m) => ({
      startRow: m.s.r,
      startColumn: m.s.c,
      endRow: m.e.r,
      endColumn: m.e.c,
    }));
    for (const m of mergeData) {
      maxRow = Math.max(maxRow, m.endRow);
      maxCol = Math.max(maxCol, m.endColumn);
    }

    const columnData: Record<number, { w?: number; hd?: BooleanNumber }> = {};
    const rowData: Record<number, { h?: number; hd?: BooleanNumber }> = {};
    if (options.formats) {
      (ws["!cols"] ?? []).forEach((col, i) => {
        if (!col) return;
        const entry: { w?: number; hd?: BooleanNumber } = {};
        if (col.width) entry.w = Math.round(col.width * 7);
        else if (col.wpx) entry.w = col.wpx;
        if (col.hidden) entry.hd = BooleanNumber.TRUE;
        if (Object.keys(entry).length) columnData[i] = entry;
      });
      (ws["!rows"] ?? []).forEach((row, i) => {
        if (!row) return;
        const entry: { h?: number; hd?: BooleanNumber } = {};
        if (row.hpt) entry.h = Math.round(row.hpt * (4 / 3));
        else if (row.hpx) entry.h = row.hpx;
        if (row.hidden) entry.hd = BooleanNumber.TRUE;
        if (Object.keys(entry).length) rowData[i] = entry;
      });
    }

    sheetOrder.push(id);
    sheets[id] = {
      id,
      name: sheetName,
      hidden: wb.Workbook?.Sheets?.[index]?.Hidden ? BooleanNumber.TRUE : BooleanNumber.FALSE,
      rowCount: Math.max(DEFAULT_ROW_COUNT, maxRow + 1),
      columnCount: Math.max(DEFAULT_COLUMN_COUNT, maxCol + 1),
      cellData,
      mergeData,
      columnData,
      rowData,
    };
  });

  return { id: newUnitId("workbook"), name, styles, sheetOrder, sheets };
}

function cellToUniver(cell: CellObject, styleFor: (pattern: string | undefined) => string | undefined, date1904: boolean): ICellData | null {
  const out: ICellData = {};
  if (cell.f) out.f = cell.f.startsWith("=") ? cell.f : `=${cell.f}`;

  switch (cell.t) {
    case "n":
      if (typeof cell.v === "number") {
        out.v = date1904 && isDateFormat(cell.z as string | undefined) ? cell.v + DATE1904_OFFSET : cell.v;
        out.t = CellValueType.NUMBER;
      }
      break;
    case "b":
      out.v = cell.v ? 1 : 0;
      out.t = CellValueType.BOOLEAN;
      break;
    case "s":
      out.v = String(cell.v ?? "");
      out.t = CellValueType.STRING;
      break;
    case "d":
      out.v = cell.w ?? String(cell.v ?? "");
      out.t = CellValueType.STRING;
      break;
    case "e":
      out.v = cell.w ?? "#ERROR!";
      out.t = CellValueType.STRING;
      break;
    case "z":
    default:
      break;
  }

  // Formulas saved without a cached result (some writers store "") get no value:
  // the engine computes it. Keeping "" would type the result as text.
  if (out.f && out.v === "") {
    delete out.v;
    delete out.t;
  }

  const style = typeof cell.z === "string" ? styleFor(cell.z) : undefined;
  if (style) out.s = style;

  return out.v === undefined && !out.f ? null : out;
}

// ---------------------------------------------------------------------------
// Export: Univer -> SheetJS
// ---------------------------------------------------------------------------

/**
 * The grid's in-cell editor stamps its theme text colour onto every typed cell.
 * That isn't a user choice, so on the way out it means "Automatic" (otherwise
 * every typed cell would carry a hard-coded font colour into Excel).
 */
export const ENGINE_DEFAULT_TEXT_COLOR = String(defaultTheme.gray[900]).toUpperCase();

export function resolveStyle(s: ICellData["s"], styles: Record<string, Nullable<IStyleData>> | undefined): IStyleData | null {
  if (!s) return null;
  const style = typeof s === "string" ? (styles?.[s] ?? null) : s;
  if (!style?.cl?.rgb || String(style.cl.rgb).toUpperCase() !== ENGINE_DEFAULT_TEXT_COLOR) return style;
  const { cl: _automatic, ...rest } = style;
  return rest;
}

export function univerToSheetjs(data: IWorkbookData, moveFormula?: MoveFormulaFn, options: ConvertOptions = { formats: true }): WorkBook {
  const wb = utils.book_new();
  const usedNames = new Set<string>();
  const sheetMeta: { Hidden: 0 | 1 }[] = [];

  for (const sheetId of data.sheetOrder) {
    const sheet = data.sheets[sheetId];
    if (!sheet) continue;
    const ws = worksheetFromUniver(sheet, data.styles ?? {}, moveFormula, options);
    let name = (sheet.name || "Sheet").slice(0, 31);
    for (let n = 2; usedNames.has(name.toLowerCase()); n++) name = `${(sheet.name || "Sheet").slice(0, 27)} (${n})`;
    usedNames.add(name.toLowerCase());
    utils.book_append_sheet(wb, ws, name);
    sheetMeta.push({ Hidden: sheet.hidden === BooleanNumber.TRUE ? 1 : 0 });
  }
  if (wb.SheetNames.length === 0) {
    utils.book_append_sheet(wb, utils.aoa_to_sheet([]), "Sheet1");
    sheetMeta.push({ Hidden: 0 });
  }
  if (sheetMeta.every((s) => s.Hidden)) sheetMeta[0].Hidden = 0; // a workbook needs one visible sheet
  wb.Workbook = { ...(wb.Workbook ?? {}), Sheets: sheetMeta };
  return wb;
}

/** Visits every non-empty cell. */
export function forEachCell(
  cellData: Record<string, Record<string, ICellData | null | undefined>>,
  fn: (row: number, col: number, cell: ICellData) => void,
) {
  for (const [r, cols] of Object.entries(cellData)) {
    if (!cols) continue;
    for (const [c, cell] of Object.entries(cols)) {
      if (cell) fn(Number(r), Number(c), cell);
    }
  }
}

function worksheetFromUniver(
  sheet: Partial<IWorksheetData>,
  styles: Record<string, Nullable<IStyleData>>,
  moveFormula: MoveFormulaFn | undefined,
  options: ConvertOptions,
): WorkSheet {
  const ws: WorkSheet = {};
  const cellData = (sheet.cellData ?? {}) as Record<string, Record<string, ICellData | null | undefined>>;

  // Shared formulas: Univer stores the formula once with an `si` id; other
  // cells carry only the `si`. Record each origin so they can be expanded.
  const sharedOrigins = new Map<string, { formula: string; row: number; col: number }>();
  forEachCell(cellData, (row, col, cell) => {
    if (cell.si && cell.f && !sharedOrigins.has(cell.si)) sharedOrigins.set(cell.si, { formula: cell.f, row, col });
  });

  let maxRow = -1;
  let maxCol = -1;
  forEachCell(cellData, (row, col, cell) => {
    let formula = cell.f ?? undefined;
    if (!formula && cell.si && moveFormula) {
      const origin = sharedOrigins.get(cell.si);
      if (origin) formula = moveFormula(origin.formula, col - origin.col, row - origin.row);
    }
    const out = cellFromUniver(cell, formula, options.formats ? styles : null);
    if (!out) return;
    ws[utils.encode_cell({ r: row, c: col })] = out;
    maxRow = Math.max(maxRow, row);
    maxCol = Math.max(maxCol, col);
  });

  const merges = (sheet.mergeData ?? []).map((m) => ({
    s: { r: m.startRow, c: m.startColumn },
    e: { r: m.endRow, c: m.endColumn },
  }));
  for (const m of merges) {
    maxRow = Math.max(maxRow, m.e.r);
    maxCol = Math.max(maxCol, m.e.c);
  }
  if (merges.length) ws["!merges"] = merges;

  if (options.formats) {
    const columnData = (sheet.columnData ?? {}) as Record<string, { w?: number; hd?: BooleanNumber } | undefined>;
    for (const [i, col] of Object.entries(columnData)) {
      if (!col || (col.w === undefined && !col.hd)) continue;
      (ws["!cols"] ??= [])[Number(i)] = { ...(col.w !== undefined ? { wpx: col.w } : {}), ...(col.hd ? { hidden: true } : {}) };
    }
    const rowData = (sheet.rowData ?? {}) as Record<string, { h?: number; hd?: BooleanNumber } | undefined>;
    for (const [i, row] of Object.entries(rowData)) {
      if (!row || (row.h === undefined && !row.hd)) continue;
      (ws["!rows"] ??= [])[Number(i)] = { ...(row.h !== undefined ? { hpx: row.h } : {}), ...(row.hd ? { hidden: true } : {}) };
    }
  }

  ws["!ref"] = maxRow < 0 ? "A1" : utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxRow, c: maxCol } });
  return ws;
}

/** Plain text of a cell, flattening rich text. */
export function cellText(cell: ICellData): string | null {
  if (cell.v !== null && cell.v !== undefined) return String(cell.v);
  const stream = cell.p?.body?.dataStream;
  return stream ? stream.replace(/\r?\n$/, "").replace(/\r$/, "") : null;
}

function cellFromUniver(cell: ICellData, formula: string | undefined, styles: Record<string, Nullable<IStyleData>> | null): CellObject | null {
  let value = cell.v;
  if (value === null || value === undefined) value = cellText(cell);

  let out: CellObject;
  if (cell.t === CellValueType.BOOLEAN) {
    out = { t: "b", v: value === true || value === 1 || String(value).toUpperCase() === "TRUE" };
  } else if (cell.t === CellValueType.FORCE_STRING) {
    out = { t: "s", v: String(value ?? "") };
  } else if (typeof value === "number" || (cell.t === CellValueType.NUMBER && value !== "" && value != null && !Number.isNaN(Number(value)))) {
    out = { t: "n", v: Number(value) };
  } else if (typeof value === "boolean") {
    out = { t: "b", v: value };
  } else if (formula && typeof value === "string" && value in ERROR_CODES) {
    out = { t: "e", v: ERROR_CODES[value], w: value };
  } else if (value !== null && value !== undefined && value !== "") {
    out = { t: "s", v: String(value) };
  } else if (formula) {
    out = { t: "z" };
  } else {
    return null;
  }

  if (formula) out.f = formula.startsWith("=") ? formula.slice(1) : formula;

  if (styles) {
    const pattern = resolveStyle(cell.s, styles)?.n?.pattern;
    if (pattern && out.t === "n") out.z = pattern;
  }
  return out;
}

/** CSV text of one sheet (values only, as displayed in their raw form). */
export function sheetToCsv(data: IWorkbookData, sheetName?: string): string {
  const wb = univerToSheetjs(data, undefined, { formats: true });
  const name = sheetName && wb.SheetNames.includes(sheetName) ? sheetName : wb.SheetNames[0];
  return utils.sheet_to_csv(wb.Sheets[name]);
}

/** Writes a workbook with SheetJS (values, formulas, merges, sheet visibility). */
export function writeWithSheetJS(wb: WorkBook): Uint8Array {
  return new Uint8Array(write(wb, { type: "array", bookType: "xlsx", bookSST: true, compression: false }) as ArrayBuffer);
}
