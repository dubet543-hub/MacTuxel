import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { read as sheetjsRead, utils, write as sheetjsWrite } from "xlsx";
import { strFromU8, unzipSync } from "fflate";
import { readFileSync } from "node:fs";
import {
  BooleanNumber,
  BorderStyleTypes,
  CellValueType,
  HorizontalAlign,
  TextDecoration,
  VerticalAlign,
  WrapStrategy,
  type ICellData,
  type IStyleData,
  type IWorkbookData,
} from "@univerjs/presets";
import { exportXlsx, importXlsx } from "../../src/io/xlsx";
import { openWorkbookBytes, saveWorkbookBytes } from "../../src/io/formats";
import { applyTint, normalizeHex, resolveColor } from "../../src/io/ooxml/colors";
import { rotationFromExcel, rotationToExcel } from "../../src/io/ooxml/styles";
import { colWidthToPx, pxToColWidth, pxToPt, ptToPx } from "../../src/io/ooxml/worksheet";

// ---------------------------------------------------------------------------
// A MacTuxel workbook exercising every supported feature.
// ---------------------------------------------------------------------------

const STYLES: Record<string, IStyleData> = {
  header: {
    bl: BooleanNumber.TRUE,
    ff: "Georgia",
    fs: 14,
    cl: { rgb: "#FFFFFF" },
    bg: { rgb: "#0D9488" },
    ht: HorizontalAlign.CENTER,
    vt: VerticalAlign.MIDDLE,
    bd: { b: { s: BorderStyleTypes.THICK, cl: { rgb: "#115E59" } } },
  },
  money: { n: { pattern: '"$"#,##0.00' }, ht: HorizontalAlign.RIGHT },
  pct: { n: { pattern: "0.0%" }, it: BooleanNumber.TRUE },
  date: { n: { pattern: "yyyy-mm-dd" } },
  fancy: {
    ul: { s: BooleanNumber.TRUE, t: TextDecoration.DOUBLE },
    st: { s: BooleanNumber.TRUE },
    tb: WrapStrategy.WRAP,
    vt: VerticalAlign.TOP,
    tr: { a: -45 }, // counterclockwise
    bd: {
      t: { s: BorderStyleTypes.THIN, cl: { rgb: "#DC2626" } },
      l: { s: BorderStyleTypes.DASHED, cl: { rgb: "#000000" } },
      r: { s: BorderStyleTypes.DOUBLE, cl: { rgb: "#4F46E5" } },
    },
  },
  clockwise: { tr: { a: 45 } },
  vertical: { tr: { a: 0, v: BooleanNumber.TRUE } },
  fillOnly: { bg: { rgb: "#FDE68A" } },
};

function sampleWorkbook(): IWorkbookData {
  const cell = (v: ICellData["v"], s?: string, extra: Partial<ICellData> = {}): ICellData => ({
    v,
    ...(typeof v === "number" ? { t: CellValueType.NUMBER } : typeof v === "string" ? { t: CellValueType.STRING } : {}),
    ...(s ? { s } : {}),
    ...extra,
  });
  return {
    id: "wb",
    name: "Budget",
    appVersion: "",
    locale: "enUS" as IWorkbookData["locale"],
    styles: STYLES,
    defaultStyle: { ff: "Arial", fs: 11 },
    sheetOrder: ["s1", "s2"],
    sheets: {
      s1: {
        id: "s1",
        name: "Q1 Budget",
        tabColor: "#DB2777",
        zoomRatio: 1.25,
        freeze: { xSplit: 1, ySplit: 1, startRow: 1, startColumn: 1 },
        defaultColumnWidth: 88,
        defaultRowHeight: 24,
        cellData: {
          0: { 0: cell("Item", "header"), 1: cell("Cost", "header"), 2: cell("Share", "header"), 3: cell("Due", "header") },
          1: { 0: cell("Rent"), 1: cell(1500, "money"), 2: cell(0.6, "pct"), 3: cell(46023, "date") },
          2: { 0: cell("Power"), 1: cell(250.75, "money"), 2: cell(0.1, "pct"), 3: cell(46054, "date") },
          3: {
            0: cell("Total", "fancy"),
            1: { f: "=SUM(B2:B3)", v: 1750.75, t: CellValueType.NUMBER, s: "money" },
            2: { f: "=C2+C3", v: 0.7, t: CellValueType.NUMBER, s: "pct", si: "shared1" },
            3: { v: true as unknown as number, t: CellValueType.BOOLEAN },
          },
          4: { 2: { si: "shared1", v: 0.7, t: CellValueType.NUMBER } }, // shared formula → =C3+C4
          5: { 0: cell("Clockwise", "clockwise"), 1: cell("Up", "vertical"), 2: { s: "fillOnly" } }, // C6: formatted, empty
          6: { 0: { f: "=1/0", v: "#DIV/0!", t: CellValueType.STRING } },
        },
        mergeData: [{ startRow: 7, endRow: 8, startColumn: 0, endColumn: 2 }],
        columnData: { 0: { w: 140 }, 4: { hd: BooleanNumber.TRUE } },
        rowData: { 0: { h: 32 }, 9: { hd: BooleanNumber.TRUE } },
        showGridlines: BooleanNumber.FALSE,
      },
      s2: {
        id: "s2",
        name: "Notes",
        hidden: BooleanNumber.TRUE,
        cellData: { 0: { 0: cell("Ünïcødé ✓ — 日本語") } },
      },
    },
  };
}

const moveFormula = (f: string, dx: number, dy: number) =>
  // Minimal relative-reference shifter for the test (A1-style, no $).
  f.replace(/([A-Z]+)(\d+)/g, (_, col: string, row: string) => {
    const c = [...col].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) + dx;
    let label = "";
    for (let n = c; n > 0; n = Math.floor((n - 1) / 26)) label = String.fromCharCode(65 + ((n - 1) % 26)) + label;
    return `${label}${Number(row) + dy}`;
  });

async function readWithExcelJS(bytes: Uint8Array) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes as unknown as ArrayBuffer);
  return wb;
}

// ---------------------------------------------------------------------------

describe("unit conversions and colour helpers", () => {
  it("converts Excel column widths and row heights", () => {
    expect(colWidthToPx(pxToColWidth(140))).toBe(140);
    expect(colWidthToPx(9.140625)).toBe(64); // Excel's default 8.43-character column
    expect(pxToPt(20)).toBe(15);
    expect(ptToPx(15)).toBe(20);
  });

  it("maps text rotation both ways", () => {
    expect(rotationToExcel({ a: -45 })).toBe(45); // counterclockwise
    expect(rotationToExcel({ a: 45 })).toBe(135); // clockwise
    expect(rotationToExcel({ a: 0, v: BooleanNumber.TRUE })).toBe(255);
    for (const v of [30, 90, 120, 180, 255]) expect(rotationToExcel(rotationFromExcel(v))).toBe(v);
  });

  it("resolves theme, tint and indexed colours", () => {
    expect(normalizeHex("ff0d9488")).toBe("#0D9488");
    expect(normalizeHex("rgb(13, 148, 136)")).toBe("#0D9488");
    expect(resolveColor({ theme: "4" })).toBe("#4472C4");
    expect(resolveColor({ indexed: "10" })).toBe("#FF0000");
    expect(resolveColor({ indexed: "64" })).toBeNull(); // system foreground = automatic
    expect(applyTint("#4472C4", 0.7999816888943144)).toBe("#DAE3F3"); // Excel's "Accent 1, Lighter 80%"
    expect(applyTint("#000000", 0.5)).toBe("#808080");
  });
});

describe("XLSX export, verified with an independent reader (ExcelJS)", () => {
  const { bytes, issues } = exportXlsx(sampleWorkbook(), { moveFormula });

  it("writes worksheets with names, order and visibility", async () => {
    const wb = await readWithExcelJS(bytes);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Q1 Budget", "Notes"]);
    expect(wb.getWorksheet("Notes")!.state).toBe("hidden");
    expect(wb.getWorksheet("Notes")!.getCell("A1").value).toBe("Ünïcødé ✓ — 日本語");
  });

  it("writes values, formulas, shared formulas, booleans and errors", async () => {
    const ws = (await readWithExcelJS(bytes)).getWorksheet("Q1 Budget")!;
    expect(ws.getCell("A2").value).toBe("Rent");
    expect(ws.getCell("B2").value).toBe(1500);
    expect(ws.getCell("B4").formula).toBe("SUM(B2:B3)");
    expect(ws.getCell("C4").formula).toBe("C2+C3");
    expect(ws.getCell("C5").formula).toBe("C3+C4"); // expanded from Univer's shared formula
    expect(ws.getCell("D4").value).toBe(true);
    expect(ws.getCell("A7").formula).toBe("1/0");
    expect((ws.getCell("A7").result as unknown as { error: string }).error).toBe("#DIV/0!");
  });

  it("writes number formats and dates", async () => {
    const ws = (await readWithExcelJS(bytes)).getWorksheet("Q1 Budget")!;
    expect(ws.getCell("B2").numFmt).toBe('"$"#,##0.00');
    expect(ws.getCell("C2").numFmt).toBe("0.0%");
    expect(ws.getCell("D2").numFmt).toBe("yyyy-mm-dd");
    const due = ws.getCell("D2").value as Date;
    expect(due).toBeInstanceOf(Date);
    expect(due.toISOString().slice(0, 10)).toBe("2026-01-01");
  });

  it("writes fonts, fills, borders and alignment", async () => {
    const ws = (await readWithExcelJS(bytes)).getWorksheet("Q1 Budget")!;
    const h = ws.getCell("A1");
    expect(h.font).toMatchObject({ bold: true, name: "Georgia", size: 14, color: { argb: "FFFFFFFF" } });
    expect(h.fill).toMatchObject({ type: "pattern", pattern: "solid", fgColor: { argb: "FF0D9488" } });
    expect(h.border.bottom).toMatchObject({ style: "thick", color: { argb: "FF115E59" } });
    expect(h.alignment).toMatchObject({ horizontal: "center", vertical: "middle" });

    const f = ws.getCell("A4");
    expect(f.font).toMatchObject({ underline: "double", strike: true });
    expect(f.alignment).toMatchObject({ wrapText: true, vertical: "top", textRotation: 45 });
    expect(f.border.top).toMatchObject({ style: "thin", color: { argb: "FFDC2626" } });
    expect(f.border.left).toMatchObject({ style: "dashed" });
    expect(f.border.right).toMatchObject({ style: "double", color: { argb: "FF4F46E5" } });

    expect(ws.getCell("A6").alignment.textRotation).toBe(-45); // ExcelJS: negative = clockwise
    expect(ws.getCell("B6").alignment.textRotation).toBe("vertical");
    expect(ws.getCell("C2").font.italic).toBe(true);
    expect(ws.getCell("B2").alignment.horizontal).toBe("right");
    // Formatted but empty cell keeps its fill.
    expect(ws.getCell("C6").fill).toMatchObject({ fgColor: { argb: "FFFDE68A" } });
    // Unformatted cells use the stylesheet's default font (font 0), which is the workbook default.
    const stylesXml = strFromU8(unzipSync(bytes)["xl/styles.xml"]);
    const font0 = /<fonts[^>]*>(<font>.*?<\/font>)/.exec(stylesXml)![1];
    expect(font0).toContain('<name val="Arial"/>');
    expect(font0).toContain('<sz val="11"/>');
  });

  it("writes merges, sizes, visibility, panes, tab colour, gridlines and zoom", async () => {
    const ws = (await readWithExcelJS(bytes)).getWorksheet("Q1 Budget")!;
    expect(ws.model.merges).toContain("A8:C9");
    expect(Math.round(ws.getColumn(1).width! * 7)).toBe(140);
    expect(ws.getColumn(5).hidden).toBe(true);
    expect(ws.getRow(1).height).toBe(24); // 32 px = 24 pt
    expect(ws.getRow(10).hidden).toBe(true);
    expect(ws.properties.tabColor).toMatchObject({ argb: "FFDB2777" });
    expect(ws.views[0]).toMatchObject({ state: "frozen", xSplit: 1, ySplit: 1, showGridLines: false, zoomScale: 125 });
    expect(Math.round(ws.properties.defaultColWidth! * 7)).toBe(88);
    expect(ws.properties.defaultRowHeight).toBe(18); // 24 px
  });

  it("is also readable by SheetJS (second reader) with the same values and formulas", () => {
    const wb = sheetjsRead(bytes, { type: "array", cellFormula: true });
    const ws = wb.Sheets["Q1 Budget"];
    expect(ws["B4"]).toMatchObject({ f: "SUM(B2:B3)", v: 1750.75 });
    expect(ws["A1"].v).toBe("Item");
    expect(ws["!merges"]).toEqual([{ s: { r: 7, c: 0 }, e: { r: 8, c: 2 } }]);
  });

  it("reports nothing for features it fully supports", () => {
    expect(issues).toEqual([]);
  });
});

describe("XLSX round trip: MacTuxel → file → MacTuxel", () => {
  it("keeps values, formulas, styles, sizes and sheet settings", () => {
    const original = sampleWorkbook();
    const { bytes } = exportXlsx(original, { moveFormula });
    const { workbook, issues } = importXlsx(bytes, "Budget");
    expect(issues).toEqual([]);
    const [s1, s2] = workbook.sheetOrder!.map((id) => workbook.sheets![id]!);
    const styleOf = (r: number, c: number) => {
      const s = (s1.cellData as Record<number, Record<number, ICellData>>)[r][c].s;
      return typeof s === "string" ? workbook.styles![s] : s;
    };
    const cells = s1.cellData as Record<number, Record<number, ICellData>>;

    expect(s1.name).toBe("Q1 Budget");
    expect(s2.hidden).toBe(BooleanNumber.TRUE);
    expect(cells[1][1]).toMatchObject({ v: 1500, t: CellValueType.NUMBER });
    expect(cells[3][1]).toMatchObject({ f: "=SUM(B2:B3)" });
    expect(cells[4][2]).toMatchObject({ f: "=C3+C4" });
    expect(cells[1][3].v).toBe(46023);

    expect(styleOf(0, 0)).toMatchObject({
      bl: 1, ff: "Georgia", fs: 14, cl: { rgb: "#FFFFFF" }, bg: { rgb: "#0D9488" },
      ht: HorizontalAlign.CENTER, vt: VerticalAlign.MIDDLE,
      bd: { b: { s: BorderStyleTypes.THICK, cl: { rgb: "#115E59" } } },
    });
    expect(styleOf(1, 1)).toMatchObject({ n: { pattern: '"$"#,##0.00' }, ht: HorizontalAlign.RIGHT });
    expect(styleOf(3, 0)).toMatchObject({ ul: { s: 1, t: TextDecoration.DOUBLE }, st: { s: 1 }, tb: WrapStrategy.WRAP, tr: { a: -45 } });
    expect(styleOf(5, 0)).toMatchObject({ tr: { a: 45 } });
    expect(styleOf(5, 1)).toMatchObject({ tr: { v: BooleanNumber.TRUE } });
    expect(styleOf(5, 2)).toMatchObject({ bg: { rgb: "#FDE68A" } });

    expect(s1.mergeData).toEqual([{ startRow: 7, endRow: 8, startColumn: 0, endColumn: 2 }]);
    expect((s1.columnData as Record<number, { w?: number; hd?: number }>)[0].w).toBe(140);
    expect((s1.columnData as Record<number, { w?: number; hd?: number }>)[4].hd).toBe(BooleanNumber.TRUE);
    expect((s1.rowData as Record<number, { h?: number }>)[0].h).toBe(32);
    expect(s1).toMatchObject({
      tabColor: "#DB2777",
      zoomRatio: 1.25,
      showGridlines: BooleanNumber.FALSE,
      defaultColumnWidth: 88,
      defaultRowHeight: 24,
      freeze: { xSplit: 1, ySplit: 1 },
    });
    expect(workbook.defaultStyle).toEqual({ ff: "Arial", fs: 11 });
  });
});

describe("XLSX import of files written by another program (ExcelJS)", () => {
  async function excelJsFile(build: (wb: ExcelJS.Workbook) => void): Promise<Uint8Array> {
    const wb = new ExcelJS.Workbook();
    build(wb);
    return new Uint8Array(await wb.xlsx.writeBuffer());
  }

  it("imports formatting, theme colours, sizes and panes", async () => {
    const bytes = await excelJsFile((wb) => {
      const ws = wb.addWorksheet("Sales", { properties: { tabColor: { argb: "FF00B050" } }, views: [{ state: "frozen", ySplit: 2, xSplit: 0 }] });
      ws.getCell("A1").value = "Region";
      ws.getCell("A1").font = { bold: true, italic: true, size: 16, name: "Helvetica Neue", color: { theme: 4 } };
      ws.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF00" } };
      ws.getCell("B1").value = { formula: "SUM(B2:B3)", result: 30 };
      ws.getCell("B2").value = 10;
      ws.getCell("B3").value = 20;
      ws.getCell("B2").numFmt = "#,##0.00";
      ws.getCell("C2").value = new Date(Date.UTC(2026, 2, 14));
      ws.getCell("C2").numFmt = "d mmm yyyy";
      ws.getCell("D2").value = "wrapped";
      ws.getCell("D2").alignment = { wrapText: true, horizontal: "center", vertical: "bottom" };
      ws.getCell("E2").border = { left: { style: "medium", color: { argb: "FF0000FF" } } };
      ws.mergeCells("A5:C6");
      ws.getColumn(1).width = 30;
      ws.getRow(4).height = 40;
      ws.getCell("A7").value = "hidden row";
      ws.getRow(7).hidden = true;
    });
    const { workbook, issues } = openWorkbookBytes(bytes, "Sales.xlsx");
    expect(issues).toEqual([]);
    const sheet = workbook.sheets![workbook.sheetOrder![0]]!;
    const cells = sheet.cellData as Record<number, Record<number, ICellData>>;
    const style = (r: number, c: number) => workbook.styles![cells[r][c].s as string]!;

    expect(sheet.name).toBe("Sales");
    // theme index 4 = accent1 of the file's own theme (ExcelJS embeds the Office 2007 theme).
    const themeXml = strFromU8(unzipSync(bytes)["xl/theme/theme1.xml"]);
    const accent1 = `#${/<a:accent1>\s*<a:srgbClr val="([0-9A-F]{6})"/i.exec(themeXml)![1].toUpperCase()}`;
    expect(style(0, 0)).toMatchObject({ bl: 1, it: 1, fs: 16, ff: "Helvetica Neue", cl: { rgb: accent1 }, bg: { rgb: "#FFFF00" } });
    expect(cells[0][1]).toMatchObject({ f: "=SUM(B2:B3)", v: 30 });
    expect(style(1, 1).n).toEqual({ pattern: "#,##0.00" });
    expect(cells[1][2].v).toBe(46095); // 2026-03-14 as an Excel serial
    expect(style(1, 2).n).toEqual({ pattern: "d mmm yyyy" });
    expect(style(1, 3)).toMatchObject({ tb: WrapStrategy.WRAP, ht: HorizontalAlign.CENTER, vt: VerticalAlign.BOTTOM });
    expect(style(1, 4).bd).toMatchObject({ l: { s: BorderStyleTypes.MEDIUM, cl: { rgb: "#0000FF" } } });
    expect(sheet.mergeData).toEqual([{ startRow: 4, endRow: 5, startColumn: 0, endColumn: 2 }]);
    expect((sheet.columnData as Record<number, { w?: number }>)[0].w).toBe(210);
    expect((sheet.rowData as Record<number, { h?: number }>)[3].h).toBeCloseTo(53.33, 1);
    expect((sheet.rowData as Record<number, { hd?: number }>)[6].hd).toBe(BooleanNumber.TRUE);
    expect(sheet).toMatchObject({ tabColor: "#00B050", freeze: { ySplit: 2, xSplit: 0 } });
  });

  it("converts the 1904 date system", async () => {
    const bytes = await excelJsFile((wb) => {
      wb.properties.date1904 = true;
      const ws = wb.addWorksheet("D");
      ws.getCell("A1").value = new Date(Date.UTC(2026, 0, 1));
      ws.getCell("A1").numFmt = "yyyy-mm-dd";
    });
    const { workbook, issues } = openWorkbookBytes(bytes, "d.xlsx");
    const cells = workbook.sheets![workbook.sheetOrder![0]]!.cellData as Record<number, Record<number, ICellData>>;
    expect(cells[0][0].v).toBe(46023); // 2026-01-01 in the 1900 system
    expect(issues.map((i) => i.id)).toContain("date1904");
  });

  it("detects features MacTuxel can't keep", async () => {
    const bytes = await excelJsFile((wb) => {
      const ws = wb.addWorksheet("Report");
      ws.getCell("A1").value = 5;
      ws.addConditionalFormatting({ ref: "A1:A3", rules: [{ type: "cellIs", operator: "greaterThan", formulae: [3], priority: 1, style: { font: { bold: true } } }] });
      ws.getCell("B1").dataValidation = { type: "list", allowBlank: true, formulae: ['"a,b"'] };
      ws.getCell("C1").value = { text: "MacTuxel", hyperlink: "https://example.com" };
      ws.getCell("D1").note = "A note";
      ws.autoFilter = "A1:D1";
      ws.protect("", {});
      wb.definedNames.add("Report!$A$1", "TaxRate");
    });
    const { issues } = openWorkbookBytes(bytes, "report.xlsx");
    const ids = issues.map((i) => i.id);
    for (const id of ["conditional-formatting", "data-validation", "hyperlinks", "comments", "filters", "sheet-protection", "names"]) {
      expect(ids, id).toContain(id);
    }
    expect(issues.find((i) => i.id === "conditional-formatting")!.detail).toContain('"Report"');
    // The data itself is still imported.
    const { workbook } = openWorkbookBytes(bytes, "report.xlsx");
    const cells = workbook.sheets![workbook.sheetOrder![0]]!.cellData as Record<number, Record<number, ICellData>>;
    expect(cells[0][0].v).toBe(5);
    expect(cells[0][2].v).toBe("MacTuxel");
  });

  it("rejects files that aren't really XLSX", () => {
    expect(() => openWorkbookBytes(new TextEncoder().encode("not a zip"), "fake.xlsx")).toThrow(/isn't a valid Excel workbook/);
    expect(() => openWorkbookBytes(new Uint8Array([1, 2, 3]), "photo.png")).toThrow(/can't open/);
  });

  it("opens macro-enabled workbooks as copies and warns", async () => {
    const bytes = await excelJsFile((wb) => {
      wb.addWorksheet("M").getCell("A1").value = 1;
    });
    const opened = openWorkbookBytes(bytes, "macro.xlsm");
    expect(opened.canSaveInPlace).toBe(false);
  });
});

describe("legacy XLS, ODS and CSV", () => {
  const legacy = () => {
    const wb = utils.book_new();
    const ws = utils.aoa_to_sheet([
      ["Name", "Amount"],
      ["A", 1.5],
      ["B", 2.25],
    ]);
    ws["C2"] = { t: "n", f: "B2*2", v: 3 };
    ws["B2"].z = "0.00";
    ws["!ref"] = "A1:C3";
    ws["!merges"] = [{ s: { r: 3, c: 0 }, e: { r: 3, c: 1 } }];
    utils.book_append_sheet(wb, ws, "Old");
    utils.book_append_sheet(wb, utils.aoa_to_sheet([["two"]]), "Second");
    return wb;
  };

  it("imports .xls (BIFF8) written by SheetJS: values, number formats, sheets", () => {
    const bytes = new Uint8Array(sheetjsWrite(legacy(), { type: "array", bookType: "biff8" }) as ArrayBuffer);
    const opened = openWorkbookBytes(bytes, "old.xls");
    expect(opened.kind).toBe("xls");
    expect(opened.canSaveInPlace).toBe(false);
    expect(opened.issues.map((i) => i.id)).toEqual(["legacy-format"]);
    const wb = opened.workbook;
    expect(wb.sheetOrder!.map((id) => wb.sheets![id]!.name)).toEqual(["Old", "Second"]);
    const cells = wb.sheets![wb.sheetOrder![0]]!.cellData as Record<number, Record<number, ICellData>>;
    expect(cells[1][1].v).toBe(1.5);
    expect(wb.styles![cells[1][1].s as string]).toEqual({ n: { pattern: "0.00" } });
  });

  it("imports .xls with formulas written by an independent library (xlwt)", () => {
    // tests/fixtures/legacy-formulas.xls was generated by Python xlwt 1.3.0 (see README).
    const bytes = new Uint8Array(readFileSync("tests/fixtures/legacy-formulas.xls"));
    const wb = openWorkbookBytes(bytes, "legacy-formulas.xls").workbook;
    expect(wb.sheetOrder!.map((id) => wb.sheets![id]!.name)).toEqual(["Ledger", "Second"]);
    const sheet = wb.sheets![wb.sheetOrder![0]]!;
    const cells = sheet.cellData as Record<number, Record<number, ICellData>>;
    expect(cells[0][0].v).toBe("Item");
    expect(cells[1][3]).toMatchObject({ f: "=B2*C2" });
    expect(cells[3][3]).toMatchObject({ f: "=SUM(D2:D3)" });
    expect(wb.styles![cells[1][2].s as string]).toEqual({ n: { pattern: "#,##0.00" } });
    expect(cells[4][0].v).toBe(46095); // 2026-03-14
    expect(wb.styles![cells[4][0].s as string]).toEqual({ n: { pattern: "yyyy-mm-dd" } });
    expect(sheet.mergeData).toEqual([{ startRow: 6, endRow: 6, startColumn: 0, endColumn: 2 }]);
  });

  it("imports .ods", () => {
    const bytes = new Uint8Array(sheetjsWrite(legacy(), { type: "array", bookType: "ods" }) as ArrayBuffer);
    const opened = openWorkbookBytes(bytes, "sheet.ods");
    const cells = opened.workbook.sheets![opened.workbook.sheetOrder![0]]!.cellData as Record<number, Record<number, ICellData>>;
    expect(cells[2][1].v).toBe(2.25);
  });

  it("imports UTF-8 CSV (with or without BOM) and exports CSV with a BOM", () => {
    for (const prefix of ["", "﻿"]) {
      const opened = openWorkbookBytes(new TextEncoder().encode(`${prefix}city,temp\nZürich,-3.5\n東京,12\n`), "w.csv");
      const cells = opened.workbook.sheets![opened.workbook.sheetOrder![0]]!.cellData as Record<number, Record<number, ICellData>>;
      expect(cells[0][0].v).toBe("city");
      expect(cells[1][0].v).toBe("Zürich");
      expect(cells[1][1]).toMatchObject({ v: -3.5, t: CellValueType.NUMBER });
      expect(cells[2][0].v).toBe("東京");
    }
    const saved = saveWorkbookBytes(sampleWorkbook(), "csv", { activeSheetName: "Q1 Budget" });
    expect([...saved.bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // UTF-8 BOM
    const text = new TextDecoder().decode(saved.bytes); // (TextDecoder drops the BOM)
    expect(text.split("\n")[0]).toBe("Item,Cost,Share,Due");
    // Like Excel, CSV gets the displayed values.
    expect(text.split("\n")[1]).toBe('Rent,"$1,500.00",60.0%,2026-01-01');
    expect(saved.issues.map((i) => i.id).sort()).toEqual(["csv-formatting", "csv-formulas", "csv-sheets"]);
  });
});

describe("export details found in app testing", () => {
  const book = (styles: Record<string, IStyleData>, cells: Record<number, Record<number, ICellData>>): IWorkbookData => ({
    id: "w", name: "w", appVersion: "", locale: "enUS" as IWorkbookData["locale"], styles,
    sheetOrder: ["s"], sheets: { s: { id: "s", name: "S", cellData: cells } },
  });

  it("treats the grid editor's stamped text colour as Automatic, but keeps chosen colours", async () => {
    const { bytes } = exportXlsx(
      book({ typed: { cl: { rgb: "#1B1C1F" } }, chosen: { cl: { rgb: "#DC2626" } } }, {
        0: { 0: { v: "typed", s: "typed" }, 1: { v: "red", s: "chosen" } },
      }),
    );
    const ws = (await readWithExcelJS(bytes)).worksheets[0];
    expect(ws.getCell("A1").font?.color).toBeUndefined();
    expect(ws.getCell("B1").font?.color).toMatchObject({ argb: "FFDC2626" });
  });

  it("writes date formats as explicit codes (not locale-dependent built-ins)", async () => {
    const { bytes } = exportXlsx(book({ d: { n: { pattern: "m/d/yyyy" } }, t: { n: { pattern: "h:mm" } } }, { 0: { 0: { v: 46095, t: CellValueType.NUMBER, s: "d" }, 1: { v: 0.5, t: CellValueType.NUMBER, s: "t" } } }));
    const ws = (await readWithExcelJS(bytes)).worksheets[0];
    expect(ws.getCell("A1").numFmt).toBe("m/d/yyyy");
    expect(ws.getCell("B1").numFmt).toBe("h:mm");
  });
});
