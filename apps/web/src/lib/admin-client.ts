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

export class AdminApiError extends Error {
  constructor(public status: number, message: string) {
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
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new AdminApiError(res.status, body.error ?? `Request failed (${res.status})`);
  return body as T;
}

export const admin = {
  login: async (username: string, password: string): Promise<AdminSession> => {
    const res = await call<AdminSession>("/admin/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    localStorage.setItem(ADMIN_KEY, res.token);
    return res;
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
