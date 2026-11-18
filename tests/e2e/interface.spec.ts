import { expect, test } from "@playwright/test";
import { CMD, GRID, cell, clickCell, dragSelect, openApp, openTab, seed, select, state, typeAndCommit } from "./helpers";

const TABS = ["File", "Home", "Insert", "Page Layout", "Formulas", "Data", "Review", "View", "Help"];

test("all interface areas are present", async ({ page }) => {
  const errors = await openApp(page);
  await expect(page.locator(".titlebar")).toBeVisible();
  await expect(page.getByRole("toolbar", { name: "Quick Access Toolbar" })).toBeVisible();
  for (const name of ["New", "Undo", "Redo"]) await expect(page.getByRole("toolbar").getByRole("button", { name, exact: true })).toBeVisible();
  await expect(page.getByRole("tablist", { name: "Ribbon" }).getByRole("tab")).toHaveText(TABS);
  await expect(page.getByTestId("name-box")).toHaveValue("A1");
  await expect(page.getByTestId("formula-input")).toBeVisible();
  await expect(page.locator(GRID)).toBeVisible();
  await expect(page.getByTestId("sheet-tabs").getByRole("tab", { name: "Sheet1" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("zoom-value")).toHaveText("100%");
  // Univer still draws the grid's own scrollbars and headers on the canvas.
  expect(errors).toEqual([]);
});

test("every ribbon tab renders; unavailable commands are visibly disabled with a reason", async ({ page }) => {
  const errors = await openApp(page);
  for (const name of TABS) {
    await openTab(page, name);
    await expect(page.getByRole("tab", { name, exact: true })).toHaveAttribute("aria-selected", "true");
    const groups = page.locator("#ribbon-panel .rg");
    expect(await groups.count()).toBeGreaterThan(0);
  }
  await openTab(page, "Home");
  const sortFilter = page.getByRole("button", { name: "Sort & Filter" });
  await expect(sortFilter).toHaveAttribute("aria-disabled", "true");
  await expect(sortFilter).toHaveAttribute("data-tip-desc", /isn't included/);
  // Clicking a disabled command does nothing (no error, no state change).
  const before = await page.evaluate(() => JSON.stringify(window.__MACTUXEL__!.snapshot()));
  await sortFilter.click({ force: true });
  expect(await page.evaluate(() => JSON.stringify(window.__MACTUXEL__!.snapshot()))).toBe(before);
  expect(errors).toEqual([]);
});

test("ribbon can be collapsed and restored", async ({ page }) => {
  await openApp(page);
  await page.getByRole("tab", { name: "Home" }).dblclick();
  await expect(page.locator("#ribbon-panel")).toHaveCount(0);
  await page.getByRole("button", { name: "Show ribbon" }).click();
  await expect(page.locator("#ribbon-panel")).toBeVisible();
});

test("selection changes update the Name Box, formula bar and status bar", async ({ page }) => {
  const errors = await openApp(page);
  await seed(page, "B2:D4", [
    [1, 2, 3],
    [4, "text", 6],
    [7, 8, 9],
  ]);
  await seed(page, "E2", [["=SUM(B2:D2)"]]);

  await clickCell(page, 2, 2); // C3
  await expect(page.getByTestId("name-box")).toHaveValue("C3");
  await expect(page.getByTestId("formula-input")).toHaveValue("text");

  await clickCell(page, 4, 1); // E2
  await expect(page.getByTestId("name-box")).toHaveValue("E2");
  await expect(page.getByTestId("formula-input")).toHaveValue("=SUM(B2:D2)");

  // A single cell shows no aggregate.
  await expect(page.getByTestId("stat-sum")).toHaveCount(0);

  await dragSelect(page, [1, 1], [3, 3]); // B2:D4
  await expect(page.getByTestId("name-box")).toHaveValue("B2");
  await expect(page.getByTestId("stat-sum")).toHaveText("40");
  await expect(page.getByTestId("stat-count")).toHaveText("9");
  await expect(page.getByTestId("stat-average")).toHaveText("5");
  expect((await state(page)).selectionLabel).toBe("B2:D4");
  expect(errors).toEqual([]);
});

test("keyboard navigation in the grid", async ({ page }) => {
  const errors = await openApp(page);
  const nameBox = page.getByTestId("name-box");
  await clickCell(page, 1, 1); // B2
  await expect(nameBox).toHaveValue("B2");

  await page.keyboard.press("ArrowRight");
  await expect(nameBox).toHaveValue("C2");
  await page.keyboard.press("ArrowDown");
  await expect(nameBox).toHaveValue("C3");
  await page.keyboard.press("ArrowLeft");
  await expect(nameBox).toHaveValue("B3");
  await page.keyboard.press("ArrowUp");
  await expect(nameBox).toHaveValue("B2");

  await page.keyboard.press("Tab");
  await expect(nameBox).toHaveValue("C2");
  await page.keyboard.press("Shift+Tab");
  await expect(nameBox).toHaveValue("B2");

  await typeAndCommit(page, "x"); // Return commits and moves down
  await expect(nameBox).toHaveValue("B3");
  expect((await cell(page, "B2")).value).toBe("x");
  await page.keyboard.press("Shift+Enter");
  await expect(nameBox).toHaveValue("B2");

  // Shift+arrows extend the selection.
  await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.press("Shift+ArrowDown");
  await expect.poll(() => state(page).then((s) => s.selectionLabel)).toBe("B2:C3");

  // Escape cancels an in-progress edit.
  await clickCell(page, 3, 3); // D4
  await page.keyboard.type("draft");
  await expect(page.getByTestId("status-message")).toHaveText("Edit");
  await expect(page.getByTestId("formula-input")).toHaveValue("draft"); // live mirror while typing
  await page.keyboard.press("Escape");
  expect((await cell(page, "D4")).value).toBeNull();

  // Backspace clears contents.
  await clickCell(page, 1, 1);
  await page.keyboard.press("Backspace");
  await expect.poll(() => cell(page, "B2").then((c) => c.value)).toBeNull();

  // ⌘Z undoes.
  await page.keyboard.press(`${CMD}+z`);
  await expect.poll(() => cell(page, "B2").then((c) => c.value)).toBe("x");
  expect(errors).toEqual([]);
});

test("Name Box navigates and rejects bad references", async ({ page }) => {
  const errors = await openApp(page);
  const nameBox = page.getByTestId("name-box");
  await nameBox.click();
  await nameBox.fill("E10");
  await nameBox.press("Enter");
  await expect(nameBox).toHaveValue("E10");
  // Focus returned to the grid: typing edits E10.
  await typeAndCommit(page, "jumped");
  expect((await cell(page, "E10")).value).toBe("jumped");

  await nameBox.click();
  await nameBox.fill("b2:c4");
  await nameBox.press("Enter");
  await expect.poll(() => state(page).then((s) => s.selectionLabel)).toBe("B2:C4");

  await nameBox.click();
  await nameBox.fill("not a cell");
  await nameBox.press("Enter");
  await expect(nameBox).toHaveAttribute("aria-invalid", "true");
  await nameBox.press("Escape");
  await expect(nameBox).toHaveValue("B2");
  expect(errors).toEqual([]);
});

test("formula bar edits the active cell", async ({ page }) => {
  const errors = await openApp(page);
  await seed(page, "A1:A2", [[20], [22]]);
  await clickCell(page, 0, 2); // A3
  const input = page.getByTestId("formula-input");
  await input.click();
  await input.fill("=A1+A2");
  await input.press("Enter");
  await expect.poll(() => cell(page, "A3").then((c) => c.value)).toBe(42);
  await expect(input).toHaveValue("=A1+A2");

  // Focus went back to the grid: arrow keys move the selection again.
  await page.keyboard.press("ArrowDown");
  await expect(page.getByTestId("name-box")).toHaveValue("A4");

  // Number and text parsing; Escape cancels.
  await input.click();
  await input.fill("3.5");
  await input.press("Enter");
  expect(await cell(page, "A4")).toMatchObject({ value: 3.5, type: 2 });
  await input.click();
  await input.fill("discard me");
  await input.press("Escape");
  expect((await cell(page, "A4")).value).toBe(3.5);
  await expect(input).toHaveValue("3.5");

  // ✓ button commits.
  await input.click();
  await input.fill("hello");
  await page.getByRole("button", { name: "Enter", exact: true }).click();
  expect((await cell(page, "A4")).value).toBe("hello");
  expect(errors).toEqual([]);
});

test("zoom from status bar, View tab and shortcuts", async ({ page }) => {
  const errors = await openApp(page);
  const zoom = () => page.evaluate(() => window.__MACTUXEL__!.api.getActiveWorkbook()!.getActiveSheet().getZoom());
  await page.getByRole("button", { name: "Zoom In" }).first().click();
  await expect.poll(zoom).toBeCloseTo(1.1);
  await expect(page.getByTestId("zoom-value")).toHaveText("110%");
  await page.getByRole("button", { name: "Zoom Out" }).first().click();
  await page.getByRole("button", { name: "Zoom Out" }).first().click();
  await expect.poll(zoom).toBeCloseTo(0.9);

  await page.getByTestId("zoom-slider").fill("150");
  await expect.poll(zoom).toBeCloseTo(1.5);
  await page.getByTestId("zoom-value").click();
  await expect.poll(zoom).toBeCloseTo(1);

  await clickCell(page, 0, 0);
  await page.keyboard.press(`${CMD}+Equal`);
  await expect.poll(zoom).toBeCloseTo(1.1);
  await page.keyboard.press(`${CMD}+Digit0`);
  await expect.poll(zoom).toBeCloseTo(1);

  await openTab(page, "View");
  await page.getByTestId("view-zoom-out").click();
  await expect.poll(zoom).toBeCloseTo(0.9);
  await page.getByTestId("view-zoom-reset").click();
  await expect.poll(zoom).toBeCloseTo(1);
  expect(errors).toEqual([]);
});

test("window resizing keeps every command reachable", async ({ page }) => {
  const errors = await openApp(page);
  const overflow = () => page.evaluate(() => {
    const el = document.querySelector<HTMLElement>("#ribbon-panel")!;
    return el.scrollWidth - el.clientWidth;
  });

  for (const width of [1600, 1280, 1100, 900]) {
    await page.setViewportSize({ width, height: 700 });
    await expect.poll(overflow).toBeLessThanOrEqual(1);
    const grid = await page.locator(GRID).boundingBox();
    expect(grid!.width).toBeGreaterThan(width - 40); // grid follows the window
  }

  // At 900px the right-most groups collapse into dropdown buttons that still work.
  await seed(page, "A1:A2", [[5], [6]]);
  await select(page, "A3");
  const editing = page.getByTestId("group-Editing");
  await expect(editing).toBeVisible();
  await editing.click();
  await page.getByTestId("cmd-autosum").click();
  await expect.poll(() => cell(page, "A3").then((c) => c.value)).toBe(11);

  // Growing the window expands groups again.
  await page.setViewportSize({ width: 1600, height: 800 });
  await expect(page.getByTestId("group-Editing")).toHaveCount(0);
  await expect(page.getByTestId("cmd-autosum")).toBeVisible();
  expect(errors).toEqual([]);
});

test("Retina: grid canvas renders at device pixel ratio", async ({ browser }) => {
  const context = await browser.newContext({ deviceScaleFactor: 2, viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await openApp(page);
  const ratio = await page.evaluate((sel) => {
    const c = document.querySelector<HTMLCanvasElement>(sel)!;
    return c.width / c.getBoundingClientRect().width;
  }, GRID);
  expect(ratio).toBeCloseTo(2, 1);
  await context.close();
});

test("tooltips explain commands and shortcuts", async ({ page }) => {
  await openApp(page);
  await page.getByTestId("cmd-bold").hover();
  const tip = page.getByTestId("tooltip");
  await expect(tip).toContainText("Bold");
  await expect(tip).toContainText("⌘B");
  await page.getByRole("button", { name: "Conditional Formatting" }).hover();
  await expect(tip).toContainText("Conditional Formatting");
  await expect(tip).toContainText("isn't included");
});

test("Help dialogs open and close", async ({ page }) => {
  const errors = await openApp(page);
  await openTab(page, "Help");
  for (const [id, title] of [
    ["help-shortcuts", "Keyboard Shortcuts"],
    ["help-functions", "Function Reference"],
    ["help-about", "About MacTuxel"],
  ] as const) {
    await page.getByTestId(id).click();
    const dialog = page.getByRole("dialog", { name: title });
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test("Review ▸ Workbook Statistics counts real data", async ({ page }) => {
  await openApp(page);
  await seed(page, "A1:B2", [
    ["name", 1],
    ["=1+1", 2],
  ]);
  await openTab(page, "Review");
  await page.getByTestId("rv-stats").click();
  const stats = page.getByTestId("workbook-stats");
  await expect(stats).toContainText("Used range (current sheet)A1:B2");
  await expect(stats).toContainText("Formulas1");
  await expect(stats).toContainText("Numbers3");
  await expect(stats).toContainText("Text cells1");
});

test("quick access Undo and Redo", async ({ page }) => {
  await openApp(page);
  await clickCell(page, 0, 0);
  await typeAndCommit(page, "one");
  await page.getByTestId("qat-undo").click();
  await expect.poll(() => cell(page, "A1").then((c) => c.value)).toBeNull();
  await page.getByTestId("qat-redo").click();
  await expect.poll(() => cell(page, "A1").then((c) => c.value)).toBe("one");
});

test("number-formatted cells: formula bar shows the stored value, AutoSum includes them", async ({ page }) => {
  const errors = await openApp(page);
  await seed(page, "A1:A2", [[1500], [250.75]]);
  await select(page, "A1:A2");
  await page.getByTestId("cmd-currency").click();
  await clickCell(page, 0, 0);
  await expect(page.getByTestId("formula-input")).toHaveValue("1500"); // not "$1,500.00"

  // Committing from the formula bar keeps it a number.
  await page.getByTestId("formula-input").click();
  await page.getByTestId("formula-input").press("Enter");
  expect(await cell(page, "A1")).toMatchObject({ value: 1500, type: 2 });

  await select(page, "A3");
  await page.getByTestId("cmd-autosum").click();
  await expect.poll(() => cell(page, "A3").then((c) => c.value)).toBe(1750.75);
  expect((await cell(page, "A3")).formula).toBe("=SUM(A1:A2)");
  expect(errors).toEqual([]);
});
