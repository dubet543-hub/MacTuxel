import { describe, expect, it } from "vitest";
import { read, utils, write } from "xlsx";
import { CellValueType, type IWorkbookData } from "@univerjs/presets";
import { fileKindOf, openWorkbookBytes, saveKindFor, saveWorkbookBytes } from "../../src/io/formats";
import { baseName, extensionOf, fileNameOf, univerToSheetjs } from "../../src/io/workbookConvert";

function xlsxBytes(build: () => ReturnType<typeof utils.book_new>): Uint8Array {
  return new Uint8Array(write(build(), { type: "array", bookType: "xlsx" }) as ArrayBuffer);
}

function firstSheet(data: Partial<IWorkbookData>) {
  const id = data.sheetOrder![0];
  return data.sheets![id]!;
}

describe("path helpers", () => {
  it("extracts extension, names and kinds", () => {
    expect(extensionOf("/Users/a/Budget 2026.XLSX")).toBe("xlsx");
    expect(baseName("/Users/a/Budget 2026.xlsx")).toBe("Budget 2026");
    expect(fileNameOf("/Users/a/Budget 2026.xlsx")).toBe("Budget 2026.xlsx");
    expect(extensionOf("/Users/a/noext")).toBe("");
    expect(fileKindOf("/x/y.XLS")).toBe("xls");
    expect(fileKindOf("/x/y.numbers")).toBeNull();
    expect(saveKindFor("/x/y.csv")).toBe("csv");
    expect(saveKindFor("/x/y.xlsx")).toBe("xlsx");
    expect(saveKindFor("/x/y")).toBe("xlsx");
  });
});

describe("import from SheetJS-written XLSX", () => {
  it("converts text, numbers, booleans, formulas, number formats and merges", () => {
    const bytes = xlsxBytes(() => {
      const wb = utils.book_new();
      const ws = utils.aoa_to_sheet([
        ["Item", "Qty", "Price"],
        ["Apples", 3, 1.5],
        ["Pears", 2, 2.25],
        [true, null, null],
      ]);
      ws["C2"].z = "0.00";
      ws["D2"] = { t: "n", f: "B2*C2", v: 4.5 };
      ws["!ref"] = "A1:D4";
      ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];
      utils.book_append_sheet(wb, ws, "Fruit");
      utils.book_append_sheet(wb, utils.aoa_to_sheet([["second"]]), "Other");
      return wb;
    });

    const { workbook: data } = openWorkbookBytes(bytes, "Fruit list.xlsx");
    expect(data.name).toBe("Fruit list");
    expect(data.sheetOrder).toHaveLength(2);

    const sheet = firstSheet(data);
    expect(sheet.name).toBe("Fruit");
    const cells = sheet.cellData as Record<number, Record<number, any>>;
    expect(cells[0][0]).toMatchObject({ v: "Item", t: CellValueType.STRING });
    expect(cells[1][1]).toMatchObject({ v: 3, t: CellValueType.NUMBER });
    expect(cells[1][3]).toMatchObject({ f: "=B2*C2", v: 4.5 });
    expect(cells[3][0]).toMatchObject({ t: CellValueType.BOOLEAN, v: 1 });
    expect(data.styles![cells[1][2].s as string]).toMatchObject({ n: { pattern: "0.00" } });
    expect(sheet.mergeData).toEqual([{ startRow: 0, startColumn: 0, endRow: 0, endColumn: 1 }]);
    expect(sheet.rowCount).toBeGreaterThanOrEqual(1000);
    expect(sheet.columnCount).toBeGreaterThanOrEqual(26);
  });
});

describe("export", () => {
  const snapshot: IWorkbookData = {
    id: "wb",
    name: "Test",
    appVersion: "",
    locale: "enUS" as IWorkbookData["locale"],
    styles: { money: { n: { pattern: "$#,##0.00" } } },
    sheetOrder: ["s1"],
    sheets: {
      s1: {
        id: "s1",
        name: "Data",
        cellData: {
          0: { 0: { v: "Label" }, 1: { v: 10, t: CellValueType.NUMBER, s: "money" } },
          1: { 0: { v: "Twice" }, 1: { f: "=B1*2", v: 20, si: "shared1" } },
          2: { 1: { si: "shared1", v: 40 } },
          3: { 0: { v: 1, t: CellValueType.BOOLEAN } },
          4: { 0: { p: { id: "d", body: { dataStream: "Rich text\r\n" }, documentStyle: {} } } },
        },
        mergeData: [{ startRow: 5, endRow: 6, startColumn: 0, endColumn: 1 }],
      },
    },
  };

  it("maps values, formulas, shared formulas, rich text and merges through SheetJS", () => {
    const wb = univerToSheetjs(snapshot, (f, dx, dy) => (dx === 0 && dy === 1 && f === "=B1*2" ? "=B2*2" : f));
    const ws = wb.Sheets["Data"];
    expect(ws["A1"]).toMatchObject({ t: "s", v: "Label" });
    expect(ws["B1"]).toMatchObject({ t: "n", v: 10, z: "$#,##0.00" });
    expect(ws["B2"]).toMatchObject({ t: "n", v: 20, f: "B1*2" });
    expect(ws["B3"]).toMatchObject({ t: "n", v: 40, f: "B2*2" });
    expect(ws["A4"]).toMatchObject({ t: "b", v: true });
    expect(ws["A5"]).toMatchObject({ t: "s", v: "Rich text" });
    expect(ws["!merges"]).toEqual([{ s: { r: 5, c: 0 }, e: { r: 6, c: 1 } }]);
    expect(ws["!ref"]).toBe("A1:B7");
  });

  it("writes a valid xlsx that round-trips", () => {
    const { bytes } = saveWorkbookBytes(snapshot, "xlsx");
    const back = read(bytes, { type: "array", cellFormula: true });
    expect(back.SheetNames).toEqual(["Data"]);
    expect(back.Sheets["Data"]["B2"].f).toBe("B1*2");
    expect(back.Sheets["Data"]["A1"].v).toBe("Label");

    const reimported = openWorkbookBytes(bytes, "again.xlsx").workbook;
    const cells = firstSheet(reimported).cellData as Record<number, Record<number, any>>;
    expect(cells[1][1]).toMatchObject({ f: "=B1*2", v: 20 });
  });

  it("dedupes sheet names case-insensitively and limits them to 31 chars", () => {
    const long = "A".repeat(40);
    const wb = univerToSheetjs({
      ...snapshot,
      sheetOrder: ["a", "b", "c"],
      sheets: {
        a: { id: "a", name: long, cellData: {} },
        b: { id: "b", name: long, cellData: {} },
        c: { id: "c", name: "data", cellData: {} },
      },
    });
    expect(wb.SheetNames[0]).toHaveLength(31);
    expect(wb.SheetNames[1]).not.toBe(wb.SheetNames[0]);
    expect(wb.SheetNames[1].length).toBeLessThanOrEqual(31);
  });
});
