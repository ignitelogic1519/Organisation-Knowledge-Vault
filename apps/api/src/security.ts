import type { FastifyReply, FastifyRequest } from "fastify";
import { isSafeHref, resolveEmbed, RICH_TEXT_TAG_SET, sanitizeStyleAttribute } from "@vault/shared";
import { db } from "./db.js";

// ── In-memory rate limiter ──────────────────────────────────────────────────
// Simple fixed-window limiter keyed by (bucket, ip). Counters live in memory, so a
// restart clears them — acceptable for a single-instance deployment; a horizontal scale
// would move this to Redis (tracked in docs/future.md).

interface Window {
  count: number;
  resetAt: number;
}
const buckets = new Map<string, Window>();

export function rateLimit(bucket: string, ip: string, max: number, windowMs: number): boolean {
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const w = buckets.get(key);
  if (!w || w.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  w.count += 1;
  return w.count <= max;
}

/** preHandler factory: 429 when a client exceeds `max` requests per `windowMs`. */
export function rateLimiter(bucket: string, max: number, windowMs: number) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    if (!rateLimit(bucket, req.ip, max, windowMs)) {
      return reply
        .status(429)
        .send({ error: "Too many attempts — please wait a moment and try again" });
    }
  };
}

// ── HTML sanitizer (dependency-free) ─────────────────────────────────────────
// Authored documents store limited rich text. We sanitize server-side (authoritative)
// AND client-side (defence in depth) so stored-XSS cannot reach another user's browser.
// Whitelist tags, keep only http(s) hrefs on <a>, and keep only the inline style
// declarations the Studio's formatting controls produce (colour, highlight, size,
// alignment …) — see @vault/shared/rich-text for the shared whitelist. Formatting has to
// survive the round trip, so "strip every attribute" is not an option here.

/**
 * Extremely conservative HTML cleaner: removes disallowed tags (keeping their text),
 * drops every attribute except safe hrefs and a filtered `style`, and neutralizes any
 * script/style/event content. Not a full DOM parser — it errs toward stripping.
 */
export function sanitizeHtml(input: string): string {
  if (!input) return "";
  // 1. Kill script/style blocks entirely (with contents)
  let out = input.replace(/<\s*(script|style|iframe|object|embed)[\s\S]*?<\/\s*\1\s*>/gi, "");
  // 2. Walk every tag; keep whitelisted ones (attributes scrubbed), drop the rest
  out = out.replace(/<\/?([a-zA-Z0-9]+)((?:[^>"']|"[^"]*"|'[^']*')*)>/g, (match, rawName, attrs) => {
    const name = String(rawName).toLowerCase();
    if (!RICH_TEXT_TAG_SET.has(name)) return "";
    const closing = /^<\//.test(match);
    if (closing) return `</${name}>`;
    const rawStyle = /style\s*=\s*("([^"]*)"|'([^']*)')/i.exec(attrs);
    const style = sanitizeStyleAttribute(rawStyle?.[2] ?? rawStyle?.[3] ?? "");
    const styleAttr = style ? ` style="${style.replace(/"/g, "&quot;")}"` : "";
    if (name === "a") {
      const href = /href\s*=\s*("([^"]*)"|'([^']*)')/i.exec(attrs);
      const url = href?.[2] ?? href?.[3] ?? "";
      if (isSafeHref(url)) {
        return `<a href="${url.replace(/"/g, "&quot;")}" target="_blank" rel="noreferrer noopener"${styleAttr}>`;
      }
      return `<a${styleAttr}>`;
    }
    return `<${name}${styleAttr}>`;
  });
  return out;
}

/** Rich text nested inside a block (`columns` and `accordion` each carry their own). */
interface SanitizableBlock {
  type?: string;
  html?: string;
  columns?: { html?: string }[];
  panels?: { html?: string }[];
  url?: string;
}

/**
 * Sanitize the rich-text fields of authored document blocks in place — the block's own
 * HTML plus every column's and every collapsible panel's. `code` blocks are left alone:
 * they are stored and rendered as plain text, so running them through the tag stripper
 * would eat the snippet itself. An `embed` block's address is re-resolved against the
 * host allowlist and rewritten to the canonical embed URL, so what is stored is only ever
 * a URL we built.
 */
export function sanitizeBlocks<T extends SanitizableBlock[]>(blocks: T): T {
  for (const b of blocks) {
    if (typeof b.html === "string" && b.type !== "code") b.html = sanitizeHtml(b.html);
    for (const nested of [b.columns, b.panels]) {
      if (!Array.isArray(nested)) continue;
      for (const part of nested) {
        if (typeof part.html === "string") part.html = sanitizeHtml(part.html);
      }
    }
    if (b.type === "embed" && typeof b.url === "string") {
      b.url = resolveEmbed(b.url)?.src ?? "";
    }
  }
  return blocks;
}

/** Every text field of an exam is rendered as PLAIN text — markup is simply removed. */
const stripMarkup = (input: string) => input.replace(/<[^>]*>/g, "");

interface SanitizableExam {
  intro?: string;
  questions?: {
    prompt?: string;
    help?: string;
    explanation?: string;
    options?: { text?: string }[];
  }[];
}

/**
 * Clean an authored MCQ paper on the way in. Questions, options and explanations are shown
 * to candidates as text nodes, never as HTML, so the safest thing to store is text with no
 * tags at all — that keeps a paper harmless no matter which surface renders it later.
 */
export function sanitizeExam<T extends SanitizableExam>(exam: T): T {
  if (typeof exam.intro === "string") exam.intro = stripMarkup(exam.intro);
  for (const question of exam.questions ?? []) {
    if (typeof question.prompt === "string") question.prompt = stripMarkup(question.prompt);
    if (typeof question.help === "string") question.help = stripMarkup(question.help);
    if (typeof question.explanation === "string") {
      question.explanation = stripMarkup(question.explanation);
    }
    for (const option of question.options ?? []) {
      if (typeof option.text === "string") option.text = stripMarkup(option.text);
    }
  }
  return exam;
}

// ── Audit log ────────────────────────────────────────────────────────────────

export async function audit(
  orgId: string,
  action: string,
  opts: { actorProfileId?: string; ip?: string; detail?: Record<string, unknown> } = {},
): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        orgId,
        action,
        actorProfileId: opts.actorProfileId ?? null,
        ip: opts.ip ?? null,
        detail: (opts.detail ?? undefined) as object | undefined,
      },
    });
  } catch {
    // Auditing must never break the primary action
  }
}
