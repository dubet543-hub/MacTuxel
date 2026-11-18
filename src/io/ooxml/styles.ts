import {
  BooleanNumber,
  BorderStyleTypes,
  HorizontalAlign,
  TextDecoration,
  VerticalAlign,
  WrapStrategy,
  type IBorderData,
  type IStyleData,
} from "@univerjs/presets";
import { DEFAULT_COLOR_CONTEXT, normalizeHex, resolveColor, toArgb, type ColorContext } from "./colors";
import { attr, boolAttr, child, children, descendant, escapeXml, parseXml, valChild } from "./xml";

/** Built-in number formats, ECMA-376 Part 1 §18.8.30. */
export const BUILTIN_NUM_FMTS: Record<number, string> = {
  0: "General", 1: "0", 2: "0.00", 3: "#,##0", 4: "#,##0.00",
  9: "0%", 10: "0.00%", 11: "0.00E+00", 12: "# ?/?", 13: "# ??/??",
  14: "m/d/yyyy", 15: "d-mmm-yy", 16: "d-mmm", 17: "mmm-yy",
  18: "h:mm AM/PM", 19: "h:mm:ss AM/PM", 20: "h:mm", 21: "h:mm:ss", 22: "m/d/yyyy h:mm",
  37: "#,##0 ;(#,##0)", 38: "#,##0 ;[Red](#,##0)", 39: "#,##0.00;(#,##0.00)", 40: "#,##0.00;[Red](#,##0.00)",
  45: "mm:ss", 46: "[h]:mm:ss", 47: "mmss.0", 48: "##0.0E+0", 49: "@",
};

const BORDER_FROM_XML: Record<string, BorderStyleTypes> = {
  thin: BorderStyleTypes.THIN,
  hair: BorderStyleTypes.HAIR,
  dotted: BorderStyleTypes.DOTTED,
  dashed: BorderStyleTypes.DASHED,
  dashDot: BorderStyleTypes.DASH_DOT,
  dashDotDot: BorderStyleTypes.DASH_DOT_DOT,
  double: BorderStyleTypes.DOUBLE,
  medium: BorderStyleTypes.MEDIUM,
  mediumDashed: BorderStyleTypes.MEDIUM_DASHED,
  mediumDashDot: BorderStyleTypes.MEDIUM_DASH_DOT,
  mediumDashDotDot: BorderStyleTypes.MEDIUM_DASH_DOT_DOT,
  slantDashDot: BorderStyleTypes.SLANT_DASH_DOT,
  thick: BorderStyleTypes.THICK,
};
const BORDER_TO_XML = Object.fromEntries(Object.entries(BORDER_FROM_XML).map(([k, v]) => [v, k])) as Record<number, string>;

const H_FROM_XML: Record<string, HorizontalAlign> = {
  left: HorizontalAlign.LEFT,
  center: HorizontalAlign.CENTER,
  centerContinuous: HorizontalAlign.CENTER,
  right: HorizontalAlign.RIGHT,
  justify: HorizontalAlign.JUSTIFIED,
  distributed: HorizontalAlign.DISTRIBUTED,
};
const H_TO_XML: Partial<Record<HorizontalAlign, string>> = {
  [HorizontalAlign.LEFT]: "left",
  [HorizontalAlign.CENTER]: "center",
  [HorizontalAlign.RIGHT]: "right",
  [HorizontalAlign.JUSTIFIED]: "justify",
  [HorizontalAlign.BOTH]: "justify",
  [HorizontalAlign.DISTRIBUTED]: "distributed",
};
const V_FROM_XML: Record<string, VerticalAlign> = { top: VerticalAlign.TOP, center: VerticalAlign.MIDDLE, bottom: VerticalAlign.BOTTOM };
const V_TO_XML: Partial<Record<VerticalAlign, string>> = {
  [VerticalAlign.TOP]: "top",
  [VerticalAlign.MIDDLE]: "center",
  [VerticalAlign.BOTTOM]: "bottom",
};

/**
 * Excel textRotation: 0–90 counterclockwise, 91–180 clockwise by (v − 90), 255 vertical.
 * Univer tr.a: negative = counterclockwise, positive = clockwise.
 */
export function rotationFromExcel(v: number): { a: number; v?: BooleanNumber } | null {
  if (!v) return null;
  if (v === 255) return { a: 0, v: BooleanNumber.TRUE };
  if (v <= 90) return { a: -v };
  if (v <= 180) return { a: v - 90 };
  return null;
}

export function rotationToExcel(tr: { a?: number; v?: BooleanNumber } | null | undefined | void): number | null {
  if (!tr) return null;
  if (tr.v === BooleanNumber.TRUE) return 255;
  const a = Math.round(tr.a ?? 0);
  if (!a) return null;
  if (a < 0) return Math.min(90, -a);
  return 90 + Math.min(90, a);
}

export interface DefaultFont {
  name: string;
  size: number;
}

export interface ParsedStylesheet {
  /** Univer style per cellXfs index (null = no formatting beyond defaults). */
  xfStyles: (IStyleData | null)[];
  defaultFont: DefaultFont;
  /** Format features found that MacTuxel approximates or drops. */
  approximations: Set<string>;
}

type Raw = { rgb: string | null; theme: string | null; tint: string | null; indexed: string | null };
const rawColor = (e: Element | null): Raw | null =>
  e ? { rgb: attr(e, "rgb"), theme: attr(e, "theme"), tint: attr(e, "tint"), indexed: attr(e, "indexed") } : null;

export function parseStylesheet(xml: string | null, ctx: ColorContext = DEFAULT_COLOR_CONTEXT): ParsedStylesheet {
  const approximations = new Set<string>();
  if (!xml) return { xfStyles: [], defaultFont: { name: "Calibri", size: 11 }, approximations };
  const doc = parseXml(xml);

  const numFmts = new Map<number, string>();
  for (const n of children(descendant(doc, "numFmts"), "numFmt")) numFmts.set(Number(attr(n, "numFmtId")), attr(n, "formatCode") ?? "General");
  const fmtCode = (id: number) => numFmts.get(id) ?? BUILTIN_NUM_FMTS[id] ?? null;

  const fonts = children(descendant(doc, "fonts"), "font");
  const fonts0 = fonts[0];
  const defaultFont: DefaultFont = {
    name: valChild(fonts0, "name") ?? "Calibri",
    size: Number(valChild(fonts0, "sz") ?? 11),
  };
  const fontStyles = fonts.map((f) => {
    const s: IStyleData = {};
    const name = valChild(f, "name");
    const size = valChild(f, "sz");
    if (name && name !== defaultFont.name) s.ff = name;
    if (size && Number(size) !== defaultFont.size) s.fs = Number(size);
    const on = (tag: string) => {
      const v = valChild(f, tag);
      return v !== null && v !== "0" && v !== "false";
    };
    if (on("b")) s.bl = BooleanNumber.TRUE;
    if (on("i")) s.it = BooleanNumber.TRUE;
    if (on("strike")) s.st = { s: BooleanNumber.TRUE };
    const u = valChild(f, "u");
    if (u && u !== "none") s.ul = { s: BooleanNumber.TRUE, t: u.startsWith("double") ? TextDecoration.DOUBLE : TextDecoration.SINGLE };
    if (valChild(f, "vertAlign")) approximations.add("Superscript and subscript text");
    const color = resolveColor(rawColor(child(f, "color")), ctx);
    if (color && color !== "#000000") s.cl = { rgb: color };
    return s;
  });

  const fillStyles = children(descendant(doc, "fills"), "fill").map((f): IStyleData => {
    const pattern = child(f, "patternFill");
    if (pattern) {
      const type = attr(pattern, "patternType") ?? (child(pattern, "fgColor") ? "solid" : "none");
      if (type === "none") return {};
      const fg = resolveColor(rawColor(child(pattern, "fgColor")), ctx);
      if (type === "solid") return fg ? { bg: { rgb: fg } } : {};
      if (type === "gray125" || type === "gray0625") return {}; // Excel's reserved filler fills
      approximations.add("Patterned cell fills (shown as solid colour)");
      return fg ? { bg: { rgb: fg } } : {};
    }
    const gradient = child(f, "gradientFill");
    if (gradient) {
      approximations.add("Gradient cell fills (shown as solid colour)");
      const stop = child(gradient, "stop");
      const c = resolveColor(rawColor(child(stop, "color")), ctx);
      return c ? { bg: { rgb: c } } : {};
    }
    return {};
  });

  const borderStyles = children(descendant(doc, "borders"), "border").map((b): IStyleData => {
    const bd: IBorderData = {};
    const side = (tag: string, key: "t" | "b" | "l" | "r") => {
      const e = child(b, tag);
      const style = attr(e, "style");
      if (!e || !style || style === "none") return;
      bd[key] = { s: BORDER_FROM_XML[style] ?? BorderStyleTypes.THIN, cl: { rgb: resolveColor(rawColor(child(e, "color")), ctx) ?? "#000000" } };
    };
    side("left", "l");
    side("right", "r");
    side("top", "t");
    side("bottom", "b");
    if (attr(child(b, "diagonal"), "style")) approximations.add("Diagonal borders");
    return Object.keys(bd).length ? { bd } : {};
  });

  const xfStyles = children(descendant(doc, "cellXfs"), "xf").map((xf): IStyleData | null => {
    const s: IStyleData = {
      ...(fontStyles[Number(attr(xf, "fontId") ?? 0)] ?? {}),
      ...(fillStyles[Number(attr(xf, "fillId") ?? 0)] ?? {}),
      ...(borderStyles[Number(attr(xf, "borderId") ?? 0)] ?? {}),
    };
    const fmt = fmtCode(Number(attr(xf, "numFmtId") ?? 0));
    if (fmt && fmt !== "General") s.n = { pattern: fmt };
    const al = child(xf, "alignment");
    if (al) {
      const h = attr(al, "horizontal");
      if (h && H_FROM_XML[h] !== undefined) s.ht = H_FROM_XML[h];
      if (h === "fill" || h === "centerContinuous") approximations.add("Fill and center-across-selection alignment");
      const v = attr(al, "vertical");
      if (v && V_FROM_XML[v] !== undefined) s.vt = V_FROM_XML[v];
      if (v === "justify" || v === "distributed") approximations.add("Justified vertical alignment");
      if (boolAttr(al, "wrapText")) s.tb = WrapStrategy.WRAP;
      const tr = rotationFromExcel(Number(attr(al, "textRotation") ?? 0));
      if (tr) s.tr = tr;
      if (Number(attr(al, "indent") ?? 0) > 0) approximations.add("Indented text");
      if (boolAttr(al, "shrinkToFit")) approximations.add("Shrink to fit");
    }
    return Object.keys(s).length ? s : null;
  });

  return { xfStyles, defaultFont, approximations };
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

/**
 * Built-in ids used when writing. Date/time built-ins (14–22) are rendered in the
 * reader's locale (Excel shows id 14 as d/m/yyyy in the UK), so those are always
 * written as explicit codes to keep exactly the format the user chose.
 */
const BUILTIN_IDS = new Map(
  Object.entries(BUILTIN_NUM_FMTS)
    .filter(([id]) => Number(id) < 14 || Number(id) > 22)
    .map(([id, code]) => [code, Number(id)]),
);

/** Collects unique fonts/fills/borders/formats and emits a valid styles.xml. */
export class StyleTable {
  private fonts: string[] = [];
  private fills: string[] = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
  private borders: string[] = ["<border><left/><right/><top/><bottom/><diagonal/></border>"];
  private customFmts = new Map<string, number>();
  private xfs: string[] = [];
  private xfIndex = new Map<string, number>();
  /** Univer formatting the XLSX writer can't express (for save warnings). */
  readonly approximations = new Set<string>();

  constructor(private readonly defaultFont: DefaultFont) {
    this.fonts.push(this.fontXml({}));
    this.xfFor(null); // xf 0 = defaults
  }

  private intern(list: string[], xml: string): number {
    const i = list.indexOf(xml);
    if (i >= 0) return i;
    list.push(xml);
    return list.length - 1;
  }

  private fontXml(s: IStyleData): string {
    const parts: string[] = [];
    if (s.bl === BooleanNumber.TRUE) parts.push("<b/>");
    if (s.it === BooleanNumber.TRUE) parts.push("<i/>");
    if (s.st?.s === BooleanNumber.TRUE) parts.push("<strike/>");
    if (s.ul?.s === BooleanNumber.TRUE) parts.push(s.ul.t === TextDecoration.DOUBLE ? '<u val="double"/>' : "<u/>");
    parts.push(`<sz val="${s.fs ?? this.defaultFont.size}"/>`);
    const color = normalizeHex(s.cl?.rgb);
    if (color) parts.push(`<color rgb="${toArgb(color)}"/>`);
    parts.push(`<name val="${escapeXml(s.ff ?? this.defaultFont.name)}"/>`, '<family val="2"/>');
    return `<font>${parts.join("")}</font>`;
  }

  private fillXml(s: IStyleData): string | null {
    const color = normalizeHex(s.bg?.rgb);
    if (!color) return null;
    return `<fill><patternFill patternType="solid"><fgColor rgb="${toArgb(color)}"/><bgColor indexed="64"/></patternFill></fill>`;
  }

  private borderXml(s: IStyleData): string | null {
    const bd = s.bd;
    if (!bd) return null;
    const side = (tag: string, d: IBorderData["t"]) => {
      if (!d || !d.s || (d.s as number) === BorderStyleTypes.NONE) return `<${tag}/>`;
      const color = normalizeHex(d.cl?.rgb) ?? "#000000";
      return `<${tag} style="${BORDER_TO_XML[d.s] ?? "thin"}"><color rgb="${toArgb(color)}"/></${tag}>`;
    };
    if (bd.tl_br || bd.bl_tr || bd.tl_bc || bd.tl_mr || bd.ml_tr || bd.bc_tr) this.approximations.add("Diagonal borders");
    const xml = `<border>${side("left", bd.l)}${side("right", bd.r)}${side("top", bd.t)}${side("bottom", bd.b)}<diagonal/></border>`;
    return xml === this.borders[0] ? null : xml;
  }

  private numFmtId(pattern: string | undefined): number {
    if (!pattern || pattern === "General") return 0;
    const builtin = BUILTIN_IDS.get(pattern);
    if (builtin !== undefined) return builtin;
    let id = this.customFmts.get(pattern);
    if (id === undefined) {
      id = 164 + this.customFmts.size;
      this.customFmts.set(pattern, id);
    }
    return id;
  }

  /** cellXfs index for a Univer style (0 for none). */
  xfFor(style: IStyleData | null | undefined): number {
    const s = style ?? {};
    if (s.va) this.approximations.add("Superscript and subscript text");
    if (s.pd) this.approximations.add("Custom cell padding");
    if (s.td) this.approximations.add("Text direction");
    if (s.ol?.s) this.approximations.add("Overline text");

    const fontId = this.intern(this.fonts, this.fontXml(s));
    const fill = this.fillXml(s);
    const fillId = fill ? this.intern(this.fills, fill) : 0;
    const border = this.borderXml(s);
    const borderId = border ? this.intern(this.borders, border) : 0;
    const numFmtId = this.numFmtId(s.n?.pattern);

    const align: string[] = [];
    const h = s.ht !== undefined && s.ht !== null ? H_TO_XML[s.ht as HorizontalAlign] : undefined;
    if (h) align.push(`horizontal="${h}"`);
    const v = s.vt !== undefined && s.vt !== null ? V_TO_XML[s.vt as VerticalAlign] : undefined;
    if (v) align.push(`vertical="${v}"`);
    if (s.tb === WrapStrategy.WRAP) align.push('wrapText="1"');
    const rot = rotationToExcel(s.tr);
    if (rot !== null) align.push(`textRotation="${rot}"`);

    const flags = [
      numFmtId ? ' applyNumberFormat="1"' : "",
      fontId ? ' applyFont="1"' : "",
      fillId ? ' applyFill="1"' : "",
      borderId ? ' applyBorder="1"' : "",
      align.length ? ' applyAlignment="1"' : "",
    ].join("");
    const body = align.length ? `<alignment ${align.join(" ")}/>` : "";
    const xml = `<xf numFmtId="${numFmtId}" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" xfId="0"${flags}${body ? `>${body}</xf>` : "/>"}`;
    let index = this.xfIndex.get(xml);
    if (index === undefined) {
      index = this.xfs.length;
      this.xfs.push(xml);
      this.xfIndex.set(xml, index);
    }
    return index;
  }

  toXml(): string {
    const numFmts = [...this.customFmts]
      .map(([code, id]) => `<numFmt numFmtId="${id}" formatCode="${escapeXml(code)}"/>`)
      .join("");
    return [
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n',
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
      this.customFmts.size ? `<numFmts count="${this.customFmts.size}">${numFmts}</numFmts>` : "",
      `<fonts count="${this.fonts.length}">${this.fonts.join("")}</fonts>`,
      `<fills count="${this.fills.length}">${this.fills.join("")}</fills>`,
      `<borders count="${this.borders.length}">${this.borders.join("")}</borders>`,
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>',
      `<cellXfs count="${this.xfs.length}">${this.xfs.join("")}</cellXfs>`,
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>',
      '<dxfs count="0"/><tableStyles count="0" defaultTableStyle="TableStyleMedium9" defaultPivotStyle="PivotStyleLight16"/>',
      "</styleSheet>",
    ].join("");
  }
}
