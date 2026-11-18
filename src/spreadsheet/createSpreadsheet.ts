import { createUniver, LocaleType, mergeLocales, type IWorkbookData } from "@univerjs/presets";
import { UniverSheetsCorePreset } from "@univerjs/preset-sheets-core";
import sheetsCoreEnUS from "@univerjs/preset-sheets-core/locales/en-US";
import "@univerjs/preset-sheets-core/lib/index.css";
import { createBlankWorkbook } from "./blankWorkbook";

export type SpreadsheetAPI = ReturnType<typeof createUniver>["univerAPI"];

export interface SpreadsheetHandle {
  readonly api: SpreadsheetAPI;
  /** Replace the open workbook with new data. */
  load(data: Partial<IWorkbookData>): void;
  /** Serialise the open workbook (Univer snapshot). */
  snapshot(): IWorkbookData | null;
  setDarkMode(dark: boolean): void;
  dispose(): void;
}

export interface CreateSpreadsheetOptions {
  darkMode: boolean;
  workbook?: Partial<IWorkbookData>;
}

/**
 * Mounts the Univer Sheets engine (open-source core preset) as a bare grid:
 * canvas, row/column headers, scrollbars, in-cell editor and context menu.
 * MacTuxel supplies its own ribbon, formula bar, sheet tabs and status bar.
 */
export function createSpreadsheet(container: HTMLElement, options: CreateSpreadsheetOptions): SpreadsheetHandle {
  const { univer, univerAPI } = createUniver({
    locale: LocaleType.EN_US,
    locales: { [LocaleType.EN_US]: mergeLocales(sheetsCoreEnUS) },
    darkMode: options.darkMode,
    presets: [
      UniverSheetsCorePreset({
        container,
        header: false,
        toolbar: false,
        formulaBar: false,
        footer: false,
        contextMenu: true,
      }),
    ],
  });

  univerAPI.createWorkbook(options.workbook ?? createBlankWorkbook());

  return {
    api: univerAPI,
    load(data) {
      const current = univerAPI.getActiveWorkbook();
      const next = univerAPI.createWorkbook(data);
      if (current && current.getId() !== next.getId()) {
        univerAPI.disposeUnit(current.getId());
      }
    },
    snapshot() {
      return univerAPI.getActiveWorkbook()?.save() ?? null;
    },
    setDarkMode(dark) {
      if (univerAPI.isDarkMode() !== dark) univerAPI.toggleDarkMode(dark);
    },
    dispose() {
      univer.dispose();
    },
  };
}
