import { z } from "zod";

// Ask-and-approve contracts: every request on the platform carries an explicit
// category so both inboxes and history read unambiguously.

export type RequestKind =
  | "COURSE_ASSIGN"
  | "JOIN_BRANCH"
  | "DELETE_BRANCH"
  | "VISIBILITY"
  | "CONTENT_REVIEW";
export type RequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "CHANGES_REQUESTED";

/** How each status reads to a human, and who it is waiting on. */
export const REQUEST_STATUS_TEXT: Record<
  RequestStatus,
  { label: string; waitingOn: "reviewer" | "author" | "nobody" }
> = {
  PENDING: { label: "waiting on review", waitingOn: "reviewer" },
  APPROVED: { label: "approved", waitingOn: "nobody" },
  REJECTED: { label: "declined", waitingOn: "nobody" },
  CHANGES_REQUESTED: { label: "changes requested", waitingOn: "author" },
};

/** Human labels for the request categories — the single source for UI text. */
export const REQUEST_KIND_LABELS: Record<RequestKind, string> = {
  COURSE_ASSIGN: "Course request",
  JOIN_BRANCH: "Join request",
  DELETE_BRANCH: "Deletion request",
  VISIBILITY: "Visibility request",
  CONTENT_REVIEW: "Document review",
};

export const createRequestSchema = z.object({
  kind: z.enum(["COURSE_ASSIGN", "JOIN_BRANCH", "DELETE_BRANCH", "VISIBILITY"]),
  /** Branch to join / branch to delete / branch that should receive the course. */
  targetRoleNodeId: z.string().uuid(),
  /** JOIN_BRANCH only: the position the requester wants — member or sub-owner. */
  joinAs: z.enum(["MEMBER", "OWNER"]).default("MEMBER"),
  /** COURSE_ASSIGN only: the library course being requested. */
  courseCode: z.string().optional(),
  message: z.string().max(500).optional(),
});
// z.input: fields with defaults (joinAs) stay optional for callers
export type CreateRequestInput = z.input<typeof createRequestSchema>;

/**
 * A Document review has three outcomes, not two. "Send back" is the one that was
 * missing: the draft survives, the author is told exactly what to change, and the thread
 * stays open until they resubmit. Rejecting still discards the draft — it is the
 * deliberate "this should not exist" verdict, which is why it needs its own word.
 */
export const reviewOutcomes = ["APPROVE", "CHANGES", "REJECT"] as const;
export const reviewOutcomeSchema = z.enum(reviewOutcomes);
export type ReviewOutcome = z.infer<typeof reviewOutcomeSchema>;

export const REVIEW_OUTCOME_TEXT: Record<
  ReviewOutcome,
  { label: string; blurb: string }
> = {
  APPROVE: {
    label: "Approve & publish",
    blurb: "Configure it for the branch and put it live.",
  },
  CHANGES: {
    label: "Send back with changes",
    blurb:
      "The author keeps their work and their draft. Write what needs changing — they revise it and send it back to you.",
  },
  REJECT: {
    label: "Decline",
    blurb:
      "The proposal is discarded and the draft deleted. Use this when the document should not exist, not when it needs work.",
  },
};

export const decideRequestSchema = z.object({
  approve: z.boolean(),
  /**
   * CONTENT_REVIEW: the explicit verdict. Absent for every other kind, and absent on old
   * clients — where `approve` still decides between publish and discard.
   */
  outcome: reviewOutcomeSchema.optional(),
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
      /** CONTENT_REVIEW approval: also publish the newly-approved document to the library. */
      inLibrary: z.boolean().optional(),
    })
    .optional(),
});
export type DecideRequestInput = z.infer<typeof decideRequestSchema>;

/** Post a message onto a request's thread — the suggestion channel, both directions. */
export const requestMessageSchema = z.object({
  body: z.string().trim().min(1, "Write something").max(2000),
  /** RESUBMIT puts a returned Document review back in the reviewer's inbox. */
  kind: z.enum(["REPLY", "RESUBMIT"]).default("REPLY"),
});
export type RequestMessageInput = z.input<typeof requestMessageSchema>;

export interface RequestMessageView {
  id: string;
  kind: "SUGGESTION" | "REPLY" | "RESUBMIT" | "DECISION";
  body: string;
  author: { username: string; displayName: string };
  /** True when the signed-in user wrote it — the thread aligns on that. */
  mine: boolean;
  createdAt: string;
}

export interface RequestView {
  id: string;
  kind: RequestKind;
  status: RequestStatus;
  targetRoleName: string;
  targetRoleNumber: number;
  /** JOIN_BRANCH: the position being asked for. */
  joinAs: "MEMBER" | "OWNER";
  courseCode: string | null;
  courseTitle: string | null;
  requester: { username: string; displayName: string };
  message: string | null;
  decisionNote: string | null;
  decidedAt: string | null;
  createdAt: string;
  // ── Document review only ──────────────────────────────────────────────────
  /** The suggestion thread, oldest first. Empty for every other request kind. */
  messages: RequestMessageView[];
  /** How many times the reviewer has sent it back. */
  revisionRound: number;
  /** Sitting with the author after a send-back, rather than in the reviewer's inbox. */
  awaitingAuthor: boolean;
  /** The signed-in user may write on this thread. */
  canMessage: boolean;
  /** The signed-in user is the one who must act next. */
  isMyTurn: boolean;
}

export interface RequestsOverview {
  orgId: string;
  /** Requests the signed-in user has made, newest first. */
  mine: RequestView[];
  /** Pending requests the signed-in user has the authority to decide. */
  inbox: RequestView[];
}
