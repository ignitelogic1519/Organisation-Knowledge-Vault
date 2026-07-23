import { z } from "zod";
import type { Classification, CompletionStatus, CourseKind } from "./types.js";

// Course & learning contracts — docs/structure.md §3 (courses), §5 (assignment), §6 (surfaces).

/**
 * Authored (in-app created) document blocks — the Studio's storage format. Rendered by
 * the viewer inside the standardized document frame. Rich text is stored as limited
 * HTML and sanitized (whitelist) at render time.
 */
export const authoredBlockSchema = z.object({
  type: z.enum(["heading", "paragraph", "table", "media", "card", "checklist", "image", "divider"]),
  /** heading/paragraph/card: limited HTML; image/media: url; table: unused */
  html: z.string().max(20_000).optional(),
  level: z.number().int().min(1).max(3).optional(), // heading level
  url: z.string().url().optional(), // media/image src
  mediaKind: z.enum(["audio", "video"]).optional(),
  title: z.string().max(200).optional(), // card/checklist/media title
  rows: z.array(z.array(z.string().max(2_000))).max(50).optional(), // table: rows of cells
  items: z.array(z.string().max(500)).max(50).optional(), // checklist entries
});
export type AuthoredBlock = z.infer<typeof authoredBlockSchema>;
export const authoredBlocksSchema = z.array(authoredBlockSchema).min(1).max(200);

export const createCourseSchema = z.object({
  roleNodeId: z.string().uuid(), // uploading role — its number goes into the code
  kind: z.enum(["DOCUMENT", "BOOK", "LINK", "AUDIO", "VIDEO"]),
  title: z.string().min(2, "Title is too short").max(120),
  /** Short description — shown in the library and on the course's detail view. */
  description: z.string().min(8, "Describe the course in a sentence or two").max(500),
  /** Whether the course is discoverable in the organization library. */
  inLibrary: z.boolean().default(false),
  /** Dynamic shelf tag ("AI", "Safety", …) — the library groups similar tags together. */
  category: z.string().trim().max(40).optional(),
  /** Page-2 "scope" of the standardized document format. */
  scope: z.string().trim().max(2000).optional(),
  /** Compulsory organization-standard classification. */
  classification: z.enum(["PUBLIC", "CONFIDENTIAL", "PRIVATE", "SECRET"], {
    errorMap: () => ({ message: "Pick the document's classification — it is compulsory" }),
  }),
  /** Owner-controlled: may members download the document from the preview? */
  allowDownload: z.boolean().default(false),
  /** LINK/AUDIO/VIDEO hosted elsewhere: external URL. */
  url: z.string().url().optional(),
  /** Small files (≤ 2 MB) via the inline adapter. */
  fileBase64: z.string().optional(),
  filename: z.string().max(200).optional(),
  mime: z.string().max(100).optional(),
  /** Studio-authored interactive document. */
  blocks: authoredBlocksSchema.optional(),
  deadlineDays: z.number().int().positive().max(3650).optional(),
  retakeEveryNDays: z.number().int().positive().max(3650).optional(),
  resetsCompletionOnUpdate: z.boolean().default(false),
  /** Course codes that must be completed first (hard prerequisites). */
  prerequisiteCodes: z.array(z.string()).max(20).default([]),
});
export type CreateCourseInput = z.infer<typeof createCourseSchema>;

export const placeCourseSchema = z.object({
  roleNodeId: z.string().uuid(),
  mandatory: z.boolean(),
  inheritToDescendants: z.boolean(),
  /** Optional per-branch overrides of the course defaults. */
  deadlineDays: z.number().int().positive().max(3650).nullable().optional(),
  retakeEveryNDays: z.number().int().positive().max(3650).nullable().optional(),
});
export type PlaceCourseInput = z.infer<typeof placeCourseSchema>;

export const grantAdminAccessSchema = z.object({
  username: z.string().min(1),
  level: z.enum(["VIEW", "EDIT"]),
  canGrant: z.boolean().default(false),
});
export type GrantAdminAccessInput = z.infer<typeof grantAdminAccessSchema>;

export const updateCourseSchema = z.object({
  title: z.string().min(2).max(120).optional(),
  description: z.string().min(8).max(500).optional(),
  scope: z.string().trim().max(2000).nullable().optional(),
  category: z.string().trim().max(40).nullable().optional(),
  classification: z.enum(["PUBLIC", "CONFIDENTIAL", "PRIVATE", "SECRET"]).optional(),
  allowDownload: z.boolean().optional(),
  url: z.string().url().optional(),
  fileBase64: z.string().optional(),
  filename: z.string().max(200).optional(),
  mime: z.string().max(100).optional(),
  blocks: authoredBlocksSchema.optional(),
});
export type UpdateCourseInput = z.infer<typeof updateCourseSchema>;

export interface CourseInfo {
  code: string;
  title: string;
  kind: CourseKind;
  version: number;
  deadlineDays: number | null;
  retakeEveryNDays: number | null;
  prerequisiteCodes: string[];
}

/** A library entry: course metadata plus usage & completion signals for the detail view. */
export interface LibraryCourse {
  code: string;
  title: string;
  kind: CourseKind;
  description: string | null;
  category: string | null;
  classification: Classification;
  archived: boolean;
  uploaderRoleName: string;
  createdAt: string;
  /** How many people completed it (org-wide, across versions). */
  completedCount: number;
  /** Branch names the course is currently placed on. */
  usedIn: string[];
  /** Average rating (1–5) across reviews, null when unrated. */
  avgRating: number | null;
  ratingCount: number;
}

export const reviewCourseSchema = z.object({
  rating: z.number().int().min(1).max(5).nullable().optional(),
  comment: z.string().trim().max(1000).optional(),
});
export type ReviewCourseInput = z.infer<typeof reviewCourseSchema>;

export interface CourseReviewView {
  displayName: string;
  username: string;
  rating: number | null;
  comment: string | null;
  updatedAt: string;
}

/** Per-course compliance for a branch: who completed, who is pending/overdue. */
export interface ComplianceCourse {
  code: string;
  title: string;
  mandatory: boolean;
  viaRoleName: string;
  total: number;
  compliant: number;
  pending: {
    profileId: string;
    displayName: string;
    username: string;
    status: CompletionStatus | "AVAILABLE";
    overdue: boolean;
  }[];
}

export interface ComplianceReport {
  roleId: string;
  roleName: string;
  /** Everyone in the branch's subtree the courses reach. */
  peopleCount: number;
  courses: ComplianceCourse[];
}

export interface LearningItem extends CourseInfo {
  mandatory: boolean;
  viaRoleName: string; // which placement reaches this user
  status: CompletionStatus | "AVAILABLE";
  completedAt: string | null;
  validUntil: string | null;
  /** Prerequisite codes not yet completed — non-empty blocks completion. */
  missingPrerequisites: string[];
  overdue: boolean;
  /** Standardized-document metadata for the viewer's cover & header/footer. */
  description: string | null;
  scope: string | null;
  classification: Classification;
  allowDownload: boolean;
  publishedAt: string;
  creatorName: string;
}

export interface MyLearningView {
  orgId: string;
  mandatory: LearningItem[];
  optIn: LearningItem[];
}

export interface CourseAdminView {
  course: CourseInfo & { createdAt: string; resetsCompletionOnUpdate: boolean };
  usage: {
    roleName: string;
    roleNumber: number;
    mandatory: boolean;
    inheritToDescendants: boolean;
  }[];
  access: { username: string; displayName: string; level: "VIEW" | "EDIT"; canGrant: boolean }[];
  myLevel: "VIEW" | "EDIT";
  completions: { total: number; completed: number; expired: number };
}

export interface AppNotification {
  id: string;
  kind: string;
  /** Org the event belongs to — lets the bell deep-link to the right place. */
  orgId: string | null;
  payload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}
