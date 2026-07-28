// Rich-text whitelist shared by the API's sanitizer (regex, server-authoritative) and the
// web renderer's DOM sanitizer (defence in depth). Both must agree, or formatting the
// author applied in the Studio would silently disappear on save — or, worse, something the
// server allowed would slip past the client.

/** Tags an authored document may contain. Everything else is unwrapped to its text. */
export const RICH_TEXT_TAGS = [
  "b", "strong", "i", "em", "u", "s", "del", "ins", "mark", "small", "sub", "sup",
  "br", "p", "div", "span", "code", "pre", "blockquote",
  "ul", "ol", "li",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "a",
] as const;

export const RICH_TEXT_TAG_SET: ReadonlySet<string> = new Set<string>(RICH_TEXT_TAGS);

/**
 * Inline CSS properties the Studio's formatting controls produce. Anything outside this
 * list (position, behavior, url()-carrying properties, …) is dropped.
 */
const STYLE_RULES: Record<string, RegExp> = {
  // Colours: hex, rgb()/rgba(), or a plain keyword
  color: /^(#[0-9a-f]{3,8}|rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(,\s*[\d.]+\s*)?\)|[a-z]{3,20})$/i,
  "background-color": /^(#[0-9a-f]{3,8}|rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(,\s*[\d.]+\s*)?\)|transparent|[a-z]{3,20})$/i,
  // Type
  "font-size": /^(\d{1,3}(\.\d+)?(px|pt|em|rem|%))$/i,
  "font-family": /^[a-z0-9 ,'"-]{1,120}$/i, // no parentheses ⇒ no url()
  "font-weight": /^(normal|bold|bolder|lighter|[1-9]00)$/i,
  "font-style": /^(normal|italic|oblique)$/i,
  "line-height": /^(normal|\d{1,3}(\.\d+)?(px|em|rem|%)?)$/i,
  "letter-spacing": /^(normal|-?\d{1,2}(\.\d+)?(px|em)?)$/i,
  "text-decoration": /^(none|underline|overline|line-through|underline line-through)$/i,
  "text-decoration-line": /^(none|underline|overline|line-through|underline line-through)$/i,
  "text-transform": /^(none|uppercase|lowercase|capitalize)$/i,
  "text-align": /^(left|center|right|justify)$/i,
  "vertical-align": /^(baseline|sub|super|middle|top|bottom)$/i,
  // Light layout, used by lists and indenting
  "padding-left": /^\d{1,3}(px|em|rem)$/i,
  "margin-left": /^\d{1,3}(px|em|rem)$/i,
};

/**
 * Keep only whitelisted declarations from a `style` attribute, normalized and re-joined.
 * Returns "" when nothing survives (the caller then drops the attribute entirely).
 */
export function sanitizeStyleAttribute(raw: string): string {
  if (!raw || raw.length > 600) return "";
  const kept: string[] = [];
  for (const decl of raw.split(";")) {
    const idx = decl.indexOf(":");
    if (idx < 1) continue;
    const prop = decl.slice(0, idx).trim().toLowerCase();
    const value = decl.slice(idx + 1).trim().replace(/\s+/g, " ");
    if (!value || value.length > 90) continue;
    // Belt and braces: nothing that can escape a declaration or fetch a resource
    if (/[{}<>\\]|url\s*\(|expression|javascript:|@import|\/\*/i.test(value)) continue;
    const rule = STYLE_RULES[prop];
    if (rule && rule.test(value)) kept.push(`${prop}: ${value}`);
  }
  return kept.join("; ");
}

/** True when a link target is safe to render (http/https only — no javascript:, no data:). */
export function isSafeHref(url: string): boolean {
  return /^https?:\/\//i.test(url.trim());
}
