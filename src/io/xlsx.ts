import { BooleanNumber, CellValueType, type ICellData, type IStyleData, type IWorkbookData, type IWorksheetData } from "@univerjs/presets";
import { DEFAULT_FONT_FAMILY, DEFAULT_FONT_SIZE } from "../spreadsheet/sheetState";
import { detectXlsxIssues, type CompatIssue } from "./compatibility";
import { openPackage, readColorContext, readText, repack, writeText } from "./ooxml/package";
import { parseStylesheet, StyleTable } from "./ooxml/styles";
import { EXCEL_DEFAULT_COL_PX, EXCEL_DEFAULT_ROW_PX, patchSheetXml, readSheetLayout, type SheetPatch } from "./ooxml/worksheet";
import {
  DATE1904_OFFSET,
  forEachCell,
  isDateFormat,
  readWithSheetJS,
  resolveStyle,
  sheetjsToUniver,
  univerToSheetjs,
  writeWithSheetJS,
  type MoveFormulaFn,
} from "./workbookConvert";

/** MacTuxel's own defaults for sheets created in the app (Univer's grid metrics). */
export const MACTUXEL_DEFAULT_COL_PX = 88;
export const MACTUXEL_DEFAULT_ROW_PX = 24;

export interface XlsxImport {
  workbook: Partial<IWorkbookData>;
  issues: CompatIssue[];
}

/** Columns defined across a huge span (e.g. A:XFD) only matter up to the used area. */
const MAX_COLUMN_SPAN = 1024;

export function importXlsx(bytes: Uint8Array, name: string): XlsxImport {
  const pkg = openPackage(bytes);
  const ctx = readColorContext(pkg);
  const parsed = parseStylesheet(readText(pkg.files, pkg.stylesPath), ctx);

  const sheetjs = readWithSheetJS(bytes);
  const date1904 = Boolean(sheetjs.Workbook?.WBProps?.date1904);
  const data = sheetjsToUniver(sheetjs, name, { formats: false });
  const styles = (data.styles ??= {});

  // One Univer style entry per used cellXfs index.
  const styleIdForXf = new Map<number, string>();
  parsed.xfStyles.forEach((style, i) => {
    if (!style) return;
    const id = `xf${i}`;
    styles[id] = style;
    styleIdForXf.set(i, id);
  });
  data.defaultStyle = { ff: parsed.defaultFont.name, fs: parsed.defaultFont.size };

  const partsByName = new Map(pkg.sheets.map((s) => [s.name, s]));
  for (const sheetId of data.sheetOrder ?? []) {
    const sheet = data.sheets![sheetId] as Partial<IWorksheetData>;
    const part = partsByName.get(sheet.name ?? "");
    const xml = part ? readText(pkg.files, part.path) : null;
    if (!part || !xml) continue;
    const layout = readSheetLayout(xml, ctx);
    const cellData = (sheet.cellData ??= {}) as Record<number, Record<number, ICellData>>;
    let maxRow = (sheet.rowCount ?? 1) - 1;
    let maxCol = (sheet.columnCount ?? 1) - 1;

    for (const [r, c, xf] of layout.cellXfs) {
      const styleId = styleIdForXf.get(xf);
      if (!styleId) continue;
      const cell = ((cellData[r] ??= {})[c] ??= {});
      cell.s = styleId;
      if (date1904 && cell.t === CellValueType.NUMBER && typeof cell.v === "number" && isDateFormat(styles[styleId]?.n?.pattern)) {
        cell.v += DATE1904_OFFSET;
      }
      maxRow = Math.max(maxRow, r);
      maxCol = Math.max(maxCol, c);
    }

    const columnData: Record<number, { w?: number; hd?: BooleanNumber }> = {};
    for (const col of layout.cols) {
      const end = Math.min(col.max, col.min + MAX_COLUMN_SPAN, Math.max(maxCol, col.min));
      for (let c = col.min; c <= end; c++) {
        const entry: { w?: number; hd?: BooleanNumber } = {};
        if (col.widthPx !== undefined) entry.w = col.widthPx;
        if (col.hidden) entry.hd = BooleanNumber.TRUE;
        if (Object.keys(entry).length) columnData[c] = entry;
      }
    }
    const rowData: Record<number, { h?: number; hd?: BooleanNumber }> = {};
    for (const [r, info] of layout.rows) {
      const entry: { h?: number; hd?: BooleanNumber } = {};
      if (info.heightPx !== undefined) entry.h = info.heightPx;
      if (info.hidden) entry.hd = BooleanNumber.TRUE;
      rowData[r] = entry;
      maxRow = Math.max(maxRow, r);
    }

    Object.assign(sheet, {
      cellData,
      columnData,
      rowData,
      rowCount: Math.max(sheet.rowCount ?? 0, maxRow + 1),
      columnCount: Math.max(sheet.columnCount ?? 0, maxCol + 1),
      defaultColumnWidth: layout.defaultColPx ?? EXCEL_DEFAULT_COL_PX,
      defaultRowHeight: layout.defaultRowPx ?? EXCEL_DEFAULT_ROW_PX,
      showGridlines: layout.showGridlines ? BooleanNumber.TRUE : BooleanNumber.FALSE,
      hidden: part.hidden ? BooleanNumber.TRUE : BooleanNumber.FALSE,
      ...(layout.tabColor ? { tabColor: layout.tabColor } : {}),
      ...(layout.zoom ? { zoomRatio: layout.zoom } : {}),
      ...(layout.freeze
        ? { freeze: { xSplit: layout.freeze.cols, ySplit: layout.freeze.rows, startRow: layout.freeze.rows, startColumn: layout.freeze.cols } }
        : {}),
    } satisfies Partial<IWorksheetData>);
  }

  return { workbook: data, issues: detectXlsxIssues(pkg, parsed.approximations) };
}

export interface XlsxExport {
  bytes: Uint8Array;
  /** Formatting that the file format can't hold exactly (shown before saving). */
  issues: CompatIssue[];
}

/** Rich text with more than one run of formatting can't be kept per character. */
function hasMixedRuns(cell: ICellData): boolean {
  const runs = cell.p?.body?.textRuns ?? [];
  return runs.length > 1 || runs.some((r) => r.ts && Object.keys(r.ts).length > 0);
}

export function exportXlsx(data: IWorkbookData, options: { moveFormula?: MoveFormulaFn } = {}): XlsxExport {
  const sheetjs = univerToSheetjs(data, options.moveFormula, { formats: false });
  const pkg = openPackage(writeWithSheetJS(sheetjs));

  const defaults = resolveStyle(data.defaultStyle as ICellData["s"], data.styles);
  const table = new StyleTable({ name: defaults?.ff ?? DEFAULT_FONT_FAMILY, size: defaults?.fs ?? DEFAULT_FONT_SIZE });
  let richText = false;
  let rowColStyles = false;

  const sheetIds = data.sheetOrder.filter((id) => data.sheets[id]);
  sheetIds.forEach((sheetId, index) => {
    const sheet = data.sheets[sheetId];
    const part = pkg.sheets[index];
    const xml = readText(pkg.files, part?.path ?? null);
    if (!sheet || !part || !xml) return;

    const cellXfs: SheetPatch["cellXfs"] = new Map();
    forEachCell((sheet.cellData ?? {}) as Record<string, Record<string, ICellData>>, (r, c, cell) => {
      if (cell.p && hasMixedRuns(cell)) richText = true;
      const style: IStyleData | null = resolveStyle(cell.s, data.styles);
      if (!style || !Object.keys(style).length) return;
      const xf = table.xfFor(style);
      if (xf) (cellXfs.get(r) ?? cellXfs.set(r, new Map()).get(r)!).set(c, xf);
    });

    const cols: SheetPatch["cols"] = [];
    for (const [i, col] of Object.entries(sheet.columnData ?? {})) {
      if (!col) continue;
      if (col.s) rowColStyles = true;
      if (col.w !== undefined || col.hd === BooleanNumber.TRUE) cols.push({ index: Number(i), widthPx: col.w, hidden: col.hd === BooleanNumber.TRUE });
    }
    const rows: SheetPatch["rows"] = new Map();
    for (const [i, row] of Object.entries(sheet.rowData ?? {})) {
      if (!row) continue;
      if (row.s) rowColStyles = true;
      // Auto-fit heights (ia) are recomputed by Excel; only user heights are written.
      const height = row.h !== undefined && row.ia !== BooleanNumber.TRUE ? row.h : undefined;
      if (height !== undefined || row.hd === BooleanNumber.TRUE) rows.set(Number(i), { heightPx: height, hidden: row.hd === BooleanNumber.TRUE });
    }

    const freeze = sheet.freeze && (sheet.freeze.xSplit > 0 || sheet.freeze.ySplit > 0) ? { rows: Math.max(0, sheet.freeze.ySplit), cols: Math.max(0, sheet.freeze.xSplit) } : undefined;
    writeText(
      pkg.files,
      part.path,
      patchSheetXml(xml, {
        cellXfs,
        cols,
        rows,
        defaultColPx: sheet.defaultColumnWidth ?? MACTUXEL_DEFAULT_COL_PX,
        defaultRowPx: sheet.defaultRowHeight ?? MACTUXEL_DEFAULT_ROW_PX,
        freeze,
        tabColor: sheet.tabColor,
        showGridlines: sheet.showGridlines !== BooleanNumber.FALSE,
        zoom: sheet.zoomRatio,
      }),
    );
  });

  writeText(pkg.files, pkg.stylesPath ?? "xl/styles.xml", table.toXml());

  const issues: CompatIssue[] = [...table.approximations].map((label) => ({
    id: `style:${label}`,
    title: label,
    detail: "Saved in a simplified form.",
    effect: "changed" as const,
  }));
  if (richText) issues.push({ id: "rich-text", title: "Mixed formatting inside a cell", detail: "Text is saved; formatting applied to only part of a cell's text is simplified.", effect: "changed" });
  if (rowColStyles) issues.push({ id: "row-col-styles", title: "Whole-row or whole-column formatting", detail: "Formatting applied to entire rows or columns isn't saved; cell formatting is.", effect: "removed" });

  return { bytes: repack(pkg.files), issues };
}
