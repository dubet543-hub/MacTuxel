import type { XlsxPackage } from "./ooxml/package";
import { readText } from "./ooxml/package";

/** Something in a file that MacTuxel will drop or change when it saves. */
export interface CompatIssue {
  /** Stable key, used to tell whether the user has already acknowledged it. */
  id: string;
  title: string;
  detail: string;
  /** "removed": lost on save. "changed": kept approximately. */
  effect: "removed" | "changed";
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function sheetList(names: string[]): string {
  const unique = [...new Set(names)];
  const shown = unique.slice(0, 3).map((n) => `"${n}"`).join(", ");
  return unique.length > 3 ? `${shown} and ${unique.length - 3} more` : shown;
}

/** Scans an XLSX package for features MacTuxel doesn't preserve. */
export function detectXlsxIssues(pkg: XlsxPackage, styleApproximations: Iterable<string>): CompatIssue[] {
  const issues: CompatIssue[] = [];
  const paths = Object.keys(pkg.files);
  const count = (re: RegExp) => paths.filter((p) => re.test(p)).length;
  const removed = (id: string, title: string, detail: string) => issues.push({ id, title, detail, effect: "removed" });
  const changed = (id: string, title: string, detail: string) => issues.push({ id, title, detail, effect: "changed" });

  const charts = count(/^xl\/charts\/chart\d+\.xml$/);
  if (charts) removed("charts", "Charts", `${plural(charts, "chart")} will be removed.`);
  const media = count(/^xl\/media\//);
  if (media) removed("pictures", "Pictures", `${plural(media, "picture")} will be removed.`);
  const drawings = count(/^xl\/drawings\/drawing\d+\.xml$/);
  if (drawings && !charts && !media) removed("shapes", "Shapes and text boxes", "Drawing objects will be removed.");
  const pivots = count(/^xl\/pivotTables\/pivotTable\d+\.xml$/);
  if (pivots) removed("pivots", "PivotTables", `${plural(pivots, "PivotTable")} will be converted to plain values.`);
  const tables = count(/^xl\/tables\/table\d+\.xml$/);
  if (tables) removed("tables", "Excel tables", `${plural(tables, "table")} will become ordinary cell ranges (data is kept).`);
  const comments = count(/^xl\/comments\d*\.xml$/) + count(/^xl\/threadedComments\//);
  if (comments) removed("comments", "Comments and notes", "Cell comments and notes will be removed.");
  if (pkg.files["xl/vbaProject.bin"]) removed("macros", "Macros (VBA)", "Macros will be removed. Save as .xlsx only if you no longer need them.");
  const links = count(/^xl\/externalLinks\//);
  if (links) removed("external-links", "Links to other workbooks", "Formulas keep their last values, but external link definitions are removed.");
  if (count(/^xl\/(slicers|slicerCaches|timelines|timelineCaches)\//)) removed("slicers", "Slicers and timelines", "Slicers and timelines will be removed.");
  if (pkg.files["xl/connections.xml"] || count(/^xl\/queryTables\//)) removed("connections", "Data connections", "External data connections will be removed.");
  if (count(/^xl\/ctrlProps\//)) removed("controls", "Form controls", "Form controls will be removed.");

  const wbXml = readText(pkg.files, pkg.workbookPath) ?? "";
  const names = [...wbXml.matchAll(/<definedName\b[^>]*\bname="([^"]+)"/g)].map((m) => m[1]);
  const userNames = names.filter((n) => !n.startsWith("_xlnm."));
  if (userNames.length) removed("names", "Named ranges", `${plural(userNames.length, "name")} (e.g. ${userNames[0]}) will be removed; formulas that use them will show errors.`);
  if (names.some((n) => n.startsWith("_xlnm.Print"))) removed("print-areas", "Print areas and titles", "Print areas and print titles will be removed.");
  if (/<workbookProtection\b/.test(wbXml)) removed("workbook-protection", "Workbook protection", "Workbook structure protection will be removed.");
  if (/<workbookPr\b[^>]*\bdate1904="(1|true)"/.test(wbXml)) changed("date1904", "1904 date system", "Dates are converted to the 1900 date system; they'll display the same.");

  const sheetFeatures: [RegExp, string, string, string, "removed" | "changed"][] = [
    [/<conditionalFormatting\b/, "conditional-formatting", "Conditional formatting", "Conditional formatting rules will be removed", "removed"],
    [/<dataValidations?\b/, "data-validation", "Data validation", "Drop-down lists and input rules will be removed", "removed"],
    [/<hyperlinks?\b/, "hyperlinks", "Hyperlinks", "Links are removed; the cell text is kept", "removed"],
    [/<sheetProtection\b/, "sheet-protection", "Sheet protection", "Sheet protection will be removed", "removed"],
    [/<autoFilter\b/, "filters", "Filters", "Filter buttons and hidden filter results will be removed", "removed"],
    [/sparklineGroup/, "sparklines", "Sparklines", "Sparklines will be removed", "removed"],
    [/<f\b[^>]*\bt="array"/, "array-formulas", "Array formulas", "Array formulas are kept as ordinary formulas in their top-left cell", "changed"],
    [/\boutlineLevel(Row|Col)?="[1-9]/, "outline", "Grouped rows and columns", "Grouping is removed; the rows and columns stay", "removed"],
    // Only non-default print settings: Excel writes orientation="portrait" etc. into almost every file.
    [/<(rowBreaks|colBreaks)\b|<(oddHeader|oddFooter|evenHeader|evenFooter|firstHeader|firstFooter)>[^<]+<|<pageSetup\b[^>]*\borientation="landscape"|<pageSetup\b[^>]*\bscale="(?!100")\d+"|<pageSetUpPr\b[^>]*\bfitToPage="(1|true)"/, "page-setup", "Page setup", "Page breaks, headers, footers and print settings will be removed", "removed"],
    [/<legacyDrawing\b|<oleObjects\b|<controls\b/, "objects", "Embedded objects", "Embedded objects will be removed", "removed"],
  ];
  const hits = new Map<string, string[]>();
  for (const sheet of pkg.sheets) {
    const xml = readText(pkg.files, sheet.path);
    if (!xml) continue;
    for (const [re, id] of sheetFeatures) if (re.test(xml)) hits.set(id, [...(hits.get(id) ?? []), sheet.name]);
  }
  for (const [, id, title, detail, effect] of sheetFeatures) {
    const on = hits.get(id);
    if (on && !issues.some((i) => i.id === id)) issues.push({ id, title, detail: `${detail} (on ${sheetList(on)}).`, effect });
  }

  const sst = readText(pkg.files, pkg.sharedStringsPath) ?? "";
  if (/<si>\s*<r>|<si><r>|<r><rPr>/.test(sst)) changed("rich-text", "Mixed formatting inside a cell", "Text keeps its content; formatting applied to part of a cell's text is simplified.");

  for (const label of styleApproximations) changed(`style:${label}`, label, "Shown approximately and saved in its simplified form.");
  return issues;
}

/** Issues to show when saving the current workbook as CSV. */
export function csvExportIssues(sheetCount: number, hasFormulas: boolean, hasFormatting: boolean): CompatIssue[] {
  const issues: CompatIssue[] = [];
  if (sheetCount > 1) issues.push({ id: "csv-sheets", title: "Only the current sheet", detail: `CSV holds one sheet; the other ${plural(sheetCount - 1, "sheet")} won't be exported.`, effect: "removed" });
  if (hasFormulas) issues.push({ id: "csv-formulas", title: "Formulas", detail: "Formulas are exported as their current values.", effect: "changed" });
  if (hasFormatting) issues.push({ id: "csv-formatting", title: "Formatting", detail: "Fonts, colours, borders, sizes and merged cells aren't stored in CSV.", effect: "removed" });
  return issues;
}

/** Stable fingerprint of a set of issues (to skip re-asking for the same warnings). */
export function issuesKey(issues: CompatIssue[]): string {
  return issues.map((i) => i.id).sort().join("|");
}
