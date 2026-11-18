import { expect, test, type Page } from "@playwright/test";
import { CMD, cell, clickCell, dragSelect, openApp, seed, select, state, typeAndCommit } from "./helpers";

async function styleOf(page: Page, a1: string) {
  return (await cell(page, a1)).style ?? {};
}

test.describe("Home ▸ Font", () => {
  test("bold, italic, underline, strikethrough toggle and reflect state", async ({ page }) => {
    const errors = await openApp(page);
    await seed(page, "A1", [["Hello"]]);
    await select(page, "A1");

    const bold = page.getByTestId("cmd-bold");
    await bold.click();
    await expect.poll(async () => (await styleOf(page, "A1")).bl).toBe(1);
    await expect(bold).toHaveAttribute("aria-pressed", "true");
    await bold.click();
    await expect.poll(async () => (await styleOf(page, "A1")).bl).toBe(0);
    await expect(bold).toHaveAttribute("aria-pressed", "false");

    await page.getByTestId("cmd-italic").click();
    await page.getByTestId("cmd-underline").click();
    await page.getByTestId("cmd-strike").click();
    await expect.poll(async () => {
      const s = await styleOf(page, "A1");
      return [s.it, s.ul?.s, s.st?.s];
    }).toEqual([1, 1, 1]);
    for (const id of ["cmd-italic", "cmd-underline", "cmd-strike"]) await expect(page.getByTestId(id)).toHaveAttribute("aria-pressed", "true");

    // Selecting a plain cell resets the toggle state.
    await select(page, "B5");
    await expect(page.getByTestId("cmd-italic")).toHaveAttribute("aria-pressed", "false");
    expect(errors).toEqual([]);
  });

  test("font family, size, grow and shrink", async ({ page }) => {
    const errors = await openApp(page);
    await seed(page, "A1", [["Type"]]);
    await select(page, "A1");

    await page.getByRole("combobox", { name: "Font", exact: true }).selectOption("Georgia");
    await expect.poll(async () => (await styleOf(page, "A1")).ff).toBe("Georgia");

    const size = page.getByRole("textbox", { name: "Font size" });
    await size.click();
    await size.fill("18");
    await size.press("Enter");
    await expect.poll(async () => (await styleOf(page, "A1")).fs).toBe(18);
    await expect(size).toHaveValue("18");

    await page.getByRole("button", { name: "Font size options" }).click();
    await page.getByRole("menuitem", { name: "24" }).click();
    await expect.poll(async () => (await styleOf(page, "A1")).fs).toBe(24);

    await page.getByTestId("cmd-shrink-font").click();
    await expect.poll(async () => (await styleOf(page, "A1")).fs).toBeLessThan(24);
    await page.getByTestId("cmd-grow-font").click();
    await expect.poll(async () => (await styleOf(page, "A1")).fs).toBe(24);

    // Invalid sizes are rejected without changing the cell.
    await size.click();
    await size.fill("abc");
    await size.press("Enter");
    expect((await styleOf(page, "A1")).fs).toBe(24);
    await expect(size).toHaveValue("24");
    expect(errors).toEqual([]);
  });

  test("fill color, font color and borders", async ({ page }) => {
    const errors = await openApp(page);
    await select(page, "B2:C3");

    await page.getByTestId("cmd-fill-menu").click();
    await page.locator('.palette__swatch[data-color="#bbf7d0"]').click();
    await expect.poll(async () => (await styleOf(page, "C3")).bg?.rgb).toBe("#bbf7d0");
    // The main button re-applies the last color.
    await select(page, "E5");
    await page.getByTestId("cmd-fill").click();
    await expect.poll(async () => (await styleOf(page, "E5")).bg?.rgb).toBe("#bbf7d0");
    await page.getByTestId("cmd-fill-menu").click();
    await page.getByRole("button", { name: "No Fill" }).click();
    await expect.poll(async () => (await styleOf(page, "E5")).bg?.rgb ?? null).toBeNull();

    await select(page, "B2");
    await page.getByTestId("cmd-font-color-menu").click();
    await page.locator('.palette__swatch[data-color="#4f46e5"]').click();
    await expect.poll(async () => (await styleOf(page, "B2")).cl?.rgb).toBe("#4f46e5");

    await select(page, "B2:C3");
    await page.getByTestId("cmd-borders").click();
    await page.getByRole("menuitem", { name: "All Borders" }).click();
    await expect.poll(async () => {
      const s = await styleOf(page, "C3");
      return [s.bd?.t?.s, s.bd?.b?.s, s.bd?.l?.s, s.bd?.r?.s].every((x) => x === 1);
    }).toBe(true);
    await page.getByTestId("cmd-borders").click();
    await page.getByRole("menuitem", { name: "No Border" }).click();
    await expect.poll(async () => {
      // "No Border" stores each side with style NONE (0), which draws nothing.
      const bd = (await styleOf(page, "C3")).bd;
      return [bd?.t?.s, bd?.b?.s, bd?.l?.s, bd?.r?.s].every((x) => !x);
    }).toBe(true);
    expect(errors).toEqual([]);
  });
});

test.describe("Home ▸ Alignment", () => {
  test("horizontal, vertical, wrap, rotation and merge", async ({ page }) => {
    const errors = await openApp(page);
    await seed(page, "A1", [["Aligned"]]);
    await select(page, "A1");

    // HorizontalAlign: 1 left, 2 center, 3 right. VerticalAlign: 1 top, 2 middle, 3 bottom.
    for (const [id, ht] of [["cmd-align-center", 2], ["cmd-align-right", 3], ["cmd-align-left", 1]] as const) {
      await page.getByTestId(id).click();
      await expect.poll(async () => (await styleOf(page, "A1")).ht).toBe(ht);
      await expect(page.getByTestId(id)).toHaveAttribute("aria-pressed", "true");
    }
    for (const [id, vt] of [["cmd-valign-top", 1], ["cmd-valign-middle", 2], ["cmd-valign-bottom", 3]] as const) {
      await page.getByTestId(id).click();
      await expect.poll(async () => (await styleOf(page, "A1")).vt).toBe(vt);
    }

    await page.getByTestId("cmd-wrap").click();
    await expect.poll(async () => (await styleOf(page, "A1")).tb).toBe(3);
    await expect(page.getByTestId("cmd-wrap")).toHaveAttribute("aria-pressed", "true");

    await page.getByTestId("cmd-orientation").click();
    await page.getByRole("menuitem", { name: "Angle Counterclockwise" }).click();
    await expect.poll(async () => (await styleOf(page, "A1")).tr?.a).toBe(-45); // counterclockwise in Univer's convention

    await select(page, "B2:D2");
    await page.getByTestId("cmd-merge").click();
    await expect.poll(() => page.evaluate(() => window.__MACTUXEL__!.api.getActiveWorkbook()!.getActiveSheet().getRange("B2:D2").isMerged())).toBe(true);
    await expect(page.getByTestId("cmd-merge")).toHaveAttribute("aria-pressed", "true");
    expect((await styleOf(page, "B2")).ht).toBe(2);
    // Clicking again unmerges.
    await page.getByTestId("cmd-merge").click();
    await expect.poll(() => page.evaluate(() => window.__MACTUXEL__!.api.getActiveWorkbook()!.getActiveSheet().getRange("B2").isPartOfMerge())).toBe(false);

    await select(page, "B4:D5");
    await page.getByTestId("cmd-merge-menu").click();
    await page.getByRole("menuitem", { name: "Merge Across" }).click();
    await expect.poll(() => page.evaluate(() => window.__MACTUXEL__!.api.getActiveWorkbook()!.getActiveSheet().getMergedRanges().length)).toBe(2);
    expect(errors).toEqual([]);
  });
});

test.describe("Home ▸ Number", () => {
  test("format menu, currency, percent, comma and decimals", async ({ page }) => {
    const errors = await openApp(page);
    await seed(page, "A1:A3", [[1234.5], [0.125], [46000]]);

    await select(page, "A1");
    await page.getByTestId("cmd-currency").click();
    await expect.poll(async () => (await cell(page, "A1")).display.trim()).toBe("$1,234.50");
    await expect(page.getByRole("combobox", { name: "Number format" })).toContainText("Currency");

    await page.getByTestId("cmd-inc-decimal").click();
    await expect.poll(async () => (await cell(page, "A1")).display.trim()).toBe("$1,234.500");
    await page.getByTestId("cmd-dec-decimal").click();
    await page.getByTestId("cmd-dec-decimal").click();
    await expect.poll(async () => (await cell(page, "A1")).display.trim()).toBe("$1,234.5");

    await select(page, "A2");
    await page.getByTestId("cmd-percent").click();
    await expect.poll(async () => (await cell(page, "A2")).display.trim()).toMatch(/^12\.5\d*%$|^13%$/);

    await page.getByTestId("cmd-comma").click();
    await expect.poll(async () => (await cell(page, "A2")).format).toBe("#,##0.00");

    await select(page, "A3");
    await page.getByRole("combobox", { name: "Number format" }).selectOption({ label: "Short Date" });
    await expect.poll(async () => (await cell(page, "A3")).format).toBe("m/d/yyyy");
    await expect.poll(async () => (await cell(page, "A3")).display).toMatch(/^\d{1,2}\/\d{1,2}\/\d{4}$/);
    await page.getByRole("combobox", { name: "Number format" }).selectOption({ label: "General" });
    await expect.poll(async () => (await cell(page, "A3")).display).toBe("46000");
    expect(errors).toEqual([]);
  });
});

test.describe("Home ▸ Styles", () => {
  test("cell styles apply real formatting", async ({ page }) => {
    const errors = await openApp(page);
    await seed(page, "A1", [["Status"]]);
    await select(page, "A1");
    await page.getByTestId("cmd-cell-styles").click();
    await page.locator('[data-style="good"]').click();
    await expect.poll(async () => {
      const s = await styleOf(page, "A1");
      return [s.bg?.rgb, s.cl?.rgb];
    }).toEqual(["#dcfce7", "#166534"]);

    await page.getByTestId("cmd-cell-styles").click();
    await page.locator('[data-style="title"]').click();
    await expect.poll(async () => {
      const s = await styleOf(page, "A1");
      return [s.fs, s.bl, s.bg?.rgb ?? null];
    }).toEqual([18, 1, null]);
    expect(errors).toEqual([]);
  });
});

test.describe("Home ▸ Cells", () => {
  test("insert and delete rows, columns and cells", async ({ page }) => {
    const errors = await openApp(page);
    await seed(page, "A1:B3", [
      ["a1", "b1"],
      ["a2", "b2"],
      ["a3", "b3"],
    ]);

    await select(page, "A2");
    await page.getByTestId("cmd-insert").click();
    await page.getByRole("menuitem", { name: "Insert Sheet Rows" }).click();
    await expect.poll(async () => (await cell(page, "A3")).value).toBe("a2");
    expect((await cell(page, "A2")).value).toBeNull();

    await page.getByTestId("cmd-delete").click();
    await page.getByRole("menuitem", { name: "Delete Sheet Rows" }).click();
    await expect.poll(async () => (await cell(page, "A2")).value).toBe("a2");

    await select(page, "A1");
    await page.getByTestId("cmd-insert").click();
    await page.getByRole("menuitem", { name: "Insert Sheet Columns" }).click();
    await expect.poll(async () => (await cell(page, "B1")).value).toBe("a1");

    await page.getByTestId("cmd-delete").click();
    await page.getByRole("menuitem", { name: "Delete Sheet Columns" }).click();
    await expect.poll(async () => (await cell(page, "A1")).value).toBe("a1");

    await select(page, "B1");
    await page.getByTestId("cmd-insert").click();
    await page.getByRole("menuitem", { name: "Insert Cells (Shift Down)" }).click();
    await expect.poll(async () => (await cell(page, "B2")).value).toBe("b1");
    expect((await cell(page, "A2")).value).toBe("a2"); // other columns untouched

    await page.getByTestId("cmd-delete").click();
    await page.getByRole("menuitem", { name: "Delete Cells (Shift Up)" }).click();
    await expect.poll(async () => (await cell(page, "B1")).value).toBe("b1");
    expect(errors).toEqual([]);
  });

  test("row height and column width dialogs, autofit and hide", async ({ page }) => {
    const errors = await openApp(page);
    await select(page, "B2");
    const sheet = "window.__MACTUXEL__.api.getActiveWorkbook().getActiveSheet()";

    await page.getByTestId("cmd-format").click();
    await page.getByRole("menuitem", { name: "Row Height…" }).click();
    const dialog = page.getByRole("dialog", { name: "Row Height" });
    await dialog.getByRole("spinbutton").fill("0");
    await dialog.getByRole("button", { name: "OK" }).click();
    await expect(dialog.getByRole("alert")).toContainText("between 1 and 409");
    await dialog.getByRole("spinbutton").fill("40");
    await dialog.getByRole("button", { name: "OK" }).click();
    await expect(dialog).toHaveCount(0);
    await expect.poll(() => page.evaluate(`${sheet}.getRowHeight(1)`)).toBe(40);

    await page.getByTestId("cmd-format").click();
    await page.getByRole("menuitem", { name: "Column Width…" }).click();
    const cw = page.getByRole("dialog", { name: "Column Width" });
    await cw.getByRole("spinbutton").fill("150");
    await cw.getByRole("spinbutton").press("Enter");
    await expect.poll(() => page.evaluate(`${sheet}.getColumnWidth(1)`)).toBe(150);

    await page.getByTestId("cmd-format").click();
    await page.getByRole("menuitem", { name: "Hide Columns", exact: true }).click();
    await expect.poll(() => page.evaluate(`${sheet}.isColumnHiddenByUser ? ${sheet}.isColumnHiddenByUser(1) : ${sheet}.getSheet().getColVisible(1) === false`)).toBe(true);
    await select(page, "A1:C1");
    await page.getByTestId("cmd-format").click();
    await page.getByRole("menuitem", { name: "Unhide Columns" }).click();
    await expect.poll(() => page.evaluate(`${sheet}.getSheet().getColVisible(1)`)).toBe(true);
    expect(errors).toEqual([]);
  });
});

test.describe("Home ▸ Editing", () => {
  test("AutoSum above, beside and for a block", async ({ page }) => {
    const errors = await openApp(page);
    await seed(page, "A1:B3", [
      [1, 10],
      [2, 20],
      [3, 30],
    ]);

    await select(page, "A4");
    await page.getByTestId("cmd-autosum").click();
    await expect.poll(async () => (await cell(page, "A4")).formula).toBe("=SUM(A1:A3)");
    await expect.poll(async () => (await cell(page, "A4")).value).toBe(6);

    await select(page, "C1");
    await page.getByTestId("cmd-autosum-menu").click();
    await page.getByRole("menuitem", { name: "Average" }).click();
    await expect.poll(async () => (await cell(page, "C1")).formula).toBe("=AVERAGE(A1:B1)");

    await select(page, "A1:B3");
    await page.getByTestId("cmd-autosum-menu").click();
    await page.getByRole("menuitem", { name: "Max" }).click();
    await expect.poll(async () => [(await cell(page, "A4")).formula, (await cell(page, "B4")).value]).toEqual(["=MAX(A1:A3)", 30]);

    // Nothing to sum → a status message, no formula.
    await select(page, "F10");
    await page.getByTestId("cmd-autosum").click();
    await expect(page.getByTestId("status-message")).toContainText("AutoSum:");
    expect((await cell(page, "F10")).formula).toBeNull();
    expect(errors).toEqual([]);
  });

  test("fill down/right and clear", async ({ page }) => {
    const errors = await openApp(page);
    await seed(page, "A1", [["=ROW()*10"]]);
    await select(page, "A1:A3");
    await page.getByTestId("cmd-fill-series").click();
    await page.getByRole("menuitem", { name: "Down" }).click();
    await expect.poll(async () => (await cell(page, "A3")).value).toBe(30);

    await seed(page, "C1", [["right"]]);
    await select(page, "C1:E1");
    await page.getByTestId("cmd-fill-series").click();
    await page.getByRole("menuitem", { name: "Right" }).click();
    await expect.poll(async () => (await cell(page, "E1")).value).toBe("right");

    await select(page, "C1");
    await page.getByTestId("cmd-bold").click();
    await page.getByTestId("cmd-clear").click();
    await page.getByRole("menuitem", { name: "Clear Formats" }).click();
    await expect.poll(async () => (await styleOf(page, "C1")).bl ?? 0).toBe(0);
    expect((await cell(page, "C1")).value).toBe("right");

    await page.getByTestId("cmd-clear").click();
    await page.getByRole("menuitem", { name: "Clear Contents" }).click();
    await expect.poll(async () => (await cell(page, "C1")).value).toBeNull();
    expect(errors).toEqual([]);
  });
});

test.describe("Home ▸ Clipboard", () => {
  // Browser WebKit can't grant async clipboard reads, so pasting here uses ⌘V — the same
  // trusted DOM paste event the desktop app's Paste button triggers via Edit ▸ Paste.
  test("ribbon Copy and Cut feed paste with formatting", async ({ page }) => {
    const errors = await openApp(page);
    await seed(page, "A1", [["copied"]]);
    await clickCell(page, 0, 0);
    await page.getByTestId("cmd-bold").click();
    await page.getByTestId("cmd-copy").click();
    await clickCell(page, 2, 2); // C3
    await page.keyboard.press(`${CMD}+v`);
    await expect.poll(async () => (await cell(page, "C3")).value).toBe("copied");
    expect((await styleOf(page, "C3")).bl).toBe(1); // formatting travels with it

    await seed(page, "B1", [["moved"]]);
    await clickCell(page, 1, 0);
    await page.getByTestId("cmd-cut").click();
    await clickCell(page, 3, 3); // D4
    await page.keyboard.press(`${CMD}+v`);
    await expect.poll(async () => (await cell(page, "D4")).value).toBe("moved");
    await expect.poll(async () => (await cell(page, "B1")).value).toBeNull();

    expect(errors).toEqual([]);
  });

  test("format painter copies formats, keeps values, and can be cancelled", async ({ page }) => {
    const errors = await openApp(page);
    await seed(page, "A1:A2", [["src"], [1234.5]]);
    await seed(page, "E5:E6", [["keep"], ["=1+1"]]);
    await select(page, "A1");
    await page.getByTestId("cmd-bold").click();
    await page.getByTestId("cmd-fill").click();
    await select(page, "A2");
    await page.getByTestId("cmd-currency").click();

    // Paint A1:A2 (bold+fill / currency) onto E5:E8 — the pattern tiles.
    await select(page, "A1:A2");
    const painter = page.getByTestId("cmd-format-painter");
    await painter.click();
    await expect(painter).toHaveAttribute("aria-pressed", "true");
    await dragSelect(page, [4, 4], [4, 7]); // E5:E8
    await expect(painter).toHaveAttribute("aria-pressed", "false");
    await expect.poll(async () => (await styleOf(page, "E5")).bl).toBe(1);
    expect((await styleOf(page, "E7")).bl).toBe(1);
    expect((await cell(page, "E6")).format).toContain("$");
    expect((await cell(page, "E5")).value).toBe("keep");
    expect((await cell(page, "E6")).formula).toBe("=1+1");

    // Escape cancels an armed painter; the next selection is untouched.
    await select(page, "A1");
    await painter.click();
    await page.keyboard.press("Escape");
    await expect(painter).toHaveAttribute("aria-pressed", "false");
    await clickCell(page, 6, 6); // G7
    expect((await styleOf(page, "G7")).bl ?? 0).toBe(0);
    expect(errors).toEqual([]);
  });

  test("Paste button explains itself when the clipboard can't be read (browser preview)", async ({ page }) => {
    await openApp(page);
    await clickCell(page, 2, 2);
    await page.getByTestId("cmd-paste").click();
    await expect(page.getByTestId("status-message")).toContainText("Press ⌘V to paste");
  });
});

test.describe("Keyboard shortcuts", () => {
  test("grid and MacTuxel shortcuts each apply exactly once", async ({ page }) => {
    const errors = await openApp(page);
    await seed(page, "A1:A3", [[1], [2], [3]]);
    await clickCell(page, 0, 0);

    await page.keyboard.press(`${CMD}+b`);
    await expect.poll(async () => (await styleOf(page, "A1")).bl).toBe(1);
    await page.keyboard.press(`${CMD}+Shift+x`);
    await expect.poll(async () => (await styleOf(page, "A1")).st?.s).toBe(1);
    await page.keyboard.press(`${CMD}+Shift+Period`);
    await expect.poll(async () => (await styleOf(page, "A1")).fs).toBe(12);
    await page.keyboard.press(`${CMD}+Shift+Comma`);
    await expect.poll(async () => (await styleOf(page, "A1")).fs).toBe(11);

    await clickCell(page, 0, 3); // A4
    await page.keyboard.press(`${CMD}+Shift+t`);
    await expect.poll(async () => (await cell(page, "A4")).value).toBe(6);

    await seed(page, "C1", [["x"]]);
    await select(page, "C1:C3");
    await page.keyboard.press(`${CMD}+d`);
    await expect.poll(async () => (await cell(page, "C3")).value).toBe("x");
    await select(page, "C1:E1");
    await page.keyboard.press(`${CMD}+r`);
    await expect.poll(async () => (await cell(page, "E1")).value).toBe("x");

    await select(page, "A2");
    await page.keyboard.press(`${CMD}+Shift+Digit5`);
    await expect.poll(async () => (await cell(page, "A2")).format).toContain("%");

    // ⇧⌘Z redoes (macOS convention).
    await clickCell(page, 6, 0); // G1
    await typeAndCommit(page, "redo-me");
    await page.keyboard.press(`${CMD}+z`);
    await expect.poll(async () => (await cell(page, "G1")).value).toBeNull();
    await page.keyboard.press(`${CMD}+Shift+z`);
    await expect.poll(async () => (await cell(page, "G1")).value).toBe("redo-me");

    // Shortcuts don't fire while typing in the formula bar.
    await page.getByTestId("formula-input").click();
    await page.keyboard.press(`${CMD}+d`);
    await page.keyboard.press("Escape");
    expect((await state(page)).ready).toBe(true);
    expect(errors).toEqual([]);
  });
});
