"use client";

import type {
  AppNotification,
  CourseAdminView,
  CreateCourseInput,
  MyLearningView,
  PlaceCourseInput,
} from "@vault/shared";
import { api, authFetch } from "./auth-client";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export const courses = {
  create: (orgId: string, input: CreateCourseInput) =>
    api<{ code: string }>(`/orgs/${orgId}/courses`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  place: (code: string, input: PlaceCourseInput) =>
    api<{ ok: boolean }>(`/courses/${code}/placements`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  myLearning: (orgId: string) => api<MyLearningView>(`/orgs/${orgId}/my-learning`),
  complete: (code: string) =>
    api<{ ok: boolean; validUntil: string | null }>(`/courses/${code}/complete`, {
      method: "POST",
      body: "{}",
    }),
  admin: (code: string) => api<CourseAdminView>(`/courses/${code}/admin`),
  grantAccess: (code: string, username: string, level: "VIEW" | "EDIT", canGrant: boolean) =>
    api<{ ok: boolean }>(`/courses/${code}/admin/access`, {
      method: "POST",
      body: JSON.stringify({ username, level, canGrant }),
    }),
  /** Content opens in a new tab: links resolve to their URL; files stream from the API. */
  contentUrl: (code: string) => `${API}/courses/${code}/content`,
  listForRole: (roleId: string) =>
    api<{
      courses: {
        code: string;
        title: string;
        kind: string;
        mandatory: boolean;
        inheritToDescendants: boolean;
        canDelete: boolean;
      }[];
    }>(`/roles/${roleId}/courses`),
  unplace: (code: string, roleNodeId: string) =>
    api<{ ok: boolean }>(`/courses/${code}/placements/${roleNodeId}`, { method: "DELETE" }),
  remove: (code: string) =>
    api<{ ok: boolean; releasedPrerequisiteLinks: number }>(`/courses/${code}`, {
      method: "DELETE",
    }),
};

export const notifications = {
  list: () => api<{ notifications: AppNotification[]; unread: number }>("/notifications"),
  markAllRead: () => api<{ ok: boolean }>("/notifications/read", { method: "POST", body: "{}" }),
};

export const vaultFiles = {
  exportMain: (orgId: string, password: string, supremeToken: string) =>
    fetchBinary(`/orgs/${orgId}/export-main`, { password }, supremeToken),
  deleteOrg: (orgId: string, supremeToken: string) =>
    api<{ ok: boolean; retainedUntil: string }>(`/orgs/${orgId}`, {
      method: "DELETE",
      headers: { "x-supreme-token": supremeToken },
    }),
  exportBkp: (roleId: string, password: string) =>
    fetchBinary(`/roles/${roleId}/export-bkp`, { password }),
  restoreBkp: (roleId: string, fileBase64: string, password: string) =>
    api<{ ok: boolean; report: { applied: string[]; skipped: string[] } }>(
      `/roles/${roleId}/restore-bkp`,
      { method: "POST", body: JSON.stringify({ fileBase64, password }) },
    ),
  revive: (fileBase64: string, password: string) =>
    api<{ ok: boolean; orgId: string; report: Record<string, number> }>("/orgs/revive", {
      method: "POST",
      body: JSON.stringify({ fileBase64, password }),
    }),
};

async function fetchBinary(path: string, body: object, supremeToken?: string): Promise<Blob> {
  // authFetch handles the Bearer header AND transparently refreshes an expired session
  const res = await authFetch(path, {
    method: "POST",
    headers: supremeToken ? { "x-supreme-token": supremeToken } : {},
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Download failed (${res.status})`);
  }
  return res.blob();
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
