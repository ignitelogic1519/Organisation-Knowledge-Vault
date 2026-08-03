import type { FastifyInstance } from "fastify";
import {
  can,
  canProposeContent,
  saveStudioDraftSchema,
  studioDocumentSchema,
  type OrgPlanLimitsView,
  type StudioDocument,
  type StudioDraftSummary,
  type StudioDraftView,
} from "@vault/shared";
import { db } from "../db.js";
import { assertDraftsAllowed, orgPlanLimitsView } from "../orgs/plan.js";
import { actorPlacements, toRoleRef } from "../roles/helpers.js";
import { sanitizeBlocks, sanitizeExam } from "../security.js";

// Document Studio server routes: what the organization's plan allows, and the premium
// draft store that lets an author park an unfinished document and resume it anywhere.
// Publishing still goes through POST /orgs/:id/courses — a draft is purely private
// authoring state and reaches no reader.

const MAX_DRAFTS_PER_AUTHOR = 40;

/** May this profile author content for the branch (publish directly, or propose)? */
async function assertCanAuthor(profileId: string, roleNodeId: string, orgId: string) {
  const node = await db.roleNode.findUnique({
    where: { id: roleNodeId },
    include: { org: true },
  });
  if (!node || node.orgId !== orgId || node.org.deletedAt) {
    throw Object.assign(new Error("Role not found"), { statusCode: 404 });
  }
  const placements = await actorPlacements(profileId, orgId);
  const ref = toRoleRef(node);
  if (!can(placements, "create_content", ref) && !canProposeContent(placements, ref)) {
    throw Object.assign(new Error("You don't create content in this layer"), { statusCode: 403 });
  }
  return node;
}

function toSummary(
  row: {
    id: string;
    roleNodeId: string;
    title: string;
    blockCount: number;
    document: unknown;
    createdAt: Date;
    updatedAt: Date;
  },
  roleName: string,
): StudioDraftSummary {
  // Which Studio mode wrote it lives in the stored document — each editor lists only the
  // drafts it can reopen, so an exam never turns up in the document editor's tray.
  const kind = (row.document as { kind?: StudioDraftSummary["kind"] } | null)?.kind ?? "DOCUMENT";
  return {
    id: row.id,
    roleNodeId: row.roleNodeId,
    roleName,
    kind,
    title: row.title || (kind === "EXAM" ? "Untitled exam" : "Untitled document"),
    blockCount: row.blockCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function studioRoutes(app: FastifyInstance) {
  // What the org's plan permits and how much of it is already spent. Read by the Studio
  // (before offering the draft button) and by the upload form's allowance meter.
  app.get<{ Params: { id: string } }>(
    "/orgs/:id/plan-limits",
    { preHandler: app.authenticate },
    async (req, reply): Promise<OrgPlanLimitsView> => {
      const member = await db.membership.findUnique({
        where: { profileId_orgId: { profileId: req.profileId, orgId: req.params.id } },
      });
      if (!member) return reply.status(404).send({ error: "Organization not found" });
      return orgPlanLimitsView(req.params.id);
    },
  );

  // The author's own drafts in this org (newest first) — never anyone else's.
  app.get<{ Params: { id: string } }>(
    "/orgs/:id/studio-drafts",
    { preHandler: app.authenticate },
    async (req, reply): Promise<{ drafts: StudioDraftSummary[]; enabled: boolean }> => {
      const member = await db.membership.findUnique({
        where: { profileId_orgId: { profileId: req.profileId, orgId: req.params.id } },
      });
      if (!member) return reply.status(404).send({ error: "Organization not found" });
      const rows = await db.studioDraft.findMany({
        where: { orgId: req.params.id, authorProfileId: req.profileId },
        orderBy: { updatedAt: "desc" },
        take: MAX_DRAFTS_PER_AUTHOR,
      });
      const nodes = await db.roleNode.findMany({
        where: { id: { in: [...new Set(rows.map((r) => r.roleNodeId))] } },
      });
      const limits = await orgPlanLimitsView(req.params.id);
      return {
        drafts: rows.map((r) =>
          toSummary(r, nodes.find((n) => n.id === r.roleNodeId)?.name ?? "—"),
        ),
        enabled: limits.draftsEnabled,
      };
    },
  );

  // Save (or overwrite) a draft — premium plans only.
  app.post<{ Params: { id: string } }>(
    "/orgs/:id/studio-drafts",
    { preHandler: app.authenticate },
    async (req, reply): Promise<StudioDraftView> => {
      const body = saveStudioDraftSchema.parse(req.body);
      const member = await db.membership.findUnique({
        where: { profileId_orgId: { profileId: req.profileId, orgId: req.params.id } },
      });
      if (!member) return reply.status(404).send({ error: "Organization not found" });
      // 402 when the plan doesn't include drafts — the UI turns this into the upgrade note
      await assertDraftsAllowed(req.params.id);
      const node = await assertCanAuthor(req.profileId, body.roleNodeId, req.params.id);

      // Authored HTML is sanitized on the way in, exactly as it is when publishing, so a
      // draft can never become a delivery route for stored markup. An exam draft carries
      // questions instead of blocks and is cleaned the same way.
      const document: StudioDocument = {
        ...body.document,
        blocks: sanitizeBlocks(body.document.blocks),
        ...(body.document.exam ? { exam: sanitizeExam(body.document.exam) } : {}),
      };
      const data = {
        orgId: req.params.id,
        roleNodeId: node.id,
        authorProfileId: req.profileId,
        title: document.title.slice(0, 120),
        document: document as object,
        // "How much is in it", shown in the drafts tray: blocks for a document, questions
        // for an exam.
        blockCount: document.exam ? document.exam.questions.length : document.blocks.length,
      };

      let row;
      if (body.id) {
        const existing = await db.studioDraft.findUnique({ where: { id: body.id } });
        if (!existing || existing.authorProfileId !== req.profileId || existing.orgId !== req.params.id) {
          return reply.status(404).send({ error: "Draft not found" });
        }
        row = await db.studioDraft.update({ where: { id: body.id }, data });
      } else {
        const mine = await db.studioDraft.count({
          where: { orgId: req.params.id, authorProfileId: req.profileId },
        });
        if (mine >= MAX_DRAFTS_PER_AUTHOR) {
          return reply.status(409).send({
            error: `You already hold ${MAX_DRAFTS_PER_AUTHOR} drafts here — publish or delete one before starting another.`,
          });
        }
        row = await db.studioDraft.create({ data });
      }
      return { ...toSummary(row, node.name), document };
    },
  );

  // Reopen a draft in the Studio.
  app.get<{ Params: { id: string; draftId: string } }>(
    "/orgs/:id/studio-drafts/:draftId",
    { preHandler: app.authenticate },
    async (req, reply): Promise<StudioDraftView> => {
      const row = await db.studioDraft.findUnique({ where: { id: req.params.draftId } });
      if (!row || row.orgId !== req.params.id || row.authorProfileId !== req.profileId) {
        return reply.status(404).send({ error: "Draft not found" });
      }
      const node = await db.roleNode.findUnique({ where: { id: row.roleNodeId } });
      // Re-parse through the schema: a draft written by an older Studio version still
      // opens, with anything the current format no longer accepts dropped.
      const document = studioDocumentSchema.parse(row.document);
      return { ...toSummary(row, node?.name ?? "—"), document };
    },
  );

  // Discard a draft (also used right after a successful publish).
  app.delete<{ Params: { id: string; draftId: string } }>(
    "/orgs/:id/studio-drafts/:draftId",
    { preHandler: app.authenticate },
    async (req, reply) => {
      const row = await db.studioDraft.findUnique({ where: { id: req.params.draftId } });
      if (!row || row.orgId !== req.params.id || row.authorProfileId !== req.profileId) {
        return reply.status(404).send({ error: "Draft not found" });
      }
      await db.studioDraft.delete({ where: { id: row.id } });
      return { ok: true };
    },
  );
}
