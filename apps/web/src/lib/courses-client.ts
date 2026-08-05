"use client";

import type {
  ComplianceReport,
  CourseAdminView,
  CourseHistoryView,
  CourseReviewView,
  CreateCourseInput,
  LibraryCourse,
  MailboxView,
  MyLearningView,
  PlaceCourseInput,
  ReviewCourseInput,
  UpdateCourseInput,
} from "@vault/shared";
import { api, authFetch } from "./auth-client";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** Everything GET /courses/:code answers — including what the Studio needs to reopen it. */
export interface CourseDetail {
  code: string;
  title: string;
  kind: import("@vault/shared").CourseKind;
  version: number;
  deadlineDays: number | null;
  retakeEveryNDays: number | null;
  prerequisiteCodes: string[];
  description: string | null;
  scope: string | null;
  category: string | null;
  classification: import("@vault/shared").Classification;
  allowDownload: boolean;
  inLibrary: boolean;
  resetsCompletionOnUpdate: boolean;
  source: "STUDIO" | "UPLOAD";
  /** Out of deployment: it reaches nobody while its next edition is written. */
  withdrawn: boolean;
  archived: boolean;
  /** Retired by a newer document — an old reference forwards here. */
  supersededByCode: string | null;
  /** What this one replaced when it was published. */
  supersedesCode: string | null;
  canManage: boolean;
  publishedAt: string;
  creatorName: string;
  draft: boolean;
}

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
    api<CourseDetail>(`/courses/${code}`),
  /** The stored content itself — authored blocks, an exam paper, a link, or a ticket for
   *  an object in the organization's own storage. Managers only for an exam: the answer
   *  key lives in there. */
  content: (code: string) =>
    api<{
      authored?: import("@vault/shared").AuthoredBlock[];
      exam?: import("@vault/shared").ExamBody;
      theme?: import("@vault/shared").DocumentTheme;
      url?: string;
      /** Present for the `s3` adapter: fetch and decrypt in the browser (§9.5). */
      downloadUrl?: string;
      encrypted?: boolean;
      fileKey?: string;
      mime?: string;
      filename?: string;
      bytes?: number;
      sha256?: string;
    }>(`/courses/${code}/content`),
  /** Take a course out of deployment (or put it back) while a new edition is written. */
  withdraw: (code: string, withdrawn: boolean) =>
    api<{ ok: boolean; withdrawn: boolean }>(`/courses/${code}/withdraw`, {
      method: "POST",
      body: JSON.stringify({ withdrawn }),
    }),
  /** Every edition ever published, and how this document stands against its neighbours. */
  editions: (code: string) => api<CourseHistoryView>(`/courses/${code}/editions`),
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
        version: number;
        withdrawn: boolean;
        source: "STUDIO" | "UPLOAD";
        allowDownload: boolean;
        mandatory: boolean;
        inheritToDescendants: boolean;
        deadlineDays: number | null;
        retakeEveryNDays: number | null;
        /** The course's own defaults, before the placement's overrides. */
        courseDeadlineDays: number | null;
        courseRetakeEveryNDays: number | null;
        scope: string | null;
        category: string | null;
        resetsCompletionOnUpdate: boolean;
        supersededByCourseId: string | null;
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
  /** Manager-only: give candidates their exam attempts back. */
  resetExam: (roleId: string, input: { courseCode: string; profileIds: string[]; note?: string }) =>
    api<{ ok: boolean; reset: number; attemptsVoided: number }>(
      `/roles/${roleId}/compliance/reset-exam`,
      { method: "POST", body: JSON.stringify(input) },
    ),
};

/** Live username suggestions for the add-person forms. */
export const people = {
  search: (q: string, orgId?: string) =>
    api<{ profiles: { username: string; displayName: string; avatar: string | null; alreadyMember: boolean }[] }>(
      `/profiles/search?q=${encodeURIComponent(q)}${orgId ? `&orgId=${orgId}` : ""}`,
    ),
};

/** The mailbox — one read returns folders, labels, counts and expiry in a single trip. */
export const mailbox = {
  load: () => api<MailboxView>("/notifications"),
  markRead: (scope: { category?: string; orgId?: string } = {}) =>
    api<{ ok: boolean; marked: number }>("/notifications/read", {
      method: "POST",
      body: JSON.stringify(scope),
    }),
  mark: (ids: string[], read: boolean) =>
    api<{ ok: boolean; updated: number }>("/notifications/mark", {
      method: "POST",
      body: JSON.stringify({ ids, read }),
    }),
  remove: (id: string) => api<{ ok: boolean }>(`/notifications/${id}`, { method: "DELETE" }),
  removeMany: (ids: string[]) =>
    api<{ ok: boolean; deleted: number }>("/notifications/delete", {
      method: "POST",
      body: JSON.stringify({ ids }),
    }),
  clear: (scope: { category?: string; orgId?: string; readOnly?: boolean } = {}) =>
    api<{ ok: boolean; deleted: number }>("/notifications/clear", {
      method: "POST",
      body: JSON.stringify(scope),
    }),
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
  revive: (fileBase64: string, password: string, accessCode?: string) =>
    api<{ ok: boolean; orgId: string; report: Record<string, number> }>("/orgs/revive", {
      method: "POST",
      body: JSON.stringify({ fileBase64, password, ...(accessCode ? { accessCode } : {}) }),
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
