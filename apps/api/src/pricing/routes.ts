import type { FastifyInstance } from "fastify";
import {
  createPlatformRequestSchema,
  type PricingPlanView,
  type PricingView,
  type PlatformRequestView,
  type UpgradableOrgView,
} from "@vault/shared";
import { db } from "../db.js";
import { effectivePlanStatus } from "../orgs/plan.js";

// User-facing pricing & the request channel to the super-admin. Knowledge Coins are only
// ever exposed here (the /wallet endpoint), per product decision.

function toPlanView(p: {
  key: string;
  name: string;
  tagline: string | null;
  category: string;
  priceCoins: number;
  durationDays: number | null;
  memberLimit: number | null;
  documentLimit: number | null;
  uploadLimit: number | null;
  storageLimitMb: number | null;
  tier: number;
  allowDrafts: boolean;
  isCustom: boolean;
  imageUrl: string | null;
  criteria: string | null;
  badge: string | null;
  highlights: unknown;
}): PricingPlanView {
  return {
    key: p.key,
    name: p.name,
    tagline: p.tagline,
    category: p.category,
    priceCoins: p.priceCoins,
    durationDays: p.durationDays,
    memberLimit: p.memberLimit,
    documentLimit: p.documentLimit,
    uploadLimit: p.uploadLimit,
    storageLimitMb: p.storageLimitMb,
    tier: p.tier,
    allowDrafts: p.allowDrafts,
    isCustom: p.isCustom,
    imageUrl: p.imageUrl,
    criteria: p.criteria,
    badge: p.badge,
    highlights: Array.isArray(p.highlights) ? (p.highlights as string[]) : [],
  };
}

export async function pricingRoutes(app: FastifyInstance) {
  // Public: the pricing cards. Active rows whose validity window includes "now",
  // grouped into tabs by category. A signed-in viewer also gets the organizations they
  // could upgrade, so the page can show "what you run today" beside "what's above it".
  app.get("/pricing", async (req): Promise<PricingView> => {
    const now = new Date();
    const rows = await db.pricingPlan.findMany({
      where: {
        active: true,
        AND: [
          { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
          { OR: [{ validUntil: null }, { validUntil: { gte: now } }] },
        ],
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    const plans = rows.map(toPlanView);
    const tabs = [...new Set(plans.map((p) => p.category))];

    // The viewer is optional here (the page is public), so an unauthenticated read simply
    // returns no organizations rather than a 401.
    let myOrgs: UpgradableOrgView[] = [];
    const profileId = await app.optionalProfileId(req);
    if (profileId) {
      const memberships = await db.membership.findMany({
        where: { profileId, org: { deletedAt: null } },
        include: { org: true },
      });
      const planByKey = new Map(plans.map((p) => [p.key, p]));
      myOrgs = await Promise.all(
        memberships.map(async (m) => {
          const root = await db.roleNode.findFirst({
            where: { orgId: m.orgId, parentId: null },
            select: { id: true },
          });
          const [ownerHere, members, documents, uploads] = await Promise.all([
            root
              ? db.placement.count({
                  where: { roleNodeId: root.id, kind: "OWNER", membershipId: m.id },
                })
              : Promise.resolve(0),
            db.membership.count({ where: { orgId: m.orgId } }),
            db.course.count({ where: { orgId: m.orgId, source: "STUDIO" } }),
            db.course.count({ where: { orgId: m.orgId, source: "UPLOAD" } }),
          ]);
          const plan = m.org.planKey ? planByKey.get(m.org.planKey) ?? null : null;
          return {
            id: m.org.id,
            name: m.org.name,
            orgNumber: m.org.orgNumber,
            planKey: m.org.planKey,
            planName: plan?.name ?? null,
            planStatus: effectivePlanStatus(m.org.planStatus, m.org.planExpiresAt),
            planExpiresAt: m.org.planExpiresAt?.toISOString() ?? null,
            tier: plan?.tier ?? 0,
            canUpgrade: ownerHere > 0,
            members,
            documents,
            uploads,
          };
        }),
      );
      myOrgs.sort((a, b) => a.orgNumber - b.orgNumber);
    }

    return { tabs, plans, coins: 0, myOrgs };
  });

  // The signed-in user's coin balance (only surfaced on the pricing/payment page).
  app.get("/wallet", { preHandler: app.authenticate }, async (req) => {
    const profile = await db.profile.findUniqueOrThrow({ where: { id: req.profileId } });
    return { coins: profile.coins };
  });

  // File a request to the super-admin (create / upgrade / custom proposal / restore).
  app.post("/platform-requests", { preHandler: app.authenticate }, async (req, reply) => {
    const body = createPlatformRequestSchema.parse(req.body);

    // An upgrade names an organization the requester must actually own.
    if (body.kind === "UPGRADE_PLAN") {
      const org = await db.organization.findUnique({
        where: { orgNumber: body.targetOrgNumber as number },
      });
      if (!org || org.deletedAt) return reply.status(404).send({ error: "No such organization" });
      const root = await db.roleNode.findFirst({
        where: { orgId: org.id, parentId: null },
        select: { id: true },
      });
      const owns = root
        ? await db.placement.count({
            where: {
              roleNodeId: root.id,
              kind: "OWNER",
              membership: { profileId: req.profileId, orgId: org.id },
            },
          })
        : 0;
      if (owns === 0) {
        return reply
          .status(403)
          .send({ error: "Only an owner of that organization can ask for an upgrade" });
      }
    }

    const duplicate = await db.platformRequest.findFirst({
      where: {
        requesterId: req.profileId,
        kind: body.kind,
        status: "PENDING",
        planKey: body.planKey ?? null,
        targetOrgNumber: body.targetOrgNumber ?? null,
      },
    });
    if (duplicate) {
      return reply.status(409).send({ error: "You already have that request pending" });
    }

    const created = await db.platformRequest.create({
      data: {
        kind: body.kind,
        requesterId: req.profileId,
        planKey: body.planKey ?? null,
        requestedDays: body.requestedDays ?? null,
        offeredCoins: body.offeredCoins ?? null,
        requestedMembers: body.requestedMembers ?? null,
        requestedDocuments: body.requestedDocuments ?? null,
        requestedUploads: body.requestedUploads ?? null,
        message: body.message ?? null,
        targetOrgNumber: body.targetOrgNumber ?? null,
      },
    });
    return { ok: true, id: created.id };
  });

  // The user's own requests, newest first. The OTP itself is NOT returned here — it lives
  // in the user's mailbox (durable 30 days), which they can read any time.
  app.get(
    "/platform-requests/mine",
    { preHandler: app.authenticate },
    async (req): Promise<{ requests: PlatformRequestView[] }> => {
      const rows = await db.platformRequest.findMany({
        where: { requesterId: req.profileId },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
      return {
        requests: rows.map((r) => ({
          id: r.id,
          kind: r.kind,
          status: r.status,
          planKey: r.planKey,
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
          otp: null,
          otpExpiresAt: r.otpExpiresAt?.toISOString() ?? null,
          targetOrgNumber: r.targetOrgNumber,
          createdAt: r.createdAt.toISOString(),
          decidedAt: r.decidedAt?.toISOString() ?? null,
        })),
      };
    },
  );

  app.post<{ Params: { id: string } }>(
    "/platform-requests/:id/withdraw",
    { preHandler: app.authenticate },
    async (req, reply) => {
      const request = await db.platformRequest.findUnique({ where: { id: req.params.id } });
      if (!request || request.requesterId !== req.profileId) {
        return reply.status(404).send({ error: "No such request" });
      }
      if (request.status !== "PENDING") {
        return reply.status(409).send({ error: "Only pending requests can be withdrawn" });
      }
      // Withdrawn means finished — the row goes rather than sitting in the admin's list.
      await db.platformRequest.delete({ where: { id: request.id } });
      return { ok: true };
    },
  );

  // Clear a served request from the user's own list (the outcome is in their mailbox).
  app.delete<{ Params: { id: string } }>(
    "/platform-requests/:id",
    { preHandler: app.authenticate },
    async (req, reply) => {
      const request = await db.platformRequest.findUnique({ where: { id: req.params.id } });
      if (!request || request.requesterId !== req.profileId) {
        return reply.status(404).send({ error: "No such request" });
      }
      if (request.status === "APPROVED" && request.otpExpiresAt && request.otpExpiresAt > new Date()) {
        return reply
          .status(409)
          .send({ error: "This approval still holds a live access code — use it or let it expire" });
      }
      await db.platformRequest.delete({ where: { id: request.id } });
      return { ok: true };
    },
  );
}
