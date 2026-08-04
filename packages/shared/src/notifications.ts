// The mailbox contract — one catalog of every message the platform can send, shared by
// the API (which stamps category/priority/expiry on write) and the web client (which
// renders labels, folders and deep links). Adding a message kind means adding one row
// here; nothing else has to change.
//
// Everything is a plain object map so a lookup is a single hash probe, and the derived
// index (KIND_BY_CATEGORY) is built once at module load instead of on every render.

/** Top-level mailbox folders — the left rail of the mailbox, in display order. */
export type NotificationCategory =
  | "ADMIN" // from the Knowledge Base team — always high priority
  | "PLAN" // plans, coins, expiry
  | "REQUESTS" // the ask-and-approve flows (join, course, deletion, visibility, review)
  | "CONTENT" // publishing, reviews, adoption of your material
  | "LEARNING" // assignments, deadlines, expiry, exam results
  | "PEOPLE" // placements, roles, governance
  | "SYSTEM"; // housekeeping notes about the mailbox itself

/** Priority drives sort order and the red "high" flag. Admin mail is always HIGH. */
export type NotificationPriority = "HIGH" | "NORMAL" | "LOW";

export interface NotificationKindMeta {
  /** Subject line shown in the list when the server didn't store one. */
  label: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  /** Days the message survives before the sweeper deletes it. */
  retentionDays: number;
  /** Optional finer label inside a category ("Document review", "Join request"). */
  sublabel?: string;
  icon: string;
}

export const NOTIFICATION_CATEGORY_META: Record<
  NotificationCategory,
  { label: string; icon: string; blurb: string }
> = {
  ADMIN: {
    label: "Knowledge Base",
    icon: "🛡",
    blurb: "Messages from the Knowledge Base team — access codes, decisions, announcements.",
  },
  PLAN: { label: "Plans & Coins", icon: "🪙", blurb: "Plan changes, expiry warnings and coin movements." },
  REQUESTS: { label: "Requests", icon: "📨", blurb: "Everything waiting on a decision — yours or someone else's." },
  CONTENT: { label: "Publishing", icon: "📄", blurb: "Document reviews, publications and adoptions." },
  LEARNING: { label: "Learning", icon: "🎓", blurb: "Your courses, deadlines, exam results and reminders." },
  PEOPLE: { label: "People", icon: "👥", blurb: "Placements, ownership and governance changes." },
  SYSTEM: { label: "System", icon: "⚙", blurb: "Housekeeping notes about this mailbox." },
};

/** The display order of the folder rail. */
export const NOTIFICATION_CATEGORIES: NotificationCategory[] = [
  "ADMIN",
  "REQUESTS",
  "CONTENT",
  "LEARNING",
  "PLAN",
  "PEOPLE",
  "SYSTEM",
];

/** Default retention windows (days). Admin receipts live longest — they carry codes. */
export const RETENTION_DAYS = {
  ADMIN: 30,
  PLAN: 30,
  REQUESTS: 14,
  CONTENT: 14,
  LEARNING: 10,
  PEOPLE: 14,
  SYSTEM: 3,
} as const satisfies Record<NotificationCategory, number>;

/**
 * Every message kind on the platform. `sublabel` is the Gmail-style secondary label a
 * message carries inside its folder — that is how "publishing a document" and "a course
 * for my path" end up as separate, filterable things instead of one grey pile.
 */
export const NOTIFICATION_KINDS: Record<string, NotificationKindMeta> = {
  // ── From the Knowledge Base team (super-admin). Always HIGH. ─────────────
  admin_otp: {
    label: "Your access code is ready",
    category: "ADMIN",
    priority: "HIGH",
    retentionDays: RETENTION_DAYS.ADMIN,
    sublabel: "Access code",
    icon: "🔑",
  },
  admin_denied: {
    label: "Your request was declined",
    category: "ADMIN",
    priority: "HIGH",
    retentionDays: RETENTION_DAYS.ADMIN,
    sublabel: "Decision",
    icon: "🚫",
  },
  admin_message: {
    label: "A message from the Knowledge Base team",
    category: "ADMIN",
    priority: "HIGH",
    retentionDays: RETENTION_DAYS.ADMIN,
    sublabel: "Announcement",
    icon: "📣",
  },
  coins_gift: {
    label: "Your Knowledge Coins changed",
    category: "ADMIN",
    priority: "HIGH",
    retentionDays: RETENTION_DAYS.ADMIN,
    sublabel: "Coins",
    icon: "🪙",
  },
  plan_upgraded: {
    label: "Your organization plan was updated",
    category: "ADMIN",
    priority: "HIGH",
    retentionDays: RETENTION_DAYS.ADMIN,
    sublabel: "Plan",
    icon: "⭐",
  },
  plan_expiring: {
    label: "A plan is close to expiry",
    category: "PLAN",
    priority: "HIGH",
    retentionDays: RETENTION_DAYS.PLAN,
    sublabel: "Expiry",
    icon: "⏳",
  },
  plan_expired: {
    label: "A plan has lapsed",
    category: "PLAN",
    priority: "HIGH",
    retentionDays: RETENTION_DAYS.PLAN,
    sublabel: "Expiry",
    icon: "⏰",
  },
  // Coins spent by the user themselves (founding or restoring an organization).
  coins_spent: {
    label: "Knowledge Coins spent",
    category: "PLAN",
    priority: "NORMAL",
    retentionDays: RETENTION_DAYS.PLAN,
    sublabel: "Coins",
    icon: "💳",
  },
  plan_activated: {
    label: "A plan is now active",
    category: "PLAN",
    priority: "NORMAL",
    retentionDays: RETENTION_DAYS.PLAN,
    sublabel: "Plan",
    icon: "✅",
  },

  // ── Requests, split by the sub-flow they belong to ────────────────────────
  request_created: {
    label: "A request is waiting on you",
    category: "REQUESTS",
    priority: "NORMAL",
    retentionDays: RETENTION_DAYS.REQUESTS,
    icon: "📨",
  },
  request_decided: {
    label: "Your request was decided",
    category: "REQUESTS",
    priority: "NORMAL",
    retentionDays: RETENTION_DAYS.REQUESTS,
    icon: "✉️",
  },
  request_withdrawn: {
    label: "A request was withdrawn",
    category: "REQUESTS",
    priority: "LOW",
    retentionDays: RETENTION_DAYS.REQUESTS,
    icon: "↩️",
  },

  // ── Publishing / content ─────────────────────────────────────────────────
  content_published: {
    label: "Your document was published",
    category: "CONTENT",
    priority: "NORMAL",
    retentionDays: RETENTION_DAYS.CONTENT,
    sublabel: "Publishing",
    icon: "📄",
  },
  content_rejected: {
    label: "Your document was not published",
    category: "CONTENT",
    priority: "NORMAL",
    retentionDays: RETENTION_DAYS.CONTENT,
    sublabel: "Publishing",
    icon: "📄",
  },
  course_adopted: {
    label: "Your course was adopted",
    category: "CONTENT",
    priority: "LOW",
    retentionDays: RETENTION_DAYS.CONTENT,
    sublabel: "Adoption",
    icon: "🌱",
  },
  course_updated_redo: {
    label: "A course was updated — completion reset",
    category: "LEARNING",
    priority: "NORMAL",
    retentionDays: RETENTION_DAYS.LEARNING,
    sublabel: "New edition",
    icon: "🔁",
  },

  // ── Learning ─────────────────────────────────────────────────────────────
  course_assigned: {
    label: "A new course reaches you",
    category: "LEARNING",
    priority: "NORMAL",
    retentionDays: RETENTION_DAYS.LEARNING,
    sublabel: "Assignment",
    icon: "📚",
  },
  completion_expired: {
    label: "A completion expired — course re-assigned",
    category: "LEARNING",
    priority: "NORMAL",
    retentionDays: RETENTION_DAYS.LEARNING,
    sublabel: "Recurrence",
    icon: "🔄",
  },
  course_overdue: {
    label: "A mandatory course is overdue",
    category: "LEARNING",
    priority: "HIGH",
    retentionDays: RETENTION_DAYS.LEARNING,
    sublabel: "Overdue",
    icon: "⚠️",
  },
  escalation_overdue: {
    label: "Someone you added has an overdue course",
    category: "LEARNING",
    priority: "HIGH",
    retentionDays: RETENTION_DAYS.LEARNING,
    sublabel: "Escalation",
    icon: "📈",
  },
  compliance_reminder: {
    label: "Reminder from your manager",
    category: "LEARNING",
    priority: "NORMAL",
    retentionDays: RETENTION_DAYS.LEARNING,
    sublabel: "Reminder",
    icon: "🔔",
  },
  exam_attempts_exhausted: {
    label: "You have used every attempt on an exam",
    category: "LEARNING",
    priority: "HIGH",
    retentionDays: RETENTION_DAYS.LEARNING,
    sublabel: "Exam",
    icon: "🛑",
  },
  exam_reset: {
    label: "Your exam attempts were reset",
    category: "LEARNING",
    priority: "NORMAL",
    retentionDays: RETENTION_DAYS.LEARNING,
    sublabel: "Exam",
    icon: "♻️",
  },

  // ── People & governance ──────────────────────────────────────────────────
  placement_added: {
    label: "You were placed on a branch",
    category: "PEOPLE",
    priority: "NORMAL",
    retentionDays: RETENTION_DAYS.PEOPLE,
    sublabel: "Placement",
    icon: "🌳",
  },
  placement_removed: {
    label: "You were removed from a branch",
    category: "PEOPLE",
    priority: "NORMAL",
    retentionDays: RETENTION_DAYS.PEOPLE,
    sublabel: "Placement",
    icon: "🍂",
  },

  // ── System ───────────────────────────────────────────────────────────────
  inbox_cleanup: {
    label: "Your mailbox is filling up",
    category: "SYSTEM",
    priority: "LOW",
    retentionDays: RETENTION_DAYS.SYSTEM,
    icon: "🧹",
  },
  // Storage health (docs/structure.md §9.8). Both are HIGH because an owner needs to
  // act, and both are worded so the state never reads as data loss — it is not.
  storage_degraded: {
    label: "Your storage is not reachable",
    category: "SYSTEM",
    priority: "HIGH",
    retentionDays: RETENTION_DAYS.SYSTEM,
    sublabel: "Storage",
    icon: "🔌",
  },
  storage_recovered: {
    label: "Your storage is reachable again",
    category: "SYSTEM",
    priority: "HIGH",
    retentionDays: RETENTION_DAYS.SYSTEM,
    sublabel: "Storage",
    icon: "✅",
  },
};

/** Sub-labels for request messages, derived from the request kind they carry. */
export const REQUEST_SUBLABELS: Record<string, string> = {
  COURSE_ASSIGN: "Course for my path",
  JOIN_BRANCH: "Join a branch",
  DELETE_BRANCH: "Branch deletion",
  VISIBILITY: "Visibility",
  CONTENT_REVIEW: "Document publishing",
};

const FALLBACK: NotificationKindMeta = {
  label: "Notification",
  category: "SYSTEM",
  priority: "NORMAL",
  retentionDays: RETENTION_DAYS.SYSTEM,
  icon: "•",
};

/** O(1) metadata lookup with a safe default for a kind an older client doesn't know. */
export function notificationMeta(kind: string): NotificationKindMeta {
  return NOTIFICATION_KINDS[kind] ?? FALLBACK;
}

/** The finest label a message carries — the request sub-flow when it has one. */
export function notificationSublabel(kind: string, payload: Record<string, unknown>): string | null {
  const requestKind = typeof payload.kind === "string" ? payload.kind : null;
  if (requestKind && REQUEST_SUBLABELS[requestKind]) return REQUEST_SUBLABELS[requestKind];
  return notificationMeta(kind).sublabel ?? null;
}

export const PRIORITY_RANK: Record<NotificationPriority, number> = { HIGH: 0, NORMAL: 1, LOW: 2 };

/** One message as the mailbox sees it. */
export interface MailMessage {
  id: string;
  kind: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  /** Sub-flow label inside the folder ("Document publishing", "Access code", …). */
  sublabel: string | null;
  /** Subject line — stored by the server so a message reads like mail. */
  subject: string;
  /** One-line preview under the subject. */
  preview: string;
  /** Full body text (may be several lines). */
  body: string;
  orgId: string | null;
  /** Organization label, so the mailbox can group by organization like Gmail labels. */
  orgName: string | null;
  payload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
  /** When the sweeper will delete it — the mailbox counts this down. */
  expiresAt: string;
  /** Where clicking it should take the reader (null = nothing to open). */
  link: string | null;
}

export interface MailboxView {
  messages: MailMessage[];
  unread: number;
  /** Unread count per folder, so the rail can render badges without a second pass. */
  unreadByCategory: Record<string, number>;
  /** Organizations that appear in this mailbox — the "labels" section of the rail. */
  orgs: { id: string; name: string; unread: number }[];
  /** Total stored messages (may exceed what this page returned). */
  total: number;
  /** Server-side retention windows, so the UI can explain the countdown. */
  retentionDays: Record<string, number>;
}

/** Human countdown for the expiry column ("6d left", "4h left", "expired"). */
export function expiresInLabel(expiresAt: string, now = Date.now()): string {
  const ms = new Date(expiresAt).getTime() - now;
  if (ms <= 0) return "expiring now";
  const days = Math.floor(ms / 86400_000);
  if (days >= 1) return `${days}d left`;
  const hours = Math.floor(ms / 3600_000);
  if (hours >= 1) return `${hours}h left`;
  return `${Math.max(1, Math.floor(ms / 60_000))}m left`;
}
