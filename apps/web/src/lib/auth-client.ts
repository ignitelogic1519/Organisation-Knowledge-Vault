"use client";

import { SESSION_ENDED, isSessionEndedCode, type AuthResponse, type PublicProfile, type SessionEndedCode } from "@vault/shared";

// Token storage + API client with automatic refresh-token rotation.
// Tokens live in localStorage (works for the future mobile app's model too — see
// docs/architecture.md; revisit for httpOnly cookies if we ever go same-domain).
//
// Sessions end after an hour away from the keyboard (structure.md §8.8). The API is what
// enforces that — see apps/api/src/auth/tokens.ts. Everything below is the half of the
// story the person sees: the browser tells the API when its user is actually there,
// notices the hour passing even while nothing is being requested, and signs out with an
// explanation instead of leaving a dead session on screen until the next click fails.

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const ACCESS_KEY = "kv.accessToken";
const REFRESH_KEY = "kv.refreshToken";
/** Last sign of the user, shared by every tab (and surviving a reload). */
const ACTIVITY_KEY = "kv.lastActivity";
/** The window the API is enforcing, so the countdown never contradicts the server. */
const IDLE_KEY = "kv.idleTimeout";
/** Why the last session ended — read once by the sign-in page. */
const REASON_KEY = "kv.signedOutReason";

const DEFAULT_IDLE_SECONDS = 60 * 60;
/** Don't write to storage or beat the API more often than this. */
const ACTIVITY_THROTTLE_MS = 30_000;

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    /** Set when the API refused because the session itself is over. */
    public code?: SessionEndedCode,
  ) {
    super(message);
  }
}

function storeTokens(res: AuthResponse) {
  localStorage.setItem(ACCESS_KEY, res.tokens.accessToken);
  localStorage.setItem(REFRESH_KEY, res.tokens.refreshToken);
  if (res.tokens.idleTimeoutSeconds > 0) {
    localStorage.setItem(IDLE_KEY, String(res.tokens.idleTimeoutSeconds));
  }
}

export function clearTokens() {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(ACTIVITY_KEY);
}

export function hasSession(): boolean {
  return typeof window !== "undefined" && !!localStorage.getItem(REFRESH_KEY);
}

/** Current access token — used by the SSE live-update channel (EventSource cannot set
 *  headers, so the token travels as a query parameter). */
export function getAccessToken(): string | null {
  return typeof window !== "undefined" ? localStorage.getItem(ACCESS_KEY) : null;
}

/** Force a refresh-token rotation now (SSE reconnect path). */
export function refreshSession(): Promise<boolean> {
  return tryRefresh();
}

// ── The idle clock ───────────────────────────────────────────────────────────

/** The window in force, as last reported by the API. */
export function idleTimeoutMs(): number {
  const stored = Number(localStorage.getItem(IDLE_KEY));
  return (Number.isFinite(stored) && stored > 0 ? stored : DEFAULT_IDLE_SECONDS) * 1000;
}

/** When the session dies if nobody touches anything — epoch ms. */
export function idleDeadline(): number {
  const last = Number(localStorage.getItem(ACTIVITY_KEY));
  return (Number.isFinite(last) && last > 0 ? last : Date.now()) + idleTimeoutMs();
}

let lastBeatAt = 0;

/**
 * The user did something. Recorded locally on every call (cheap) and reported to the API
 * at most every 30 seconds, because only the API's copy decides whether the session
 * lives. A failed beat is deliberately ignored: a flaky network is not a reason to throw
 * somebody out — the API's own clock still has the last word.
 */
export function markActivity(force = false): void {
  if (typeof window === "undefined" || !hasSession()) return;
  const now = Date.now();
  if (!force && now - lastBeatAt < ACTIVITY_THROTTLE_MS) return;
  lastBeatAt = now;
  localStorage.setItem(ACTIVITY_KEY, String(now));
  void authFetch("/auth/activity", { method: "POST", body: "{}" }).catch(() => undefined);
}

/** Start the clock — called on sign-in and whenever a guard finds it unset. */
export function seedActivity(): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACTIVITY_KEY, String(Date.now()));
  lastBeatAt = Date.now();
}

/**
 * Is the clock running at all? False for a session signed in before this build, which is
 * the only case where a guard should start it: a mark that already exists is evidence,
 * and evidence of an hour away is exactly what must NOT be overwritten on page load.
 */
export function hasActivityMark(): boolean {
  if (typeof window === "undefined") return false;
  return Number(localStorage.getItem(ACTIVITY_KEY)) > 0;
}

// ── Ending a session ─────────────────────────────────────────────────────────

type SessionEndListener = (reason: SessionEndedCode) => void;
const endListeners = new Set<SessionEndListener>();

/** The guard subscribes so it can leave for the sign-in page. Returns an unsubscribe. */
export function onSessionEnded(listener: SessionEndListener): () => void {
  endListeners.add(listener);
  return () => endListeners.delete(listener);
}

/**
 * Tear the session down here and now. Writing the reason to storage is what carries it to
 * the sign-in page AND to every other open tab (the `storage` event fires in all of them),
 * so one window timing out signs the rest out with the same explanation.
 */
export function endSession(reason: SessionEndedCode = SESSION_ENDED.ended): void {
  if (typeof window === "undefined") return;
  // Nothing to end — and no explanation to leave lying around for the next visitor to
  // read on a sign-in page they arrived at of their own accord.
  if (!hasSession()) return;
  clearTokens();
  localStorage.setItem(REASON_KEY, reason);
  for (const listener of endListeners) listener(reason);
}

/** The sign-in page reads this once, to say why it is asking. */
export function takeSignOutReason(): SessionEndedCode | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(REASON_KEY);
  if (!raw) return null;
  localStorage.removeItem(REASON_KEY);
  return isSessionEndedCode(raw) ? raw : null;
}

// ── Requests ─────────────────────────────────────────────────────────────────

async function rawRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const access = localStorage.getItem(ACCESS_KEY);
  return fetch(`${API}${path}`, {
    ...init,
    headers: {
      // content-type only when there IS a body — Fastify 400s on empty JSON bodies
      ...(init.body != null ? { "content-type": "application/json" } : {}),
      ...(access ? { authorization: `Bearer ${access}` } : {}),
      ...init.headers,
    },
  });
}

// Single-flight refresh: refresh tokens rotate (one-time use), so parallel 401s must share
// ONE refresh call — otherwise the losers revoke the winner's fresh session.
let refreshInFlight: Promise<boolean> | null = null;

function tryRefresh(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const refreshToken = localStorage.getItem(REFRESH_KEY);
    if (!refreshToken) return false;
    const res = await fetch(`${API}/auth/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) {
      // 401 means the session is over — and the API says which ending it was, so the
      // sign-in page can explain rather than just demand a password again. Anything else
      // (the API asleep, a network blip) leaves the tokens alone: a cold start on Render
      // must not look like a sign-out.
      if (res.status === 401) {
        const body = (await res.json().catch(() => ({}))) as { code?: string };
        endSession(isSessionEndedCode(body.code) ? body.code : SESSION_ENDED.ended);
      }
      return false;
    }
    storeTokens((await res.json()) as AuthResponse);
    return true;
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

/** Authenticated fetch with transparent one-shot token refresh — for any response type. */
export async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  let res = await rawRequest(path, init);
  if (res.status === 401 && (await tryRefresh())) {
    res = await rawRequest(path, init);
  }
  return res;
}

/** Authenticated JSON request; transparently refreshes an expired access token once. */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await authFetch(path, init);
  const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
  if (!res.ok) {
    if (res.status === 401 && isSessionEndedCode(body.code)) endSession(body.code);
    throw new ApiError(
      res.status,
      body.error ?? `Request failed (${res.status})`,
      isSessionEndedCode(body.code) ? body.code : undefined,
    );
  }
  return body as T;
}

async function authCall(path: string, payload: unknown): Promise<AuthResponse> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = (await res.json().catch(() => ({}))) as AuthResponse & { error?: string };
  if (!res.ok) throw new ApiError(res.status, body.error ?? "Request failed");
  storeTokens(body);
  localStorage.removeItem(REASON_KEY);
  seedActivity();
  return body;
}

export const auth = {
  register: (username: string, password: string, displayName: string) =>
    authCall("/auth/register", { username, password, displayName }),
  login: (username: string, password: string) => authCall("/auth/login", { username, password }),
  me: () => api<{ profile: PublicProfile }>("/me"),
  updateMe: (input: { displayName?: string; avatar?: string | null }) =>
    api<{ profile: PublicProfile }>("/me", { method: "PATCH", body: JSON.stringify(input) }),
  deleteMe: () => api<{ ok: boolean }>("/me", { method: "DELETE" }),
  logout: async () => {
    const refreshToken = localStorage.getItem(REFRESH_KEY);
    if (refreshToken) {
      await fetch(`${API}/auth/logout`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      }).catch(() => undefined);
    }
    clearTokens();
    // A deliberate sign-out needs no explanation on the next screen.
    localStorage.removeItem(REASON_KEY);
  },
  /**
   * The hour ran out. The session is ended on the server as well as here — leaving it
   * open would mean a refresh token in a stolen localStorage still had value.
   */
  signOutIdle: async () => {
    const refreshToken = localStorage.getItem(REFRESH_KEY);
    endSession(SESSION_ENDED.idle);
    if (refreshToken) {
      await fetch(`${API}/auth/logout`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      }).catch(() => undefined);
    }
  },
};

export { SESSION_ENDED };
