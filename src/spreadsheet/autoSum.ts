import { cellLabel } from "./cellRefs";

export type AggregateFunction = "SUM" | "AVERAGE" | "COUNT" | "MAX" | "MIN";

export interface Bounds {
  startRow: number;
  endRow: number;
  startColumn: number;
  endColumn: number;
}

export interface AutoSumPlacement {
  row: number;
  col: number;
  formula: string;
}

/** Returns true when the cell holds a number (or a formula producing one). */
export type IsNumeric = (row: number, col: number) => boolean;

/**
 * Decides where AutoSum writes and what it sums, following the familiar rules:
 * - Single cell: sum the contiguous numbers directly above it; if none, to its left.
 * - Multi-cell selection: write one total per column in the row beneath it
 *   (or one per row to the right, if the selection is a single row).
 * Returns an empty list when there is nothing numeric to aggregate.
 */
export function planAutoSum(fn: AggregateFunction, sel: Bounds, isNumeric: IsNumeric): AutoSumPlacement[] {
  const single = sel.startRow === sel.endRow && sel.startColumn === sel.endColumn;

  if (single) {
    const { startRow: row, startColumn: col } = sel;
    let top = row;
    while (top - 1 >= 0 && isNumeric(top - 1, col)) top--;
    if (top < row) return [{ row, col, formula: `=${fn}(${cellLabel(top, col)}:${cellLabel(row - 1, col)})` }];
    let left = col;
    while (left - 1 >= 0 && isNumeric(row, left - 1)) left--;
    if (left < col) return [{ row, col, formula: `=${fn}(${cellLabel(row, left)}:${cellLabel(row, col - 1)})` }];
    return [];
  }

  const placements: AutoSumPlacement[] = [];
  if (sel.startRow === sel.endRow) {
    // Horizontal strip: total to the right.
    return [
      {
        row: sel.startRow,
        col: sel.endColumn + 1,
        formula: `=${fn}(${cellLabel(sel.startRow, sel.startColumn)}:${cellLabel(sel.startRow, sel.endColumn)})`,
      },
    ];
  }
  for (let col = sel.startColumn; col <= sel.endColumn; col++) {
    let hasNumber = false;
    for (let row = sel.startRow; row <= sel.endRow && !hasNumber; row++) hasNumber = isNumeric(row, col);
    if (!hasNumber) continue;
    placements.push({
      row: sel.endRow + 1,
      col,
      formula: `=${fn}(${cellLabel(sel.startRow, col)}:${cellLabel(sel.endRow, col)})`,
    });
  }
  return placements;
}
