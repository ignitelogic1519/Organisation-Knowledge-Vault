import { z } from "zod";
import type { CompletionStatus, CourseKind } from "./types.js";

// Course & learning contracts — docs/structure.md §3 (courses), §5 (assignment), §6 (surfaces).

export const createCourseSchema = z.object({
  roleNodeId: z.string().uuid(), // uploading role — its number goes into the code
  kind: z.enum(["DOCUMENT", "BOOK", "LINK", "AUDIO", "VIDEO"]),
  title: z.string().min(2, "Title is too short").max(120),
  /** LINK/AUDIO/VIDEO hosted elsewhere: external URL. */
  url: z.string().url().optional(),
  /** Small files (≤ 2 MB) via the inline adapter. */
  fileBase64: z.string().optional(),
  filename: z.string().max(200).optional(),
  mime: z.string().max(100).optional(),
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
});
export type PlaceCourseInput = z.infer<typeof placeCourseSchema>;

export const grantAdminAccessSchema = z.object({
  email: z.string().email(),
  level: z.enum(["VIEW", "EDIT"]),
  canGrant: z.boolean().default(false),
});
export type GrantAdminAccessInput = z.infer<typeof grantAdminAccessSchema>;

export const updateCourseSchema = z.object({
  title: z.string().min(2).max(120).optional(),
  url: z.string().url().optional(),
  fileBase64: z.string().optional(),
  filename: z.string().max(200).optional(),
  mime: z.string().max(100).optional(),
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

export interface LearningItem extends CourseInfo {
  mandatory: boolean;
  viaRoleName: string; // which placement reaches this user
  status: CompletionStatus | "AVAILABLE";
  completedAt: string | null;
  validUntil: string | null;
  /** Prerequisite codes not yet completed — non-empty blocks completion. */
  missingPrerequisites: string[];
  overdue: boolean;
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
  access: { email: string; displayName: string; level: "VIEW" | "EDIT"; canGrant: boolean }[];
  myLevel: "VIEW" | "EDIT";
  completions: { total: number; completed: number; expired: number };
}

export interface AppNotification {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}
