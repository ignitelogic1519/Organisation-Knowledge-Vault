import { z } from "zod";

// Ask-and-approve contracts: every request on the platform carries an explicit
// category so both inboxes and history read unambiguously.

export type RequestKind = "COURSE_ASSIGN" | "JOIN_BRANCH" | "DELETE_BRANCH";
export type RequestStatus = "PENDING" | "APPROVED" | "REJECTED";

/** Human labels for the request categories — the single source for UI text. */
export const REQUEST_KIND_LABELS: Record<RequestKind, string> = {
  COURSE_ASSIGN: "Course request",
  JOIN_BRANCH: "Join request",
  DELETE_BRANCH: "Deletion request",
};

export const createRequestSchema = z.object({
  kind: z.enum(["COURSE_ASSIGN", "JOIN_BRANCH", "DELETE_BRANCH"]),
  /** Branch to join / branch to delete / branch that should receive the course. */
  targetRoleNodeId: z.string().uuid(),
  /** COURSE_ASSIGN only: the library course being requested. */
  courseCode: z.string().optional(),
  message: z.string().max(500).optional(),
});
export type CreateRequestInput = z.infer<typeof createRequestSchema>;

export const decideRequestSchema = z.object({
  approve: z.boolean(),
  decisionNote: z.string().max(500).optional(),
  /**
   * COURSE_ASSIGN approval config — the approving manager tunes the course for their
   * branch (mandatory, inheritance, deadline and recurrence overrides) before it lands.
   */
  config: z
    .object({
      mandatory: z.boolean(),
      inheritToDescendants: z.boolean(),
      deadlineDays: z.number().int().positive().max(3650).nullable().optional(),
      retakeEveryNDays: z.number().int().positive().max(3650).nullable().optional(),
    })
    .optional(),
});
export type DecideRequestInput = z.infer<typeof decideRequestSchema>;

export interface RequestView {
  id: string;
  kind: RequestKind;
  status: RequestStatus;
  targetRoleName: string;
  targetRoleNumber: number;
  courseCode: string | null;
  courseTitle: string | null;
  requester: { username: string; displayName: string };
  message: string | null;
  decisionNote: string | null;
  decidedAt: string | null;
  createdAt: string;
}

export interface RequestsOverview {
  orgId: string;
  /** Requests the signed-in user has made, newest first. */
  mine: RequestView[];
  /** Pending requests the signed-in user has the authority to decide. */
  inbox: RequestView[];
}
