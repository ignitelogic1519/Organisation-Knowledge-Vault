"use client";

import type {
  AddAdminInput,
  AdminOrgRow,
  AdminRequestRow,
  AdminSession,
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
  orgTree: (orgNumber: number) =>
    call<{ name: string; nodes: AdminTreeNode[] }>(`/admin/orgs/${orgNumber}/tree`),
  requests: (status?: string) =>
    call<{ requests: AdminRequestRow[] }>(`/admin/requests${status ? `?status=${status}` : ""}`),
  decide: (id: string, input: DecidePlatformRequestInput) =>
    call<{ ok: boolean; status: string; otp?: string; expiresAt?: string }>(
      `/admin/requests/${id}/decide`,
      { method: "POST", body: JSON.stringify(input) },
    ),
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
