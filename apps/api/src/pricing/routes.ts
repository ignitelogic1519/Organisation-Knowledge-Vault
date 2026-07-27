import type { FastifyInstance } from "fastify";
import {
  createPlatformRequestSchema,
  type PricingPlanView,
  type PricingView,
  type PlatformRequestView,
} from "@vault/shared";
import { db } from "../db.js";

// User-facing pricing & the request channel to the super-admin. Knowledge Coins are only
// ever exposed here (the /wallet endpoint), per product decision.

export async function pricingRoutes(app: FastifyInstance) {
  // Public: the pricing cards. Active rows whose validity window includes "now",
  // grouped into tabs by category.
  app.get("/pricing", async (): Promise<PricingView> => {
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
    const plans: PricingPlanView[] = rows.map((p) => ({
      key: p.key,
      name: p.name,
      tagline: p.tagline,
      category: p.category,
      priceCoins: p.priceCoins,
      durationDays: p.durationDays,
      memberLimit: p.memberLimit,
      isCustom: p.isCustom,
      imageUrl: p.imageUrl,
      criteria: p.criteria,
      badge: p.badge,
      highlights: Array.isArray(p.highlights) ? (p.highlights as string[]) : [],
    }));
    const tabs = [...new Set(plans.map((p) => p.category))];
    return { tabs, plans, coins: 0 };
  });

  // The signed-in user's coin balance (only surfaced on the pricing/payment page).
  app.get("/wallet", { preHandler: app.authenticate }, async (req) => {
    const profile = await db.profile.findUniqueOrThrow({ where: { id: req.profileId } });
    return { coins: profile.coins };
  });

  // File a request to the super-admin (create an org / propose a custom plan / restore).
  app.post("/platform-requests", { preHandler: app.authenticate }, async (req) => {
    const body = createPlatformRequestSchema.parse(req.body);
    const created = await db.platformRequest.create({
      data: {
        kind: body.kind,
        requesterId: req.profileId,
        planKey: body.planKey ?? null,
        requestedDays: body.requestedDays ?? null,
        offeredCoins: body.offeredCoins ?? null,
        message: body.message ?? null,
        targetOrgNumber: body.targetOrgNumber ?? null,
      },
    });
    return { ok: true, id: created.id };
  });

  // The user's own requests, newest first. The OTP itself is NOT returned here — it lives
  // in the user's notifications (durable 30 days), which they can read any time.
  app.get("/platform-requests/mine", { preHandler: app.authenticate }, async (req): Promise<{ requests: PlatformRequestView[] }> => {
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
        message: r.message,
        grantedDays: r.grantedDays,
        priceCoins: r.priceCoins,
        adminMessage: r.adminMessage,
        otp: null,
        otpExpiresAt: r.otpExpiresAt?.toISOString() ?? null,
        targetOrgNumber: r.targetOrgNumber,
        createdAt: r.createdAt.toISOString(),
        decidedAt: r.decidedAt?.toISOString() ?? null,
      })),
    };
  });

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
      await db.platformRequest.update({ where: { id: request.id }, data: { status: "WITHDRAWN" } });
      return { ok: true };
    },
  );
}
