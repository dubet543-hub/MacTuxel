import { normalizeHex, resolveColor, toArgb, type ColorContext } from "./colors";
import { attr, boolAttr, child, children, el, NS_MAIN, parseXml, serializeXml } from "./xml";

/**
 * Units. Excel stores column widths in "characters" of the default font's max
 * digit width (7px for Calibri 11 at 96 dpi; the stored width already includes
 * padding, so px ≈ width × 7) and row heights in points (px = pt × 4/3).
 */
export const PX_PER_CHAR = 7;
export const PX_PER_PT = 4 / 3;
export const EXCEL_DEFAULT_COL_PX = 64; // 8.43 characters
export const EXCEL_DEFAULT_ROW_PX = 20; // 15 pt

export const colWidthToPx = (width: number) => Math.round(width * PX_PER_CHAR);
export const pxToColWidth = (px: number) => Math.round((px / PX_PER_CHAR) * 256) / 256;
export const ptToPx = (pt: number) => Math.round(pt * PX_PER_PT * 100) / 100;
export const pxToPt = (px: number) => Math.round((px / PX_PER_PT) * 100) / 100;

export function decodeCol(letters: string): number {
  let n = 0;
  for (let i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64);
  return n - 1;
}

export function encodeCol(col: number): string {
  let s = "";
  for (let n = col + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

export function decodeRef(ref: string): { r: number; c: number } | null {
  const m = /^\$?([A-Z]{1,3})\$?(\d+)$/.exec(ref);
  return m ? { r: Number(m[2]) - 1, c: decodeCol(m[1]) } : null;
}

export interface SheetLayout {
  /** [row, col, xfIndex] for every cell with a non-default style. */
  cellXfs: [number, number, number][];
  cols: { min: number; max: number; widthPx?: number; hidden: boolean }[];
  rows: Map<number, { heightPx?: number; hidden: boolean }>;
  defaultColPx?: number;
  defaultRowPx?: number;
  freeze?: { rows: number; cols: number };
  tabColor?: string;
  showGridlines: boolean;
  zoom?: number;
  rightToLeft: boolean;
}

export function readSheetLayout(xml: string, ctx: ColorContext): SheetLayout {
  const doc = parseXml(xml);
  const root = doc.documentElement;
  const layout: SheetLayout = { cellXfs: [], cols: [], rows: new Map(), showGridlines: true, rightToLeft: false };

  const tab = child(child(root, "sheetPr"), "tabColor");
  if (tab) {
    const c = resolveColor({ rgb: attr(tab, "rgb"), theme: attr(tab, "theme"), tint: attr(tab, "tint"), indexed: attr(tab, "indexed") }, ctx);
    if (c) layout.tabColor = c;
  }

  const view = child(child(root, "sheetViews"), "sheetView");
  if (view) {
    layout.showGridlines = boolAttr(view, "showGridLines", true);
    layout.rightToLeft = boolAttr(view, "rightToLeft");
    const zoom = Number(attr(view, "zoomScale") ?? 100);
    if (zoom && zoom !== 100) layout.zoom = zoom / 100;
    const pane = child(view, "pane");
    if (pane && (attr(pane, "state") === "frozen" || attr(pane, "state") === "frozenSplit")) {
      layout.freeze = { rows: Math.round(Number(attr(pane, "ySplit") ?? 0)), cols: Math.round(Number(attr(pane, "xSplit") ?? 0)) };
    }
  }

  const fmt = child(root, "sheetFormatPr");
  if (fmt) {
    const dcw = attr(fmt, "defaultColWidth");
    const base = attr(fmt, "baseColWidth");
    if (dcw) layout.defaultColPx = colWidthToPx(Number(dcw));
    else if (base) layout.defaultColPx = colWidthToPx(Number(base) + 5 / PX_PER_CHAR);
    const drh = attr(fmt, "defaultRowHeight");
    if (drh) layout.defaultRowPx = ptToPx(Number(drh));
  }

  for (const c of children(child(root, "cols"), "col")) {
    const width = attr(c, "width");
    layout.cols.push({
      min: Number(attr(c, "min")) - 1,
      max: Number(attr(c, "max")) - 1,
      widthPx: width && boolAttr(c, "customWidth", true) ? colWidthToPx(Number(width)) : undefined,
      hidden: boolAttr(c, "hidden"),
    });
  }

  for (const row of children(child(root, "sheetData"), "row")) {
    const r = Number(attr(row, "r")) - 1;
    const ht = attr(row, "ht");
    const hidden = boolAttr(row, "hidden");
    if ((ht && boolAttr(row, "customHeight")) || hidden) {
      layout.rows.set(r, { heightPx: ht && boolAttr(row, "customHeight") ? ptToPx(Number(ht)) : undefined, hidden });
    }
    for (const c of children(row, "c")) {
      const s = Number(attr(c, "s") ?? 0);
      if (!s) continue;
      const pos = decodeRef(attr(c, "r") ?? "");
      if (pos) layout.cellXfs.push([pos.r, pos.c, s]);
    }
  }
  return layout;
}

export interface SheetPatch {
  cellXfs: Map<number, Map<number, number>>; // row → col → xf (non-zero)
  cols: { index: number; widthPx?: number; hidden?: boolean }[];
  rows: Map<number, { heightPx?: number; hidden?: boolean }>;
  defaultColPx: number;
  defaultRowPx: number;
  freeze?: { rows: number; cols: number };
  tabColor?: string | null;
  showGridlines: boolean;
  zoom?: number;
}

/** Applies MacTuxel's layout and formatting onto a worksheet part written by SheetJS. */
export function patchSheetXml(xml: string, patch: SheetPatch): string {
  const doc = parseXml(xml);
  const root = doc.documentElement;
  const sheetData = child(root, "sheetData") ?? root.appendChild(el(doc, "sheetData"));

  // sheetPr / tabColor (must be the first child)
  const tab = normalizeHex(patch.tabColor);
  if (tab) {
    let pr = child(root, "sheetPr");
    if (!pr) pr = root.insertBefore(el(doc, "sheetPr"), root.firstElementChild);
    for (const old of children(pr, "tabColor")) pr.removeChild(old);
    pr.insertBefore(el(doc, "tabColor", { rgb: toArgb(tab) }), pr.firstElementChild);
  }

  // sheetViews: gridlines, zoom, frozen panes
  let views = child(root, "sheetViews");
  if (!views) {
    const after = child(root, "dimension") ?? child(root, "sheetPr");
    views = root.insertBefore(el(doc, "sheetViews"), after ? after.nextElementSibling : root.firstElementChild);
  }
  let view = child(views, "sheetView");
  if (!view) view = views.appendChild(el(doc, "sheetView", { workbookViewId: 0 }));
  if (!patch.showGridlines) view.setAttribute("showGridLines", "0");
  if (patch.zoom && Math.round(patch.zoom * 100) !== 100) view.setAttribute("zoomScale", String(Math.round(patch.zoom * 100)));
  for (const old of [...children(view, "pane"), ...children(view, "selection")]) view.removeChild(old);
  if (patch.freeze && (patch.freeze.rows > 0 || patch.freeze.cols > 0)) {
    const { rows, cols } = patch.freeze;
    const activePane = rows && cols ? "bottomRight" : rows ? "bottomLeft" : "topRight";
    view.appendChild(
      el(doc, "pane", {
        xSplit: cols || undefined,
        ySplit: rows || undefined,
        topLeftCell: `${encodeCol(cols)}${rows + 1}`,
        activePane,
        state: "frozen",
      }),
    );
    view.appendChild(el(doc, "selection", { pane: activePane }));
  }

  // sheetFormatPr (after sheetViews, before cols)
  for (const old of children(root, "sheetFormatPr")) root.removeChild(old);
  const formatPr = el(doc, "sheetFormatPr", {
    baseColWidth: 8,
    defaultColWidth: pxToColWidth(patch.defaultColPx),
    defaultRowHeight: pxToPt(patch.defaultRowPx),
    customHeight: Math.abs(patch.defaultRowPx - EXCEL_DEFAULT_ROW_PX) > 0.5 ? 1 : undefined,
  });
  root.insertBefore(formatPr, views.nextElementSibling);

  // cols (rebuilt)
  for (const old of children(root, "cols")) root.removeChild(old);
  const colDefs = patch.cols.filter((c) => c.widthPx !== undefined || c.hidden).sort((a, b) => a.index - b.index);
  if (colDefs.length) {
    const cols = el(doc, "cols");
    for (const c of colDefs) {
      cols.appendChild(
        el(doc, "col", {
          min: c.index + 1,
          max: c.index + 1,
          width: pxToColWidth(c.widthPx ?? patch.defaultColPx),
          customWidth: c.widthPx !== undefined ? 1 : undefined,
          hidden: c.hidden ? 1 : undefined,
        }),
      );
    }
    root.insertBefore(cols, sheetData);
  }

  // rows and cell styles
  // New rows/cells are appended, then each touched container is sorted once
  // (SpreadsheetML requires ascending row and column order).
  const rowEls = new Map<number, Element>();
  for (const row of children(sheetData, "row")) rowEls.set(Number(attr(row, "r")) - 1, row);
  let rowsAdded = false;
  const rowIndices = new Set<number>([...patch.rows.keys(), ...patch.cellXfs.keys()]);
  for (const r of rowIndices) {
    const info = patch.rows.get(r);
    const xfs = patch.cellXfs.get(r);
    let row = rowEls.get(r);
    if (!row) {
      row = sheetData.appendChild(el(doc, "row", { r: r + 1 }));
      rowEls.set(r, row);
      rowsAdded = true;
    }
    for (const a of ["ht", "customHeight", "hidden"]) row.removeAttribute(a);
    if (info?.heightPx !== undefined) {
      row.setAttribute("ht", String(pxToPt(info.heightPx)));
      row.setAttribute("customHeight", "1");
    }
    if (info?.hidden) row.setAttribute("hidden", "1");
    if (!xfs) continue;
    const cellEls = new Map<number, Element>();
    for (const c of children(row, "c")) {
      const pos = decodeRef(attr(c, "r") ?? "");
      if (pos) cellEls.set(pos.c, c);
    }
    let cellsAdded = false;
    for (const [col, xf] of xfs) {
      let cellEl = cellEls.get(col);
      if (!cellEl) {
        cellEl = row.appendChild(el(doc, "c", { r: `${encodeCol(col)}${r + 1}` }));
        cellEls.set(col, cellEl);
        cellsAdded = true;
      }
      cellEl.setAttribute("s", String(xf));
    }
    if (cellsAdded) for (const col of [...cellEls.keys()].sort((a, b) => a - b)) row.appendChild(cellEls.get(col)!);
  }
  if (rowsAdded) for (const r of [...rowEls.keys()].sort((a, b) => a - b)) sheetData.appendChild(rowEls.get(r)!);
  // Remove "s" pointing at SheetJS's own (discarded) stylesheet on unformatted cells.
  for (const [r, row] of rowEls) {
    const xfs = patch.cellXfs.get(r);
    for (const c of children(row, "c")) {
      const pos = decodeRef(attr(c, "r") ?? "");
      if (pos && !xfs?.has(pos.c)) c.removeAttribute("s");
    }
  }
  if (root.namespaceURI !== NS_MAIN) throw new Error("Unexpected worksheet namespace");
  return serializeXml(doc);
}
