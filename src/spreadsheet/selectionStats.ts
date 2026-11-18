export interface SelectionStats {
  /** Selected cells in total (may include empty cells). */
  cells: number;
  /** Non-empty cells. */
  count: number;
  /** Cells holding numbers (including formula results). */
  numericCount: number;
  sum: number;
  average: number | null;
  min: number | null;
  max: number | null;
}

export function emptyStats(cells = 0): SelectionStats {
  return { cells, count: 0, numericCount: 0, sum: 0, average: null, min: null, max: null };
}

/**
 * Aggregates selection values like a spreadsheet status bar: text counts
 * toward Count only; numbers count toward Sum/Average/Min/Max. Booleans are
 * stored as 1/0 with a boolean type flag, so callers pass them as booleans.
 */
export function computeStats(blocks: readonly (readonly unknown[])[][], totalCells: number): SelectionStats {
  const stats = emptyStats(totalCells);
  let min = Infinity;
  let max = -Infinity;
  for (const block of blocks) {
    for (const row of block) {
      for (const value of row) {
        if (value === null || value === undefined || value === "") continue;
        stats.count += 1;
        if (typeof value === "number" && Number.isFinite(value)) {
          stats.numericCount += 1;
          stats.sum += value;
          if (value < min) min = value;
          if (value > max) max = value;
        }
      }
    }
  }
  if (stats.numericCount > 0) {
    stats.average = stats.sum / stats.numericCount;
    stats.min = min;
    stats.max = max;
  }
  return stats;
}

/** Status-bar number formatting: up to 10 significant decimals, grouped thousands. */
export function formatStat(value: number): string {
  const rounded = Number.parseFloat(value.toPrecision(12));
  return rounded.toLocaleString("en-US", { maximumFractionDigits: 10 });
}
