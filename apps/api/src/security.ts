import type { FastifyReply, FastifyRequest } from "fastify";
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
// Whitelist tags + strip every attribute except safe hrefs on <a>.

const ALLOWED_TAGS = new Set([
  "b", "strong", "i", "em", "u", "br", "ul", "ol", "li", "p", "h1", "h2", "h3", "a", "code", "span", "mark",
]);

/**
 * Extremely conservative HTML cleaner: removes disallowed tags (keeping their text),
 * drops all attributes except http(s) hrefs on anchors, and neutralizes any
 * script/style/event content. Not a full DOM parser — it errs toward stripping.
 */
export function sanitizeHtml(input: string): string {
  if (!input) return "";
  // 1. Kill script/style blocks entirely (with contents)
  let out = input.replace(/<\s*(script|style|iframe|object|embed)[\s\S]*?<\/\s*\1\s*>/gi, "");
  // 2. Walk every tag; keep whitelisted ones (attributes scrubbed), drop the rest
  out = out.replace(/<\/?([a-zA-Z0-9]+)((?:[^>"']|"[^"]*"|'[^']*')*)>/g, (match, rawName, attrs) => {
    const name = String(rawName).toLowerCase();
    if (!ALLOWED_TAGS.has(name)) return "";
    const closing = /^<\//.test(match);
    if (closing) return `</${name}>`;
    if (name === "a") {
      const href = /href\s*=\s*("([^"]*)"|'([^']*)')/i.exec(attrs);
      const url = href?.[2] ?? href?.[3] ?? "";
      if (/^https?:\/\//i.test(url)) {
        return `<a href="${url.replace(/"/g, "&quot;")}" target="_blank" rel="noreferrer noopener">`;
      }
      return "<a>";
    }
    return `<${name}>`;
  });
  return out;
}

/** Sanitize the rich-text fields of authored document blocks in place. */
export function sanitizeBlocks<T extends { html?: string }[]>(blocks: T): T {
  for (const b of blocks) {
    if (typeof b.html === "string") b.html = sanitizeHtml(b.html);
  }
  return blocks;
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
