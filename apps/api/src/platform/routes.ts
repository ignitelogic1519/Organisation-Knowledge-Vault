import type { FastifyInstance } from "fastify";
import { hash, verify as argonVerify } from "@node-rs/argon2";
import {
  adminLoginSchema,
  changeAdminPasswordSchema,
  decidePlatformRequestSchema,
  giftCoinsSchema,
  upgradePlanSchema,
  addAdminSchema,
  type AdminOrgRow,
  type AdminRequestRow,
  type AdminTreeNode,
} from "@vault/shared";
import { db } from "../db.js";
import { issueAdminToken } from "./tokens.js";
import { generateOtp, hashOtp } from "./otp.js";
import { notifyFromAdmin } from "./notify.js";
import { getDefaultCoins, setDefaultCoins } from "./settings.js";
import { purgeOrganization } from "../orgs/purge.js";

const OTP_TTL_MS = 24 * 3600_000;

async function audit(adminId: string, action: string, detail?: unknown) {
  await db.platformAdminAudit.create({
    data: { adminId, action, detail: (detail as object) ?? undefined },
  });
}

/** Owner usernames of an org = OWNER placements on the root role. */
async function ownerUsernames(orgId: string): Promise<string[]> {
  const root = await db.roleNode.findFirst({ where: { orgId, parentId: null }, select: { id: true } });
  if (!root) return [];
  const owners = await db.placement.findMany({
    where: { roleNodeId: root.id, kind: "OWNER" },
    select: { membership: { select: { profile: { select: { username: true } } } } },
  });
  return owners.map((o) => o.membership.profile.username);
}

/** Profile ids of an org's root-role owners — the people we notify about plan changes. */
async function ownerProfileIds(orgId: string): Promise<string[]> {
  const root = await db.roleNode.findFirst({ where: { orgId, parentId: null }, select: { id: true } });
  if (!root) return [];
  const owners = await db.placement.findMany({
    where: { roleNodeId: root.id, kind: "OWNER" },
    select: { membership: { select: { profileId: true } } },
  });
  return [...new Set(owners.map((o) => o.membership.profileId))];
}

/** Tree depth from materialized paths ("100.101.102" → depth 3). */
function treeDepth(paths: string[]): number {
  return paths.reduce((max, p) => Math.max(max, p.split(".").length), 0);
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
    const orgs = await db.organization.findMany({ orderBy: { orgNumber: "asc" } });
    const rows: AdminOrgRow[] = [];
    for (const o of orgs) {
      const [roles, memberCount, owners] = await Promise.all([
        db.roleNode.findMany({ where: { orgId: o.id }, select: { path: true } }),
        db.membership.count({ where: { orgId: o.id } }),
        ownerUsernames(o.id),
      ]);
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
        roleCount: roles.length,
        treeDepth: treeDepth(roles.map((r) => r.path)),
        createdAt: o.createdAt.toISOString(),
        deletedAt: o.deletedAt?.toISOString() ?? null,
      });
    }
    return { orgs: rows };
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
  app.get("/admin/requests", { preHandler: app.authenticateAdmin }, async (req): Promise<{ requests: AdminRequestRow[] }> => {
    const status = (req.query as { status?: string })?.status;
    const reqs = await db.platformRequest.findMany({
      where: status ? { status: status as never } : {},
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 200,
      include: { requester: { select: { username: true, displayName: true, coins: true } } },
    });
    return {
      requests: reqs.map((r) => ({
        id: r.id,
        kind: r.kind,
        status: r.status,
        requesterUsername: r.requester.username,
        requesterDisplayName: r.requester.displayName,
        requesterCoins: r.requester.coins,
        planKey: r.planKey,
        requestedDays: r.requestedDays,
        offeredCoins: r.offeredCoins,
        message: r.message,
        grantedDays: r.grantedDays,
        priceCoins: r.priceCoins,
        adminMessage: r.adminMessage,
        targetOrgNumber: r.targetOrgNumber,
        createdAt: r.createdAt.toISOString(),
        decidedAt: r.decidedAt?.toISOString() ?? null,
      })),
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
          message: body.adminMessage || "The super-admin declined this request.",
          requestKind: request.kind,
        });
        await audit(req.adminId, "deny_request", { requestId: request.id });
        return { ok: true, status: "DENIED" };
      }

      // APPROVE → mint an OTP, record terms, notify the user.
      const otp = generateOtp();
      const grantedDays = body.grantedDays ?? request.requestedDays ?? null;
      const expiresAt = new Date(Date.now() + OTP_TTL_MS);
      await db.platformRequest.update({
        where: { id: request.id },
        data: {
          status: "APPROVED",
          grantedDays,
          priceCoins: body.priceCoins ?? request.offeredCoins ?? 0,
          otpHash: hashOtp(otp),
          otpExpiresAt: expiresAt,
          adminMessage: body.adminMessage ?? null,
          decidedById: req.adminId,
          decidedAt: new Date(),
        },
      });
      await notifyFromAdmin(request.requesterId, "admin_otp", {
        title: "Your access code is ready",
        message:
          body.adminMessage ||
          "Your request was approved. Use the code below within 24 hours to continue.",
        otp,
        expiresAt: expiresAt.toISOString(),
        priceCoins: body.priceCoins ?? request.offeredCoins ?? 0,
        grantedDays,
        requestKind: request.kind,
        planKey: request.planKey,
      });
      await audit(req.adminId, "grant_otp", { requestId: request.id, grantedDays });
      // The OTP is returned to the admin ONCE so they can also relay it out of band.
      return { ok: true, status: "APPROVED", otp, expiresAt: expiresAt.toISOString() };
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
    await notifyFromAdmin(profile.id, "coins_gift", {
      title: body.delta > 0 ? "You received Knowledge Coins" : "Your Knowledge Coins were adjusted",
      message:
        (body.delta > 0 ? `+${body.delta}` : `${body.delta}`) +
        ` coins. New balance: ${newBalance}.` +
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
      for (const k of ["name", "tagline", "category", "priceCoins", "durationDays", "isCustom", "imageUrl", "criteria", "badge", "highlights", "active", "sortOrder"]) {
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
