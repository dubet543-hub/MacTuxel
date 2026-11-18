import type { IStyleData, IWorkbookData } from "@univerjs/presets";
import { csvExportIssues, type CompatIssue } from "./compatibility";
import { isZip } from "./ooxml/package";
import { exportXlsx, importXlsx } from "./xlsx";
import { baseName, extensionOf, forEachCell, readWithSheetJS, resolveStyle, sheetToCsv, sheetjsToUniver, type MoveFormulaFn } from "./workbookConvert";

/** Formats MacTuxel can open. */
export type FileKind = "xlsx" | "xlsm" | "xls" | "ods" | "csv" | "tsv";
export const OPEN_EXTENSIONS: readonly FileKind[] = ["xlsx", "xlsm", "xls", "ods", "csv", "tsv"];

/** Formats MacTuxel can write. */
export type SaveKind = "xlsx" | "csv";
export const SAVE_EXTENSIONS: readonly SaveKind[] = ["xlsx", "csv"];

export function fileKindOf(path: string): FileKind | null {
  const ext = extensionOf(path);
  return (OPEN_EXTENSIONS as readonly string[]).includes(ext) ? (ext as FileKind) : null;
}

export function saveKindFor(path: string): SaveKind {
  return extensionOf(path) === "csv" ? "csv" : "xlsx";
}

export interface OpenedWorkbook {
  workbook: Partial<IWorkbookData>;
  kind: FileKind;
  /** Features in the file that won't survive a save. */
  issues: CompatIssue[];
  /** Whether Save can write back to the same file (otherwise Save becomes Save As .xlsx). */
  canSaveInPlace: boolean;
}

const LEGACY_NOTE: CompatIssue = {
  id: "legacy-format",
  title: "Older file format",
  detail: "Values, formulas, number formats, merged cells and sizes are imported; fonts, colours and borders aren't. Saving creates a new .xlsx file.",
  effect: "changed",
};

/** Parses any supported spreadsheet file into a Univer workbook. */
export function openWorkbookBytes(bytes: Uint8Array, fileName: string): OpenedWorkbook {
  const kind = fileKindOf(fileName);
  if (!kind) throw new Error(`MacTuxel can't open ".${extensionOf(fileName) || "?"}" files. Supported: ${OPEN_EXTENSIONS.map((e) => `.${e}`).join(", ")}.`);
  const name = baseName(fileName);

  if (kind === "xlsx" || kind === "xlsm") {
    if (!isZip(bytes)) throw new Error(`"${fileName}" isn't a valid Excel workbook. It may be damaged or use a different format.`);
    const { workbook, issues } = importXlsx(bytes, name);
    // Writing .xlsx content into a .xlsm file would break it, so macro workbooks are saved as copies.
    return { workbook, kind, issues, canSaveInPlace: kind === "xlsx" };
  }

  if (kind === "csv" || kind === "tsv") {
    const workbook = sheetjsToUniver(readWithSheetJS(bytes, { csv: true }), name, { formats: true });
    return { workbook, kind, issues: [], canSaveInPlace: false };
  }

  // xls, ods
  const workbook = sheetjsToUniver(readWithSheetJS(bytes), name, { formats: true });
  const issues: CompatIssue[] = [{ ...LEGACY_NOTE, title: kind === "ods" ? "OpenDocument spreadsheet" : "Excel 97–2004 workbook (.xls)" }];
  return { workbook, kind, issues, canSaveInPlace: false };
}

export interface SavedWorkbook {
  bytes: Uint8Array;
  issues: CompatIssue[];
}

/** Serialises a workbook as .xlsx or as CSV of one sheet. */
export function saveWorkbookBytes(
  data: IWorkbookData,
  kind: SaveKind,
  options: { moveFormula?: MoveFormulaFn; activeSheetName?: string } = {},
): SavedWorkbook {
  if (kind === "csv") {
    let hasFormulas = false;
    let hasFormatting = false;
    const sheet = Object.values(data.sheets).find((s) => s.name === options.activeSheetName) ?? data.sheets[data.sheetOrder[0]];
    forEachCell((sheet?.cellData ?? {}) as Record<string, Record<string, import("@univerjs/presets").ICellData>>, (_r, _c, cell) => {
      if (cell.f || cell.si) hasFormulas = true;
      const style: IStyleData | null = resolveStyle(cell.s, data.styles);
      if (style && Object.keys(style).some((k) => k !== "n")) hasFormatting = true;
    });
    if (sheet?.mergeData?.length) hasFormatting = true;
    // A BOM lets Excel read UTF-8 CSV correctly.
    const bytes = new TextEncoder().encode(`﻿${sheetToCsv(data, options.activeSheetName)}`);
    return { bytes, issues: csvExportIssues(data.sheetOrder.length, hasFormulas, hasFormatting) };
  }
  return exportXlsx(data, { moveFormula: options.moveFormula });
}
