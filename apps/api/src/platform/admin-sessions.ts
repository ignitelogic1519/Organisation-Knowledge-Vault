import { IDLE_TIMEOUT_MS } from "../auth/tokens.js";

// The same hour away from the keyboard as a user session (structure.md §8.8), applied to
// the staff console. If anything it matters more here: this is the screen that can gift
// coins, ban a profile and purge an organization, and it is used on shared machines
// beside a support ticket.
//
// Admin sessions are held in memory rather than in a table. An admin token is already a
// stateless 8-hour JWT with no server-side row, and the console is a handful of people —
// the same trade the rate limiter makes (docs/structure.md §8.6). The consequence is
// honest and bounded: an API restart forgets when an admin was last seen, so their next
// request starts a fresh hour, and the 8-hour lifetime of the token itself is the ceiling
// that no restart can lift.

interface AdminSessionState {
  lastActivity: number;
  /** Ended sessions are REMEMBERED, not deleted — forgetting one would hand it a new hour. */
  ended: boolean;
  endedReason?: string;
}

const sessions = new Map<string, AdminSessionState>();

/** Long past the 8-hour token lifetime: nothing can be resurrected by a sweep. */
const FORGET_AFTER_MS = 12 * 3600_000;

function sweep(now: number): void {
  if (sessions.size < 200) return;
  for (const [sid, state] of sessions) {
    if (now - state.lastActivity > FORGET_AFTER_MS) sessions.delete(sid);
  }
}

export function startAdminSession(sid: string): void {
  const now = Date.now();
  sweep(now);
  sessions.set(sid, { lastActivity: now, ended: false });
}

export type AdminSessionVerdict = "ok" | "idle" | "ended";

/**
 * Is this console session still usable? Never moves the clock: the console polls itself
 * every ten seconds, so counting its own traffic as presence would mean an open tab never
 * timed out at all. Only `touchAdminSession` — driven by real interaction — does that.
 */
export function checkAdminSession(sid: string): AdminSessionVerdict {
  const now = Date.now();
  const state = sessions.get(sid);
  if (!state) {
    // First sight of a token this process did not issue (a restart, most likely). The
    // token's own expiry has already been verified, so the session is adopted with its
    // clock starting now rather than refused outright.
    sessions.set(sid, { lastActivity: now, ended: false });
    return "ok";
  }
  if (state.ended) return "ended";
  if (now - state.lastActivity > IDLE_TIMEOUT_MS) {
    state.ended = true;
    state.endedReason = "idle";
    return "idle";
  }
  return "ok";
}

/** The admin did something — the only thing that moves the clock. */
export function touchAdminSession(sid: string): boolean {
  if (checkAdminSession(sid) !== "ok") return false;
  const state = sessions.get(sid);
  if (!state) return false;
  state.lastActivity = Date.now();
  return true;
}

export function endAdminSession(sid: string, reason = "logout"): void {
  const state = sessions.get(sid);
  if (state) {
    state.ended = true;
    state.endedReason = reason;
    return;
  }
  sessions.set(sid, { lastActivity: Date.now(), ended: true, endedReason: reason });
}
