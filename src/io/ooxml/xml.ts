/** Small DOM helpers for SpreadsheetML parts (works in WKWebView and jsdom). */

export const NS_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
export const NS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
export const NS_PKG_REL = "http://schemas.openxmlformats.org/package/2006/relationships";
export const NS_DRAWING = "http://schemas.openxmlformats.org/drawingml/2006/main";

export function parseXml(text: string): Document {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  const error = doc.getElementsByTagName("parsererror")[0];
  if (error) throw new Error(`Malformed XML in workbook: ${error.textContent?.slice(0, 120)}`);
  return doc;
}

export function serializeXml(doc: Document): string {
  const body = new XMLSerializer().serializeToString(doc.documentElement);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${body}`;
}

/** Direct children with a local name (namespace-agnostic, so prefixed parts work too). */
export function children(parent: Element | null | undefined, localName: string): Element[] {
  if (!parent) return [];
  const out: Element[] = [];
  for (let n = parent.firstElementChild; n; n = n.nextElementSibling) if (n.localName === localName) out.push(n);
  return out;
}

export function child(parent: Element | null | undefined, localName: string): Element | null {
  return children(parent, localName)[0] ?? null;
}

/** First descendant with a local name. */
export function descendant(parent: Element | Document | null | undefined, localName: string): Element | null {
  if (!parent) return null;
  const list = parent.getElementsByTagNameNS("*", localName);
  return list.length ? list[0] : null;
}

export function attr(el: Element | null | undefined, name: string): string | null {
  return el?.getAttribute(name) ?? null;
}

export function boolAttr(el: Element | null | undefined, name: string, fallback = false): boolean {
  const v = attr(el, name);
  if (v === null) return fallback;
  return v === "1" || v === "true";
}

/** Value of <x val="…"/>; a present element without val means true for boolean props (e.g. <b/>). */
export function valChild(parent: Element | null, localName: string): string | null {
  const el = child(parent, localName);
  if (!el) return null;
  return el.getAttribute("val") ?? "1";
}

export function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Builds an element in the SpreadsheetML namespace. */
export function el(doc: Document, name: string, attrs: Record<string, string | number | undefined> = {}): Element {
  const e = doc.createElementNS(NS_MAIN, name);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined) e.setAttribute(k, String(v));
  return e;
}
