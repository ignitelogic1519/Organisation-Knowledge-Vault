"use client";

import type {
  AddAdminInput,
  AdminBroadcastInput,
  AdminBulkDeleteInput,
  AdminOrgDetail,
  AdminOrgRow,
  AdminRequestRow,
  AdminSession,
  AdminSetOrgInput,
  AdminTreeNode,
  DecidePlatformRequestInput,
  GiftCoinsInput,
  UpgradePlanInput,
} from "@vault/shared";

// Super-admin API client — a SEPARATE realm from the user auth client. The admin token
// lives under its own localStorage key so the two sessions never collide.

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const ADMIN_KEY = "kv.adminToken";
/** Last sign of the admin themselves — the console's own polling never touches it. */
const ADMIN_ACTIVITY_KEY = "kv.adminLastActivity";
const ADMIN_IDLE_KEY = "kv.adminIdleTimeout";
/** Why the console asked for a password again — read once by its sign-in page. */
const ADMIN_REASON_KEY = "kv.adminSignedOutReason";

const DEFAULT_IDLE_SECONDS = 60 * 60;
const ACTIVITY_THROTTLE_MS = 30_000;

export class AdminApiError extends Error {
  constructor(
    public status: number,
    message: string,
    /** Set when the console session itself is over, not just this request. */
    public code?: string,
  ) {
    super(message);
  }
}

export function adminToken(): string | null {
  return typeof window !== "undefined" ? localStorage.getItem(ADMIN_KEY) : null;
}
export function hasAdminSession(): boolean {
  return !!adminToken();
}
export function clearAdminSession() {
  localStorage.removeItem(ADMIN_KEY);
  localStorage.removeItem(ADMIN_ACTIVITY_KEY);
}

// ── The console's idle hour (structure.md §8.8) ──────────────────────────────
// The console polls itself every ten seconds, so its own traffic proves nothing about
// whether anyone is sitting in front of it. Presence is reported separately, from real
// interaction, and the API refuses the token once the hour has passed.

function adminIdleMs(): number {
  const stored = Number(localStorage.getItem(ADMIN_IDLE_KEY));
  return (Number.isFinite(stored) && stored > 0 ? stored : DEFAULT_IDLE_SECONDS) * 1000;
}

/** When the console session dies if nobody touches anything — epoch ms. */
export function adminIdleDeadline(): number {
  const last = Number(localStorage.getItem(ADMIN_ACTIVITY_KEY));
  return (Number.isFinite(last) && last > 0 ? last : Date.now()) + adminIdleMs();
}

export function hasAdminActivityMark(): boolean {
  return typeof window !== "undefined" && Number(localStorage.getItem(ADMIN_ACTIVITY_KEY)) > 0;
}

export function seedAdminActivity(): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(ADMIN_ACTIVITY_KEY, String(Date.now()));
}

let lastAdminBeat = 0;

/** The admin did something. Reported to the API at most every 30 seconds. */
export function markAdminActivity(force = false): void {
  if (typeof window === "undefined" || !hasAdminSession()) return;
  const now = Date.now();
  if (!force && now - lastAdminBeat < ACTIVITY_THROTTLE_MS) return;
  lastAdminBeat = now;
  localStorage.setItem(ADMIN_ACTIVITY_KEY, String(now));
  void call("/admin/activity", { method: "POST", body: "{}" }).catch(() => undefined);
}

/** End the console session here, and remember why for the sign-in page. */
export function endAdminSession(reason = "session_ended"): void {
  if (typeof window === "undefined") return;
  clearAdminSession();
  localStorage.setItem(ADMIN_REASON_KEY, reason);
}

export function takeAdminSignOutReason(): string | null {
  if (typeof window === "undefined") return null;
  const reason = localStorage.getItem(ADMIN_REASON_KEY);
  if (reason) localStorage.removeItem(ADMIN_REASON_KEY);
  return reason;
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = adminToken();
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      ...(init.body != null ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
  if (!res.ok) {
    // The session itself is over (the hour passed, or it was ended elsewhere). Drop the
    // token here so every screen in the console agrees, and keep the reason for the
    // sign-in page.
    if (res.status === 401 && (body.code === "session_idle" || body.code === "session_ended")) {
      endAdminSession(body.code);
    }
    throw new AdminApiError(res.status, body.error ?? `Request failed (${res.status})`, body.code);
  }
  return body as T;
}

export const admin = {
  login: async (username: string, password: string): Promise<AdminSession> => {
    const res = await call<AdminSession>("/admin/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    localStorage.setItem(ADMIN_KEY, res.token);
    if (res.idleTimeoutSeconds > 0) {
      localStorage.setItem(ADMIN_IDLE_KEY, String(res.idleTimeoutSeconds));
    }
    localStorage.removeItem(ADMIN_REASON_KEY);
    seedAdminActivity();
    return res;
  },
  /** Sign out on the server too, so the token cannot be replayed from storage. */
  logout: async () => {
    if (hasAdminSession()) {
      await call<{ ok: boolean }>("/admin/logout", { method: "POST", body: "{}" }).catch(
        () => undefined,
      );
    }
    clearAdminSession();
    localStorage.removeItem(ADMIN_REASON_KEY);
  },
  me: () => call<{ admin: AdminSession["admin"] }>("/admin/me"),
  changePassword: (currentPassword: string, newPassword: string, confirm: string) =>
    call<{ ok: boolean }>("/admin/change-password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword, confirm }),
    }),
  orgs: () => call<{ orgs: AdminOrgRow[] }>("/admin/orgs"),
  orgDetail: (orgNumber: number) => call<AdminOrgDetail>(`/admin/orgs/${orgNumber}/detail`),
  /** Re-run an organization's storage health check from the console (§9.8). */
  checkOrgStorage: (orgNumber: number) =>
    call<{ status: string; error: string | null }>(`/admin/orgs/${orgNumber}/storage/check`, {
      method: "POST",
      body: "{}",
    }),

  // ── Users ──
  users: (q?: string) =>
    call<{ users: import("@vault/shared").AdminUserRow[] }>(
      `/admin/users${q ? `?q=${encodeURIComponent(q)}` : ""}`,
    ),
  userCoins: (profileId: string, delta: number, note?: string) =>
    call<{ ok: boolean; coins: number; applied: number }>("/admin/users/coins", {
      method: "POST",
      body: JSON.stringify({ profileId, delta, ...(note ? { note } : {}) }),
    }),
  userBan: (profileId: string, banned: boolean) =>
    call<{ ok: boolean; banned: boolean }>("/admin/users/ban", {
      method: "POST",
      body: JSON.stringify({ profileId, banned }),
    }),
  userDelete: (profileId: string) =>
    call<{ ok: boolean }>(`/admin/users/${profileId}`, { method: "DELETE" }),

  setOrg: (input: AdminSetOrgInput) =>
    call<{ ok: boolean; orgNumber: number }>("/admin/orgs", {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  messageOrgs: (input: AdminBroadcastInput) =>
    call<{ ok: boolean; organizations: number; delivered: number }>("/admin/orgs/message", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  bulkDelete: (input: AdminBulkDeleteInput) =>
    call<{ ok: boolean; deleted: number }>("/admin/orgs/bulk-delete", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  orgTree: (orgNumber: number) =>
    call<{ name: string; nodes: AdminTreeNode[] }>(`/admin/orgs/${orgNumber}/tree`),
  requests: (status?: string) =>
    call<{ requests: AdminRequestRow[] }>(`/admin/requests${status ? `?status=${status}` : ""}`),
  decide: (id: string, input: DecidePlatformRequestInput) =>
    call<{
      ok: boolean;
      status: string;
      otp?: string | null;
      appliedOrgNumber?: number | null;
      expiresAt?: string;
    }>(`/admin/requests/${id}/decide`, { method: "POST", body: JSON.stringify(input) }),
  giftCoins: (input: GiftCoinsInput) =>
    call<{ ok: boolean; balance: number }>("/admin/coins/gift", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  upgradePlan: (input: UpgradePlanInput) =>
    call<{ ok: boolean; planKey: string; expiresAt: string | null }>("/admin/plans/upgrade", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  purgeOrg: (orgNumber: number) =>
    call<{ ok: boolean }>(`/admin/orgs/${orgNumber}/purge`, { method: "POST", body: "{}" }),
  getSettings: () => call<{ defaultCoins: number }>("/admin/settings"),
  setDefaultCoins: (defaultCoins: number) =>
    call<{ ok: boolean; defaultCoins: number }>("/admin/settings", {
      method: "PUT",
      body: JSON.stringify({ defaultCoins }),
    }),
  plans: () => call<{ plans: unknown[] }>("/admin/plans"),
  admins: () =>
    call<{ admins: { id: string; username: string; displayName: string; active: boolean; createdAt: string; lastLoginAt: string | null }[] }>(
      "/admin/admins",
    ),
  addAdmin: (input: AddAdminInput) =>
    call<{ ok: boolean; id: string }>("/admin/admins", { method: "POST", body: JSON.stringify(input) }),
  toggleAdmin: (id: string) =>
    call<{ ok: boolean; active: boolean }>(`/admin/admins/${id}/toggle`, { method: "POST", body: "{}" }),
};
