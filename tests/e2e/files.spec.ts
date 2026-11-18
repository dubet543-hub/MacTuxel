import { expect, test, type Page } from "@playwright/test";
import ExcelJS from "exceljs";
import { read as sheetjsRead } from "xlsx";
import { readFileSync } from "node:fs";
import { CMD, cell, clickCell, openApp, openTab, seed, select, state, typeAndCommit } from "./helpers";

/**
 * Module 3 end-to-end tests. They use MacTuxel's dev-only in-memory file
 * backend (window.__MACTUXEL_TEST_FS__): the real Save/Open/Export code runs,
 * only the native panels are replaced by queued answers. The store survives
 * reloads (sessionStorage), so a reload is a full app restart.
 */

interface TestFs {
  files: Record<string, number[]>;
  openQueue: (string | null)[];
  saveQueue: (string | null)[];
  log: string[];
}

async function installFs(page: Page, files: Record<string, Uint8Array> = {}) {
  await page.addInitScript((initial: Record<string, number[]>) => {
    const saved = sessionStorage.getItem("mactuxel-test-fs");
    const fs = saved ? JSON.parse(saved) : { files: initial, openQueue: [], saveQueue: [], log: [] };
    window.__MACTUXEL_TEST_FS__ = fs;
    addEventListener("pagehide", () => sessionStorage.setItem("mactuxel-test-fs", JSON.stringify(fs)));
  }, Object.fromEntries(Object.entries(files).map(([k, v]) => [k, [...v]])));
}

const fs = (page: Page) => page.evaluate(() => window.__MACTUXEL_TEST_FS__ as TestFs);
const queueSave = (page: Page, path: string | null) => page.evaluate((p) => window.__MACTUXEL_TEST_FS__!.saveQueue.push(p), path);
const queueOpen = (page: Page, path: string | null) => page.evaluate((p) => window.__MACTUXEL_TEST_FS__!.openQueue.push(p), path);
const fileBytes = async (page: Page, path: string) => new Uint8Array((await fs(page)).files[path]);

async function restartApp(page: Page) {
  page.once("dialog", (d) => void d.accept()); // the browser's "leave page?" prompt, if any
  await page.reload();
  await page.waitForFunction(() => window.__MACTUXEL__?.getState().ready === true);
}

async function excelJs(bytes: Uint8Array) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes as unknown as ArrayBuffer);
  return wb;
}

test.describe("XLSX round trip through the app", () => {
  test("create, save, close, reopen — verified with independent readers", async ({ page }) => {
    await installFs(page);
    const errors = await openApp(page);

    // --- Create a workbook through the UI -------------------------------------------
    await clickCell(page, 0, 0);
    for (const v of ["Item", "Rent", "Power", "Total"]) await typeAndCommit(page, v);
    await clickCell(page, 1, 0);
    for (const v of ["Cost", "1500", "250.75", "=SUM(B2:B3)"]) await typeAndCommit(page, v);
    await clickCell(page, 2, 0);
    for (const v of ["Due", "=DATE(2026,3,14)"]) await typeAndCommit(page, v);

    await select(page, "A1:C1");
    await page.getByTestId("cmd-bold").click();
    await page.getByTestId("cmd-fill-menu").click();
    await page.locator('.palette__swatch[data-color="#bbf7d0"]').click();
    await page.getByTestId("cmd-align-center").click();
    await select(page, "B2:B4");
    await page.getByTestId("cmd-currency").click();
    await select(page, "C2");
    await page.getByRole("combobox", { name: "Number format" }).selectOption({ label: "Short Date" });
    await select(page, "A6:C6");
    await page.getByTestId("cmd-merge").click();
    await select(page, "A1");
    await page.getByTestId("cmd-format").click();
    await page.getByRole("menuitem", { name: "Column Width…" }).click();
    await page.getByRole("dialog", { name: "Column Width" }).getByRole("spinbutton").fill("150");
    await page.getByRole("dialog", { name: "Column Width" }).getByRole("spinbutton").press("Enter");
    await page.getByTestId("add-sheet").click(); // second worksheet
    await clickCell(page, 0, 0);
    await typeAndCommit(page, "Notes go here");
    await page.getByTestId("sheet-tabs").getByRole("tab", { name: "Sheet1" }).click();

    await expect(page.getByTestId("dirty-indicator")).toBeVisible();

    // --- ⌘S on an untitled workbook → Save As → file written ------------------------------
    await queueSave(page, "/mem/Budget.xlsx");
    await clickCell(page, 4, 9);
    await page.keyboard.press(`${CMD}+s`);
    await expect(page.getByTestId("document-name")).toHaveText("Budget.xlsx");
    await expect(page.getByTestId("dirty-indicator")).toHaveCount(0);
    expect((await fs(page)).log).toContain("pickSave:Untitled.xlsx:xlsx");

    // --- Independent verification of the saved bytes ----------------------------------
    const bytes = await fileBytes(page, "/mem/Budget.xlsx");
    const wb = await excelJs(bytes);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Sheet1", "Sheet2"]);
    const ws = wb.getWorksheet("Sheet1")!;
    expect(ws.getCell("A2").value).toBe("Rent");
    expect(ws.getCell("B2").value).toBe(1500);
    expect(ws.getCell("B4").formula).toBe("SUM(B2:B3)");
    expect(ws.getCell("B4").result).toBe(1750.75);
    expect(ws.getCell("B2").numFmt).toContain("$");
    expect(ws.getCell("C2").numFmt).toBe("m/d/yyyy");
    expect(ws.getCell("C2").formula).toBe("DATE(2026,3,14)");
    const due = ws.getCell("C2").result; // a formula cell: the date is its cached result
    expect(due instanceof Date ? due.toISOString().slice(0, 10) : due).toBe(due instanceof Date ? "2026-03-14" : 46095);
    expect(ws.getCell("A1").font?.bold).toBe(true);
    expect(ws.getCell("C1").fill).toMatchObject({ pattern: "solid", fgColor: { argb: "FFBBF7D0" } });
    expect(ws.getCell("B1").alignment?.horizontal).toBe("center");
    expect(ws.model.merges).toContain("A6:C6");
    expect(Math.round(ws.getColumn(1).width! * 7)).toBe(150);
    expect(wb.getWorksheet("Sheet2")!.getCell("A1").value).toBe("Notes go here");
    const sj = sheetjsRead(bytes, { type: "array", cellFormula: true });
    expect(sj.Sheets["Sheet1"]["B4"]).toMatchObject({ f: "SUM(B2:B3)", v: 1750.75 });

    // --- Close (full app restart), reopen with ⌘O -------------------------------------
    await restartApp(page);
    expect((await cell(page, "A2")).value).toBeNull(); // fresh, untitled workbook
    await queueOpen(page, "/mem/Budget.xlsx");
    await clickCell(page, 4, 9);
    await page.keyboard.press(`${CMD}+o`);
    await expect(page.getByTestId("document-name")).toHaveText("Budget.xlsx");

    expect(await cell(page, "A2")).toMatchObject({ value: "Rent" });
    expect(await cell(page, "B4")).toMatchObject({ value: 1750.75, formula: "=SUM(B2:B3)" });
    expect((await cell(page, "B2")).display.trim()).toBe("$1,500.00");
    expect((await cell(page, "C2")).display).toBe("3/14/2026");
    expect((await cell(page, "A1")).style).toMatchObject({ bl: 1, bg: { rgb: "#BBF7D0" }, ht: 2 });
    expect(await page.evaluate(() => window.__MACTUXEL__!.api.getActiveWorkbook()!.getActiveSheet().getRange("A6:C6").isMerged())).toBe(true);
    expect(await page.evaluate(() => window.__MACTUXEL__!.api.getActiveWorkbook()!.getActiveSheet().getColumnWidth(0))).toBe(150);
    expect((await state(page)).sheets.map((s) => s.name)).toEqual(["Sheet1", "Sheet2"]);
    // Opening doesn't count as an edit.
    await expect(page.getByTestId("dirty-indicator")).toHaveCount(0);

    // --- Edit and save in place (⌘S writes to the same file) ----------------------------
    // (Column A is now 150px wide, so go to B2 through the Name Box rather than by pixel.)
    await page.getByTestId("name-box").fill("B2");
    await page.getByTestId("name-box").press("Enter");
    await typeAndCommit(page, "1600");
    expect((await cell(page, "A2")).value).toBe("Rent");
    await expect(page.getByTestId("dirty-indicator")).toBeVisible();
    await page.keyboard.press(`${CMD}+s`);
    await expect(page.getByTestId("dirty-indicator")).toHaveCount(0);
    const resaved = await excelJs(await fileBytes(page, "/mem/Budget.xlsx"));
    expect(resaved.getWorksheet("Sheet1")!.getCell("B2").value).toBe(1600);
    expect(resaved.getWorksheet("Sheet1")!.getCell("B2").numFmt).toContain("$"); // formatting kept on re-save
    expect(errors).toEqual([]);
  });
});

test.describe("documents", () => {
  test("Save As writes a new file; Open Recent reopens and forgets missing files", async ({ page }) => {
    await installFs(page);
    await openApp(page);
    await seed(page, "A1", [["first"]]);
    await clickCell(page, 0, 1);
    await typeAndCommit(page, "edit");

    await queueSave(page, "/mem/One.xlsx");
    await page.keyboard.press(`${CMD}+Shift+s`);
    await expect(page.getByTestId("document-name")).toHaveText("One.xlsx");
    await queueSave(page, "/mem/Two"); // no extension → .xlsx is added
    await page.keyboard.press(`${CMD}+Shift+s`);
    await expect(page.getByTestId("document-name")).toHaveText("Two.xlsx");
    expect(Object.keys((await fs(page)).files).sort()).toEqual(["/mem/One.xlsx", "/mem/Two.xlsx"]);

    await restartApp(page);
    await openTab(page, "File");
    await page.getByTestId("file-recent").click();
    const items = page.getByRole("menu", { name: "Open Recent" }).getByRole("menuitem");
    await expect(items.nth(0)).toContainText("Two.xlsx");
    await expect(items.nth(1)).toContainText("One.xlsx");
    await items.nth(1).click();
    await expect(page.getByTestId("document-name")).toHaveText("One.xlsx");
    expect((await cell(page, "A1")).value).toBe("first");

    // A recent file that disappeared: clear message, removed from the list.
    await page.evaluate(() => delete window.__MACTUXEL_TEST_FS__!.files["/mem/Two.xlsx"]);
    await page.getByTestId("file-recent").click();
    await page.getByRole("menu", { name: "Open Recent" }).getByRole("menuitem", { name: "Two.xlsx" }).click();
    await expect(page.getByTestId("status-message")).toContainText("couldn't be opened");
    await page.getByTestId("file-recent").click();
    await expect(page.getByRole("menu", { name: "Open Recent" }).getByRole("menuitem")).toHaveCount(2); // One.xlsx + Clear Menu
    await expect(page.getByRole("menu", { name: "Open Recent" })).not.toContainText("Two.xlsx");
    await page.getByRole("menuitem", { name: "Clear Menu" }).click();
    await page.getByTestId("file-recent").click();
    await expect(page.getByRole("menuitem", { name: "No Recent Files" })).toBeVisible();
  });

  test("unsaved-changes prompts: Save from the prompt, Cancel, and the leave-page guard", async ({ page }) => {
    await installFs(page);
    await openApp(page);
    await clickCell(page, 0, 0);
    await typeAndCommit(page, "keep me");
    await expect(page).toHaveTitle("Untitled — Edited — MacTuxel");

    // New → "Save" in the prompt → Save As panel → saved, then the new workbook opens.
    await queueSave(page, "/mem/Kept.xlsx");
    await page.keyboard.press(`${CMD}+n`);
    await page.getByTestId("save-changes").click();
    await expect(page.getByTestId("document-name")).toHaveText("Untitled");
    const kept = await excelJs(await fileBytes(page, "/mem/Kept.xlsx"));
    expect(kept.worksheets[0].getCell("A1").value).toBe("keep me");

    // Cancelling the Save As panel from the prompt keeps the document.
    await clickCell(page, 0, 0);
    await typeAndCommit(page, "unsaved");
    await queueSave(page, null);
    await page.keyboard.press(`${CMD}+n`);
    await page.getByTestId("save-changes").click();
    await expect(page.getByTestId("dirty-indicator")).toBeVisible();
    expect((await cell(page, "A1")).value).toBe("unsaved");

    // Closing the window with unsaved changes is guarded.
    let guarded = false;
    page.on("dialog", (d) => {
      if (d.type() === "beforeunload") guarded = true;
      void d.dismiss();
    });
    await page.close({ runBeforeUnload: true });
    await expect.poll(() => guarded).toBe(true);
  });
});

test.describe("other formats", () => {
  test("CSV import and export", async ({ page }) => {
    const csv = new TextEncoder().encode("﻿city,temp\nZürich,-3.5\n東京,12\n");
    await installFs(page, { "/mem/weather.csv": csv });
    await openApp(page);
    await queueOpen(page, "/mem/weather.csv");
    await page.keyboard.press(`${CMD}+o`);
    await expect(page.getByTestId("document-name")).toHaveText("weather.csv");
    expect(await cell(page, "A2")).toMatchObject({ value: "Zürich" });
    expect(await cell(page, "B2")).toMatchObject({ value: -3.5, type: 2 });
    expect(await cell(page, "A3")).toMatchObject({ value: "東京" });

    await clickCell(page, 1, 2);
    await typeAndCommit(page, "13");
    await queueSave(page, "/mem/weather-out.csv");
    await openTab(page, "File");
    await page.getByTestId("file-export-csv").click();
    await expect.poll(async () => Object.keys((await fs(page)).files)).toContain("/mem/weather-out.csv");
    const out = await fileBytes(page, "/mem/weather-out.csv");
    expect([...out.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(out).trim().split("\n")).toEqual(["city,temp", "Zürich,-3.5", "東京,13"]);
    // Exporting doesn't make the CSV "the document": it stays edited.
    await expect(page.getByTestId("dirty-indicator")).toBeVisible();

    // Save on a CSV document asks for an .xlsx name instead of overwriting the CSV.
    await queueSave(page, "/mem/weather.xlsx");
    await page.keyboard.press(`${CMD}+s`);
    await expect(page.getByTestId("document-name")).toHaveText("weather.xlsx");
    expect((await fs(page)).log).toContain("pickSave:weather.xlsx:xlsx");
  });

  test("CSV export warns about other sheets, formulas and formatting", async ({ page }) => {
    await installFs(page);
    await openApp(page);
    await seed(page, "A1:B1", [["x", "=1+1"]]);
    await select(page, "A1");
    await page.getByTestId("cmd-bold").click();
    await page.getByTestId("add-sheet").click();
    await page.getByTestId("sheet-tabs").getByRole("tab", { name: "Sheet1" }).click();
    await queueSave(page, "/mem/out.csv");
    await openTab(page, "File");
    await page.getByTestId("file-export-csv").click();
    const warn = page.getByRole("dialog", { name: "Some features won't be kept" });
    await expect(warn).toContainText("Only the current sheet");
    await expect(warn).toContainText("Formulas");
    await expect(warn).toContainText("Formatting");
    await warn.getByTestId("compat-proceed").click();
    await expect.poll(async () => Object.keys((await fs(page)).files)).toContain("/mem/out.csv");
  });

  test("legacy .xls import (file written by xlwt), saved as .xlsx", async ({ page }) => {
    await installFs(page, { "/mem/legacy.xls": new Uint8Array(readFileSync("tests/fixtures/legacy-formulas.xls")) });
    await openApp(page);
    await queueOpen(page, "/mem/legacy.xls");
    await openTab(page, "File");
    await page.getByTestId("file-open").click();
    await expect(page.getByTestId("document-name")).toHaveText("legacy.xls");
    expect(await cell(page, "D4")).toMatchObject({ value: 9, formula: "=SUM(D2:D3)" }); // 3×1.5 + 2×2.25
    expect((await state(page)).sheets.map((s) => s.name)).toEqual(["Ledger", "Second"]);

    await page.getByTestId("file-compat").click();
    await expect(page.getByRole("dialog", { name: "Compatibility Report" })).toContainText("Excel 97–2004 workbook");
    await page.keyboard.press("Escape");

    await queueSave(page, "/mem/legacy.xlsx");
    await page.getByTestId("file-save").click();
    await page.getByTestId("compat-proceed").click(); // the legacy-format note
    await expect(page.getByTestId("document-name")).toHaveText("legacy.xlsx");
    const wb = await excelJs(await fileBytes(page, "/mem/legacy.xlsx"));
    expect(wb.getWorksheet("Ledger")!.getCell("D4").formula).toBe("SUM(D2:D3)");
  });

  test("unsupported Excel features: banner on open, warning before overwriting", async ({ page }) => {
    const source = new ExcelJS.Workbook();
    const ws = source.addWorksheet("Report");
    ws.getCell("A1").value = 5;
    ws.getCell("A2").value = 7;
    ws.addConditionalFormatting({ ref: "A1:A2", rules: [{ type: "cellIs", operator: "greaterThan", formulae: [6], priority: 1, style: { font: { bold: true } } }] });
    ws.getCell("B1").note = "reviewed";
    const bytes = new Uint8Array(await source.xlsx.writeBuffer());
    await installFs(page, { "/mem/report.xlsx": bytes });
    await openApp(page);

    await queueOpen(page, "/mem/report.xlsx");
    await page.keyboard.press(`${CMD}+o`);
    const banner = page.getByTestId("compat-banner");
    await expect(banner).toContainText("conditional formatting");
    await expect(banner).toContainText("comments and notes");

    await clickCell(page, 0, 2);
    await typeAndCommit(page, "9");
    const before = (await fs(page)).files["/mem/report.xlsx"];
    await page.keyboard.press(`${CMD}+s`);
    const warn = page.getByRole("dialog", { name: "Some features won't be kept" });
    await expect(warn).toContainText("Conditional formatting");
    await expect(warn).toContainText("Comments and notes");
    await warn.getByRole("button", { name: "Cancel" }).click();
    expect((await fs(page)).files["/mem/report.xlsx"]).toEqual(before); // nothing written
    await expect(page.getByTestId("dirty-indicator")).toBeVisible();

    await page.keyboard.press(`${CMD}+s`);
    await page.getByTestId("compat-proceed").click();
    await expect(page.getByTestId("dirty-indicator")).toHaveCount(0);
    const saved = await excelJs(await fileBytes(page, "/mem/report.xlsx"));
    expect(saved.getWorksheet("Report")!.getCell("A3").value).toBe(9);
    // Saved once — no repeated warning on the next save.
    await clickCell(page, 0, 3);
    await typeAndCommit(page, "10");
    await page.keyboard.press(`${CMD}+s`);
    await expect(page.getByTestId("dirty-indicator")).toHaveCount(0);
    await expect(page.getByRole("dialog", { name: "Some features won't be kept" })).toHaveCount(0);
  });
});

test.describe("drag and drop, recovery", () => {
  test("dropping a file opens it", async ({ page }) => {
    await installFs(page);
    await openApp(page);
    const source = new ExcelJS.Workbook();
    source.addWorksheet("Dropped").getCell("A1").value = "from a drop";
    const bytes = [...new Uint8Array(await source.xlsx.writeBuffer())];

    await page.evaluate((data) => {
      const dt = new DataTransfer();
      dt.items.add(new File([new Uint8Array(data)], "dropped.xlsx"));
      window.dispatchEvent(new DragEvent("dragenter", { dataTransfer: dt, bubbles: true }));
      (window as unknown as { __dt: DataTransfer }).__dt = dt;
    }, bytes);
    await expect(page.getByTestId("drop-overlay")).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new DragEvent("drop", { dataTransfer: (window as unknown as { __dt: DataTransfer }).__dt, bubbles: true, cancelable: true })));
    await expect(page.getByTestId("drop-overlay")).toHaveCount(0);
    await expect(page.getByTestId("document-name")).toHaveText("dropped.xlsx");
    expect((await cell(page, "A1")).value).toBe("from a drop");
    expect((await state(page)).sheets.map((s) => s.name)).toEqual(["Dropped"]);
  });

  test("unsaved work is restored after an unexpected restart", async ({ page }) => {
    await installFs(page);
    await openApp(page);
    await clickCell(page, 0, 0);
    await typeAndCommit(page, "precious");
    await clickCell(page, 0, 0); // Return moved the selection down
    await page.getByTestId("cmd-bold").click();
    await page.waitForTimeout(2600); // snapshot debounce (2 s)
    await restartApp(page); // simulates a crash: nothing was saved

    const prompt = page.getByRole("dialog", { name: "Recover unsaved changes?" });
    await expect(prompt).toContainText("Untitled");
    await page.getByTestId("recovery-restore").click();
    await expect.poll(() => cell(page, "A1").then((c) => c.value)).toBe("precious");
    expect((await cell(page, "A1")).style?.bl).toBe(1);
    await expect(page.getByTestId("dirty-indicator")).toBeVisible(); // still unsaved

    // Saving clears the recovery copy: no prompt on the next launch.
    await queueSave(page, "/mem/Recovered.xlsx");
    await page.keyboard.press(`${CMD}+s`);
    await expect(page.getByTestId("document-name")).toHaveText("Recovered.xlsx");
    await restartApp(page);
    await page.waitForTimeout(800);
    await expect(page.getByRole("dialog", { name: "Recover unsaved changes?" })).toHaveCount(0);
  });

  test("discarding recovery starts fresh and doesn't ask again", async ({ page }) => {
    await installFs(page);
    await openApp(page);
    await clickCell(page, 0, 0);
    await typeAndCommit(page, "throwaway");
    await page.waitForTimeout(2600);
    await restartApp(page);
    await page.getByTestId("recovery-discard").click();
    expect((await cell(page, "A1")).value).toBeNull();
    await restartApp(page);
    await page.waitForTimeout(800);
    await expect(page.getByRole("dialog", { name: "Recover unsaved changes?" })).toHaveCount(0);
  });
});
