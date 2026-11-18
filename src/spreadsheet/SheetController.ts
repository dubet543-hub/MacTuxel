import {
  BorderStyleTypes,
  BorderType,
  CommandType,
  Dimension,
  HorizontalAlign,
  VerticalAlign,
  WrapStrategy,
  type IStyleData,
  type IWorkbookData,
} from "@univerjs/presets";
import { nativePaste } from "../platform/tauri";
import type { SpreadsheetAPI, SpreadsheetHandle } from "./createSpreadsheet";
import { planAutoSum, type AggregateFunction } from "./autoSum";
import { cellInputText, parseCellInput, statValue } from "./cellInput";
import { cellLabel, parseRangeRef, rangeLabel } from "./cellRefs";
import { computeStats } from "./selectionStats";
import { uniqueCopyName, validateSheetName } from "./sheetNames";
import {
  DEFAULT_FONT_FAMILY,
  DEFAULT_FONT_SIZE,
  INITIAL_SHEET_STATE,
  type CellStyleState,
  type HAlign,
  type SelectionBounds,
  type SheetUIState,
  type VAlign,
} from "./sheetState";

type Workbook = NonNullable<ReturnType<SpreadsheetAPI["getActiveWorkbook"]>>;
type Worksheet = ReturnType<Workbook["getActiveSheet"]>;
type Range = ReturnType<Worksheet["getRange"]>;

export type BorderPreset = "all" | "outside" | "inside" | "top" | "bottom" | "left" | "right" | "thick-outside" | "none";
export type MergeMode = "center" | "across" | "cells" | "unmerge";
export type ClearMode = "all" | "contents" | "formats";
export type ShiftDirection = "down" | "right" | "up" | "left";

export interface CellStylePreset {
  id: string;
  label: string;
  background?: string | null;
  color?: string | null;
  bold?: boolean;
  italic?: boolean;
  fontSize?: number;
  border?: "bottom-thick" | "top-double";
}

export interface WorkbookStatistics {
  sheets: number;
  usedRange: string;
  cellsWithData: number;
  formulas: number;
  numbers: number;
  text: number;
}

/** Mutations that don't change document content (view state, recalculation bookkeeping). */
const NON_DIRTY_MUTATION = /zoom|scroll|activ|selection|calculation|formula-data|dirty|numfmt-cache/i;

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 4;

/**
 * Single façade between the MacTuxel UI and the Univer workbook: exposes
 * spreadsheet operations and a reactive snapshot of selection/format state.
 */
export class SheetController {
  private state: SheetUIState = INITIAL_SHEET_STATE;
  private readonly listeners = new Set<() => void>();
  private readonly dirtyListeners = new Set<() => void>();
  private readonly disposers: Array<() => void> = [];
  private unbindWorkbook: (() => void) | null = null;
  private frame = 0;
  private disposed = false;
  private painter: { dispose(): void } | null = null;

  constructor(
    readonly handle: SpreadsheetHandle,
    private readonly host: HTMLElement,
  ) {
    const api = this.api;
    const E = api.Event;
    const events = [
      E.SelectionChanged,
      E.SheetValueChanged,
      E.ActiveSheetChanged,
      E.SheetCreated,
      E.SheetDeleted,
      E.SheetMoved,
      E.SheetNameChanged,
      E.SheetTabColorChanged,
      E.SheetZoomChanged,
      E.GridlineChanged,
      E.SheetEditStarted,
      E.SheetEditEnded,
    ] as const;
    for (const name of events) {
      const d = api.addEvent(name, () => this.scheduleRefresh());
      this.disposers.push(() => d.dispose());
    }
    const live = api.addEvent(E.SheetEditChanging, (params) => {
      const text = params.value.toPlainText().replace(/\r?\n$/, "").replace(/\r$/, "");
      this.setState({ ...this.state, cellInput: text, editing: true });
    });
    this.disposers.push(() => live.dispose());
    this.bindWorkbook();
    this.refresh();
  }

  get api(): SpreadsheetAPI {
    return this.handle.api;
  }

  // ---------------------------------------------------------------------------
  // Store plumbing (for React's useSyncExternalStore)
  // ---------------------------------------------------------------------------

  getState = (): SheetUIState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Fires when document content changes (used for the "Edited" indicator). */
  onDirty(listener: () => void): () => void {
    this.dirtyListeners.add(listener);
    return () => this.dirtyListeners.delete(listener);
  }

  private setState(next: SheetUIState) {
    this.state = next;
    for (const l of this.listeners) l();
  }

  private bindWorkbook() {
    this.unbindWorkbook?.();
    const wb = this.api.getActiveWorkbook();
    if (!wb) return;
    const d = wb.onCommandExecuted((info) => {
      this.scheduleRefresh();
      // Formula results written back by the engine (e.g. a file opened without cached
      // values) carry `sourceFormulaData`; they aren't edits by the user.
      const fromFormulaEngine = !!info.params && "sourceFormulaData" in info.params;
      if (info.type === CommandType.MUTATION && !NON_DIRTY_MUTATION.test(info.id) && !fromFormulaEngine) {
        for (const l of this.dirtyListeners) l();
      }
    });
    this.unbindWorkbook = () => d.dispose();
  }

  scheduleRefresh() {
    if (this.frame || this.disposed) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.refresh();
    });
  }

  refresh() {
    if (this.disposed) return;
    const wb = this.api.getActiveWorkbook();
    if (!wb) return;
    const ws = wb.getActiveSheet();
    const selection = ws.getSelection();
    const ranges = selection?.getActiveRangeList() ?? [];
    const primary = selection?.getActiveRange() ?? ws.getRange(0, 0);
    const current = selection?.getCurrentCell();
    const row = current?.actualRow ?? primary.getRow();
    const col = current?.actualColumn ?? primary.getColumn();
    const cell = ws.getRange(row, col);
    const bounds = boundsOf(primary);

    const editing = wb.isCellEditing();
    const freeze = ws.getFreeze();

    this.setState({
      ready: true,
      sheets: wb
        .getSheets()
        .filter((s) => !s.isSheetHidden())
        .map((s) => ({ id: s.getSheetId(), name: s.getSheetName(), color: s.getTabColor() || null })),
      activeSheetId: ws.getSheetId(),
      activeCell: { row, col },
      nameBox: cellLabel(row, col),
      selectionLabel: rangeLabel({
        start: { row: bounds.startRow, col: bounds.startColumn },
        end: { row: bounds.endRow, col: bounds.endColumn },
      }),
      selection: bounds,
      cellInput: editing ? this.state.cellInput : cellInputText(rawCell(cell)),
      editing,
      style: styleState(cell.getCellStyleData()),
      numberFormat: cell.getNumberFormat() || "General",
      merged: cell.isPartOfMerge(),
      stats: this.selectionStats(ws, ranges.length ? ranges : [primary]),
      zoom: ws.getZoom(),
      gridlines: !ws.hasHiddenGridLines(),
      frozen: freeze ? { rows: Math.max(0, freeze.ySplit), cols: Math.max(0, freeze.xSplit) } : { rows: 0, cols: 0 },
      painting: this.painter !== null,
    });
  }

  private selectionStats(ws: Worksheet, ranges: Range[]) {
    const lastRow = ws.getLastRow();
    const lastCol = ws.getLastColumn();
    let total = 0;
    const blocks: unknown[][][] = [];
    for (const r of ranges) {
      const b = boundsOf(r);
      total += (b.endRow - b.startRow + 1) * (b.endColumn - b.startColumn + 1);
      // Only the used area can hold values; skip the empty remainder.
      const endRow = Math.min(b.endRow, lastRow);
      const endCol = Math.min(b.endColumn, lastCol);
      if (endRow < b.startRow || endCol < b.startColumn) continue;
      const grid = ws.getRange(b.startRow, b.startColumn, endRow - b.startRow + 1, endCol - b.startColumn + 1).getCellDataGrid();
      blocks.push(grid.map((rowCells) => rowCells.map(statValue)));
    }
    return computeStats(blocks, total);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private get workbook(): Workbook {
    const wb = this.api.getActiveWorkbook();
    if (!wb) throw new Error("No workbook is open.");
    return wb;
  }

  private get sheet(): Worksheet {
    return this.workbook.getActiveSheet();
  }

  private selectedRanges(): Range[] {
    const ws = this.sheet;
    const list = ws.getSelection()?.getActiveRangeList() ?? [];
    if (list.length) return list;
    const r = ws.getSelection()?.getActiveRange();
    return [r ?? ws.getRange(0, 0)];
  }

  private primaryRange(): Range {
    const ws = this.sheet;
    return ws.getSelection()?.getActiveRange() ?? ws.getRange(0, 0);
  }

  private activeCellRange(): Range {
    const { row, col } = this.state.activeCell;
    return this.sheet.getRange(row, col);
  }

  /** Commits any in-cell edit so formatting applies to the stored value. */
  private async commitEditing() {
    const wb = this.api.getActiveWorkbook();
    if (wb?.isCellEditing()) await wb.endEditingAsync(true);
  }

  private async eachRange(fn: (range: Range) => void) {
    await this.commitEditing();
    for (const r of this.selectedRanges()) fn(r);
    this.scheduleRefresh();
  }

  private async exec(id: string, params?: object) {
    await this.commitEditing();
    const ok = await this.api.executeCommand(id, params);
    this.scheduleRefresh();
    return ok;
  }

  /**
   * Returns keyboard focus to the grid so typing edits cells again.
   * Univer listens on its hidden cell editor element.
   */
  focusGrid() {
    const editor =
      document.getElementById("__editor___INTERNAL_EDITOR__DOCS_NORMAL") ??
      this.host.querySelector<HTMLElement>('[data-u-comp="editor"][contenteditable="true"]');
    editor?.focus({ preventScroll: true });
  }

  // ---------------------------------------------------------------------------
  // Document
  // ---------------------------------------------------------------------------

  load(data: Partial<IWorkbookData>) {
    this.handle.load(data);
    this.bindWorkbook();
    this.refresh();
  }

  snapshot() {
    return this.handle.snapshot();
  }

  undo = () => this.api.undo().then(() => this.scheduleRefresh());
  redo = () => this.api.redo().then(() => this.scheduleRefresh());

  // ---------------------------------------------------------------------------
  // Clipboard
  // ---------------------------------------------------------------------------

  async copy() {
    await this.commitEditing();
    const ok = await this.api.copy();
    if (!ok) throw new Error("Couldn't copy to the clipboard.");
    return ok;
  }

  async cut() {
    return this.exec("univer.command.cut");
  }

  async paste() {
    await this.commitEditing();
    // Desktop: route through the native Edit ▸ Paste action (no clipboard permission prompt).
    this.focusGrid();
    if (await nativePaste()) {
      this.scheduleRefresh();
      return true;
    }
    let ok = false;
    try {
      ok = await this.api.paste();
    } catch {
      ok = false;
    }
    if (!ok) throw new Error("The clipboard couldn't be read here. Press ⌘V to paste.");
    this.scheduleRefresh();
    return ok;
  }

  /**
   * Format Painter: captures the selection's cell formats; the next selection
   * the user completes receives them (tiled), keeping its values and formulas.
   * Clicking again (or Escape) cancels.
   */
  async formatPainter() {
    await this.commitEditing();
    if (this.painter) {
      this.cancelFormatPainter();
      return;
    }
    const ws = this.sheet;
    const source = boundsOf(this.primaryRange());
    const styles: (IStyleData | null)[][] = [];
    for (let r = source.startRow; r <= source.endRow; r++) {
      const row: (IStyleData | null)[] = [];
      for (let c = source.startColumn; c <= source.endColumn; c++) row.push(ws.getRange(r, c).getCellStyleData());
      styles.push(row);
    }
    const sheetId = ws.getSheetId();
    const listener = this.api.addEvent(this.api.Event.SelectionMoveEnd, (params) => {
      const target = params.selections[params.selections.length - 1];
      if (!target || params.worksheet.getSheetId() !== sheetId) return;
      this.cancelFormatPainter();
      this.applyFormats(styles, target);
    });
    this.painter = { dispose: () => listener.dispose() };
    this.setState({ ...this.state, painting: true });
  }

  cancelFormatPainter() {
    if (!this.painter) return;
    this.painter.dispose();
    this.painter = null;
    this.setState({ ...this.state, painting: false });
  }

  private applyFormats(styles: (IStyleData | null)[][], target: SelectionBounds) {
    const ws = this.sheet;
    const rows = target.endRow - target.startRow + 1;
    const cols = target.endColumn - target.startColumn + 1;
    const range = ws.getRange(target.startRow, target.startColumn, rows, cols);
    const current = range.getCellDataGrid();
    const next = current.map((row, r) =>
      row.map((cell, c) => {
        const style = styles[r % styles.length][c % styles[0].length];
        // Keep value, formula and rich text; replace only the format.
        return { ...(cell ?? {}), s: style ? { ...style } : null };
      }),
    );
    range.setValues(next);
    this.scheduleRefresh();
  }

  // ---------------------------------------------------------------------------
  // Font
  // ---------------------------------------------------------------------------

  toggleBold = () => this.exec("sheet.command.set-range-bold");
  toggleItalic = () => this.exec("sheet.command.set-range-italic");
  toggleUnderline = () => this.exec("sheet.command.set-range-underline");
  toggleStrikethrough = () => this.exec("sheet.command.set-range-stroke");
  growFont = () => this.exec("sheet.command.set-range-font-increase");
  shrinkFont = () => this.exec("sheet.command.set-range-font-decrease");

  setFontFamily(family: string) {
    return this.eachRange((r) => r.setFontFamily(family));
  }

  setFontSize(size: number) {
    if (!Number.isFinite(size) || size < 1 || size > 409) return Promise.resolve();
    return this.eachRange((r) => r.setFontSize(size));
  }

  setFontColor(color: string | null) {
    if (color === null) return this.exec("sheet.command.reset-text-color");
    return this.eachRange((r) => r.setFontColor(color));
  }

  setFillColor(color: string | null) {
    if (color === null) return this.exec("sheet.command.reset-background-color");
    return this.eachRange((r) => r.setBackgroundColor(color));
  }

  setBorders(preset: BorderPreset, color = "#000000") {
    return this.eachRange((r) => {
      switch (preset) {
        case "none":
          r.setBorder(BorderType.ALL, BorderStyleTypes.NONE);
          break;
        case "thick-outside":
          r.setBorder(BorderType.OUTSIDE, BorderStyleTypes.THICK, color);
          break;
        default:
          r.setBorder(BORDER_TYPES[preset], BorderStyleTypes.THIN, color);
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Alignment
  // ---------------------------------------------------------------------------

  setHorizontalAlign(align: Exclude<HAlign, "general">) {
    // Univer's facade uses "normal" for right alignment.
    const value = align === "right" ? "normal" : align;
    return this.eachRange((r) => r.setHorizontalAlignment(value));
  }

  setVerticalAlign(align: Exclude<VAlign, "general">) {
    return this.eachRange((r) => r.setVerticalAlignment(align));
  }

  toggleWrap() {
    const wrap = !this.state.style.wrap;
    return this.eachRange((r) => r.setWrap(wrap));
  }

  setRotation(degrees: number) {
    return this.eachRange((r) => r.setTextRotation(degrees));
  }

  merge(mode: MergeMode) {
    return this.eachRange((r) => {
      switch (mode) {
        case "center":
          r.merge();
          r.setHorizontalAlignment("center");
          break;
        case "across":
          r.mergeAcross();
          break;
        case "cells":
          r.merge();
          break;
        case "unmerge":
          r.breakApart();
          break;
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Number
  // ---------------------------------------------------------------------------

  setNumberFormat(pattern: string) {
    return this.eachRange((r) => r.setNumberFormat(pattern));
  }

  currencyFormat = () => this.exec("sheet.command.numfmt.set.currency");
  percentFormat = () => this.exec("sheet.command.numfmt.set.percent");
  commaFormat = () => this.setNumberFormat("#,##0.00");
  increaseDecimals = () => this.exec("sheet.command.numfmt.add.decimal.command");
  decreaseDecimals = () => this.exec("sheet.command.numfmt.subtract.decimal.command");

  // ---------------------------------------------------------------------------
  // Styles
  // ---------------------------------------------------------------------------

  applyCellStyle(preset: CellStylePreset) {
    return this.eachRange((r) => {
      r.clearFormat();
      if (preset.background) r.setBackgroundColor(preset.background);
      if (preset.color) r.setFontColor(preset.color);
      if (preset.bold) r.setFontWeight("bold");
      if (preset.italic) r.setFontStyle("italic");
      if (preset.fontSize) r.setFontSize(preset.fontSize);
      if (preset.border === "bottom-thick") r.setBorder(BorderType.BOTTOM, BorderStyleTypes.THICK, preset.color ?? "#0f766e");
      if (preset.border === "top-double") {
        r.setBorder(BorderType.TOP, BorderStyleTypes.THIN, "#000000");
        r.setBorder(BorderType.BOTTOM, BorderStyleTypes.DOUBLE, "#000000");
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Cells: insert / delete / format
  // ---------------------------------------------------------------------------

  async insertRows() {
    await this.commitEditing();
    const b = boundsOf(this.primaryRange());
    this.sheet.insertRowsBefore(b.startRow, b.endRow - b.startRow + 1);
    this.scheduleRefresh();
  }

  async insertColumns() {
    await this.commitEditing();
    const b = boundsOf(this.primaryRange());
    this.sheet.insertColumnsBefore(b.startColumn, b.endColumn - b.startColumn + 1);
    this.scheduleRefresh();
  }

  async deleteRows() {
    await this.commitEditing();
    const b = boundsOf(this.primaryRange());
    this.sheet.deleteRows(b.startRow, b.endRow - b.startRow + 1);
    this.scheduleRefresh();
  }

  async deleteColumns() {
    await this.commitEditing();
    const b = boundsOf(this.primaryRange());
    this.sheet.deleteColumns(b.startColumn, b.endColumn - b.startColumn + 1);
    this.scheduleRefresh();
  }

  async insertCells(shift: "down" | "right") {
    await this.commitEditing();
    this.primaryRange().insertCells(shift === "down" ? Dimension.ROWS : Dimension.COLUMNS);
    this.scheduleRefresh();
  }

  async deleteCells(shift: "up" | "left") {
    await this.commitEditing();
    this.primaryRange().deleteCells(shift === "up" ? Dimension.ROWS : Dimension.COLUMNS);
    this.scheduleRefresh();
  }

  currentRowHeight(): number {
    return this.sheet.getRowHeight(this.state.selection.startRow);
  }

  currentColumnWidth(): number {
    return this.sheet.getColumnWidth(this.state.selection.startColumn);
  }

  async setRowHeight(height: number) {
    const b = boundsOf(this.primaryRange());
    this.sheet.setRowHeights(b.startRow, b.endRow - b.startRow + 1, height);
    this.scheduleRefresh();
  }

  async setColumnWidth(width: number) {
    const b = boundsOf(this.primaryRange());
    this.sheet.setColumnWidths(b.startColumn, b.endColumn - b.startColumn + 1, width);
    this.scheduleRefresh();
  }

  async autoFitRows() {
    const b = boundsOf(this.primaryRange());
    this.sheet.autoResizeRows(b.startRow, b.endRow - b.startRow + 1);
    this.scheduleRefresh();
  }

  async autoFitColumns() {
    const b = boundsOf(this.primaryRange());
    this.sheet.autoResizeColumns(b.startColumn, b.endColumn - b.startColumn + 1);
    this.scheduleRefresh();
  }

  async setRowsHidden(hidden: boolean) {
    const b = boundsOf(this.primaryRange());
    const n = b.endRow - b.startRow + 1;
    if (hidden) this.sheet.hideRows(b.startRow, n);
    else this.sheet.showRows(b.startRow, n);
    this.scheduleRefresh();
  }

  async setColumnsHidden(hidden: boolean) {
    const b = boundsOf(this.primaryRange());
    const n = b.endColumn - b.startColumn + 1;
    if (hidden) this.sheet.hideColumns(b.startColumn, n);
    else this.sheet.showColumns(b.startColumn, n);
    this.scheduleRefresh();
  }

  // ---------------------------------------------------------------------------
  // Editing
  // ---------------------------------------------------------------------------

  /** Writes aggregate formulas for the selection. Returns the number of formulas written. */
  async autoSum(fn: AggregateFunction = "SUM"): Promise<number> {
    await this.commitEditing();
    const ws = this.sheet;
    const isNumeric = (row: number, col: number) => typeof statValue(rawCell(ws.getRange(row, col))) === "number";
    const plan = planAutoSum(fn, boundsOf(this.primaryRange()), isNumeric);
    for (const p of plan) ws.getRange(p.row, p.col).setValue(p.formula);
    if (plan.length === 1) ws.getRange(plan[0].row, plan[0].col).activate();
    this.scheduleRefresh();
    return plan.length;
  }

  selectAll = () => this.exec("sheet.command.select-all");
  fillDown = () => this.exec("sheet.command.copy-down");
  fillRight = () => this.exec("sheet.command.copy-right");

  clear(mode: ClearMode) {
    return this.eachRange((r) => {
      if (mode === "contents") r.clearContent();
      else if (mode === "formats") r.clearFormat();
      else r.clear();
    });
  }

  async textToColumns() {
    await this.commitEditing();
    this.primaryRange().splitTextToColumns(true);
    this.scheduleRefresh();
  }

  recalculate() {
    this.api.getFormula().executeCalculation();
    this.scheduleRefresh();
  }

  /** Writes formula-bar text into the active cell. */
  async commitCellInput(text: string) {
    await this.commitEditing();
    const range = this.activeCellRange();
    const value = parseCellInput(text);
    if (value === null) range.clearContent();
    else range.setValue(value);
    this.scheduleRefresh();
  }

  /** Name Box navigation. Returns an error message, or null on success. */
  goTo(reference: string): string | null {
    const parsed = parseRangeRef(reference);
    if (!parsed) return `"${reference}" isn't a valid cell reference.`;
    const ws = this.sheet;
    if (parsed.end.row >= ws.getMaxRows() || parsed.end.col >= ws.getMaxColumns()) {
      return `${reference.toUpperCase()} is outside this sheet.`;
    }
    const range = ws.getRange(
      parsed.start.row,
      parsed.start.col,
      parsed.end.row - parsed.start.row + 1,
      parsed.end.col - parsed.start.col + 1,
    );
    range.activate();
    ws.scrollToCell(parsed.start.row, parsed.start.col);
    this.scheduleRefresh();
    return null;
  }

  // ---------------------------------------------------------------------------
  // Worksheets
  // ---------------------------------------------------------------------------

  private sheetById(id: string): Worksheet {
    const ws = this.workbook.getSheetBySheetId(id);
    if (!ws) throw new Error("That sheet no longer exists.");
    return ws;
  }

  private sheetIndex(id: string): number {
    return this.workbook.getSheets().findIndex((s) => s.getSheetId() === id);
  }

  activateSheet(id: string) {
    this.workbook.setActiveSheet(id);
    this.scheduleRefresh();
  }

  async addSheet(): Promise<string> {
    await this.commitEditing();
    const wb = this.workbook;
    const index = this.state.activeSheetId ? this.sheetIndex(this.state.activeSheetId) + 1 : wb.getNumSheets();
    const ws = wb.insertSheet(undefined, { index });
    wb.setActiveSheet(ws);
    this.refresh();
    return ws.getSheetId();
  }

  /** Returns an error message, or null when renamed. */
  renameSheet(id: string, name: string): string | null {
    const ws = this.sheetById(id);
    const names = this.workbook.getSheets().map((s) => s.getSheetName());
    const error = validateSheetName(name, names, ws.getSheetName());
    if (error) return error;
    ws.setName(name.trim());
    this.refresh();
    return null;
  }

  async duplicateSheet(id: string): Promise<string> {
    await this.commitEditing();
    const wb = this.workbook;
    const source = this.sheetById(id);
    const copy = wb.duplicateSheet(source);
    const names = wb.getSheets().filter((s) => s.getSheetId() !== copy.getSheetId()).map((s) => s.getSheetName());
    copy.setName(uniqueCopyName(source.getSheetName(), names));
    wb.setActiveSheet(copy);
    this.refresh();
    return copy.getSheetId();
  }

  moveSheet(id: string, delta: number) {
    const wb = this.workbook;
    const from = this.sheetIndex(id);
    const to = Math.max(0, Math.min(wb.getNumSheets() - 1, from + delta));
    if (from < 0 || to === from) return;
    wb.moveSheet(this.sheetById(id), to);
    this.refresh();
  }

  canDeleteSheet(): boolean {
    return this.state.sheets.length > 1;
  }

  deleteSheet(id: string): boolean {
    if (!this.canDeleteSheet()) return false;
    const ok = this.workbook.deleteSheet(id);
    this.refresh();
    return ok;
  }

  setTabColor(id: string, color: string | null) {
    this.sheetById(id).setTabColor(color ?? "");
    this.refresh();
  }

  // ---------------------------------------------------------------------------
  // View
  // ---------------------------------------------------------------------------

  setZoom(ratio: number) {
    const clamped = Math.round(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, ratio)) * 100) / 100;
    this.sheet.zoom(clamped);
    this.scheduleRefresh();
  }

  setGridlines(visible: boolean) {
    this.sheet.setHiddenGridlines(!visible);
    this.scheduleRefresh();
  }

  freezePanes() {
    const { row, col } = this.state.activeCell;
    if (row === 0 && col === 0) return;
    this.sheet.setFreeze({ xSplit: col, ySplit: row, startRow: row, startColumn: col });
    this.scheduleRefresh();
  }

  freezeTopRow() {
    this.sheet.setFreeze({ xSplit: 0, ySplit: 1, startRow: 1, startColumn: 0 });
    this.scheduleRefresh();
  }

  freezeFirstColumn() {
    this.sheet.setFreeze({ xSplit: 1, ySplit: 0, startRow: 0, startColumn: 1 });
    this.scheduleRefresh();
  }

  unfreeze() {
    this.sheet.cancelFreeze();
    this.scheduleRefresh();
  }

  // ---------------------------------------------------------------------------
  // Review
  // ---------------------------------------------------------------------------

  workbookStatistics(): WorkbookStatistics {
    const wb = this.workbook;
    const ws = wb.getActiveSheet();
    const lastRow = ws.getLastRow();
    const lastCol = ws.getLastColumn();
    let cellsWithData = 0;
    let formulas = 0;
    let numbers = 0;
    let text = 0;
    if (lastRow >= 0 && lastCol >= 0) {
      for (const row of ws.getRange(0, 0, lastRow + 1, lastCol + 1).getCellDataGrid()) {
        for (const cell of row) {
          const v = statValue(cell);
          if (cell?.f) formulas++;
          if (v === null || v === undefined || v === "") continue;
          cellsWithData++;
          if (typeof v === "number") numbers++;
          else if (typeof v === "string") text++;
        }
      }
    }
    return {
      sheets: wb.getNumSheets(),
      usedRange: lastRow >= 0 && lastCol >= 0 ? `A1:${cellLabel(lastRow, lastCol)}` : "—",
      cellsWithData,
      formulas,
      numbers,
      text,
    };
  }

  dispose() {
    this.disposed = true;
    this.painter?.dispose();
    if (this.frame) cancelAnimationFrame(this.frame);
    this.unbindWorkbook?.();
    for (const d of this.disposers) d();
    this.listeners.clear();
    this.dirtyListeners.clear();
    this.handle.dispose();
  }
}

const BORDER_TYPES: Record<Exclude<BorderPreset, "none" | "thick-outside">, BorderType> = {
  all: BorderType.ALL,
  outside: BorderType.OUTSIDE,
  inside: BorderType.INSIDE,
  top: BorderType.TOP,
  bottom: BorderType.BOTTOM,
  left: BorderType.LEFT,
  right: BorderType.RIGHT,
};

/**
 * The stored cell. `FRange.getCellData()` returns the *display* value for
 * number-formatted cells (e.g. "$1,500.00"); the grid accessor returns the raw one.
 */
function rawCell(range: Range) {
  return range.getCellDataGrid()[0]?.[0] ?? null;
}

function boundsOf(range: Range): SelectionBounds {
  const r = range.getRange();
  return { startRow: r.startRow, endRow: r.endRow, startColumn: r.startColumn, endColumn: r.endColumn };
}

function styleState(s: IStyleData | null): CellStyleState {
  return {
    bold: s?.bl === 1,
    italic: s?.it === 1,
    underline: s?.ul?.s === 1,
    strikethrough: s?.st?.s === 1,
    fontFamily: s?.ff || DEFAULT_FONT_FAMILY,
    fontSize: s?.fs || DEFAULT_FONT_SIZE,
    fontColor: s?.cl?.rgb ?? null,
    background: s?.bg?.rgb ?? null,
    hAlign:
      s?.ht === HorizontalAlign.LEFT ? "left" : s?.ht === HorizontalAlign.CENTER ? "center" : s?.ht === HorizontalAlign.RIGHT ? "right" : "general",
    vAlign:
      s?.vt === VerticalAlign.TOP ? "top" : s?.vt === VerticalAlign.MIDDLE ? "middle" : s?.vt === VerticalAlign.BOTTOM ? "bottom" : "general",
    wrap: s?.tb === WrapStrategy.WRAP,
    rotation: s?.tr?.a ?? 0,
  };
}
