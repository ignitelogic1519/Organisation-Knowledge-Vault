import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { MailboxView } from "@vault/shared";
import { db } from "../db.js";
import { mailboxFor } from "./mailbox.js";

// The mailbox API. One read returns everything the client needs to render folders,
// organization labels, unread badges and expiry countdowns — no N+1 follow-up calls.

const idsSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(400) });
const scopeSchema = z.object({
  category: z.string().max(30).optional(),
  orgId: z.string().uuid().optional(),
  /** Only messages already read — "empty the read mail" without losing new arrivals. */
  readOnly: z.boolean().optional(),
});

export async function notificationRoutes(app: FastifyInstance) {
  // The whole mailbox for the signed-in profile.
  app.get("/notifications", { preHandler: app.authenticate }, async (req): Promise<MailboxView> => {
    return mailboxFor(req.profileId);
  });

  /** Legacy shape the older bell used — kept so a stale tab keeps working. */
  app.get("/notifications/legacy", { preHandler: app.authenticate }, async (req) => {
    const box = await mailboxFor(req.profileId, { limit: 50 });
    return {
      notifications: box.messages.map((m) => ({
        id: m.id,
        kind: m.kind,
        orgId: m.orgId,
        payload: m.payload,
        readAt: m.readAt,
        createdAt: m.createdAt,
      })),
      unread: box.unread,
    };
  });

  // Mark everything (or one folder / one organization) read.
  app.post("/notifications/read", { preHandler: app.authenticate }, async (req) => {
    const scope = scopeSchema.parse(req.body ?? {});
    const { count } = await db.notification.updateMany({
      where: {
        profileId: req.profileId,
        readAt: null,
        ...(scope.category ? { category: scope.category } : {}),
        ...(scope.orgId ? { orgId: scope.orgId } : {}),
      },
      data: { readAt: new Date() },
    });
    return { ok: true, marked: count };
  });

  // Mark specific messages read / unread — the Gmail row toggle.
  app.post("/notifications/mark", { preHandler: app.authenticate }, async (req) => {
    const body = idsSchema.extend({ read: z.boolean() }).parse(req.body);
    const { count } = await db.notification.updateMany({
      where: { profileId: req.profileId, id: { in: body.ids } },
      data: { readAt: body.read ? new Date() : null },
    });
    return { ok: true, updated: count };
  });

  // Delete one message.
  app.delete<{ Params: { id: string } }>(
    "/notifications/:id",
    { preHandler: app.authenticate },
    async (req) => {
      await db.notification.deleteMany({ where: { id: req.params.id, profileId: req.profileId } });
      return { ok: true };
    },
  );

  // Delete a selection — one round trip for a multi-select.
  app.post("/notifications/delete", { preHandler: app.authenticate }, async (req) => {
    const body = idsSchema.parse(req.body);
    const { count } = await db.notification.deleteMany({
      where: { profileId: req.profileId, id: { in: body.ids } },
    });
    return { ok: true, deleted: count };
  });

  // Empty the mailbox, or just one folder / organization / the already-read mail.
  app.post("/notifications/clear", { preHandler: app.authenticate }, async (req) => {
    const scope = scopeSchema.parse(req.body ?? {});
    const { count } = await db.notification.deleteMany({
      where: {
        profileId: req.profileId,
        ...(scope.category ? { category: scope.category } : {}),
        ...(scope.orgId ? { orgId: scope.orgId } : {}),
        ...(scope.readOnly ? { readAt: { not: null } } : {}),
      },
    });
    return { ok: true, deleted: count };
  });
}
