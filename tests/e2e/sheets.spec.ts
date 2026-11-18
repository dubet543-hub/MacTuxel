import { expect, test, type Page } from "@playwright/test";
import { cell, openApp, openTab, seed, state } from "./helpers";

const tabs = (page: Page) => page.getByTestId("sheet-tabs").getByRole("tab");
const names = (page: Page) => state(page).then((s) => s.sheets.map((x) => x.name));
const tab = (page: Page, name: string) => page.getByTestId("sheet-tabs").getByRole("tab", { name, exact: true });

test("add, switch, rename, duplicate, move and delete worksheets", async ({ page }) => {
  const errors = await openApp(page);
  await seed(page, "A1", [["first sheet"]]);

  // Add
  await page.getByTestId("add-sheet").click();
  await expect(tabs(page)).toHaveCount(2);
  await expect.poll(() => names(page)).toEqual(["Sheet1", "Sheet2"]);
  await expect(tab(page, "Sheet2")).toHaveAttribute("aria-selected", "true");
  expect((await cell(page, "A1")).value).toBeNull(); // new sheet is blank

  // Switch
  await tab(page, "Sheet1").click();
  await expect(tab(page, "Sheet1")).toHaveAttribute("aria-selected", "true");
  expect((await cell(page, "A1")).value).toBe("first sheet");

  // Rename inline (double-click), with validation
  await tab(page, "Sheet1").dblclick();
  const input = page.getByRole("textbox", { name: "Sheet name" });
  await input.fill("Sheet2");
  await input.press("Enter");
  await expect(page.getByRole("alert")).toContainText("already exists");
  await input.fill("Bad/Name");
  await input.press("Enter");
  await expect(page.getByRole("alert")).toContainText("can't contain");
  await input.fill("Budget");
  await input.press("Enter");
  await expect.poll(() => names(page)).toEqual(["Budget", "Sheet2"]);

  // Duplicate via context menu
  await tab(page, "Budget").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Duplicate" }).click();
  await expect.poll(() => names(page)).toEqual(["Budget", "Budget (2)", "Sheet2"]);
  await expect(tab(page, "Budget (2)")).toHaveAttribute("aria-selected", "true");
  expect((await cell(page, "A1")).value).toBe("first sheet"); // contents copied

  // Move right / left
  await tab(page, "Budget (2)").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Move Right" }).click();
  await expect.poll(() => names(page)).toEqual(["Budget", "Sheet2", "Budget (2)"]);
  await tab(page, "Budget (2)").click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: "Move Right" })).toHaveAttribute("aria-disabled", "true");
  await page.getByRole("menuitem", { name: "Move Left" }).click();
  await page.getByTestId("sheet-actions").click();
  await page.getByRole("menuitem", { name: "Move Left" }).click();
  await expect.poll(() => names(page)).toEqual(["Budget (2)", "Budget", "Sheet2"]);

  // Tab color
  await tab(page, "Sheet2").click({ button: "right" });
  await page.locator('.palette__swatch[data-color="#0284c7"]').click();
  await expect.poll(() => state(page).then((s) => s.sheets.find((x) => x.name === "Sheet2")?.color)).toBe("#0284c7");

  // Delete (confirm dialog), then guard on the last sheet
  await tab(page, "Sheet2").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("dialog", { name: "Delete Sheet" }).getByRole("button", { name: "Delete" }).click();
  await expect.poll(() => names(page)).toEqual(["Budget (2)", "Budget"]);

  await tab(page, "Budget").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("dialog", { name: "Delete Sheet" }).getByRole("button", { name: "Delete" }).click();
  await expect.poll(() => names(page)).toEqual(["Budget (2)"]);
  await tab(page, "Budget (2)").click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: "Delete" })).toHaveAttribute("aria-disabled", "true");
  await page.keyboard.press("Escape");
  expect(errors).toEqual([]);
});

test("rename from Page Layout uses a validated dialog; cancel keeps the name", async ({ page }) => {
  await openApp(page);
  await openTab(page, "Page Layout");
  await page.getByTestId("pl-rename").click();
  const dialog = page.getByRole("dialog", { name: "Rename Sheet" });
  await dialog.getByRole("textbox").fill("   ");
  await dialog.getByRole("button", { name: "Rename" }).click();
  await expect(dialog.getByRole("alert")).toContainText("can't be blank");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect.poll(() => names(page)).toEqual(["Sheet1"]);

  await page.getByTestId("pl-rename").click();
  await dialog.getByRole("textbox").fill("Q4 Plan");
  await dialog.getByRole("textbox").press("Enter");
  await expect.poll(() => names(page)).toEqual(["Q4 Plan"]);
});

test("drag a tab to reorder", async ({ page }) => {
  await openApp(page);
  await page.getByTestId("add-sheet").click();
  await page.getByTestId("add-sheet").click();
  await expect.poll(() => names(page)).toEqual(["Sheet1", "Sheet2", "Sheet3"]);
  await tab(page, "Sheet3").dragTo(tab(page, "Sheet1"));
  await expect.poll(() => names(page)).toEqual(["Sheet3", "Sheet1", "Sheet2"]);
});

test("Insert ribbon adds a sheet after the current one; undo restores", async ({ page }) => {
  await openApp(page);
  await openTab(page, "Insert");
  await page.getByTestId("ins-sheet").click();
  await expect.poll(() => names(page)).toEqual(["Sheet1", "Sheet2"]);
  await page.getByTestId("qat-undo").click();
  await expect.poll(() => names(page)).toEqual(["Sheet1"]);
});
