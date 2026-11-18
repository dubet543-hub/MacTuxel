/** Number-format presets offered in the Home ▸ Number group. Patterns use Excel-compatible syntax. */
export interface NumberFormatPreset {
  id: string;
  label: string;
  pattern: string;
  /** Sample shown in the menu, rendered for 1234.5 (or a date/time). */
  sample: string;
}

export const GENERAL_PATTERN = "General";

export const NUMBER_FORMAT_PRESETS: readonly NumberFormatPreset[] = [
  { id: "general", label: "General", pattern: GENERAL_PATTERN, sample: "1234.5" },
  { id: "number", label: "Number", pattern: "0.00", sample: "1234.50" },
  { id: "comma", label: "Comma", pattern: "#,##0.00", sample: "1,234.50" },
  { id: "currency", label: "Currency", pattern: '"$"#,##0.00', sample: "$1,234.50" },
  { id: "accounting", label: "Accounting", pattern: '_("$"* #,##0.00_);_("$"* (#,##0.00);_("$"* "-"??_);_(@_)', sample: "$ 1,234.50" },
  { id: "short-date", label: "Short Date", pattern: "m/d/yyyy", sample: "3/14/2026" },
  { id: "long-date", label: "Long Date", pattern: "dddd, mmmm d, yyyy", sample: "Saturday, March 14, 2026" },
  { id: "time", label: "Time", pattern: "h:mm:ss AM/PM", sample: "1:30:00 PM" },
  { id: "percent", label: "Percentage", pattern: "0.00%", sample: "12.50%" },
  { id: "fraction", label: "Fraction", pattern: "# ?/?", sample: "1234 1/2" },
  { id: "scientific", label: "Scientific", pattern: "0.00E+00", sample: "1.23E+03" },
  { id: "text", label: "Text", pattern: "@", sample: "1234.5" },
];

/** Best-effort label for the format currently applied to a cell. */
export function describeNumberFormat(pattern: string | null | undefined): string {
  if (!pattern || pattern === GENERAL_PATTERN) return "General";
  const preset = NUMBER_FORMAT_PRESETS.find((p) => p.pattern === pattern);
  if (preset) return preset.label;
  if (pattern === "@") return "Text";
  if (/%/.test(pattern)) return "Percentage";
  if (/E[+-]/i.test(pattern)) return "Scientific";
  if (/[$€£¥]/.test(pattern)) return "Currency";
  if (/[dmy]/i.test(pattern) && !/[#0]/.test(pattern)) return /[hs]/i.test(pattern) ? "Date & Time" : "Date";
  if (/[hs]/i.test(pattern) && !/[#0]/.test(pattern)) return "Time";
  if (/[#0]/.test(pattern)) return "Number";
  return "Custom";
}
