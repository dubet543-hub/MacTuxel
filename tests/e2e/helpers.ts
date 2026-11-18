import { expect, type Page } from "@playwright/test";

/** Univer's default sheet geometry (px). */
export const ROW_HEADER_WIDTH = 46;
export const COLUMN_HEADER_HEIGHT = 20;
export const COLUMN_WIDTH = 88;
export const ROW_HEIGHT = 24;

export const GRID = 'canvas[id^="univer-sheet-main-canvas"]';

/** Loads the app and collects page errors / console errors for later assertions. */
export async function openApp(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto("/");
  await page.waitForFunction(() => window.__MACTUXEL__?.getState().ready === true);
  await expect(page.locator(GRID)).toBeVisible();
  return errors;
}

export async function cellPoint(page: Page, col: number, row: number) {
  const box = await page.locator(GRID).boundingBox();
  if (!box) throw new Error("grid canvas not found");
  return {
    x: box.x + ROW_HEADER_WIDTH + COLUMN_WIDTH * col + COLUMN_WIDTH / 2,
    y: box.y + COLUMN_HEADER_HEIGHT + ROW_HEIGHT * row + ROW_HEIGHT / 2,
  };
}

/** Click the centre of a cell on the grid canvas (0-based column/row). */
export async function clickCell(page: Page, col: number, row: number) {
  const p = await cellPoint(page, col, row);
  await page.mouse.click(p.x, p.y);
}

/** Drag-select from one cell to another. */
export async function dragSelect(page: Page, from: [number, number], to: [number, number]) {
  const a = await cellPoint(page, ...from);
  const b = await cellPoint(page, ...to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await page.mouse.up();
}

/** Type into the selected cell and commit with Enter, as a user would. */
export async function typeAndCommit(page: Page, text: string) {
  await page.keyboard.type(text, { delay: 15 });
  await page.keyboard.press("Enter");
}

export function cell(page: Page, a1: string) {
  return page.evaluate((ref) => {
    const range = window.__MACTUXEL__!.api.getActiveWorkbook()!.getActiveSheet().getRange(ref);
    // Raw stored data: getCellData()/getValue() return display text for number-formatted cells.
    const data = range.getCellDataGrid()[0]?.[0] ?? null;
    return {
      value: range.getRawValue() ?? null, // undefined for empty cells
      display: range.getDisplayValue(),
      formula: data?.f ?? null,
      type: data?.t ?? null,
      style: range.getCellStyleData(),
      format: range.getNumberFormat(),
    };
  }, a1);
}

/** Set values directly through the engine (test setup only). */
export function seed(page: Page, a1: string, values: (string | number)[][]) {
  return page.evaluate(
    ([ref, vals]) => {
      window.__MACTUXEL__!.api.getActiveWorkbook()!.getActiveSheet().getRange(ref).setValues(vals);
    },
    [a1, values] as const,
  );
}

export function select(page: Page, a1: string) {
  return page.evaluate((ref) => {
    window.__MACTUXEL__!.api.getActiveWorkbook()!.getActiveSheet().getRange(ref).activate();
  }, a1);
}

export function state(page: Page) {
  return page.evaluate(() => window.__MACTUXEL__!.getState());
}

export function openTab(page: Page, name: string) {
  return page.getByRole("tab", { name, exact: true }).click();
}

/** ⌘ on macOS. Playwright's WebKit reports metaKey for "Meta". */
export const CMD = "Meta";
