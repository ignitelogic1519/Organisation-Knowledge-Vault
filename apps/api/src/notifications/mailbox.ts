import {
  expiresInLabel,
  notificationMeta,
  notificationSublabel,
  NOTIFICATION_CATEGORIES,
  RETENTION_DAYS,
  type MailMessage,
  type MailboxView,
  type NotificationCategory,
  type NotificationPriority,
} from "@vault/shared";
import type { Notification } from "@prisma/client";
import { db } from "../db.js";
import { pushToProfile } from "../events.js";

// The mailbox: one place that writes a message, one place that reads it back. Every
// message is stamped at write time with its folder, its flag, its subject/body and the
// instant it expires — so the read path is a single indexed query with no per-row
// derivation, and the sweeper is one `deleteMany` on an indexed column.

/** Above this many stored messages the user gets one nudge to clear the mailbox. */
const CLUTTER_THRESHOLD = 40;

export interface NotifyOptions {
  /** Subject line; falls back to the catalog label for the kind. */
  subject?: string;
  /** Body text shown in the reading pane. */
  body?: string;
  /** Override the catalog retention for this one message. */
  retentionDays?: number;
  /** Override the catalog priority (e.g. an urgent variant of a normal kind). */
  priority?: NotificationPriority;
}

/** Compose a one-line body from a payload when the caller didn't write one. */
function defaultBody(kind: string, payload: Record<string, unknown>): string {
  const s = (k: string) => (typeof payload[k] === "string" ? (payload[k] as string) : null);
  if (s("message")) return s("message") as string;
  const title = s("title") ?? s("courseTitle") ?? s("code");
  const role = s("roleName");
  if (title && role) return `“${title}” · ${role}`;
  return title ?? role ?? "";
}

/**
 * Write one message into a profile's mailbox and poke that profile's live channel.
 * `orgId` scopes the message to an organization (the mailbox groups by it, Gmail-label
 * style); pass null for platform-wide mail.
 */
export async function deliver(
  profileId: string,
  orgId: string | null,
  kind: string,
  payload: Record<string, unknown>,
  options: NotifyOptions = {},
): Promise<Notification> {
  const meta = notificationMeta(kind);
  const retentionDays = options.retentionDays ?? meta.retentionDays;
  const row = await db.notification.create({
    data: {
      profileId,
      orgId,
      kind,
      category: meta.category,
      priority: options.priority ?? meta.priority,
      subject: (options.subject ?? meta.label).slice(0, 200),
      body: (options.body ?? defaultBody(kind, payload)).slice(0, 2000),
      payload: payload as object,
      expiresAt: new Date(Date.now() + retentionDays * 86400_000),
    },
  });
  pushToProfile(profileId, orgId);
  return row;
}

/** Deliver the same message to several people (deduplicated). */
export async function deliverMany(
  profileIds: Iterable<string>,
  orgId: string | null,
  kind: string,
  payload: Record<string, unknown>,
  options: NotifyOptions = {},
): Promise<number> {
  const targets = [...new Set(profileIds)];
  await Promise.all(targets.map((id) => deliver(id, orgId, kind, payload, options)));
  return targets.length;
}

/** Where a message opens. Requests jump to the exact card; learning to the course list. */
function linkFor(row: { kind: string; orgId: string | null; payload: unknown }): string | null {
  const payload = (row.payload ?? {}) as Record<string, unknown>;
  const meta = notificationMeta(row.kind);
  if (meta.category === "ADMIN" || meta.category === "PLAN") {
    if (row.kind === "coins_gift" || row.kind === "coins_spent") return "/account";
    if (row.kind === "admin_otp") return "/orgs/new";
    return "/pricing";
  }
  if (!row.orgId) return null;
  switch (meta.category) {
    case "REQUESTS":
      return `/orgs/${row.orgId}/requests${
        typeof payload.requestId === "string" ? `?focus=${payload.requestId}` : ""
      }`;
    case "CONTENT":
      return `/orgs/${row.orgId}/library`;
    case "LEARNING":
      return `/orgs/${row.orgId}/learning`;
    case "PEOPLE":
      return `/orgs/${row.orgId}`;
    default:
      return null;
  }
}

function toMessage(row: Notification, orgName: string | null): MailMessage {
  const payload = (row.payload ?? {}) as Record<string, unknown>;
  const meta = notificationMeta(row.kind);
  const expiresAt = row.expiresAt ?? new Date(row.createdAt.getTime() + meta.retentionDays * 86400_000);
  const body = row.body || defaultBody(row.kind, payload);
  return {
    id: row.id,
    kind: row.kind,
    category: (row.category as NotificationCategory) || meta.category,
    priority: (row.priority as NotificationPriority) || meta.priority,
    sublabel: notificationSublabel(row.kind, payload),
    subject: row.subject || meta.label,
    preview: body.length > 140 ? `${body.slice(0, 137)}…` : body,
    body,
    orgId: row.orgId,
    orgName,
    payload,
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    link: linkFor(row),
  };
}

/** Delete everything past its expiry — one indexed sweep, safe to run on any read. */
export async function sweepExpired(profileId?: string): Promise<number> {
  const { count } = await db.notification.deleteMany({
    where: {
      expiresAt: { lt: new Date() },
      ...(profileId ? { profileId } : {}),
    },
  });
  return count;
}

/** The whole mailbox for one profile: messages, folder counts and organization labels. */
export async function mailboxFor(
  profileId: string,
  opts: { limit?: number } = {},
): Promise<MailboxView> {
  await sweepExpired(profileId);

  const take = Math.min(opts.limit ?? 200, 400);
  const rows = await db.notification.findMany({
    where: { profileId },
    orderBy: { createdAt: "desc" },
    take,
  });
  const total = rows.length === take ? await db.notification.count({ where: { profileId } }) : rows.length;

  // One nudge (never more) when the mailbox is genuinely full.
  if (total > CLUTTER_THRESHOLD && !rows.some((r) => r.kind === "inbox_cleanup")) {
    const reminder = await deliver(
      profileId,
      null,
      "inbox_cleanup",
      { count: total },
      {
        subject: "Your mailbox is filling up",
        body: `You are holding ${total} messages. Old mail clears itself automatically, but you can empty a folder any time from the mailbox.`,
      },
    );
    rows.unshift(reminder);
  }

  const orgIds = [...new Set(rows.map((r) => r.orgId).filter((id): id is string => !!id))];
  const orgRows = orgIds.length
    ? await db.organization.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true } })
    : [];
  const orgNames = new Map(orgRows.map((o) => [o.id, o.name]));

  const unreadByCategory: Record<string, number> = Object.fromEntries(
    NOTIFICATION_CATEGORIES.map((c) => [c, 0]),
  );
  const orgUnread = new Map<string, number>();
  let unread = 0;
  const messages = rows.map((row) => {
    const message = toMessage(row, row.orgId ? orgNames.get(row.orgId) ?? null : null);
    if (!message.readAt) {
      unread++;
      unreadByCategory[message.category] = (unreadByCategory[message.category] ?? 0) + 1;
      if (message.orgId) orgUnread.set(message.orgId, (orgUnread.get(message.orgId) ?? 0) + 1);
    }
    return message;
  });

  return {
    messages,
    unread,
    unreadByCategory,
    orgs: orgRows
      .map((o) => ({ id: o.id, name: o.name, unread: orgUnread.get(o.id) ?? 0 }))
      .sort((a, b) => b.unread - a.unread || a.name.localeCompare(b.name)),
    total,
    retentionDays: { ...RETENTION_DAYS },
  };
}

export { expiresInLabel };
