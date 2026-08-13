// Session tests — the idle timeout (docs/structure.md §8.8).
//
// Run with `pnpm --filter @vault/api test` (builds first).
//
// These cover the decisions that are cheap to get wrong and expensive to notice: the
// boundary of the idle window itself, and the console session registry — which is pure
// in-memory state, so it can be exercised exactly. Anything that needs a database
// (rotation, /auth/activity) is left to the integration path; what is tested here is the
// arithmetic every one of those paths depends on.

import assert from "node:assert/strict";
import test from "node:test";

process.env.JWT_SECRET ??= "test-secret-for-session-tests";

const { IDLE_TIMEOUT_MS, IDLE_TIMEOUT_SECONDS, idleDeadline, idleWindowLabel, isIdle } =
  await import("../dist/auth/tokens.js");
const { checkAdminSession, endAdminSession, startAdminSession, touchAdminSession } = await import(
  "../dist/platform/admin-sessions.js"
);

const HOUR_MS = 3600_000;

// ── The window ───────────────────────────────────────────────────────────────

test("the default window is one hour, in both units", () => {
  assert.equal(IDLE_TIMEOUT_MS, HOUR_MS);
  assert.equal(IDLE_TIMEOUT_SECONDS, 3600);
  assert.equal(idleWindowLabel(60), "an hour");
  assert.equal(idleWindowLabel(120), "2 hours");
  assert.equal(idleWindowLabel(30), "30 minutes");
});

test("a session is idle only AFTER the window, not at it", () => {
  const now = Date.now();
  const seenAt = (msAgo) => ({ lastActivityAt: new Date(now - msAgo) });

  assert.equal(isIdle(seenAt(0), now), false, "just used");
  assert.equal(isIdle(seenAt(59 * 60_000), now), false, "59 minutes away is still a session");
  assert.equal(isIdle(seenAt(HOUR_MS), now), false, "the hour itself is inclusive");
  assert.equal(isIdle(seenAt(HOUR_MS + 1000), now), true, "a second past the hour ends it");
  assert.equal(isIdle(seenAt(9 * HOUR_MS), now), true, "overnight is long gone");
});

test("the deadline is the last sign of the user plus the window", () => {
  const lastActivityAt = new Date("2026-08-13T09:00:00.000Z");
  assert.equal(idleDeadline({ lastActivityAt }).toISOString(), "2026-08-13T10:00:00.000Z");
});

// ── The console's session registry ───────────────────────────────────────────

test("a console session lives while it is used and dies when it is not", () => {
  const sid = "console-1";
  startAdminSession(sid);
  assert.equal(checkAdminSession(sid), "ok");
  assert.equal(touchAdminSession(sid), true);
  assert.equal(checkAdminSession(sid), "ok");
});

test("checking a session does NOT keep it alive — only activity does", async () => {
  // The console polls itself every ten seconds. If a check counted as presence, an open
  // tab would never time out, which is the entire bug this feature exists to fix.
  const sid = "console-poller";
  startAdminSession(sid);

  // Wind the clock forward past the window, the way an unattended tab does.
  const realNow = Date.now;
  try {
    Date.now = () => realNow() + HOUR_MS + 60_000;
    // Several polls, exactly as the console would make them.
    assert.equal(checkAdminSession(sid), "idle", "the first check past the hour ends it");
    assert.equal(checkAdminSession(sid), "ended", "and it stays ended");
    assert.equal(touchAdminSession(sid), false, "activity cannot revive an ended session");
  } finally {
    Date.now = realNow;
  }
});

test("an ended session is remembered, not forgotten", () => {
  // Forgetting one would be worse than never ending it: the next request would find no
  // entry, adopt the token as new, and hand it a fresh hour.
  const sid = "console-signed-out";
  startAdminSession(sid);
  endAdminSession(sid, "logout");
  assert.equal(checkAdminSession(sid), "ended");
  assert.equal(touchAdminSession(sid), false);
});

test("a token this process never issued starts its own clock", () => {
  // What happens after an API restart: the token's signature and expiry are already
  // verified by the time we get here, so it is adopted rather than refused.
  assert.equal(checkAdminSession("console-after-restart"), "ok");
});
