/**
 * SpreadsheetML colour resolution: rgb / theme+tint / indexed / auto → "#rrggbb".
 * References: ECMA-376 Part 1, §18.8.19 (color), §18.8.27 (indexedColors), §20.1.6.2 (clrScheme).
 */

/** Default Office theme (2013+) used when a file has no theme part. */
export const DEFAULT_THEME_COLORS = [
  "#FFFFFF", // 0 lt1  (Excel maps theme index 0 to lt1 and 1 to dk1)
  "#000000", // 1 dk1
  "#E7E6E6", // 2 lt2
  "#44546A", // 3 dk2
  "#4472C4", // 4 accent1
  "#ED7D31", // 5 accent2
  "#A5A5A5", // 6 accent3
  "#FFC000", // 7 accent4
  "#5B9BD5", // 8 accent5
  "#70AD47", // 9 accent6
  "#0563C1", // 10 hlink
  "#954F72", // 11 folHlink
];

/** The legacy 64-entry indexed palette (BIFF8 default), ECMA-376 §18.8.27. */
export const DEFAULT_INDEXED_COLORS = [
  "#000000", "#FFFFFF", "#FF0000", "#00FF00", "#0000FF", "#FFFF00", "#FF00FF", "#00FFFF",
  "#000000", "#FFFFFF", "#FF0000", "#00FF00", "#0000FF", "#FFFF00", "#FF00FF", "#00FFFF",
  "#800000", "#008000", "#000080", "#808000", "#800080", "#008080", "#C0C0C0", "#808080",
  "#9999FF", "#993366", "#FFFFCC", "#CCFFFF", "#660066", "#FF8080", "#0066CC", "#CCCCFF",
  "#000080", "#FF00FF", "#FFFF00", "#00FFFF", "#800080", "#800000", "#008080", "#0000FF",
  "#00CCFF", "#CCFFFF", "#CCFFCC", "#FFFF99", "#99CCFF", "#FF99CC", "#CC99FF", "#FFCC99",
  "#3366FF", "#33CCCC", "#99CC00", "#FFCC00", "#FF9900", "#FF6600", "#666699", "#969696",
  "#003366", "#339966", "#003300", "#333300", "#993300", "#993366", "#333399", "#333333",
];
const INDEXED_SYSTEM_FOREGROUND = 64;
const INDEXED_SYSTEM_BACKGROUND = 65;

export interface ColorContext {
  theme: string[];
  indexed: string[];
}

export const DEFAULT_COLOR_CONTEXT: ColorContext = { theme: DEFAULT_THEME_COLORS, indexed: DEFAULT_INDEXED_COLORS };

/** Normalises "#abc", "#aabbcc", "rgb(1,2,3)", "FFAABBCC" → "#AABBCC". Returns null if unparseable. */
export function normalizeHex(input: string | null | undefined | void): string | null {
  if (!input) return null;
  const s = input.trim();
  let m = /^#?([0-9a-f]{8})$/i.exec(s);
  if (m) return `#${m[1].slice(2).toUpperCase()}`; // ARGB: drop alpha
  m = /^#?([0-9a-f]{6})$/i.exec(s);
  if (m) return `#${m[1].toUpperCase()}`;
  m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(s);
  if (m) return `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}`.toUpperCase();
  m = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i.exec(s);
  if (m) return `#${[m[1], m[2], m[3]].map((v) => Math.min(255, Number(v)).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
  return null;
}

/** "#AABBCC" → "FFAABBCC" (opaque ARGB as SpreadsheetML expects). */
export function toArgb(hex: string): string {
  const n = normalizeHex(hex);
  if (!n) throw new Error(`Not a colour: ${hex}`);
  return `FF${n.slice(1)}`;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = normalizeHex(hex)!.slice(1);
  return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h /= 6;
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const hue = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue(p, q, h + 1 / 3) * 255, hue(p, q, h) * 255, hue(p, q, h - 1 / 3) * 255];
}

/** Applies a SpreadsheetML tint (−1…1) to a colour's luminance, §18.8.19. */
export function applyTint(hex: string, tint: number): string {
  if (!tint) return normalizeHex(hex)!;
  const [h, s, l] = rgbToHsl(...hexToRgb(hex));
  const lum = tint < 0 ? l * (1 + tint) : l * (1 - tint) + tint;
  return rgbToHex(...hslToRgb(h, s, lum));
}

export interface RawColor {
  rgb?: string | null;
  theme?: string | null;
  tint?: string | null;
  indexed?: string | null;
  auto?: string | null;
}

/** Resolves a <color>-style element's attributes. `null` means "automatic/none". */
export function resolveColor(raw: RawColor | null | undefined, ctx: ColorContext = DEFAULT_COLOR_CONTEXT): string | null {
  if (!raw) return null;
  const tint = raw.tint ? Number(raw.tint) : 0;
  let base: string | null = null;
  if (raw.rgb) base = normalizeHex(raw.rgb);
  else if (raw.theme != null && raw.theme !== "") base = ctx.theme[Number(raw.theme)] ?? null;
  else if (raw.indexed != null && raw.indexed !== "") {
    const i = Number(raw.indexed);
    if (i === INDEXED_SYSTEM_FOREGROUND || i === INDEXED_SYSTEM_BACKGROUND) return null; // system colours = automatic
    base = ctx.indexed[i] ?? null;
  }
  if (!base) return null;
  return tint ? applyTint(base, tint) : base;
}
