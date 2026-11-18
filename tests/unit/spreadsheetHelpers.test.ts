import { describe, expect, it } from "vitest";
import { CellValueType } from "@univerjs/presets";
import { planAutoSum } from "../../src/spreadsheet/autoSum";
import { cellInputText, parseCellInput, statValue } from "../../src/spreadsheet/cellInput";
import { cellLabel, columnIndex, columnLabel, parseRangeRef, rangeLabel } from "../../src/spreadsheet/cellRefs";
import { describeNumberFormat, NUMBER_FORMAT_PRESETS } from "../../src/spreadsheet/numberFormats";
import { computeStats, formatStat } from "../../src/spreadsheet/selectionStats";
import { uniqueCopyName, validateSheetName } from "../../src/spreadsheet/sheetNames";
import { FUNCTION_CATALOG, FUNCTION_CATEGORIES, functionsIn } from "../../src/spreadsheet/functionCatalog";

describe("cell references", () => {
  it("converts column labels both ways", () => {
    expect([0, 25, 26, 51, 701, 702, 16383].map(columnLabel)).toEqual(["A", "Z", "AA", "AZ", "ZZ", "AAA", "XFD"]);
    expect(["A", "Z", "AA", "ZZ", "XFD"].map(columnIndex)).toEqual([0, 25, 26, 701, 16383]);
    expect(cellLabel(9, 4)).toBe("E10");
  });

  it("parses single cells, ranges, absolute refs and reversed corners", () => {
    expect(parseRangeRef("b7")).toEqual({ start: { row: 6, col: 1 }, end: { row: 6, col: 1 } });
    expect(parseRangeRef("$A$1:$C$3")).toEqual({ start: { row: 0, col: 0 }, end: { row: 2, col: 2 } });
    expect(parseRangeRef("C3:A1")).toEqual({ start: { row: 0, col: 0 }, end: { row: 2, col: 2 } });
    expect(rangeLabel(parseRangeRef(" d4 ")!)).toBe("D4");
  });

  it("rejects invalid references", () => {
    for (const bad of ["", "A", "1", "A0", "AAAA1", "A1:B", "A1:B2:C3", "hello", "XFE1", "A1048577"]) {
      expect(parseRangeRef(bad), bad).toBeNull();
    }
  });
});

describe("AutoSum planning", () => {
  const grid = new Set(["0,0", "1,0", "2,0", "0,1", "1,1", "4,4", "4,5"]);
  const isNumeric = (r: number, c: number) => grid.has(`${r},${c}`);

  it("sums the numbers above a single cell", () => {
    expect(planAutoSum("SUM", { startRow: 3, endRow: 3, startColumn: 0, endColumn: 0 }, isNumeric)).toEqual([
      { row: 3, col: 0, formula: "=SUM(A1:A3)" },
    ]);
  });

  it("falls back to the numbers on the left", () => {
    expect(planAutoSum("AVERAGE", { startRow: 4, endRow: 4, startColumn: 6, endColumn: 6 }, isNumeric)).toEqual([
      { row: 4, col: 6, formula: "=AVERAGE(E5:F5)" },
    ]);
  });

  it("returns nothing when there's nothing numeric nearby", () => {
    expect(planAutoSum("SUM", { startRow: 10, endRow: 10, startColumn: 10, endColumn: 10 }, isNumeric)).toEqual([]);
  });

  it("totals each numeric column below a block, skipping text-only columns", () => {
    expect(planAutoSum("MAX", { startRow: 0, endRow: 2, startColumn: 0, endColumn: 2 }, isNumeric)).toEqual([
      { row: 3, col: 0, formula: "=MAX(A1:A3)" },
      { row: 3, col: 1, formula: "=MAX(B1:B3)" },
    ]);
  });

  it("totals a horizontal strip to its right", () => {
    expect(planAutoSum("SUM", { startRow: 4, endRow: 4, startColumn: 4, endColumn: 5 }, isNumeric)).toEqual([
      { row: 4, col: 6, formula: "=SUM(E5:F5)" },
    ]);
  });
});

describe("selection statistics", () => {
  it("counts non-empty cells and aggregates numbers only", () => {
    const s = computeStats([[[1, "x", null], [2, "", true], [3, undefined, 4]]], 9);
    expect(s).toMatchObject({ cells: 9, count: 6, numericCount: 4, sum: 10, average: 2.5, min: 1, max: 4 });
  });

  it("has no average without numbers", () => {
    expect(computeStats([[["a", "b"]]], 2)).toMatchObject({ count: 2, numericCount: 0, average: null, sum: 0 });
  });

  it("formats like a status bar", () => {
    expect(formatStat(1234567.5)).toBe("1,234,567.5");
    expect(formatStat(0.1 + 0.2)).toBe("0.3");
    expect(formatStat(-3)).toBe("-3");
  });
});

describe("cell input", () => {
  it("parses formula-bar text into typed values", () => {
    expect(parseCellInput("")).toBeNull();
    expect(parseCellInput("=A1+1")).toBe("=A1+1");
    expect(parseCellInput("42")).toBe(42);
    expect(parseCellInput(" -3.5e2 ")).toBe(-350);
    expect(parseCellInput(".5")).toBe(0.5);
    expect(parseCellInput("TRUE")).toBe(true);
    expect(parseCellInput("false")).toBe(false);
    expect(parseCellInput("12 apples")).toBe("12 apples");
    expect(parseCellInput("1,000")).toBe("1,000"); // not silently reinterpreted
  });

  it("shows formulas, booleans and rich text for editing", () => {
    expect(cellInputText(null)).toBe("");
    expect(cellInputText({ f: "=SUM(A1:A2)", v: 3 })).toBe("=SUM(A1:A2)");
    expect(cellInputText({ v: 1, t: CellValueType.BOOLEAN })).toBe("TRUE");
    expect(cellInputText({ v: 0, t: CellValueType.BOOLEAN })).toBe("FALSE");
    expect(cellInputText({ v: 7 })).toBe("7");
    expect(cellInputText({ p: { id: "d", body: { dataStream: "Rich\r\n" }, documentStyle: {} } })).toBe("Rich");
  });

  it("feeds statistics without counting booleans as numbers", () => {
    expect(statValue({ v: 1, t: CellValueType.BOOLEAN })).toBe(true);
    expect(statValue({ v: "5", t: CellValueType.NUMBER })).toBe(5);
    expect(statValue({ v: 5 })).toBe(5);
    expect(statValue({})).toBeNull();
  });
});

describe("sheet names", () => {
  const existing = ["Sheet1", "Budget"];
  it("accepts valid unique names", () => {
    expect(validateSheetName("Forecast", existing)).toBeNull();
    expect(validateSheetName("budget", existing, "Budget")).toBeNull(); // renaming itself
  });
  it("rejects blank, long, duplicate and illegal names", () => {
    expect(validateSheetName("  ", existing)).toMatch(/blank/);
    expect(validateSheetName("x".repeat(32), existing)).toMatch(/31/);
    expect(validateSheetName("BUDGET", existing)).toMatch(/already exists/);
    for (const ch of ["\\", "/", "?", "*", "[", "]", ":"]) expect(validateSheetName(`a${ch}b`, existing)).toMatch(/can't contain/);
    expect(validateSheetName("'quoted'", existing)).toMatch(/apostrophe/);
  });
  it("makes unique copy names within the length limit", () => {
    expect(uniqueCopyName("Sheet1", ["Sheet1"])).toBe("Sheet1 (2)");
    expect(uniqueCopyName("Sheet1", ["Sheet1", "Sheet1 (2)"])).toBe("Sheet1 (3)");
    const long = "L".repeat(31);
    const copy = uniqueCopyName(long, [long]);
    expect(copy.length).toBeLessThanOrEqual(31);
    expect(copy.endsWith(" (2)")).toBe(true);
  });
});

describe("number formats", () => {
  it("describes presets and common custom patterns", () => {
    for (const p of NUMBER_FORMAT_PRESETS) expect(describeNumberFormat(p.pattern)).toBe(p.label);
    expect(describeNumberFormat(null)).toBe("General");
    expect(describeNumberFormat("0.000%")).toBe("Percentage");
    expect(describeNumberFormat('"€"#,##0')).toBe("Currency");
    expect(describeNumberFormat("yyyy-mm-dd")).toBe("Date");
    expect(describeNumberFormat("#,##0.000")).toBe("Number");
  });
});

describe("function catalog", () => {
  it("is well-formed: unique names, every category populated, examples are formulas", () => {
    const names = FUNCTION_CATALOG.map((f) => f.name);
    expect(new Set(names).size).toBe(names.length);
    for (const cat of FUNCTION_CATEGORIES) expect(functionsIn(cat).length).toBeGreaterThan(0);
    for (const f of FUNCTION_CATALOG) {
      expect(f.example.startsWith("=")).toBe(true);
      expect(f.syntax.startsWith(f.name)).toBe(true);
    }
  });
});
