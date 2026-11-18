# MacTuxel

An offline-first spreadsheet editor for Apple Silicon Macs (M1–M5, arm64).

- **Bundle ID:** `com.tushar.mactuxel`
- **Developer:** Tushar
- **Minimum macOS:** 12.0 (Monterey)

## Stack

| Layer | Package | Version |
|---|---|---|
| Desktop shell | Tauri (`tauri` crate / `@tauri-apps/cli`) | 2.11 |
| Native plugins | `tauri-plugin-dialog` 2.7, `tauri-plugin-fs` 2.5 | npm bindings pinned to the same minor |
| Backend | Rust (edition 2024) | stable |
| UI | React 19 + TypeScript 6 + Vite 8 | |
| Spreadsheet | Univer Sheets core preset (`@univerjs/presets`, `@univerjs/preset-sheets-core`) | 1.5.2 (pinned; all Univer packages must match) |
| Excel I/O | SheetJS Community Edition | 0.20.3 (from `cdn.sheetjs.com`, not the stale npm 0.18.5) |
| Icons | Lucide (`lucide-react`, ISC) | 1.73 |
| Tests | Vitest 5, Playwright 1.65 (WebKit) | |

## Getting started

```sh
npm install
npm run app:dev        # launches the MacTuxel desktop window (Vite + Tauri)
```

Rust must be on your `PATH` (`. "$HOME/.cargo/env"` or open a new terminal after installing rustup).

## Scripts

| Script | What it does |
|---|---|
| `npm run app:dev` | Run the desktop app with hot reload |
| `npm run app:build` | Build `MacTuxel.app` + `.dmg` for `aarch64-apple-darwin` |
| `npm run dev` | Frontend only in the browser (file Open/Save disabled) |
| `npm run typecheck` | TypeScript check |
| `npm test` | Vitest unit tests |
| `npm run test:e2e` | Playwright tests in WebKit against the dev server |
| `npm run test:rust` | Rust unit tests |
| `npm run test:all` | All of the above |

## Project layout

```
src/
  app/                      App shell and app-level logic
    App.tsx                 Layout: title bar, ribbon, formula bar, grid, sheet tabs, status bar
    useDocument.ts          New / Open / Save, dirty tracking, window title
    useGlobalShortcuts.ts   MacTuxel shortcuts (only ones the grid engine doesn't already bind)
    useSheetActions.ts      Worksheet actions with their dialogs (shared by tabs, menus, ribbon)
    CommandRunner.tsx       Runs UI commands, reports failures in the status bar
    FormulaBarBridge.tsx    Lets ribbon commands start a formula in the formula bar
    shortcuts.ts            Help ▸ Keyboard Shortcuts content
  components/
    titlebar/               Unified title bar: logo, quick access toolbar, document title, drag region
    ribbon/                 Ribbon, RibbonGroup (auto-collapses when narrow), RibbonButton, controls
      tabs/                 Home, Insert, Page Layout, Formulas, Data, Review, View, Help
    formulabar/             Name Box + formula bar (live-synced with in-cell editing)
    sheettabs/              Worksheet tabs: add, rename, duplicate, move, drag-reorder, color, delete
    statusbar/              Mode, Average / Count / Sum, zoom slider
    dialogs/                About, Keyboard Shortcuts, Function Reference, Workbook Statistics
    ui/                     Tooltip layer, Popover, Menu, ColorPalette, Dialog + DialogProvider
  spreadsheet/
    SheetController.ts      The single facade between UI and the Univer engine (operations + state)
    SheetContext.tsx        React context + useSheetState (useSyncExternalStore)
    createSpreadsheet.ts    Mounts Univer as a bare grid (its own chrome is turned off)
    autoSum, cellRefs, cellInput, selectionStats, sheetNames, numberFormats, functionCatalog
                            Pure helpers, unit tested
  io/                       SheetJS ⇄ Univer conversion, native file dialogs
  theme/                    Light / Dark / Auto preference, system sync
  platform/tauri.ts         Guarded Tauri calls (no-ops in a plain browser)
src-tauri/
  src/lib.rs, commands.rs   App builder, plugins, `app_info`
  src/edit_actions.rs       Native Edit ▸ Paste for the ribbon Paste button
  tauri.conf.json           Overlay title bar, bundle ID, CSP, macOS bundle settings
  capabilities/default.json Least-privilege permissions
tests/unit/                 Vitest
tests/e2e/                  Playwright (WebKit): editor, interface, Home ribbon, sheets, other tabs
```

## Interface

- **Title bar** (native overlay with traffic lights): logo, quick access toolbar (New, Open, Save, Undo, Redo), document title with "— Edited", appearance toggle. Drag to move; double-click to zoom.
- **Ribbon**: Home, Insert, Page Layout, Formulas, Data, Review, View, Help. Every enabled button runs a real spreadsheet operation; features not built yet are shown disabled with a tooltip saying so. Double-click a tab to hide the ribbon. In narrow windows, groups collapse from the right into dropdown buttons.
- **Home**: Clipboard, Font, Alignment, Number, Styles, Cells, Editing groups.
- **Name Box & formula bar**: shows the active cell and its formula; type a reference (e.g. `C7`, `A1:D10`) to jump; edit in the bar and press Return.
- **Sheet tabs**: add, switch, rename (double-click), right-click for duplicate / move / tab color / delete, drag to reorder.
- **Status bar**: Average, Count and Sum of the selection; zoom 10–400%.
- **Light, Dark, Auto** appearance for the whole window, including the grid.

## Files

| | |
|---|---|
| **Open** | `.xlsx`, `.xlsm` (opened as a copy), `.xls` (Excel 97–2004), `.ods`, `.csv`, `.tsv` — ⌘O, File ▸ Open Recent, or drag a file onto the window |
| **Save** | `.xlsx` — ⌘S saves in place; ⇧⌘S Save As (native panel). Files opened from `.xls`/`.xlsm`/`.ods`/`.csv` are saved as a new `.xlsx`. |
| **Export** | File ▸ Export as CSV… — the current sheet's displayed values, UTF-8 with BOM |
| **Unsaved changes** | "— Edited" in the title, the dot in the window's close button, and Save / Don't Save / Cancel before New, Open, closing the window or quitting (⌘Q, Dock ▸ Quit) |
| **Recovery** | While a document has unsaved changes, a snapshot is written about 2 s after each edit (at most 20 s apart) to `~/Library/Application Support/com.tushar.mactuxel/recovery/`. After a crash, MacTuxel offers to restore it. Saving or choosing Don't Save removes it. |

Everything works offline; file access is limited to files you pick, drop or reopen from the recent list.

## Excel compatibility

MacTuxel's compatibility with Excel is **not perfect**. What it reads and writes:

| Kept | Notes |
|---|---|
| Values, formulas (incl. shared formulas), cached results, errors | Formulas are recalculated by MacTuxel's engine |
| Multiple worksheets, names, order, hidden sheets | |
| Number formats, dates (1900 and 1904 date systems) | Date formats are written as explicit codes, so they don't change with the reader's locale |
| Fonts (name, size, bold, italic, underline/double, strikethrough, colour), fills, borders (13 styles + colour), alignment, wrap, rotation | Theme and indexed colours are resolved to RGB |
| Merged cells, column widths, row heights, hidden rows/columns, default sizes | Excel units: 7 px per character width, points for heights |
| Frozen panes, tab colours, gridlines on/off, zoom | |

Not kept — MacTuxel lists these when you open a file (banner + File ▸ Compatibility Report) and **warns before saving**:
charts, pictures, shapes, PivotTables, Excel tables (become ranges), comments/notes, macros, conditional formatting, data validation, hyperlinks, filters, sheet/workbook protection, named ranges, print settings, sparklines, slicers, external links, data connections, form controls, grouped rows/columns, rich text within a cell (simplified), patterned/gradient fills (shown solid), diagonal borders, indent, shrink-to-fit. Legacy `.xls`/`.ods` imports keep values, formulas, number formats, merges and sizes, but not fonts, colours or borders.

### How it works

SheetJS Community Edition reads and writes values, formulas, merges and sheet structure. Its free edition can't write cell formatting, so MacTuxel adds a small OOXML layer (`src/io/ooxml`) that reads/writes `styles.xml`, theme colours and per-sheet layout (sizes, panes, tab colour, gridlines, zoom) inside the `.xlsx` zip (via `fflate`).

### Verification

`tests/unit/xlsxCompat.test.ts` and `tests/e2e/files.spec.ts` check files written by MacTuxel with **ExcelJS** — an independent XLSX implementation, used only in tests — and with SheetJS, and import files **authored by ExcelJS**. `tests/fixtures/legacy-formulas.xls` was generated with Python **xlwt 1.3.0** (a separate BIFF8 writer) because SheetJS CE can't write formulas into `.xls`.
