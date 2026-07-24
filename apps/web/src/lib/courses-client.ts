"use client";

import type {
  AppNotification,
  ComplianceReport,
  CourseAdminView,
  CourseReviewView,
  CreateCourseInput,
  LibraryCourse,
  MyLearningView,
  PlaceCourseInput,
  ReviewCourseInput,
  UpdateCourseInput,
} from "@vault/shared";
import { api, authFetch } from "./auth-client";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export const courses = {
  create: (orgId: string, input: CreateCourseInput) =>
    api<{ code: string; id: string; draft: boolean }>(`/orgs/${orgId}/courses`, {
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
  compliance: (code: string) =>
    api<import("@vault/shared").CourseComplianceView>(`/courses/${code}/compliance`),
  info: (code: string) =>
    api<{
      code: string;
      title: string;
      kind: import("@vault/shared").CourseKind;
      version: number;
      deadlineDays: number | null;
      retakeEveryNDays: number | null;
      prerequisiteCodes: string[];
      description: string | null;
      scope: string | null;
      classification: import("@vault/shared").Classification;
      allowDownload: boolean;
      publishedAt: string;
      creatorName: string;
      draft: boolean;
    }>(`/courses/${code}`),
  admin: (code: string) => api<CourseAdminView>(`/courses/${code}/admin`),
  grantAccess: (code: string, username: string, level: "VIEW" | "EDIT", canGrant: boolean) =>
    api<{ ok: boolean }>(`/courses/${code}/admin/access`, {
      method: "POST",
      body: JSON.stringify({ username, level, canGrant }),
    }),
  /** Content endpoint — the in-app viewer fetches it; ?download=1 forces attachment. */
  contentUrl: (code: string) => `${API}/courses/${code}/content`,
  archive: (code: string, archived: boolean) =>
    api<{ ok: boolean; archived: boolean }>(`/courses/${code}/archive`, {
      method: "POST",
      body: JSON.stringify({ archived }),
    }),
  update: (code: string, input: UpdateCourseInput) =>
    api<{ ok: boolean; version: number }>(`/courses/${code}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  listForRole: (roleId: string) =>
    api<{
      courses: {
        code: string;
        title: string;
        kind: string;
        description: string | null;
        classification: import("@vault/shared").Classification;
        inLibrary: boolean;
        archived: boolean;
        allowDownload: boolean;
        mandatory: boolean;
        inheritToDescendants: boolean;
        deadlineDays: number | null;
        retakeEveryNDays: number | null;
        canManage: boolean;
        canDelete: boolean;
      }[];
    }>(`/roles/${roleId}/courses`),
  library: (orgId: string, q?: string) =>
    api<{ courses: LibraryCourse[] }>(
      `/orgs/${orgId}/library${q ? `?q=${encodeURIComponent(q)}` : ""}`,
    ),
  suggestCategory: (orgId: string, title: string, description: string) =>
    api<{ suggestion: string | null; categories: string[] }>(
      `/orgs/${orgId}/library/suggest-category`,
      { method: "POST", body: JSON.stringify({ title, description }) },
    ),
  reviews: (code: string) =>
    api<{
      reviews: CourseReviewView[];
      avgRating: number | null;
      count: number;
      mine: { rating: number | null; comment: string | null } | null;
    }>(`/courses/${code}/reviews`),
  review: (code: string, input: ReviewCourseInput) =>
    api<{ ok: boolean }>(`/courses/${code}/review`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  unplace: (code: string, roleNodeId: string) =>
    api<{ ok: boolean }>(`/courses/${code}/placements/${roleNodeId}`, { method: "DELETE" }),
  remove: (code: string) =>
    api<{ ok: boolean; releasedPrerequisiteLinks: number }>(`/courses/${code}`, {
      method: "DELETE",
    }),
};

export const compliance = {
  report: (roleId: string) => api<ComplianceReport>(`/roles/${roleId}/compliance`),
  remind: (roleId: string, input: { courseCode: string; profileIds: string[]; message?: string }) =>
    api<{ ok: boolean; reminded: number }>(`/roles/${roleId}/compliance/remind`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
};

export const notifications = {
  list: () => api<{ notifications: AppNotification[]; unread: number }>("/notifications"),
  markAllRead: () => api<{ ok: boolean }>("/notifications/read", { method: "POST", body: "{}" }),
  remove: (id: string) => api<{ ok: boolean }>(`/notifications/${id}`, { method: "DELETE" }),
  clearAll: () => api<{ ok: boolean }>("/notifications/clear", { method: "POST", body: "{}" }),
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
