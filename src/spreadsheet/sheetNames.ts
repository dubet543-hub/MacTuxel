export const MAX_SHEET_NAME_LENGTH = 31;
const FORBIDDEN = /[\\/?*[\]:]/;

/** Validates a worksheet name using the rules Excel files require. Returns an error message or null. */
export function validateSheetName(name: string, existing: readonly string[], currentName?: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "A sheet name can't be blank.";
  if (trimmed.length > MAX_SHEET_NAME_LENGTH) return `A sheet name can't be longer than ${MAX_SHEET_NAME_LENGTH} characters.`;
  if (FORBIDDEN.test(trimmed)) return "A sheet name can't contain any of these characters: \\ / ? * [ ] :";
  if (trimmed.startsWith("'") || trimmed.endsWith("'")) return "A sheet name can't begin or end with an apostrophe.";
  const lower = trimmed.toLowerCase();
  if (existing.some((n) => n.toLowerCase() === lower && n !== currentName)) return `A sheet named "${trimmed}" already exists.`;
  return null;
}

/** "Sheet1" → "Sheet1 (2)", skipping names already taken. */
export function uniqueCopyName(base: string, existing: readonly string[]): string {
  const taken = new Set(existing.map((n) => n.toLowerCase()));
  for (let n = 2; ; n++) {
    const suffix = ` (${n})`;
    const candidate = base.slice(0, MAX_SHEET_NAME_LENGTH - suffix.length) + suffix;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}
