import { hash, verify as argonVerify } from "@node-rs/argon2";
import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  addOwnerSchema,
  createOrgSchema,
  supremeVerifySchema,
  type MyPlacement,
  type OrgDetail,
  type OrgSummary,
  type SupremeSession,
} from "@vault/shared";
import { db } from "../db.js";
import { broadcast } from "../events.js";
import { audit } from "../security.js";
import { connectStorage, testConnection } from "../storage/org-storage.js";
import { redeemAccessCode, planStatusFor, expiryFrom, effectivePlanStatus } from "./plan.js";
import {
  auditSupreme,
  checkSupremeRateLimit,
  issueSupremeToken,
  requireSupreme,
  supremeTtlSeconds,
} from "./supreme.js";

// The Owner role of every org gets the first role number in the per-org sequence.
const FIRST_ROLE_NUMBER = 100;

type OrgReq = FastifyRequest<{ Params: { id: string } }>;

async function myPlacements(profileId: string, orgId: string): Promise<MyPlacement[]> {
  const rows = await db.placement.findMany({
    where: { membership: { profileId, orgId } },
    include: { roleNode: true },
  });
  return rows.map((p) => ({
    roleNodeId: p.roleNodeId,
    roleName: p.roleNode.name,
    roleNumber: p.roleNode.roleNumber,
    kind: p.kind,
    canCreateSubgroups: p.canCreateSubgroups,
  }));
}

/** Membership check shared by all org-scoped reads. */
async function requireMembership(req: OrgReq): Promise<boolean> {
  const membership = await db.membership.findUnique({
    where: { profileId_orgId: { profileId: req.profileId, orgId: req.params.id } },
  });
  return membership !== null;
}

export async function orgRoutes(app: FastifyInstance) {
  // Create an organization: Supreme object + Owner role + creator as first occupant
  // (docs/structure.md §4.1). The unrecoverability acknowledgement is enforced server-side.
  app.post("/orgs", { preHandler: app.authenticate }, async (req, reply): Promise<OrgSummary> => {
    const body = createOrgSchema.parse(req.body);

    // Storage is chosen in the creation form (docs/structure.md §9.3). Test it FIRST:
    // the test is a network call to their storage and cannot run inside the creation
    // transaction, and a failure must leave the access code unspent so they can fix
    // their NAS and retry with the same code.
    if (body.storage) {
      const probe = await testConnection(
        {
          endpoint: body.storage.endpoint.replace(/\/+$/, ""),
          bucket: body.storage.bucket,
          region: body.storage.region || "us-east-1",
          accessKeyId: body.storage.accessKeyId,
          secretAccessKey: body.storage.secretAccessKey,
          forcePathStyle: body.storage.forcePathStyle,
        },
        body.storage.prefix,
      );
      if (!probe.ok) {
        return reply.status(400).send({
          error: probe.error ?? "Your storage could not be verified",
          storageTest: probe,
        }) as never;
      }
    }

    // Paywall gate: a valid super-admin access code (OTP) is required to create ANY org.
    // The code carries the plan the admin approved (plan key, coin price, granted days).
    const plan = await redeemAccessCode(req.profileId, body.accessCode);
    const profile = await db.profile.findUniqueOrThrow({ where: { id: req.profileId } });
    if (profile.coins < plan.priceCoins) {
      return reply
        .status(402)
        .send({ error: `This plan costs ${plan.priceCoins} coins — you have ${profile.coins}.` }) as never;
    }
    const expiresAt = expiryFrom(plan.days);

    const [{ nextval }] = await db.$queryRaw<[{ nextval: bigint }]>`SELECT nextval('org_number_seq')`;
    const orgNumber = Number(nextval);
    const supremeHash = await hash(body.supremePassword);

    const org = await db.$transaction(async (tx) => {
      // Charge coins (at redemption — decision confirmed) and log the spend.
      if (plan.priceCoins > 0) {
        const updated = await tx.profile.update({
          where: { id: req.profileId },
          data: { coins: { decrement: plan.priceCoins } },
        });
        await tx.coinTransaction.create({
          data: {
            profileId: req.profileId,
            delta: -plan.priceCoins,
            balance: updated.coins,
            reason: "PLAN_SPEND",
            note: `Created organization on the ${plan.planKey} plan`,
          },
        });
      }
      await tx.platformRequest.update({
        where: { id: plan.requestId },
        data: { status: "USED", usedAt: new Date() },
      });
      const created = await tx.organization.create({
        data: {
          name: body.name,
          orgNumber,
          supremeHash,
          nextRoleNumber: FIRST_ROLE_NUMBER + 1,
          planKey: plan.planKey,
          planStatus: planStatusFor(plan.planKey),
          planActivatedAt: new Date(),
          planExpiresAt: expiresAt,
          planIsCustom: plan.isCustom,
        },
      });
      const ownerRole = await tx.roleNode.create({
        data: {
          orgId: created.id,
          parentId: null,
          name: body.ownerRoleName,
          roleNumber: FIRST_ROLE_NUMBER,
          path: String(FIRST_ROLE_NUMBER),
        },
      });
      const membership = await tx.membership.create({
        data: { profileId: req.profileId, orgId: created.id },
      });
      await tx.placement.create({
        data: {
          membershipId: membership.id,
          roleNodeId: ownerRole.id,
          kind: "OWNER",
          canCreateSubgroups: true,
          canAddCoOwners: true,
          addedByProfileId: req.profileId,
        },
      });
      return created;
    });

    // Persist the storage that already passed its test above. It is deliberately
    // outside the transaction: sealing credentials and generating the data key are
    // local work, and the connection they describe has already been proven.
    if (body.storage) {
      const outcome = await connectStorage(org.id, body.storage);
      if (outcome.ok) {
        await audit(org.id, "storage.connect", {
          actorProfileId: req.profileId,
          ip: req.ip,
          detail: { endpoint: outcome.row.endpoint, bucket: outcome.row.bucket },
        });
      }
    }

    return {
      id: org.id,
      name: org.name,
      orgNumber: org.orgNumber,
      myPlacements: await myPlacements(req.profileId, org.id),
      planStatus: org.planStatus,
      planKey: org.planKey,
      planExpiresAt: org.planExpiresAt?.toISOString() ?? null,
    };
  });

  // My organizations
  app.get("/orgs", { preHandler: app.authenticate }, async (req): Promise<OrgSummary[]> => {
    const memberships = await db.membership.findMany({
      where: { profileId: req.profileId, org: { deletedAt: null } },
      include: { org: true },
      orderBy: { createdAt: "asc" },
    });
    return Promise.all(
      memberships.map(async (m) => ({
        id: m.org.id,
        name: m.org.name,
        orgNumber: m.org.orgNumber,
        myPlacements: await myPlacements(req.profileId, m.orgId),
        planStatus: effectivePlanStatus(m.org.planStatus, m.org.planExpiresAt),
        planKey: m.org.planKey,
        planExpiresAt: m.org.planExpiresAt?.toISOString() ?? null,
      })),
    );
  });

  // My deleted-but-retained organizations (30-day window) — feeds the Undelete UI.
  // Visible ONLY to occupants of the org's root Owner role — plain members have no
  // business seeing (or undeleting) a deleted organization.
  app.get("/orgs/deleted", { preHandler: app.authenticate }, async (req) => {
    const memberships = await db.membership.findMany({
      where: { profileId: req.profileId, org: { deletedAt: { not: null } } },
      include: { org: true, placements: { include: { roleNode: true } } },
    });
    return memberships
      .filter((m) =>
        m.placements.some((p) => p.kind === "OWNER" && p.roleNode.parentId === null),
      )
      .map((m) => ({
        id: m.org.id,
        name: m.org.name,
        orgNumber: m.org.orgNumber,
        deletedAt: m.org.deletedAt!.toISOString(),
        purgeAt: new Date(m.org.deletedAt!.getTime() + 30 * 86400_000).toISOString(),
      }));
  });

  // Organization detail (members only)
  app.get<{ Params: { id: string } }>(
    "/orgs/:id",
    { preHandler: app.authenticate },
    async (req, reply): Promise<OrgDetail> => {
      if (!(await requireMembership(req))) {
        return reply.status(404).send({ error: "Organization not found" });
      }
      const org = await db.organization.findFirst({
        where: { id: req.params.id, deletedAt: null },
      });
      if (!org) return reply.status(404).send({ error: "Organization not found" });

      const ownerRole = await db.roleNode.findFirst({
        where: { orgId: org.id, parentId: null },
      });
      if (!ownerRole) return reply.status(500).send({ error: "Organization is corrupted" });

      const ownerPlacements = await db.placement.findMany({
        where: { roleNodeId: ownerRole.id, kind: "OWNER" },
        include: { membership: { include: { profile: true } } },
      });

      return {
        id: org.id,
        name: org.name,
        orgNumber: org.orgNumber,
        createdAt: org.createdAt.toISOString(),
        ownerRole: { id: ownerRole.id, name: ownerRole.name, roleNumber: ownerRole.roleNumber },
        owners: ownerPlacements.map((p) => ({
          profileId: p.membership.profile.id,
          displayName: p.membership.profile.displayName,
          username: p.membership.profile.username,
        })),
        myPlacements: await myPlacements(req.profileId, org.id),
        planStatus: effectivePlanStatus(org.planStatus, org.planExpiresAt),
        planKey: org.planKey,
        planExpiresAt: org.planExpiresAt?.toISOString() ?? null,
      };
    },
  );

  // The Supreme-access gate: password → short-lived supreme token (rate-limited, audited)
  app.post<{ Params: { id: string } }>(
    "/orgs/:id/supreme/verify",
    { preHandler: app.authenticate },
    async (req, reply): Promise<SupremeSession> => {
      const body = supremeVerifySchema.parse(req.body);
      const ip = req.ip;

      if (!(await requireMembership(req))) {
        return reply.status(404).send({ error: "Organization not found" });
      }
      if (!checkSupremeRateLimit(req.params.id, ip)) {
        return reply
          .status(429)
          .send({ error: "Too many attempts — try again in 15 minutes" });
      }

      const org = await db.organization.findFirst({
        where: { id: req.params.id, deletedAt: null },
      });
      if (!org) return reply.status(404).send({ error: "Organization not found" });

      const ok = await argonVerify(org.supremeHash, body.password);
      await auditSupreme(org.id, ok ? "verify_success" : "verify_failed", {
        actorProfileId: req.profileId,
        ip,
      });
      if (!ok) {
        return reply.status(401).send({ error: "Wrong Supreme password" });
      }
      return { supremeToken: await issueSupremeToken(org.id), expiresIn: supremeTtlSeconds };
    },
  );

  // Add a co-owner to the Owner role (Supreme-gated). Invitations for unregistered emails
  // arrive with Phase 3 — until then the profile must already exist.
  app.post<{ Params: { id: string } }>(
    "/orgs/:id/owners",
    { preHandler: [app.authenticate, requireSupreme] },
    async (req, reply) => {
      const body = addOwnerSchema.parse(req.body);
      const username = body.username.toLowerCase();

      const profile = await db.profile.findUnique({ where: { username } });
      if (!profile) {
        return reply.status(404).send({
          error: "No profile with this username — ask them to register first",
        });
      }
      const ownerRole = await db.roleNode.findFirst({
        where: { orgId: req.params.id, parentId: null },
      });
      if (!ownerRole) return reply.status(404).send({ error: "Organization not found" });

      const existing = await db.placement.findFirst({
        where: {
          roleNodeId: ownerRole.id,
          kind: "OWNER",
          membership: { profileId: profile.id },
        },
      });
      if (existing) {
        return reply.status(409).send({ error: "They are already an owner" });
      }

      await db.$transaction(async (tx) => {
        const membership = await tx.membership.upsert({
          where: { profileId_orgId: { profileId: profile.id, orgId: req.params.id } },
          create: { profileId: profile.id, orgId: req.params.id },
          update: {},
        });
        await tx.placement.create({
          data: {
            membershipId: membership.id,
            roleNodeId: ownerRole.id,
            kind: "OWNER",
            canCreateSubgroups: true,
            canAddCoOwners: true,
            addedByProfileId: req.profileId,
          },
        });
      });
      await auditSupreme(req.params.id, "owner_added", {
        actorProfileId: req.profileId,
        ip: req.ip,
        detail: username,
      });
      broadcast(req.params.id, "structure");
      return { ok: true };
    },
  );

  // Remove a co-owner (Supreme-gated). Invariant I2: a role always keeps ≥ 1 owner.
  app.delete<{ Params: { id: string; profileId: string } }>(
    "/orgs/:id/owners/:profileId",
    { preHandler: [app.authenticate, requireSupreme] },
    async (req, reply) => {
      const ownerRole = await db.roleNode.findFirst({
        where: { orgId: req.params.id, parentId: null },
      });
      if (!ownerRole) return reply.status(404).send({ error: "Organization not found" });

      const owners = await db.placement.findMany({
        where: { roleNodeId: ownerRole.id, kind: "OWNER" },
        include: { membership: true },
      });
      const target = owners.find((p) => p.membership.profileId === req.params.profileId);
      if (!target) return reply.status(404).send({ error: "They are not an owner" });
      if (owners.length <= 1) {
        return reply.status(409).send({
          error: "A role must always have at least one owner — add another owner first",
        });
      }

      await db.placement.delete({ where: { id: target.id } });
      await auditSupreme(req.params.id, "owner_removed", {
        actorProfileId: req.profileId,
        ip: req.ip,
        detail: req.params.profileId,
      });
      broadcast(req.params.id, "structure");
      return { ok: true };
    },
  );
}
