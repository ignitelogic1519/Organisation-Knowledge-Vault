// A small in-memory rate limiter for ticket issuance (docs/structure.md §9.16).
//
// Every streaming ticket costs the organization Google quota and gateway bandwidth, so
// one member must not be able to mint them without limit. Per instance, per key, over a
// sliding window — enough to stop a runaway script, never noticeable to a person.

const hits = new Map<string, number[]>();

export function allow(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 10_000) {
    // Keep memory bounded on a small instance: drop keys with nothing recent.
    for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  }
  return true;
}

export function tooMany(message = "Too many requests — wait a minute and try again.") {
  return Object.assign(new Error(message), { statusCode: 429 });
}
