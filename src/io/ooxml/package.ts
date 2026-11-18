import { strFromU8, strToU8, unzipSync, zipSync, type Unzipped } from "fflate";
import { DEFAULT_COLOR_CONTEXT, DEFAULT_INDEXED_COLORS, DEFAULT_THEME_COLORS, normalizeHex, type ColorContext } from "./colors";
import { attr, child, children, descendant, NS_PKG_REL, parseXml } from "./xml";

/** An XLSX file opened as its constituent parts. */
export interface XlsxPackage {
  files: Unzipped;
  workbookPath: string;
  sheets: { name: string; path: string; hidden: boolean }[];
  stylesPath: string | null;
  themePath: string | null;
  sharedStringsPath: string | null;
}

export function isZip(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

export function readText(files: Unzipped, path: string | null): string | null {
  if (!path) return null;
  const data = files[path];
  return data ? strFromU8(data) : null;
}

export function writeText(files: Unzipped, path: string, text: string) {
  files[path] = strToU8(text);
}

function dirOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? "" : path.slice(0, i + 1);
}

/** Resolves a relationship target relative to the part that owns the .rels file. */
export function resolveTarget(sourcePart: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const parts = (dirOf(sourcePart) + target).split("/");
  const out: string[] = [];
  for (const p of parts) {
    if (p === "..") out.pop();
    else if (p !== "." && p !== "") out.push(p);
  }
  return out.join("/");
}

function relsPathFor(part: string): string {
  return `${dirOf(part)}_rels/${part.slice(dirOf(part).length)}.rels`;
}

export interface Relationship {
  id: string;
  type: string;
  target: string;
  external: boolean;
}

export function readRelationships(files: Unzipped, part: string): Relationship[] {
  const text = readText(files, relsPathFor(part));
  if (!text) return [];
  const doc = parseXml(text);
  return [...doc.getElementsByTagNameNS(NS_PKG_REL, "Relationship")].map((r) => ({
    id: r.getAttribute("Id") ?? "",
    type: r.getAttribute("Type") ?? "",
    target: r.getAttribute("Target") ?? "",
    external: r.getAttribute("TargetMode") === "External",
  }));
}

const typeEndsWith = (rel: Relationship, suffix: string) => rel.type.endsWith(`/${suffix}`);

export function openPackage(bytes: Uint8Array): XlsxPackage {
  const files = unzipSync(bytes);
  const root = readRelationships(files, "");
  const officeDoc = root.find((r) => typeEndsWith(r, "officeDocument"));
  const workbookPath = officeDoc ? resolveTarget("", officeDoc.target) : "xl/workbook.xml";
  const wbText = readText(files, workbookPath);
  if (!wbText) throw new Error("This file isn't a valid Excel workbook (missing workbook part).");

  const rels = readRelationships(files, workbookPath);
  const byId = new Map(rels.map((r) => [r.id, r]));
  const doc = parseXml(wbText);
  const sheetsEl = descendant(doc, "sheets");
  const sheets = children(sheetsEl, "sheet").map((s) => {
    const rid = s.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") ?? s.getAttribute("r:id") ?? "";
    const rel = byId.get(rid);
    const state = s.getAttribute("state");
    return {
      name: s.getAttribute("name") ?? "Sheet",
      path: rel ? resolveTarget(workbookPath, rel.target) : "",
      hidden: state === "hidden" || state === "veryHidden",
    };
  });
  const find = (suffix: string) => {
    const r = rels.find((x) => typeEndsWith(x, suffix));
    return r ? resolveTarget(workbookPath, r.target) : null;
  };
  return {
    files,
    workbookPath,
    sheets,
    stylesPath: find("styles"),
    themePath: find("theme"),
    sharedStringsPath: find("sharedStrings"),
  };
}

export function repack(files: Unzipped): Uint8Array {
  return zipSync(files, { level: 6 });
}

/** Theme palette from theme1.xml in Excel's index order (lt1, dk1, lt2, dk2, accent1–6, hlink, folHlink). */
export function readColorContext(pkg: XlsxPackage): ColorContext {
  let theme = DEFAULT_THEME_COLORS;
  const themeXml = readText(pkg.files, pkg.themePath);
  if (themeXml) {
    try {
      const scheme = descendant(parseXml(themeXml), "clrScheme");
      const pick = (name: string, fallback: string) => {
        const node = child(scheme, name);
        const srgb = child(node, "srgbClr");
        const sys = child(node, "sysClr");
        return normalizeHex(attr(srgb, "val") ?? attr(sys, "lastClr")) ?? fallback;
      };
      const d = DEFAULT_THEME_COLORS;
      theme = [
        pick("lt1", d[0]), pick("dk1", d[1]), pick("lt2", d[2]), pick("dk2", d[3]),
        pick("accent1", d[4]), pick("accent2", d[5]), pick("accent3", d[6]),
        pick("accent4", d[7]), pick("accent5", d[8]), pick("accent6", d[9]),
        pick("hlink", d[10]), pick("folHlink", d[11]),
      ];
    } catch {
      theme = DEFAULT_THEME_COLORS;
    }
  }
  let indexed = DEFAULT_INDEXED_COLORS;
  const stylesXml = readText(pkg.files, pkg.stylesPath);
  if (stylesXml) {
    const custom = descendant(parseXml(stylesXml), "indexedColors");
    const list = children(custom, "rgbColor").map((c) => normalizeHex(attr(c, "rgb")) ?? "#000000");
    if (list.length) indexed = list;
  }
  return theme === DEFAULT_THEME_COLORS && indexed === DEFAULT_INDEXED_COLORS ? DEFAULT_COLOR_CONTEXT : { theme, indexed };
}
