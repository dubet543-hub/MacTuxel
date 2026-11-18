import type { IWorkbookData } from "@univerjs/presets";

export const DEFAULT_ROW_COUNT = 1000;
export const DEFAULT_COLUMN_COUNT = 26;

let counter = 0;

/** Unique enough for unit ids within one app session. */
export function newUnitId(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}

/** A new, empty workbook with a single sheet. */
export function createBlankWorkbook(name = "Untitled"): Partial<IWorkbookData> {
  const sheetId = newUnitId("sheet");
  return {
    id: newUnitId("workbook"),
    name,
    styles: {},
    sheetOrder: [sheetId],
    sheets: {
      [sheetId]: {
        id: sheetId,
        name: "Sheet1",
        rowCount: DEFAULT_ROW_COUNT,
        columnCount: DEFAULT_COLUMN_COUNT,
        cellData: {},
      },
    },
  };
}
