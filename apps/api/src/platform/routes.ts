import type { FastifyInstance } from "fastify";
import { hash, verify as argonVerify } from "@node-rs/argon2";
import {
  addAdminSchema,
  adminBroadcastSchema,
  adminBulkDeleteSchema,
  adminLoginSchema,
  adminSetOrgSchema,
  changeAdminPasswordSchema,
  decidePlatformRequestSchema,
  giftCoinsSchema,
  upgradePlanSchema,
  type AdminOrgDetail,
  type AdminOrgRow,
  type AdminRequestRow,
  type AdminTreeNode,
} from "@vault/shared";
import { db } from "../db.js";
import { orgStorageUsedMb } from "../orgs/plan.js";
import { issueAdminToken } from "./tokens.js";
import { generateOtp, hashOtp } from "./otp.js";
import { notifyFromAdmin } from "./notify.js";
import { getDefaultCoins, setDefaultCoins } from "./settings.js";
import { purgeOrganization } from "../orgs/purge.js";
import { orgOwnerProfileIds, orgOwnerUsernames } from "../orgs/owners.js";

const OTP_TTL_MS = 24 * 3600_000;

async function audit(adminId: string, action: string, detail?: unknown) {
  await db.platformAdminAudit.create({
    data: { adminId, action, detail: (detail as object) ?? undefined },
  });
}

const ownerProfileIds = orgOwnerProfileIds;

/** Tree depth from materialized paths ("100.101.102" → depth 3). */
function treeDepth(paths: string[]): number {
  return paths.reduce((max, p) => Math.max(max, p.split(".").length), 0);
}

/**
 * The admin's organization rows. One place builds them, so the table, the card grid and
 * a single card's detail view can never disagree. `onlyOrgNumber` narrows it to one org.
 */
async function listOrgRows(onlyOrgNumber?: number): Promise<AdminOrgRow[]> {
  const orgs = await db.organization.findMany({
    where: onlyOrgNumber != null ? { orgNumber: onlyOrgNumber } : {},
    orderBy: { orgNumber: "asc" },
  });
  const plans = await db.pricingPlan.findMany({
    select: { key: true, memberLimit: true, documentLimit: true, uploadLimit: true, storageLimitMb: true },
  });
  const planLimits = new Map(plans.map((p) => [p.key, p]));
  const rows: AdminOrgRow[] = [];
  for (const o of orgs) {
    const [roles, memberCount, owners, lastAudit, lastCompletion, lastCourse, lastMembership, documentCount, uploadCount, storageMb] =
      await Promise.all([
        db.roleNode.findMany({ where: { orgId: o.id }, select: { path: true } }),
        db.membership.count({ where: { orgId: o.id } }),
        orgOwnerUsernames(o.id),
        db.auditLog.findFirst({ where: { orgId: o.id }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
        db.completionRecord.findFirst({ where: { orgId: o.id, completedAt: { not: null } }, orderBy: { completedAt: "desc" }, select: { completedAt: true } }),
        db.course.findFirst({ where: { orgId: o.id }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
        db.membership.findFirst({ where: { orgId: o.id }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
        db.course.count({ where: { orgId: o.id, source: "STUDIO" } }),
        db.course.count({ where: { orgId: o.id, source: "UPLOAD" } }),
        orgStorageUsedMb(o.id),
      ]);
    // "Last activity" = the most recent user action we can see (governance, learning,
    // publishing, joining), falling back to when the org was created.
    const lastActivity = [
      o.createdAt,
      lastAudit?.createdAt,
      lastCompletion?.completedAt,
      lastCourse?.createdAt,
      lastMembership?.createdAt,
    ]
      .filter(Boolean)
      .map((d) => (d as Date).getTime())
      .reduce((a, b) => Math.max(a, b), 0);
    rows.push({
      id: o.id,
      name: o.name,
      orgNumber: o.orgNumber,
      ownerUsernames: owners,
      planKey: o.planKey,
      planStatus: o.planStatus,
      planExpiresAt: o.planExpiresAt?.toISOString() ?? null,
      planIsCustom: o.planIsCustom,
      memberCount,
      memberLimit: o.memberLimit ?? (o.planKey ? planLimits.get(o.planKey)?.memberLimit ?? null : null),
      documentCount,
      documentLimit:
        o.documentLimit ?? (o.planKey ? planLimits.get(o.planKey)?.documentLimit ?? null : null),
      uploadCount,
      uploadLimit: o.uploadLimit ?? (o.planKey ? planLimits.get(o.planKey)?.uploadLimit ?? null : null),
      storageUsedMb: storageMb,
      storageLimitMb:
        o.storageLimitMb ?? (o.planKey ? planLimits.get(o.planKey)?.storageLimitMb ?? null : null),
      roleCount: roles.length,
      treeDepth: treeDepth(roles.map((r) => r.path)),
      createdAt: o.createdAt.toISOString(),
      lastActivityAt: lastActivity ? new Date(lastActivity).toISOString() : null,
      deletedAt: o.deletedAt?.toISOString() ?? null,
    });
  }
  return rows;
}

export async function platformRoutes(app: FastifyInstance) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  app.post("/admin/login", async (req, reply) => {
    const body = adminLoginSchema.parse(req.body);
    // Trim as well as lowercase — autofill/mobile keyboards often add a stray space.
    const admin = await db.platformAdmin.findUnique({ where: { username: body.username.trim().toLowerCase() } });
    const ok = admin && admin.active && (await argonVerify(admin.passwordHash, body.password).catch(() => false));
    if (!admin || !ok) return reply.status(401).send({ error: "Wrong admin username or password" });
    await db.platformAdmin.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } });
    const { token } = await issueAdminToken(admin);
    return {
      token,
      admin: {
        id: admin.id,
        username: admin.username,
        displayName: admin.displayName,
        mustChangePassword: admin.mustChangePassword,
      },
    };
  });

  app.get("/admin/me", { preHandler: app.authenticateAdmin }, async (req) => {
    const admin = await db.platformAdmin.findUniqueOrThrow({ where: { id: req.adminId } });
    return {
      admin: {
        id: admin.id,
        username: admin.username,
        displayName: admin.displayName,
        mustChangePassword: admin.mustChangePassword,
      },
    };
  });

  app.post("/admin/change-password", { preHandler: app.authenticateAdmin }, async (req, reply) => {
    const body = changeAdminPasswordSchema.parse(req.body);
    const admin = await db.platformAdmin.findUniqueOrThrow({ where: { id: req.adminId } });
    const ok = await argonVerify(admin.passwordHash, body.currentPassword).catch(() => false);
    if (!ok) return reply.status(401).send({ error: "Current password is incorrect" });
    await db.platformAdmin.update({
      where: { id: admin.id },
      data: { passwordHash: await hash(body.newPassword), mustChangePassword: false },
    });
    await audit(admin.id, "change_password");
    return { ok: true };
  });

  // ── Organizations (god view) ────────────────────────────────────────────────
  app.get("/admin/orgs", { preHandler: app.authenticateAdmin }, async (): Promise<{ orgs: AdminOrgRow[] }> => {
    return { orgs: await listOrgRows() };
  });

  app.get<{ Params: { orgNumber: string } }>(
    "/admin/orgs/:orgNumber/tree",
    { preHandler: app.authenticateAdmin },
    async (req, reply): Promise<{ name: string; nodes: AdminTreeNode[] }> => {
      const org = await db.organization.findUnique({ where: { orgNumber: Number(req.params.orgNumber) } });
      if (!org) return reply.status(404).send({ error: "No such organization" }) as never;
      const nodes = await db.roleNode.findMany({
        where: { orgId: org.id },
        orderBy: { roleNumber: "asc" },
        include: { placements: { select: { kind: true } } },
      });
      return {
        name: org.name,
        nodes: nodes.map((n) => ({
          id: n.id,
          name: n.name,
          roleNumber: n.roleNumber,
          depth: n.path.split(".").length,
          parentId: n.parentId,
          isPublic: n.isPublic,
          ownerCount: n.placements.filter((p) => p.kind === "OWNER").length,
          memberCount: n.placements.filter((p) => p.kind === "MEMBER").length,
        })),
      };
    },
  );

  // ── Requests inbox (approve / deny → OTP + notification) ─────────────────────
  // Every row carries the requested plan's own terms, so approving is one click: the
  // admin never re-enters a structure the plan already describes.
  app.get("/admin/requests", { preHandler: app.authenticateAdmin }, async (req): Promise<{ requests: AdminRequestRow[] }> => {
    const status = (req.query as { status?: string })?.status;
    const reqs = await db.platformRequest.findMany({
      where: status ? { status: status as never } : {},
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 200,
      include: { requester: { select: { username: true, displayName: true, coins: true } } },
    });
    const planKeys = [...new Set(reqs.map((r) => r.planKey).filter((k): k is string => !!k))];
    const plans = planKeys.length
      ? await db.pricingPlan.findMany({ where: { key: { in: planKeys } } })
      : [];
    const planByKey = new Map(plans.map((p) => [p.key, p]));
    return {
      requests: reqs.map((r) => {
        const plan = r.planKey ? planByKey.get(r.planKey) ?? null : null;
        return {
          id: r.id,
          kind: r.kind,
          status: r.status,
          requesterUsername: r.requester.username,
          requesterDisplayName: r.requester.displayName,
          requesterCoins: r.requester.coins,
          planKey: r.planKey,
          planName: plan?.name ?? null,
          planDurationDays: plan?.durationDays ?? null,
          planPriceCoins: plan?.priceCoins ?? null,
          planMemberLimit: plan?.memberLimit ?? null,
          planDocumentLimit: plan?.documentLimit ?? null,
          planUploadLimit: plan?.uploadLimit ?? null,
          requestedDays: r.requestedDays,
          offeredCoins: r.offeredCoins,
          requestedMembers: r.requestedMembers,
          requestedDocuments: r.requestedDocuments,
          requestedUploads: r.requestedUploads,
          message: r.message,
          grantedDays: r.grantedDays,
          grantedMembers: r.grantedMembers,
          grantedDocuments: r.grantedDocuments,
          grantedUploads: r.grantedUploads,
          priceCoins: r.priceCoins,
          adminMessage: r.adminMessage,
          targetOrgNumber: r.targetOrgNumber,
          createdAt: r.createdAt.toISOString(),
          decidedAt: r.decidedAt?.toISOString() ?? null,
        };
      }),
    };
  });

  app.post<{ Params: { id: string } }>(
    "/admin/requests/:id/decide",
    { preHandler: app.authenticateAdmin },
    async (req, reply) => {
      const body = decidePlatformRequestSchema.parse(req.body);
      const request = await db.platformRequest.findUnique({ where: { id: req.params.id } });
      if (!request) return reply.status(404).send({ error: "No such request" });
      if (request.status !== "PENDING") return reply.status(409).send({ error: "This request was already decided" });

      if (body.decision === "DENY") {
        await db.platformRequest.update({
          where: { id: request.id },
          data: { status: "DENIED", adminMessage: body.adminMessage ?? null, decidedById: req.adminId, decidedAt: new Date() },
        });
        await notifyFromAdmin(request.requesterId, "admin_denied", {
          title: "Your request was declined",
          message: body.adminMessage || "The Knowledge Base team declined this request.",
          requestKind: request.kind,
        });
        await audit(req.adminId, "deny_request", { requestId: request.id });
        return { ok: true, status: "DENIED" };
      }

      // APPROVE → mint an OTP and record the terms. Everything defaults to the plan the
      // user chose (or to what they proposed on a custom plan) — the admin only supplies
      // a value when they mean to override it.
      const plan = request.planKey
        ? await db.pricingPlan.findUnique({ where: { key: request.planKey } })
        : null;
      const otp = generateOtp();
      const grantedDays =
        body.grantedDays !== undefined
          ? body.grantedDays
          : (request.requestedDays ?? plan?.durationDays ?? null);
      const priceCoins =
        body.priceCoins ?? request.offeredCoins ?? plan?.priceCoins ?? 0;
      const grantedMembers =
        body.grantedMembers !== undefined
          ? body.grantedMembers
          : (request.requestedMembers ?? plan?.memberLimit ?? null);
      const grantedDocuments =
        body.grantedDocuments !== undefined
          ? body.grantedDocuments
          : (request.requestedDocuments ?? plan?.documentLimit ?? null);
      const grantedUploads =
        body.grantedUploads !== undefined
          ? body.grantedUploads
          : (request.requestedUploads ?? plan?.uploadLimit ?? null);
      const expiresAt = new Date(Date.now() + OTP_TTL_MS);
      await db.platformRequest.update({
        where: { id: request.id },
        data: {
          status: "APPROVED",
          grantedDays,
          grantedMembers,
          grantedDocuments,
          grantedUploads,
          priceCoins,
          otpHash: hashOtp(otp),
          otpExpiresAt: expiresAt,
          adminMessage: body.adminMessage ?? null,
          decidedById: req.adminId,
          decidedAt: new Date(),
        },
      });

      // An upgrade is applied immediately — there is no organization to create, so the
      // code would have nothing to unlock. The owners simply find the new plan in place.
      let appliedOrgNumber: number | null = null;
      if (request.kind === "UPGRADE_PLAN" && request.targetOrgNumber != null && plan) {
        const org = await db.organization.findUnique({
          where: { orgNumber: request.targetOrgNumber },
        });
        if (org) {
          const days = grantedDays ?? plan.durationDays ?? null;
          const planExpiresAt = days ? new Date(Date.now() + days * 86400_000) : null;
          await db.organization.update({
            where: { id: org.id },
            data: {
              planKey: plan.key,
              planStatus: "ACTIVE",
              planActivatedAt: new Date(),
              planExpiresAt,
              planIsCustom: body.grantedDays != null,
              planGrantedById: req.adminId,
              memberLimit: grantedMembers,
              documentLimit: grantedDocuments,
              uploadLimit: grantedUploads,
            },
          });
          await db.platformRequest.update({
            where: { id: request.id },
            data: { status: "USED", usedAt: new Date() },
          });
          appliedOrgNumber = org.orgNumber;
          for (const pid of await ownerProfileIds(org.id)) {
            await notifyFromAdmin(pid, "plan_upgraded", {
              title: `${org.name} is now on the ${plan.name} plan`,
              message:
                `The upgrade you asked for has been applied.` +
                (planExpiresAt ? ` It runs until ${planExpiresAt.toISOString().slice(0, 10)}.` : " It has no expiry.") +
                (body.adminMessage ? ` ${body.adminMessage}` : ""),
              orgNumber: org.orgNumber,
              planKey: plan.key,
              expiresAt: planExpiresAt?.toISOString() ?? null,
            });
          }
        }
      }

      if (!appliedOrgNumber) {
        await notifyFromAdmin(request.requesterId, "admin_otp", {
          title: "Your access code is ready",
          message:
            (body.adminMessage ||
              "Your request was approved. Use the code below within 24 hours to continue.") +
            (grantedDays ? ` Plan length: ${grantedDays} days.` : "") +
            (priceCoins ? ` Cost: ${priceCoins} coins.` : ""),
          otp,
          expiresAt: expiresAt.toISOString(),
          priceCoins,
          grantedDays,
          requestKind: request.kind,
          planKey: request.planKey,
        });
      }
      await audit(req.adminId, "grant_otp", { requestId: request.id, grantedDays, priceCoins });
      // The OTP is returned to the admin ONCE so they can also relay it out of band.
      return {
        ok: true,
        status: appliedOrgNumber ? "USED" : "APPROVED",
        otp: appliedOrgNumber ? null : otp,
        appliedOrgNumber,
        expiresAt: expiresAt.toISOString(),
      };
    },
  );

  // ── Coins (gift / adjust) ────────────────────────────────────────────────────
  app.post("/admin/coins/gift", { preHandler: app.authenticateAdmin }, async (req, reply) => {
    const body = giftCoinsSchema.parse(req.body);
    const profile = await db.profile.findUnique({ where: { username: body.username.toLowerCase() } });
    if (!profile) return reply.status(404).send({ error: "No user with that username" });
    const newBalance = profile.coins + body.delta;
    if (newBalance < 0) return reply.status(400).send({ error: "That would take the balance below zero" });
    await db.$transaction([
      db.profile.update({ where: { id: profile.id }, data: { coins: newBalance } }),
      db.coinTransaction.create({
        data: {
          profileId: profile.id,
          delta: body.delta,
          balance: newBalance,
          reason: body.delta > 0 ? "ADMIN_GIFT" : "ADMIN_DEDUCT",
          note: body.note ?? null,
          byAdminId: req.adminId,
        },
      }),
    ]);
    // The user is told every time their balance moves — this is the receipt, and it
    // reaches their mailbox live wherever they happen to be.
    await notifyFromAdmin(profile.id, "coins_gift", {
      title:
        body.delta > 0
          ? `You received ${body.delta} Knowledge Coins`
          : `${Math.abs(body.delta)} Knowledge Coins were deducted`,
      message:
        (body.delta > 0
          ? `The Knowledge Base team added ${body.delta} coins to your wallet.`
          : `The Knowledge Base team deducted ${Math.abs(body.delta)} coins from your wallet.`) +
        ` Your balance is now ${newBalance} coins.` +
        (body.note ? ` Note: ${body.note}` : ""),
      delta: body.delta,
      balance: newBalance,
    });
    await audit(req.adminId, "gift_coins", { username: profile.username, delta: body.delta });
    return { ok: true, balance: newBalance };
  });

  // ── Plan upgrade (set an org's plan/expiry directly) ─────────────────────────
  app.post("/admin/plans/upgrade", { preHandler: app.authenticateAdmin }, async (req, reply) => {
    const body = upgradePlanSchema.parse(req.body);
    const org = await db.organization.findUnique({ where: { orgNumber: body.orgNumber } });
    if (!org) return reply.status(404).send({ error: "No such organization" });
    const plan = await db.pricingPlan.findUnique({ where: { key: body.planKey } });
    if (!plan) return reply.status(404).send({ error: "No such plan" });
    const days = body.durationDays === undefined ? plan.durationDays : body.durationDays;
    const expiresAt = days ? new Date(Date.now() + days * 86400_000) : null;
    await db.organization.update({
      where: { id: org.id },
      data: {
        planKey: plan.key,
        planStatus: "ACTIVE",
        planActivatedAt: new Date(),
        planExpiresAt: expiresAt,
        planIsCustom: body.durationDays != null,
        planGrantedById: req.adminId,
        // undefined = leave as-is; null = fall back to the plan's own allowance
        memberLimit: body.memberLimit,
        documentLimit: body.documentLimit,
        uploadLimit: body.uploadLimit,
        storageLimitMb: body.storageLimitMb,
      },
    });
    for (const pid of await ownerProfileIds(org.id)) {
      await notifyFromAdmin(pid, "plan_upgraded", {
        title: "Your organization plan was updated",
        message:
          `${org.name} is now on the ${plan.name} plan` +
          (expiresAt ? `, valid until ${expiresAt.toISOString().slice(0, 10)}.` : " (no expiry).") +
          (body.message ? ` ${body.message}` : ""),
        orgNumber: org.orgNumber,
        planKey: plan.key,
        expiresAt: expiresAt?.toISOString() ?? null,
      });
    }
    await audit(req.adminId, "upgrade_plan", { orgNumber: org.orgNumber, planKey: plan.key, days });
    return { ok: true, planKey: plan.key, expiresAt: expiresAt?.toISOString() ?? null };
  });

  // ── One organization, expanded: the property/value table behind its card ──────
  app.get<{ Params: { orgNumber: string } }>(
    "/admin/orgs/:orgNumber/detail",
    { preHandler: app.authenticateAdmin },
    async (req, reply): Promise<AdminOrgDetail> => {
      const orgNumber = Number(req.params.orgNumber);
      const org = await db.organization.findUnique({ where: { orgNumber } });
      if (!org) return reply.status(404).send({ error: "No such organization" }) as never;
      const all = await listOrgRows(orgNumber);
      const row = all[0];
      if (!row) return reply.status(404).send({ error: "No such organization" }) as never;

      const plans = await db.pricingPlan.findMany({ orderBy: { sortOrder: "asc" }, select: { key: true } });
      const root = await db.roleNode.findFirst({ where: { orgId: org.id, parentId: null }, select: { id: true } });
      const ownerRows = root
        ? await db.placement.findMany({
            where: { roleNodeId: root.id, kind: "OWNER" },
            select: { membership: { select: { profile: { select: { username: true, displayName: true, coins: true } } } } },
          })
        : [];
      const audits = await db.auditLog.findMany({
        where: { orgId: org.id },
        orderBy: { createdAt: "desc" },
        take: 8,
        select: { action: true, createdAt: true },
      });

      // Every metered property is editable here — this is the admin's manual control,
      // independent of whatever the plan says.
      const properties: AdminOrgDetail["properties"] = [
        { key: "name", label: "Name", value: org.name, type: "text" },
        { key: "orgNumber", label: "Organization number", value: org.orgNumber, type: "readonly" },
        { key: "planKey", label: "Plan", value: org.planKey, type: "select", options: plans.map((p) => p.key) },
        {
          key: "planStatus",
          label: "Plan status",
          value: org.planStatus,
          type: "select",
          options: ["NONE", "DEMO", "ACTIVE", "EXPIRED"],
        },
        {
          key: "planExpiresAt",
          label: "Expires on",
          value: org.planExpiresAt?.toISOString().slice(0, 10) ?? null,
          type: "date",
          hint: "Blank = no expiry",
        },
        { key: "memberLimit", label: "People limit", value: org.memberLimit, type: "number", hint: "Blank = the plan's limit" },
        { key: "documentLimit", label: "Custom-document limit", value: org.documentLimit, type: "number", hint: "Blank = the plan's limit (unlimited on paid plans)" },
        { key: "uploadLimit", label: "Upload limit", value: org.uploadLimit, type: "number", hint: "Blank = the plan's limit (unlimited on paid plans)" },
        { key: "storageLimitMb", label: "Storage limit (MB)", value: org.storageLimitMb, type: "number", hint: "Blank = the plan's limit" },
        { key: "memberCount", label: "People", value: row.memberCount, type: "readonly" },
        { key: "documentCount", label: "Custom documents", value: row.documentCount, type: "readonly" },
        { key: "uploadCount", label: "Uploads", value: row.uploadCount, type: "readonly" },
        { key: "storageUsedMb", label: "Storage used (MB)", value: row.storageUsedMb, type: "readonly" },
        { key: "roleCount", label: "Roles", value: row.roleCount, type: "readonly" },
        { key: "treeDepth", label: "Tree depth", value: row.treeDepth, type: "readonly" },
        { key: "createdAt", label: "Created", value: row.createdAt.slice(0, 10), type: "readonly" },
      ];

      return {
        org: row,
        properties,
        owners: ownerRows.map((o) => ({
          username: o.membership.profile.username,
          displayName: o.membership.profile.displayName,
          coins: o.membership.profile.coins,
        })),
        recentActivity: audits.map((a) => ({ action: a.action, at: a.createdAt.toISOString() })),
      };
    },
  );

  // Set any property by hand — the admin's override for every count and date.
  app.patch("/admin/orgs", { preHandler: app.authenticateAdmin }, async (req, reply) => {
    const body = adminSetOrgSchema.parse(req.body);
    const org = await db.organization.findUnique({ where: { orgNumber: body.orgNumber } });
    if (!org) return reply.status(404).send({ error: "No such organization" });
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.planKey !== undefined) data.planKey = body.planKey;
    if (body.planStatus !== undefined) data.planStatus = body.planStatus;
    if (body.planExpiresAt !== undefined) {
      data.planExpiresAt = body.planExpiresAt ? new Date(body.planExpiresAt) : null;
    }
    for (const k of ["memberLimit", "documentLimit", "uploadLimit", "storageLimitMb"] as const) {
      if (body[k] !== undefined) data[k] = body[k];
    }
    const updated = await db.organization.update({ where: { id: org.id }, data });
    await audit(req.adminId, "set_org_properties", { orgNumber: org.orgNumber, changed: Object.keys(data) });
    return { ok: true, orgNumber: updated.orgNumber };
  });

  // Message the owners of one or many organizations — announcements and offers.
  app.post("/admin/orgs/message", { preHandler: app.authenticateAdmin }, async (req) => {
    const body = adminBroadcastSchema.parse(req.body);
    const orgs = await db.organization.findMany({
      where: { orgNumber: { in: body.orgNumbers } },
      select: { id: true, name: true, orgNumber: true },
    });
    let delivered = 0;
    for (const org of orgs) {
      for (const pid of await ownerProfileIds(org.id)) {
        await notifyFromAdmin(
          pid,
          "admin_message",
          {
            title: body.subject,
            message: body.message,
            orgNumber: org.orgNumber,
            orgName: org.name,
          },
          { priority: body.priority },
        );
        delivered++;
      }
    }
    await audit(req.adminId, "broadcast_message", {
      orgNumbers: body.orgNumbers,
      subject: body.subject,
      delivered,
    });
    return { ok: true, organizations: orgs.length, delivered };
  });

  // Delete a selection of organizations from the card grid, permanently.
  app.post("/admin/orgs/bulk-delete", { preHandler: app.authenticateAdmin }, async (req) => {
    const body = adminBulkDeleteSchema.parse(req.body);
    const orgs = await db.organization.findMany({
      where: { orgNumber: { in: body.orgNumbers } },
      select: { id: true, name: true, orgNumber: true },
    });
    for (const org of orgs) await purgeOrganization(org.id);
    await audit(req.adminId, "bulk_purge_orgs", { orgNumbers: orgs.map((o) => o.orgNumber) });
    return { ok: true, deleted: orgs.length };
  });

  // ── Pricing plan management (so cards can be edited without raw SQL) ──────────
  app.get("/admin/plans", { preHandler: app.authenticateAdmin }, async () => {
    const plans = await db.pricingPlan.findMany({ orderBy: [{ category: "asc" }, { sortOrder: "asc" }] });
    return { plans };
  });

  app.post("/admin/plans", { preHandler: app.authenticateAdmin }, async (req) => {
    const b = req.body as Record<string, unknown>;
    const plan = await db.pricingPlan.create({
      data: {
        key: String(b.key),
        name: String(b.name),
        tagline: (b.tagline as string) ?? null,
        category: (b.category as string) ?? "Plans",
        priceCoins: Number(b.priceCoins ?? 0),
        durationDays: b.durationDays != null ? Number(b.durationDays) : null,
        memberLimit: b.memberLimit != null ? Number(b.memberLimit) : null,
        documentLimit: b.documentLimit != null ? Number(b.documentLimit) : null,
        uploadLimit: b.uploadLimit != null ? Number(b.uploadLimit) : null,
        allowDrafts: b.allowDrafts === undefined ? true : Boolean(b.allowDrafts),
        isCustom: Boolean(b.isCustom),
        imageUrl: (b.imageUrl as string) ?? null,
        criteria: (b.criteria as string) ?? null,
        badge: (b.badge as string) ?? null,
        highlights: (b.highlights as string[]) ?? [],
        active: b.active === undefined ? true : Boolean(b.active),
        sortOrder: Number(b.sortOrder ?? 100),
        validFrom: b.validFrom ? new Date(String(b.validFrom)) : null,
        validUntil: b.validUntil ? new Date(String(b.validUntil)) : null,
      },
    });
    await audit(req.adminId, "create_plan", { key: plan.key });
    return { ok: true, plan };
  });

  app.patch<{ Params: { id: string } }>(
    "/admin/plans/:id",
    { preHandler: app.authenticateAdmin },
    async (req) => {
      const b = req.body as Record<string, unknown>;
      const data: Record<string, unknown> = {};
      for (const k of ["name", "tagline", "category", "priceCoins", "durationDays", "memberLimit", "documentLimit", "uploadLimit", "allowDrafts", "isCustom", "imageUrl", "criteria", "badge", "highlights", "active", "sortOrder"]) {
        if (b[k] !== undefined) data[k] = b[k];
      }
      if (b.validFrom !== undefined) data.validFrom = b.validFrom ? new Date(String(b.validFrom)) : null;
      if (b.validUntil !== undefined) data.validUntil = b.validUntil ? new Date(String(b.validUntil)) : null;
      const plan = await db.pricingPlan.update({ where: { id: req.params.id }, data });
      await audit(req.adminId, "update_plan", { key: plan.key });
      return { ok: true, plan };
    },
  );

  // ── Platform settings (default coins for new users) ──────────────────────────
  app.get("/admin/settings", { preHandler: app.authenticateAdmin }, async () => {
    return { defaultCoins: await getDefaultCoins() };
  });

  app.put("/admin/settings", { preHandler: app.authenticateAdmin }, async (req, reply) => {
    const value = Number((req.body as { defaultCoins?: unknown })?.defaultCoins);
    if (!Number.isFinite(value) || value < 0 || value > 1_000_000) {
      return reply.status(400).send({ error: "Enter a coin amount between 0 and 1,000,000" });
    }
    await setDefaultCoins(value);
    await audit(req.adminId, "set_default_coins", { value: Math.floor(value) });
    return { ok: true, defaultCoins: Math.floor(value) };
  });

  // ── Permanent, immediate deletion (bypasses the 30-day retention) ────────────
  // The org is purged now; a user can only bring it back from its .main file.
  app.post<{ Params: { orgNumber: string } }>(
    "/admin/orgs/:orgNumber/purge",
    { preHandler: app.authenticateAdmin },
    async (req, reply) => {
      const org = await db.organization.findUnique({ where: { orgNumber: Number(req.params.orgNumber) } });
      if (!org) return reply.status(404).send({ error: "No such organization" });
      await purgeOrganization(org.id);
      await audit(req.adminId, "purge_org", { orgNumber: org.orgNumber, name: org.name });
      return { ok: true };
    },
  );

  // ── Admin management ─────────────────────────────────────────────────────────
  app.get("/admin/admins", { preHandler: app.authenticateAdmin }, async () => {
    const admins = await db.platformAdmin.findMany({ orderBy: { createdAt: "asc" } });
    return {
      admins: admins.map((a) => ({
        id: a.id,
        username: a.username,
        displayName: a.displayName,
        active: a.active,
        createdAt: a.createdAt.toISOString(),
        lastLoginAt: a.lastLoginAt?.toISOString() ?? null,
      })),
    };
  });

  app.post("/admin/admins", { preHandler: app.authenticateAdmin }, async (req, reply) => {
    const body = addAdminSchema.parse(req.body);
    const existing = await db.platformAdmin.findUnique({ where: { username: body.username.toLowerCase() } });
    if (existing) return reply.status(409).send({ error: "An admin with that username already exists" });
    const admin = await db.platformAdmin.create({
      data: {
        username: body.username.toLowerCase(),
        passwordHash: await hash(body.password),
        displayName: body.displayName,
        mustChangePassword: true,
        createdById: req.adminId,
      },
    });
    await audit(req.adminId, "add_admin", { username: admin.username });
    return { ok: true, id: admin.id };
  });

  app.post<{ Params: { id: string } }>(
    "/admin/admins/:id/toggle",
    { preHandler: app.authenticateAdmin },
    async (req, reply) => {
      if (req.params.id === req.adminId) return reply.status(400).send({ error: "You can't deactivate yourself" });
      const target = await db.platformAdmin.findUnique({ where: { id: req.params.id } });
      if (!target) return reply.status(404).send({ error: "No such admin" });
      const updated = await db.platformAdmin.update({ where: { id: target.id }, data: { active: !target.active } });
      await audit(req.adminId, "toggle_admin", { username: updated.username, active: updated.active });
      return { ok: true, active: updated.active };
    },
  );
}
