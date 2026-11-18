import { expect, test } from "@playwright/test";
import { FUNCTION_CATALOG } from "../../src/spreadsheet/functionCatalog";
import { cell, clickCell, openApp, openTab, seed, select, state } from "./helpers";

test("every function in the catalog evaluates in the engine", async ({ page }) => {
  await openApp(page);
  const results = await page.evaluate(async (items) => {
    const s = window.__MACTUXEL__!.api.getActiveWorkbook()!.getActiveSheet();
    items.forEach((it, i) => {
      it.fixture?.forEach((v, r) => s.getRange(r, 25).setValue(v)); // Z column
      s.getRange(i, 0).setValue(it.example);
      // Fixtures are per-example; recompute after each so later ones don't clobber earlier.
    });
    await new Promise((r) => setTimeout(r, 1500));
    return items.map((it, i) => {
      const d = s.getRange(i, 0).getCellData();
      return { name: it.name, v: d?.v ?? null, t: d?.t ?? null };
    });
  }, FUNCTION_CATALOG.filter((f) => !f.fixture).map((f) => ({ name: f.name, example: f.example, fixture: f.fixture })));

  for (const r of results) {
    const expected = FUNCTION_CATALOG.find((f) => f.name === r.name)!.expected;
    if (typeof expected === "boolean") {
      expect.soft({ name: r.name, v: r.v, t: r.t }).toEqual({ name: r.name, v: expected ? 1 : 0, t: 3 });
    } else if (typeof expected === "number") {
      expect.soft(r.v, r.name).toBeCloseTo(expected, 6);
    } else {
      expect.soft(r.v, r.name).toBe(expected);
    }
  }

  // Criteria functions need real ranges; each gets its own fixture.
  for (const fn of FUNCTION_CATALOG.filter((f) => f.fixture)) {
    const v = await page.evaluate(async (it) => {
      const s = window.__MACTUXEL__!.api.getActiveWorkbook()!.getActiveSheet();
      it.fixture!.forEach((val, r) => s.getRange(r, 25).setValue(val));
      s.getRange(60, 0).setValue(it.example);
      await new Promise((r) => setTimeout(r, 600));
      return s.getRange(60, 0).getValue();
    }, fn);
    expect.soft(v, fn.name).toBe(fn.expected);
  }
});

test("Formulas ▸ function menus start a formula in the formula bar", async ({ page }) => {
  const errors = await openApp(page);
  await seed(page, "A1:A3", [[4], [5], [6]]);
  await clickCell(page, 0, 3); // A4
  await openTab(page, "Formulas");
  await page.getByTestId("fn-Statistical").click();
  await page.getByRole("menuitem", { name: "AVERAGE" }).click();
  const input = page.getByTestId("formula-input");
  await expect(input).toBeFocused();
  await expect(input).toHaveValue("=AVERAGE(");
  await page.keyboard.type("A1:A3)");
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await cell(page, "A4")).value).toBe(5);

  // fx button in the formula bar offers the same catalog.
  await clickCell(page, 1, 0);
  await page.getByTestId("fx-button").click();
  await page.getByRole("menuitem", { name: "LEN" }).click();
  await expect(input).toHaveValue("=LEN(");
  await expect(input).toBeFocused();
  await page.keyboard.type('"abc")');
  await page.keyboard.press("Enter");
  await expect.poll(async () => JSON.stringify(await cell(page, "B1"))).toContain("\"value\":3,");

  // Calculate Now
  await page.getByTestId("fx-calc").click();
  expect(errors).toEqual([]);
});

test("View ▸ freeze panes and gridlines", async ({ page }) => {
  const errors = await openApp(page);
  await openTab(page, "View");
  const freeze = page.getByTestId("view-freeze");

  await freeze.click();
  await page.getByRole("menuitem", { name: "Freeze Top Row" }).click();
  await expect.poll(() => state(page).then((s) => s.frozen)).toEqual({ rows: 1, cols: 0 });
  await expect(freeze).toHaveAttribute("aria-pressed", "true");

  await select(page, "C4");
  await freeze.click();
  await page.getByRole("menuitem", { name: /^Freeze Panes/ }).click();
  await expect.poll(() => state(page).then((s) => s.frozen)).toEqual({ rows: 3, cols: 2 });

  await freeze.click();
  await page.getByRole("menuitem", { name: "Unfreeze Panes" }).click();
  await expect.poll(() => state(page).then((s) => s.frozen)).toEqual({ rows: 0, cols: 0 });

  const gridlines = page.getByTestId("view-gridlines");
  await gridlines.click();
  await expect(gridlines).toHaveAttribute("aria-pressed", "false");
  expect(await page.evaluate(() => window.__MACTUXEL__!.api.getActiveWorkbook()!.getActiveSheet().hasHiddenGridLines())).toBe(true);
  await gridlines.click();
  await expect(gridlines).toHaveAttribute("aria-pressed", "true");
  expect(errors).toEqual([]);
});

test("Data ▸ Text to Columns splits delimited text", async ({ page }) => {
  const errors = await openApp(page);
  await seed(page, "A1:A2", [["red,green,blue"], ["1,2,3"]]);
  await select(page, "A1:A2");
  await openTab(page, "Data");
  await page.getByTestId("data-text-to-columns").click();
  await expect.poll(async () => [(await cell(page, "A1")).value, (await cell(page, "B1")).value, (await cell(page, "C1")).value]).toEqual(["red", "green", "blue"]);
  expect((await cell(page, "C2")).value).toBe(3);
  // File import is desktop-only and says so.
  await expect(page.getByRole("button", { name: "From Text/CSV" })).toHaveAttribute("aria-disabled", "true");
  expect(errors).toEqual([]);
});

test("Insert ▸ rows and columns; Page Layout ▸ gridlines toggle", async ({ page }) => {
  const errors = await openApp(page);
  await seed(page, "A1:B1", [["a", "b"]]);
  await select(page, "A1");
  await openTab(page, "Insert");
  await page.getByTestId("ins-rows").click();
  await expect.poll(async () => (await cell(page, "A2")).value).toBe("a");
  await select(page, "A2"); // inserting rows selects the new row; pick one cell again
  await page.getByTestId("ins-cols").click();
  await expect.poll(async () => (await cell(page, "B2")).value).toBe("a");
  // Insert ▸ Function starts a formula.
  await page.getByTestId("ins-function").click();
  await expect(page.getByTestId("formula-input")).toHaveValue("=");
  await page.keyboard.press("Escape");

  await openTab(page, "Page Layout");
  await page.getByTestId("pl-gridlines").click();
  await expect(page.getByTestId("pl-gridlines")).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("button", { name: "Margins" })).toHaveAttribute("aria-disabled", "true");
  expect(errors).toEqual([]);
});

test("typing immediately after inserting a function is never scrambled", async ({ page }) => {
  await openApp(page);
  for (let i = 0; i < 5; i++) {
    await clickCell(page, 3, i);
    await page.getByTestId("fx-button").click();
    await page.getByRole("menuitem", { name: "LEN" }).click();
    await page.keyboard.type('"abcd")', { delay: 0 }); // no wait for focus/caret
    await page.keyboard.press("Enter");
    await expect.poll(async () => (await cell(page, `D${i + 1}`)).formula).toBe('=LEN("abcd")');
  }
});
