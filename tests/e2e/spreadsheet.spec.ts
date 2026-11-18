import { expect, test } from "@playwright/test";
import { cell, clickCell, openApp, openTab, typeAndCommit } from "./helpers";

test("window shell shows MacTuxel branding", async ({ page }) => {
  const errors = await openApp(page);
  await expect(page).toHaveTitle("MacTuxel");
  await expect(page.locator(".titlebar__app")).toHaveText("MacTuxel");
  await expect(page.getByTestId("document-name")).toHaveText("Untitled");
  expect(errors).toEqual([]);
});

test("text, numbers and formulas typed into the grid", async ({ page }) => {
  const errors = await openApp(page);

  await clickCell(page, 0, 0); // A1
  await typeAndCommit(page, "Revenue"); // A1
  await typeAndCommit(page, "42"); // A2
  await typeAndCommit(page, "58"); // A3
  await typeAndCommit(page, "=A2+A3"); // A4
  await typeAndCommit(page, "=SUM(A2:A3)*2"); // A5
  await typeAndCommit(page, "-3.5"); // A6
  await typeAndCommit(page, "=AVERAGE(A2,A3)"); // A7

  await expect.poll(() => cell(page, "A5").then((c) => c.value)).toBe(200);

  expect(await cell(page, "A1")).toMatchObject({ value: "Revenue", type: 1 });
  expect(await cell(page, "A2")).toMatchObject({ value: 42, type: 2 });
  expect(await cell(page, "A3")).toMatchObject({ value: 58, type: 2 });
  expect(await cell(page, "A4")).toMatchObject({ value: 100, formula: "=A2+A3" });
  expect(await cell(page, "A5")).toMatchObject({ value: 200, formula: "=SUM(A2:A3)*2" });
  expect(await cell(page, "A6")).toMatchObject({ value: -3.5, type: 2 });
  expect(await cell(page, "A7")).toMatchObject({ value: 50, formula: "=AVERAGE(A2,A3)" });

  // Editing an input recalculates dependents.
  await clickCell(page, 0, 1); // A2
  await typeAndCommit(page, "10");
  await expect.poll(() => cell(page, "A4").then((c) => c.value)).toBe(68);
  expect((await cell(page, "A5")).value).toBe(136);

  // Text in another column, and a cross-column formula.
  await clickCell(page, 1, 0); // B1
  await typeAndCommit(page, "Tax");
  await typeAndCommit(page, "=A4*0.1"); // B2
  await expect.poll(() => cell(page, "B2").then((c) => c.value)).toBeCloseTo(6.8);

  await expect(page.getByTestId("dirty-indicator")).toBeVisible();
  await expect(page).toHaveTitle("Untitled — Edited — MacTuxel");
  expect(errors).toEqual([]);
});

test("invalid formula yields a spreadsheet error, not a crash", async ({ page }) => {
  const errors = await openApp(page);
  await clickCell(page, 2, 0); // C1
  await typeAndCommit(page, "=1/0");
  await expect.poll(() => cell(page, "C1").then((c) => c.value)).toBe("#DIV/0!");
  expect(errors).toEqual([]);
});

test("light and dark appearance", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  const errors = await openApp(page);
  const isDark = () => page.evaluate(() => window.__MACTUXEL__!.api.isDarkMode());
  const theme = () => page.evaluate(() => document.documentElement.dataset.theme);

  // Auto follows the system setting.
  expect(await theme()).toBe("light");
  expect(await isDark()).toBe(false);
  await page.emulateMedia({ colorScheme: "dark" });
  await expect.poll(theme).toBe("dark");
  await expect.poll(isDark).toBe(true);

  // Explicit choices (View ▸ Appearance) override the system and persist across reloads.
  await openTab(page, "View");
  await page.getByRole("radio", { name: "Light" }).click();
  await expect.poll(theme).toBe("light");
  await expect.poll(isDark).toBe(false);

  await page.getByRole("radio", { name: "Dark" }).click();
  await expect.poll(isDark).toBe(true);
  await page.reload();
  await page.waitForFunction(() => window.__MACTUXEL__?.getState().ready === true);
  await openTab(page, "View");
  await expect(page.getByRole("radio", { name: "Dark" })).toHaveAttribute("aria-checked", "true");
  expect(await isDark()).toBe(true);

  // Title-bar button cycles Dark → Auto → Light.
  await page.emulateMedia({ colorScheme: "light" });
  await page.getByTestId("theme-cycle").click();
  await expect.poll(theme).toBe("light"); // Auto, system is light
  await page.getByTestId("theme-cycle").click();
  await expect(page.getByRole("radio", { name: "Light" })).toHaveAttribute("aria-checked", "true");
  await page.getByTestId("theme-cycle").click();
  await expect.poll(isDark).toBe(true);
  expect(errors).toEqual([]);
});

test("New discards the workbook after confirmation", async ({ page }) => {
  const errors = await openApp(page);
  await clickCell(page, 0, 0);
  await typeAndCommit(page, "temp");
  await expect(page.getByTestId("dirty-indicator")).toBeVisible();

  // Unsaved changes: the Mac-style Save / Don't Save / Cancel sheet appears.
  await page.getByRole("button", { name: "New", exact: true }).click();
  const ask = page.getByRole("dialog", { name: /Do you want to save the changes/ });
  await expect(ask).toBeVisible();
  await ask.getByRole("button", { name: "Cancel" }).click();
  expect((await cell(page, "A1")).value).toBe("temp"); // Cancel keeps the workbook
  await page.getByRole("button", { name: "New", exact: true }).click();
  await page.getByTestId("dont-save").click();
  await expect(page.getByTestId("dirty-indicator")).toHaveCount(0);
  expect((await cell(page, "A1")).value).toBeNull();

  // The new workbook is still editable.
  await clickCell(page, 0, 0);
  await typeAndCommit(page, "=2+3");
  await expect.poll(() => cell(page, "A1").then((c) => c.value)).toBe(5);
  expect(errors).toEqual([]);
});
