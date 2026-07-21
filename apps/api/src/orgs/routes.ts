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
  app.post("/orgs", { preHandler: app.authenticate }, async (req): Promise<OrgSummary> => {
    const body = createOrgSchema.parse(req.body);

    const [{ nextval }] = await db.$queryRaw<[{ nextval: bigint }]>`SELECT nextval('org_number_seq')`;
    const orgNumber = Number(nextval);
    const supremeHash = await hash(body.supremePassword);

    const org = await db.$transaction(async (tx) => {
      const created = await tx.organization.create({
        data: {
          name: body.name,
          orgNumber,
          supremeHash,
          nextRoleNumber: FIRST_ROLE_NUMBER + 1,
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

    return {
      id: org.id,
      name: org.name,
      orgNumber: org.orgNumber,
      myPlacements: await myPlacements(req.profileId, org.id),
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
      return { ok: true };
    },
  );
}
