"use client";

import type { AuthResponse, PublicProfile } from "@vault/shared";

// Token storage + API client with automatic refresh-token rotation.
// Tokens live in localStorage (works for the future mobile app's model too — see
// docs/architecture.md; revisit for httpOnly cookies if we ever go same-domain).

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const ACCESS_KEY = "kv.accessToken";
const REFRESH_KEY = "kv.refreshToken";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function storeTokens(res: AuthResponse) {
  localStorage.setItem(ACCESS_KEY, res.tokens.accessToken);
  localStorage.setItem(REFRESH_KEY, res.tokens.refreshToken);
}

export function clearTokens() {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
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
      clearTokens();
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
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiError(res.status, body.error ?? `Request failed (${res.status})`);
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
  return body;
}

export const auth = {
  register: (username: string, password: string, displayName: string) =>
    authCall("/auth/register", { username, password, displayName }),
  login: (username: string, password: string) => authCall("/auth/login", { username, password }),
  me: () => api<{ profile: PublicProfile }>("/me"),
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
  },
};
