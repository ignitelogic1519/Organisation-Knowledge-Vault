import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  can,
  canProposeContent,
  createCourseSchema,
  examProblems,
  grantAdminAccessSchema,
  isSelfOrAncestor,
  placeCourseSchema,
  reviewCourseSchema,
  updateCourseSchema,
  versionLabel,
  type CourseAdminView,
  type CourseComplianceView,
  type CourseHistoryView,
  type DownloadTicket,
  type MyLearningView,
} from "@vault/shared";
import { db } from "../db.js";
import { broadcast } from "../events.js";
import { audit, sanitizeBlocks, sanitizeExam } from "../security.js";
import { assertContentQuota } from "../orgs/plan.js";
import { deletionOpsFor, storage, type StorageRef } from "../storage/adapter.js";
import { drainSoon } from "../storage/jobs.js";
import { dekFor, fullKey, s3ConfigFor, storageFor } from "../storage/org-storage.js";
import { presign } from "../storage/s3.js";
import { unwrapFileKey } from "../storage/secrets.js";
import { actorPlacements, toRoleRef } from "../roles/helpers.js";
import {
  courseHandlerNodeId,
  coursesReaching,
  nextCourseCode,
  notify,
  recordCompletion,
  toLearningItem,
} from "./helpers.js";

/** Download tickets are bearer tokens: minted per view, one object, short-lived. */
const DOWNLOAD_TICKET_TTL = 300;

/**
 * Record one publication in the course's edition log. Called on creation and on every
 * content republish, so `version` is never just a number that moved — there is always a
 * row saying what the edition was, who published it and whether it expired completions.
 */
async function recordEdition(
  courseId: string,
  version: number,
  input: {
    note?: string | null;
    source: "STUDIO" | "UPLOAD";
    resetCompletions: boolean;
    publishedByProfileId: string;
  },
) {
  await db.courseEdition.upsert({
    where: { courseId_version: { courseId, version } },
    create: {
      courseId,
      version,
      note: input.note?.trim() ? input.note.trim() : null,
      source: input.source,
      resetCompletions: input.resetCompletions,
      publishedByProfileId: input.publishedByProfileId,
    },
    // A republish that lands on an existing version number (only possible if a previous
    // attempt half-wrote) refreshes the row rather than exploding on the unique key.
    update: {
      note: input.note?.trim() ? input.note.trim() : null,
      source: input.source,
      resetCompletions: input.resetCompletions,
      publishedByProfileId: input.publishedByProfileId,
      publishedAt: new Date(),
    },
  });
}

async function courseByCode(code: string) {
  return db.course.findUnique({ where: { code }, include: { org: true } });
}

// Types the browser may render inline safely (no script execution). Everything else
// (HTML, SVG, unknown) is served as a download so it can never run in our origin.
const SAFE_INLINE_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/bmp",
  "audio/mpeg",
  "audio/mp4",
  "audio/ogg",
  "audio/wav",
  "video/mp4",
  "video/webm",
  "video/ogg",
  "text/plain",
]);

/** Detect a trustworthy content-type from magic bytes; fall back to the stored mime only
 *  when it is a specific, non-generic type. */
function sniffMime(buf: Buffer, stored: string): string {
  const b = buf.subarray(0, 16);
  const startsWith = (sig: number[]) => sig.every((v, i) => b[i] === v);
  if (startsWith([0x25, 0x50, 0x44, 0x46])) return "application/pdf"; // %PDF
  if (startsWith([0x89, 0x50, 0x4e, 0x47])) return "image/png";
  if (startsWith([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith([0x47, 0x49, 0x46, 0x38])) return "image/gif";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[8] === 0x57) return "image/webp"; // RIFF…WEBP
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return "video/mp4"; // ftyp
  if (startsWith([0x1a, 0x45, 0xdf, 0xa3])) return "video/webm";
  if (startsWith([0x49, 0x44, 0x33]) || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return "audio/mpeg";
  // Trust a specific stored type; distrust generic/empty ones
  const generic = !stored || stored === "application/octet-stream" || stored === "binary/octet-stream";
  return generic ? "application/octet-stream" : stored;
}

/** VIEW/EDIT level on the course admin page — creator has implicit EDIT+grant. */
async function adminLevel(profileId: string, courseId: string, createdBy: string) {
  if (profileId === createdBy) return { level: "EDIT" as const, canGrant: true };
  const row = await db.courseAdminAccess.findUnique({
    where: { courseId_profileId: { courseId, profileId } },
  });
  return row ? { level: row.level, canGrant: row.canGrant } : null;
}

/**
 * Retire `oldId` in favour of `newId` — what "Replace it" actually means.
 *
 * Every branch the old document reached now receives the new one on exactly the same
 * terms (mandatory, inheritance, deadline, recurrence), because a replacement that
 * quietly narrowed its own audience would drop people out of compliance without anyone
 * deciding to. The old document is then archived and taken out of deployment: it keeps
 * its completion history and its code resolves forever, but it reaches nobody new and
 * anyone arriving at it is forwarded to the replacement.
 *
 * Exported so the review flow can call it when a member's replacement is approved.
 */
export async function retireSuperseded(
  newId: string,
  oldId: string,
  actorProfileId: string,
): Promise<void> {
  const [next, previous] = await Promise.all([
    db.course.findUnique({ where: { id: newId } }),
    db.course.findUnique({ where: { id: oldId } }),
  ]);
  if (!next || !previous || next.id === previous.id) return;

  const inherited = await db.coursePlacement.findMany({ where: { courseId: previous.id } });
  for (const p of inherited) {
    await db.coursePlacement.upsert({
      where: { courseId_roleNodeId: { courseId: next.id, roleNodeId: p.roleNodeId } },
      create: {
        courseId: next.id,
        roleNodeId: p.roleNodeId,
        mandatory: p.mandatory,
        inheritToDescendants: p.inheritToDescendants,
        deadlineDays: p.deadlineDays,
        retakeEveryNDays: p.retakeEveryNDays,
        placedByProfileId: actorProfileId,
      },
      // Already placed there by the author — their settings win, this only fills gaps.
      update: {},
    });
  }

  await db.course.update({
    where: { id: previous.id },
    data: {
      supersededByCourseId: next.id,
      supersededAt: new Date(),
      archived: true,
      withdrawn: true,
      withdrawnAt: new Date(),
      inLibrary: false,
    },
  });
  await db.course.update({
    where: { id: next.id },
    data: { supersedesCourseId: previous.id },
  });

  await audit(next.orgId, "course.supersede", {
    actorProfileId,
    detail: {
      replaced: previous.code,
      replacedTitle: previous.title,
      by: next.code,
      placementsCarried: inherited.length,
    },
  });

  // Everybody who had completed the old one is told where the subject now lives — an
  // unannounced replacement is how a mandatory document quietly goes unread.
  const audience = await db.completionRecord.findMany({
    where: { courseId: previous.id },
    select: { profileId: true },
    distinct: ["profileId"],
  });
  await Promise.all(
    audience
      .filter((a) => a.profileId !== actorProfileId)
      .map((a) =>
        notify(a.profileId, next.orgId, "course_superseded", {
          code: next.code,
          title: next.title,
          replacedCode: previous.code,
          replacedTitle: previous.title,
        }),
      ),
  );
}

/**
 * May the actor manage (edit / archive / delete) this course? True for anyone with EDIT
 * admin access AND for owners governing the course's home branch — i.e. the branch owner
 * where it lives and every owner above it (structure.md: authority flows down). This is
 * what lets "the owner or the top branch owners" delete a course they no longer need.
 */
async function canManageCourse(
  profileId: string,
  course: { id: string; createdByProfileId: string; orgId: string; uploaderRoleNodeId: string },
): Promise<boolean> {
  const access = await adminLevel(profileId, course.id, course.createdByProfileId);
  if (access?.level === "EDIT") return true;
  const homeNode = await db.roleNode.findUnique({ where: { id: course.uploaderRoleNodeId } });
  if (!homeNode) return false;
  const placements = await actorPlacements(profileId, course.orgId);
  return can(placements, "create_content", toRoleRef(homeNode));
}

export async function courseRoutes(app: FastifyInstance) {
  // Upload/create a knowledge item — code minted as <org>-<role>-<item>
  app.post<{ Params: { id: string } }>(
    "/orgs/:id/courses",
    { preHandler: app.authenticate },
    async (req, reply) => {
      const body = createCourseSchema.parse(req.body);
      const node = await db.roleNode.findUnique({
        where: { id: body.roleNodeId },
        include: { org: true },
      });
      if (!node || node.orgId !== req.params.id || node.org.deletedAt) {
        return reply.status(404).send({ error: "Role not found" });
      }
      const placements = await actorPlacements(req.profileId, node.orgId);
      const canPublish = can(placements, "create_content", toRoleRef(node));
      const canPropose = canProposeContent(placements, toRoleRef(node));
      if (!canPublish && !canPropose) {
        return reply.status(403).send({ error: "You don't create content in this layer" });
      }
      // A member's content is a DRAFT that a manager must review before it publishes.
      const asDraft = !canPublish;

      // An exam and its questions must agree — the kind is what tells every later surface
      // (viewer, library, compliance) that this course is sat rather than read.
      if (body.kind === "EXAM" && !body.exam) {
        return reply.status(400).send({ error: "An exam needs its questions" });
      }
      if (body.exam && body.kind !== "EXAM") {
        return reply.status(400).send({ error: "Questions can only be published as an EXAM" });
      }

      // The plan meters Studio-built material and uploads/links separately; an exam is
      // built in the Studio, so it draws on the same custom-document allowance. Check the
      // allowance BEFORE any bytes are stored, so a refusal leaves nothing behind.
      const source: "STUDIO" | "UPLOAD" = body.blocks || body.exam ? "STUDIO" : "UPLOAD";
      // Base64 inflates by ~4/3, so the decoded size is what the storage ceiling sees.
      const incomingBytes = body.fileBase64 ? Math.floor(body.fileBase64.length * 0.75) : 0;
      await assertContentQuota(node.orgId, source, incomingBytes);

      let ref: StorageRef;
      // Set when the content is an object in the org's own storage, so the object row
      // can be pointed at the course once the course exists.
      let attachObjectId: string | null = null;
      if (body.exam) {
        // Refuse a paper that cannot be marked fairly — the Studio shows the same list
        // before it ever calls us, so this is the guard for anything else.
        const problems = examProblems(body.exam);
        if (problems.length > 0) return reply.status(400).send({ error: problems[0] });
        ref = await storage.saveExam(sanitizeExam(body.exam), body.theme);
      } else if (body.blocks) {
        ref = await storage.saveAuthored(sanitizeBlocks(body.blocks), body.theme);
      } else if (body.url) {
        ref = await storage.saveLink(body.url);
      } else if (body.storageObjectId) {
        // The browser has already PUT this straight into the organization's storage —
        // the bytes never came near us. All we do is confirm the object is theirs and
        // not already claimed by another course.
        const object = await db.storageObject.findUnique({ where: { id: body.storageObjectId } });
        if (!object || object.orgId !== node.orgId) {
          return reply.status(404).send({ error: "That upload was not found in your storage" });
        }
        if (object.courseId) {
          return reply.status(409).send({ error: "That upload is already attached to a document" });
        }
        ref = await storage.saveObject(object.id, object.objectKey);
        attachObjectId = object.id;
      } else if (body.fileBase64 && body.filename && body.mime) {
        ref = await storage.saveInline(node.orgId, body.filename, body.mime, body.fileBase64);
      } else {
        return reply
          .status(400)
          .send({ error: "Provide a file, a url, authored content, or an exam" });
      }

      // Hard prerequisites must exist inside the same org
      const prereqs = await db.course.findMany({
        where: { code: { in: body.prerequisiteCodes }, orgId: node.orgId },
      });
      if (prereqs.length !== body.prerequisiteCodes.length) {
        return reply.status(400).send({ error: "Unknown prerequisite course code" });
      }

      // ── Version control against what is already on the shelves ──────────────
      // Resolved BEFORE the course is created so a bad reference costs nothing. A member
      // proposing a draft may name a replacement, but the retirement itself only happens
      // when the reviewer approves — see the CONTENT_REVIEW branch in requests/routes.ts.
      let replaced: { id: string; code: string; title: string } | null = null;
      if (body.replacesCourseCode?.trim()) {
        const target = await db.course.findUnique({
          where: { code: body.replacesCourseCode.trim() },
        });
        if (!target || target.orgId !== node.orgId) {
          return reply
            .status(404)
            .send({ error: "The document this replaces was not found in this organization" });
        }
        if (target.supersededByCourseId) {
          return reply.status(409).send({
            error: "That document has already been replaced — point at the current edition instead",
          });
        }
        if (body.replacementMode === "SUPERSEDE" && !(await canManageCourse(req.profileId, target))) {
          return reply.status(403).send({
            error:
              "Replacing a document needs authority over it — ask its branch owners, or publish alongside it instead",
          });
        }
        replaced = { id: target.id, code: target.code, title: target.title };
      }

      const code = await nextCourseCode(node);
      const course = await db.course.create({
        data: {
          orgId: node.orgId,
          code,
          uploaderRoleNodeId: node.id,
          createdByProfileId: req.profileId,
          kind: body.kind,
          title: body.title,
          description: body.description,
          scope: body.scope?.trim() ? body.scope.trim() : null,
          classification: body.classification,
          allowDownload: body.allowDownload,
          // A draft is never in the library and reaches nobody until it's approved
          inLibrary: asDraft ? false : body.inLibrary,
          draft: asDraft,
          category: body.category?.trim() ? body.category.trim() : null,
          source,
          storageRef: ref as object,
          deadlineDays: body.deadlineDays,
          retakeEveryNDays: body.retakeEveryNDays,
          resetsCompletionOnUpdate: body.resetsCompletionOnUpdate,
          // Remembered even on a draft: the reviewer needs to know what the author
          // intended this to replace before they decide.
          supersedesCourseId:
            replaced && body.replacementMode === "SUPERSEDE" ? replaced.id : null,
          prerequisites: {
            create: prereqs.map((p) => ({ requiresCourseId: p.id })),
          },
        },
      });

      // Edition 1 of this document — the first row of its history.
      await recordEdition(course.id, course.version, {
        note: body.versionNote,
        source,
        resetCompletions: false,
        publishedByProfileId: req.profileId,
      });

      // Claim the object for this course, so orphan collection can tell a live object
      // from one whose course never materialised (§9.10).
      if (attachObjectId) {
        await db.storageObject.update({
          where: { id: attachObjectId },
          data: { courseId: course.id },
        });
      }

      // A published replacement retires its predecessor straight away; a draft's
      // replacement waits for the reviewer (retireSuperseded runs on approval).
      if (!asDraft && replaced && body.replacementMode === "SUPERSEDE") {
        await retireSuperseded(course.id, replaced.id, req.profileId);
      }

      if (asDraft) {
        // File a Document-review request to the branch's handler (nearest owner level)
        const req0 = await db.vaultRequest.create({
          data: {
            orgId: node.orgId,
            kind: "CONTENT_REVIEW",
            requesterProfileId: req.profileId,
            targetRoleNodeId: node.id,
            courseId: course.id,
            message: body.description,
          },
        });
        const handlerId = await courseHandlerNodeId(node.orgId, node.path);
        const handlerOwners = handlerId
          ? await db.placement.findMany({
              where: { roleNodeId: handlerId, kind: "OWNER" },
              include: { membership: true },
            })
          : [];
        const requester = await db.profile.findUnique({ where: { id: req.profileId } });
        await Promise.all(
          [...new Set(handlerOwners.map((o) => o.membership.profileId))]
            .filter((id) => id !== req.profileId)
            .map((profileId) =>
              notify(profileId, node.orgId, "request_created", {
                requestId: req0.id,
                kind: "CONTENT_REVIEW",
                label: "Document review",
                roleName: node.name,
                from: requester?.displayName ?? "A member",
                title: course.title,
              }),
            ),
        );
        broadcast(node.orgId, "requests");
        return { code: course.code, id: course.id, draft: true };
      }

      broadcast(node.orgId, "courses");
      return { code: course.code, id: course.id, draft: false };
    },
  );

  // Resolve a course by its platform-unique code (org members only)
  app.get<{ Params: { code: string } }>(
    "/courses/:code",
    { preHandler: app.authenticate },
    async (req, reply) => {
      const course = await courseByCode(req.params.code);
      if (!course) return reply.status(404).send({ error: "Course not found" });
      const member = await db.membership.findUnique({
        where: { profileId_orgId: { profileId: req.profileId, orgId: course.orgId } },
      });
      if (!member) return reply.status(404).send({ error: "Course not found" });
      if (course.draft && course.createdByProfileId !== req.profileId) {
        if (!(await canManageCourse(req.profileId, course))) {
          return reply.status(404).send({ error: "Course not found" });
        }
      }
      const prereqs = await db.coursePrerequisite.findMany({
        where: { courseId: course.id },
        include: { requires: true },
      });
      const creator = await db.profile.findUnique({ where: { id: course.createdByProfileId } });
      return {
        code: course.code,
        title: course.title,
        kind: course.kind,
        version: course.version,
        deadlineDays: course.deadlineDays,
        retakeEveryNDays: course.retakeEveryNDays,
        prerequisiteCodes: prereqs.map((p) => p.requires.code),
        description: course.description,
        scope: course.scope,
        classification: course.classification,
        allowDownload: course.allowDownload,
        publishedAt: course.createdAt.toISOString(),
        creatorName: creator?.displayName ?? "—",
        draft: course.draft,
        // Everything the Studio needs to reopen this course for a new edition.
        category: course.category,
        inLibrary: course.inLibrary,
        resetsCompletionOnUpdate: course.resetsCompletionOnUpdate,
        source: course.source,
        withdrawn: course.withdrawn,
        archived: course.archived,
        // Where this sits in the replacement chain — the viewer forwards an old
        // reference to the current word on the subject instead of dead-ending on it.
        supersededByCode: course.supersededByCourseId
          ? ((await db.course.findUnique({ where: { id: course.supersededByCourseId } }))?.code ??
            null)
          : null,
        supersedesCode: course.supersedesCourseId
          ? ((await db.course.findUnique({ where: { id: course.supersedesCourseId } }))?.code ??
            null)
          : null,
        canManage: await canManageCourse(req.profileId, course),
      };
    },
  );

  // The course's version story: every edition published, and how it stands against the
  // documents it replaced or was replaced by. Readable by any member of the org — knowing
  // that what reaches you today is the third edition is not privileged information.
  app.get<{ Params: { code: string } }>(
    "/courses/:code/editions",
    { preHandler: app.authenticate },
    async (req, reply): Promise<CourseHistoryView> => {
      const course = await courseByCode(req.params.code);
      if (!course) return reply.status(404).send({ error: "Course not found" });
      const member = await db.membership.findUnique({
        where: { profileId_orgId: { profileId: req.profileId, orgId: course.orgId } },
      });
      if (!member) return reply.status(404).send({ error: "Course not found" });

      const rows = await db.courseEdition.findMany({
        where: { courseId: course.id },
        orderBy: { version: "desc" },
      });
      const authors = await db.profile.findMany({
        where: { id: { in: [...new Set(rows.map((r) => r.publishedByProfileId))] } },
      });
      const [supersedes, supersededBy] = await Promise.all([
        course.supersedesCourseId
          ? db.course.findUnique({ where: { id: course.supersedesCourseId } })
          : null,
        course.supersededByCourseId
          ? db.course.findUnique({ where: { id: course.supersededByCourseId } })
          : null,
      ]);

      return {
        code: course.code,
        title: course.title,
        version: course.version,
        withdrawn: course.withdrawn,
        archived: course.archived,
        editions: rows.map((r) => ({
          version: r.version,
          label: versionLabel(r.version),
          note: r.note,
          source: r.source,
          resetCompletions: r.resetCompletions,
          publishedBy:
            authors.find((a) => a.id === r.publishedByProfileId)?.displayName ?? "Former member",
          publishedAt: r.publishedAt.toISOString(),
          current: r.version === course.version,
        })),
        supersedes: supersedes ? { code: supersedes.code, title: supersedes.title } : null,
        supersededBy: supersededBy
          ? { code: supersededBy.code, title: supersededBy.title }
          : null,
        supersededAt: course.supersededAt?.toISOString() ?? null,
      };
    },
  );

  // Open the actual content (link URL, inline file, or authored blocks).
  // ?download=1 serves the file as an attachment — only when the owner allowed it.
  app.get<{ Params: { code: string }; Querystring: { download?: string } }>(
    "/courses/:code/content",
    { preHandler: app.authenticate },
    async (req, reply) => {
      const course = await courseByCode(req.params.code);
      if (!course) return reply.status(404).send({ error: "Course not found" });
      const member = await db.membership.findUnique({
        where: { profileId_orgId: { profileId: req.profileId, orgId: course.orgId } },
      });
      if (!member) return reply.status(404).send({ error: "Course not found" });
      // A draft is visible only to its creator and the branch's reviewers (for preview)
      if (course.draft && course.createdByProfileId !== req.profileId) {
        if (!(await canManageCourse(req.profileId, course))) {
          return reply.status(404).send({ error: "Course not found" });
        }
      }

      const content = await storage.resolve(course.storageRef as unknown as StorageRef);
      if (content.authored !== undefined) {
        // Native rendering by the viewer inside the standardized document frame
        return { authored: content.authored, theme: content.theme };
      }
      if (content.exam !== undefined) {
        // The stored paper carries its answer key, so it is handed out only to the people
        // who may edit the exam. A candidate gets the paper from /courses/:code/exam,
        // which strips the key and marks their answers on the server.
        if (!(await canManageCourse(req.profileId, course))) {
          return reply.status(403).send({
            error: "This is an exam — open it from My Learning to sit it question by question",
          });
        }
        return { exam: content.exam, theme: content.theme };
      }
      if (content.url) return { url: content.url };

      const wantsDownload = req.query.download === "1";
      if (wantsDownload && !course.allowDownload) {
        return reply
          .status(403)
          .send({ error: "The owner has not enabled downloads for this document" });
      }

      // An object in the organization's own storage: we hand back a short-lived
      // presigned URL and, when the posture is ENCRYPTED, this one object's key. The
      // browser fetches the ciphertext straight from their storage and decrypts it
      // there, so the bytes never touch us and our server never holds the plaintext
      // (docs/structure.md §9.5).
      if (content.object) {
        const object = await db.storageObject.findUnique({
          where: { id: content.object.storageObjectId },
        });
        if (!object) {
          return reply.status(404).send({ error: "This document is missing from your storage" });
        }
        const store = await storageFor(course.orgId);
        if (!store || store.status === "UNCONFIGURED") {
          return reply.status(409).send({
            error: "This content is unreachable until the organization reconnects its storage",
          });
        }
        if (store.status === "DEGRADED") {
          // Degraded is a read problem, not data loss — say so in those words.
          return reply.status(409).send({
            error:
              "This content is unreachable until the organization reconnects its storage" +
              (store.lastError ? ` (${store.lastError})` : ""),
          });
        }
        const ticket: DownloadTicket = {
          downloadUrl: presign(
            s3ConfigFor(store),
            "GET",
            fullKey(store, object.objectKey),
            DOWNLOAD_TICKET_TTL,
          ),
          encrypted: object.encrypted,
          mime: object.mime,
          filename: object.filename,
          bytes: object.bytes,
          sha256: object.sha256,
          expiresInSeconds: DOWNLOAD_TICKET_TTL,
        };
        if (object.encrypted && object.wrappedKey) {
          // Scoped to one object and one already-authenticated request. Never logged.
          ticket.fileKey = unwrapFileKey(
            dekFor(store),
            object.wrappedKey,
            object.objectKey,
          ).toString("base64");
        }
        return ticket;
      }

      // Serve the CORRECT content-type sniffed from magic bytes (many files upload as a
      // generic "application/octet-stream"). Security comes from WHAT we allow inline:
      // only safe-to-render types (PDF, images, media, plain text) are shown in-page;
      // anything that could execute in our origin (HTML, SVG, unknown) is forced to
      // download. We deliberately do NOT send `nosniff` here — it broke legitimate PDF
      // rendering across browsers, and the download-gating already neutralizes the risk.
      const served = sniffMime(content.file!.data, content.file!.mime);
      const dangerous = !SAFE_INLINE_TYPES.has(served);
      const disposition = wantsDownload || dangerous ? "attachment" : "inline";
      reply
        .header("content-type", served)
        .header("content-disposition", `${disposition}; filename="${content.file!.filename}"`)
        .header("x-frame-options", "SAMEORIGIN")
        .header("referrer-policy", "no-referrer");
      return reply.send(content.file!.data);
    },
  );

  // Place a course into a branch by code — no approval needed (docs/structure.md §3.2)
  app.post<{ Params: { code: string } }>(
    "/courses/:code/placements",
    { preHandler: app.authenticate },
    async (req, reply) => {
      const body = placeCourseSchema.parse(req.body);
      const course = await courseByCode(req.params.code);
      if (!course) return reply.status(404).send({ error: "Course not found" });
      const node = await db.roleNode.findUnique({ where: { id: body.roleNodeId } });
      if (!node || node.orgId !== course.orgId) {
        return reply.status(404).send({ error: "Role not found in the course's organization" });
      }
      const placements = await actorPlacements(req.profileId, course.orgId);
      if (!can(placements, "create_content", toRoleRef(node))) {
        return reply.status(403).send({ error: "You don't manage content in that layer" });
      }
      // Archived courses reach nobody new — but an existing placement may still be
      // reconfigured (e.g. to make it opt-in before removal).
      const alreadyPlaced = await db.coursePlacement.findUnique({
        where: { courseId_roleNodeId: { courseId: course.id, roleNodeId: node.id } },
      });
      if (course.archived && !alreadyPlaced) {
        return reply
          .status(409)
          .send({ error: "This course is archived — unarchive it before assigning it anew" });
      }
      // Placing twice reconfigures — mandatory/inheritance/override toggles come here too
      await db.coursePlacement.upsert({
        where: { courseId_roleNodeId: { courseId: course.id, roleNodeId: node.id } },
        create: {
          courseId: course.id,
          roleNodeId: node.id,
          mandatory: body.mandatory,
          inheritToDescendants: body.inheritToDescendants,
          deadlineDays: body.deadlineDays ?? null,
          retakeEveryNDays: body.retakeEveryNDays ?? null,
          placedByProfileId: req.profileId,
        },
        update: {
          mandatory: body.mandatory,
          inheritToDescendants: body.inheritToDescendants,
          ...(body.deadlineDays !== undefined ? { deadlineDays: body.deadlineDays } : {}),
          ...(body.retakeEveryNDays !== undefined
            ? { retakeEveryNDays: body.retakeEveryNDays }
            : {}),
        },
      });
      broadcast(course.orgId, "courses");
      return { ok: true };
    },
  );

  // My Learning (docs/structure.md §6)
  app.get<{ Params: { id: string } }>(
    "/orgs/:id/my-learning",
    { preHandler: app.authenticate },
    async (req, reply): Promise<MyLearningView> => {
      const member = await db.membership.findUnique({
        where: { profileId_orgId: { profileId: req.profileId, orgId: req.params.id } },
      });
      if (!member) return reply.status(404).send({ error: "Organization not found" });
      const reaching = await coursesReaching(req.profileId, req.params.id);
      const items = await Promise.all(reaching.map((r) => toLearningItem(req.profileId, r)));
      return {
        orgId: req.params.id,
        mandatory: items.filter((i) => i.mandatory),
        optIn: items.filter((i) => !i.mandatory),
      };
    },
  );

  // Mark complete (v1 manual completion; prerequisites hard-block)
  app.post<{ Params: { code: string } }>(
    "/courses/:code/complete",
    { preHandler: app.authenticate },
    async (req, reply) => {
      const course = await courseByCode(req.params.code);
      if (!course) return reply.status(404).send({ error: "Course not found" });
      // An exam is completed by passing it, never by declaring it done.
      if (course.kind === "EXAM") {
        return reply
          .status(409)
          .send({ error: "This is an exam — sit it and reach the pass mark to complete it" });
      }
      const reaching = await coursesReaching(req.profileId, course.orgId);
      const reach = reaching.find((r) => r.course.id === course.id);
      if (!reach) return reply.status(403).send({ error: "This course isn't assigned or available to you" });

      const item = await toLearningItem(req.profileId, reach);
      if (item.missingPrerequisites.length > 0) {
        return reply.status(409).send({
          error: `Complete the prerequisite course(s) first: ${item.missingPrerequisites.join(", ")}`,
        });
      }

      const validUntil = await recordCompletion(req.profileId, course, reach);
      return { ok: true, validUntil: validUntil?.toISOString() ?? null };
    },
  );

  // Take a course out of deployment, or put it back. Out of deployment it reaches nobody
  // and leaves the library, but every placement is kept — this is the "roll it back, revise
  // it, publish the next edition" step, not an unplacement.
  app.post<{ Params: { code: string } }>(
    "/courses/:code/withdraw",
    { preHandler: app.authenticate },
    async (req, reply) => {
      const { withdrawn } = z.object({ withdrawn: z.boolean() }).parse(req.body);
      const course = await courseByCode(req.params.code);
      if (!course) return reply.status(404).send({ error: "Course not found" });
      if (!(await canManageCourse(req.profileId, course))) {
        return reply.status(403).send({
          error: "Only this course's editors or the owners of its branch can take it out of deployment",
        });
      }
      await db.course.update({
        where: { id: course.id },
        data: { withdrawn, withdrawnAt: withdrawn ? new Date() : null },
      });
      await audit(course.orgId, withdrawn ? "course.withdraw" : "course.redeploy", {
        actorProfileId: req.profileId,
        ip: req.ip,
        detail: { code: course.code, version: course.version },
      });
      broadcast(course.orgId, "courses");
      return { ok: true, withdrawn };
    },
  );

  // Modify a course — metadata and/or content. A content change publishes the next edition:
  // it bumps the version (v1.0 → v2.0), returns the course to deployment, and — when the
  // reset flag is set — expires old completions (structure.md §5.7).
  app.patch<{ Params: { code: string } }>(
    "/courses/:code",
    { preHandler: app.authenticate },
    async (req, reply) => {
      const body = updateCourseSchema.parse(req.body);
      const course = await courseByCode(req.params.code);
      if (!course) return reply.status(404).send({ error: "Course not found" });
      // The course's own editors, OR the owners governing its home branch — the branch
      // manager and the levels above them, who answer for what the branch publishes.
      const access = await adminLevel(req.profileId, course.id, course.createdByProfileId);
      if (access?.level !== "EDIT" && !(await canManageCourse(req.profileId, course))) {
        return reply.status(403).send({ error: "Edit access to this course is required" });
      }

      const previousRef = course.storageRef as unknown as {
        adapter?: string;
        fileId?: string;
        objectKey?: string;
      };
      let ref = course.storageRef as unknown as StorageRef;
      let contentChanged = false;
      let source = course.source;
      // Set when a new edition replaces the content with an object in the org's storage.
      let newObjectId: string | null = null;
      // Replacing an upload with a Studio document (or the reverse) moves the course
      // between the plan's two allowances — charge the bucket it lands in.
      if (body.exam) {
        if (course.kind !== "EXAM") {
          return reply.status(400).send({ error: "This course is not an exam" });
        }
        const problems = examProblems(body.exam);
        if (problems.length > 0) return reply.status(400).send({ error: problems[0] });
        if (source !== "STUDIO") await assertContentQuota(course.orgId, "STUDIO");
        ref = await storage.saveExam(sanitizeExam(body.exam), body.theme);
        source = "STUDIO";
        contentChanged = true;
      } else if (body.blocks) {
        if (source !== "STUDIO") await assertContentQuota(course.orgId, "STUDIO");
        ref = await storage.saveAuthored(sanitizeBlocks(body.blocks), body.theme);
        source = "STUDIO";
        contentChanged = true;
      } else if (body.url) {
        if (source !== "UPLOAD") await assertContentQuota(course.orgId, "UPLOAD");
        ref = await storage.saveLink(body.url);
        source = "UPLOAD";
        contentChanged = true;
      } else if (body.storageObjectId) {
        if (source !== "UPLOAD") await assertContentQuota(course.orgId, "UPLOAD");
        const object = await db.storageObject.findUnique({ where: { id: body.storageObjectId } });
        if (!object || object.orgId !== course.orgId) {
          return reply.status(404).send({ error: "That upload was not found in your storage" });
        }
        if (object.courseId && object.courseId !== course.id) {
          return reply.status(409).send({ error: "That upload is already attached to a document" });
        }
        ref = await storage.saveObject(object.id, object.objectKey);
        newObjectId = object.id;
        source = "UPLOAD";
        contentChanged = true;
      } else if (body.fileBase64 && body.filename && body.mime) {
        if (source !== "UPLOAD") await assertContentQuota(course.orgId, "UPLOAD");
        ref = await storage.saveInline(course.orgId, body.filename, body.mime, body.fileBase64);
        source = "UPLOAD";
        contentChanged = true;
      }

      // Republishing is deliberate: a live course must be taken out of deployment first,
      // so nobody is ever mid-read (or mid-exam) on an edition that is being rewritten.
      if (contentChanged && !course.withdrawn) {
        return reply.status(409).send({
          error:
            "Take this course out of deployment before publishing a new edition — its readers are still on the current one",
        });
      }

      // Prerequisites are replaced wholesale when the caller sends the set. Sending [] is
      // how they are cleared, so `undefined` (absent) has to mean "leave them alone".
      let prereqIds: string[] | null = null;
      if (body.prerequisiteCodes) {
        const wanted = body.prerequisiteCodes.filter((c) => c.trim() && c.trim() !== course.code);
        const found = await db.course.findMany({
          where: { code: { in: wanted }, orgId: course.orgId },
        });
        if (found.length !== wanted.length) {
          return reply.status(400).send({ error: "Unknown prerequisite course code" });
        }
        // A document cannot require itself, directly or through another document that
        // requires it — that would lock every reader out of both.
        const circular = await db.coursePrerequisite.findMany({
          where: { courseId: { in: found.map((f) => f.id) }, requiresCourseId: course.id },
        });
        if (circular.length > 0) {
          return reply.status(409).send({
            error: "That prerequisite already depends on this document — the two would block each other",
          });
        }
        prereqIds = found.map((f) => f.id);
      }

      const updated = await db.course.update({
        where: { id: course.id },
        data: {
          title: body.title ?? course.title,
          ...(body.description !== undefined ? { description: body.description } : {}),
          ...(body.scope !== undefined ? { scope: body.scope } : {}),
          ...(body.category !== undefined
            ? { category: body.category?.trim() ? body.category.trim() : null }
            : {}),
          ...(body.classification !== undefined ? { classification: body.classification } : {}),
          ...(body.inLibrary !== undefined ? { inLibrary: body.inLibrary } : {}),
          ...(body.resetsCompletionOnUpdate !== undefined
            ? { resetsCompletionOnUpdate: body.resetsCompletionOnUpdate }
            : {}),
          ...(body.allowDownload !== undefined ? { allowDownload: body.allowDownload } : {}),
          ...(body.deadlineDays !== undefined ? { deadlineDays: body.deadlineDays } : {}),
          ...(body.retakeEveryNDays !== undefined
            ? { retakeEveryNDays: body.retakeEveryNDays }
            : {}),
          storageRef: ref as object,
          source,
          // A new edition goes straight back into deployment on the placements it kept.
          ...(contentChanged
            ? { version: { increment: 1 }, withdrawn: false, withdrawnAt: null }
            : {}),
        },
      });

      if (prereqIds) {
        await db.$transaction([
          db.coursePrerequisite.deleteMany({ where: { courseId: course.id } }),
          ...prereqIds.map((requiresCourseId) =>
            db.coursePrerequisite.create({ data: { courseId: course.id, requiresCourseId } }),
          ),
        ]);
      }

      // A new edition orphans whatever the old one pointed at. Release it through the
      // port so an inline row is dropped and a remote object is queued for deletion —
      // otherwise the organization keeps paying to store every superseded edition.
      if (contentChanged && previousRef.adapter) {
        const ops = deletionOpsFor(course.orgId, previousRef);
        if (ops.length > 0) {
          await db.$transaction(ops);
          drainSoon();
        }
      }
      if (newObjectId) {
        await db.storageObject.update({
          where: { id: newObjectId },
          data: { courseId: course.id },
        });
      }

      // The edition log gains a row for every content republish — including the note the
      // author wrote about what changed. A metadata-only edit is NOT an edition: nothing
      // reached the reader differently, so nothing is recorded against a version.
      if (contentChanged) {
        await recordEdition(course.id, updated.version, {
          note: body.versionNote,
          source,
          resetCompletions: updated.resetsCompletionOnUpdate,
          publishedByProfileId: req.profileId,
        });
      }

      if (contentChanged && updated.resetsCompletionOnUpdate) {
        const outdated = await db.completionRecord.findMany({
          where: { courseId: course.id, status: "COMPLETED", courseVersion: { lt: updated.version } },
        });
        for (const rec of outdated) {
          await db.completionRecord.update({
            where: { id: rec.id },
            data: { status: "EXPIRED" },
          });
          await notify(rec.profileId, course.orgId, "course_updated_redo", {
            code: course.code,
            title: updated.title,
            note: body.versionNote?.trim() || null,
          });
        }
      }
      broadcast(course.orgId, "courses");
      return { ok: true, version: updated.version };
    },
  );

  // Archive / unarchive a course — archived courses stay in the library (badged) and keep
  // their history, but new placements are refused so they reach nobody new.
  app.post<{ Params: { code: string } }>(
    "/courses/:code/archive",
    { preHandler: app.authenticate },
    async (req, reply) => {
      const { archived } = z.object({ archived: z.boolean() }).parse(req.body);
      const course = await courseByCode(req.params.code);
      if (!course) return reply.status(404).send({ error: "Course not found" });
      if (!(await canManageCourse(req.profileId, course))) {
        return reply
          .status(403)
          .send({ error: "Only the course's editors or its branch owners can archive it" });
      }
      await db.course.update({ where: { id: course.id }, data: { archived } });
      broadcast(course.orgId, "courses");
      return { ok: true, archived };
    },
  );

  // Course admin page: usage everywhere + separate 2-layer access tree (docs/structure.md §3.3)
  app.get<{ Params: { code: string } }>(
    "/courses/:code/admin",
    { preHandler: app.authenticate },
    async (req, reply): Promise<CourseAdminView> => {
      const course = await courseByCode(req.params.code);
      if (!course) return reply.status(404).send({ error: "Course not found" });
      const access = await adminLevel(req.profileId, course.id, course.createdByProfileId);
      if (!access) return reply.status(403).send({ error: "No access to this course's admin page" });

      const usage = await db.coursePlacement.findMany({ where: { courseId: course.id } });
      const nodes = await db.roleNode.findMany({
        where: { id: { in: usage.map((u) => u.roleNodeId) } },
      });
      const grants = await db.courseAdminAccess.findMany({ where: { courseId: course.id } });
      const profiles = await db.profile.findMany({
        where: { id: { in: grants.map((g) => g.profileId) } },
      });
      const prereqs = await db.coursePrerequisite.findMany({
        where: { courseId: course.id },
        include: { requires: true },
      });
      const completions = await db.completionRecord.findMany({ where: { courseId: course.id } });

      return {
        course: {
          code: course.code,
          title: course.title,
          kind: course.kind,
          version: course.version,
          deadlineDays: course.deadlineDays,
          retakeEveryNDays: course.retakeEveryNDays,
          prerequisiteCodes: prereqs.map((p) => p.requires.code),
          createdAt: course.createdAt.toISOString(),
          resetsCompletionOnUpdate: course.resetsCompletionOnUpdate,
        },
        usage: usage.map((u) => {
          const n = nodes.find((x) => x.id === u.roleNodeId)!;
          return {
            roleName: n.name,
            roleNumber: n.roleNumber,
            mandatory: u.mandatory,
            inheritToDescendants: u.inheritToDescendants,
          };
        }),
        access: grants.map((g) => {
          const p = profiles.find((x) => x.id === g.profileId)!;
          return { username: p.username, displayName: p.displayName, level: g.level, canGrant: g.canGrant };
        }),
        myLevel: access.level,
        completions: {
          total: completions.length,
          completed: completions.filter((c) => c.status === "COMPLETED").length,
          expired: completions.filter((c) => c.status === "EXPIRED").length,
        },
      };
    },
  );

  // Courses placed on a node — for the node's managers (feeds the tree UI)
  app.get<{ Params: { roleId: string } }>(
    "/roles/:roleId/courses",
    { preHandler: app.authenticate },
    async (req, reply) => {
      const node = await db.roleNode.findUnique({
        where: { id: req.params.roleId },
        include: { org: true },
      });
      if (!node || node.org.deletedAt) return reply.status(404).send({ error: "Role not found" });
      const placements = await actorPlacements(req.profileId, node.orgId);
      if (!can(placements, "create_content", toRoleRef(node))) {
        return reply.status(403).send({ error: "You don't manage content in this layer" });
      }
      const rows = await db.coursePlacement.findMany({
        where: { roleNodeId: node.id },
        include: { course: true },
        orderBy: { createdAt: "asc" },
      });
      return {
        courses: await Promise.all(
          rows.map(async (r) => {
            const manage = await canManageCourse(req.profileId, r.course);
            return {
              code: r.course.code,
              title: r.course.title,
              kind: r.course.kind,
              description: r.course.description,
              classification: r.course.classification,
              inLibrary: r.course.inLibrary,
              archived: r.course.archived,
              // What the branch panel needs to offer "revise this": which edition is live,
              // whether it is currently out of deployment, and whether it is ours to edit
              // in the Studio at all (an uploaded file is replaced, not edited).
              version: r.course.version,
              withdrawn: r.course.withdrawn,
              source: r.course.source,
              allowDownload: r.course.allowDownload,
              mandatory: r.mandatory,
              inheritToDescendants: r.inheritToDescendants,
              deadlineDays: r.deadlineDays ?? r.course.deadlineDays,
              retakeEveryNDays: r.retakeEveryNDays ?? r.course.retakeEveryNDays,
              // The properties editor opens on these, so it never has to guess what it
              // is editing: the course's OWN defaults, not the placement's overrides.
              courseDeadlineDays: r.course.deadlineDays,
              courseRetakeEveryNDays: r.course.retakeEveryNDays,
              scope: r.course.scope,
              category: r.course.category,
              resetsCompletionOnUpdate: r.course.resetsCompletionOnUpdate,
              supersededByCourseId: r.course.supersededByCourseId,
              canManage: manage,
              canDelete: manage,
            };
          }),
        ),
      };
    },
  );

  // Remove a placement from one branch — completion records are kept (history rule D4-3)
  app.delete<{ Params: { code: string; roleNodeId: string } }>(
    "/courses/:code/placements/:roleNodeId",
    { preHandler: app.authenticate },
    async (req, reply) => {
      const course = await courseByCode(req.params.code);
      if (!course) return reply.status(404).send({ error: "Course not found" });
      const node = await db.roleNode.findUnique({ where: { id: req.params.roleNodeId } });
      if (!node || node.orgId !== course.orgId) {
        return reply.status(404).send({ error: "Placement not found" });
      }
      const placements = await actorPlacements(req.profileId, course.orgId);
      if (!can(placements, "create_content", toRoleRef(node))) {
        return reply.status(403).send({ error: "You don't manage content in that layer" });
      }
      await db.coursePlacement.deleteMany({
        where: { courseId: course.id, roleNodeId: node.id },
      });
      broadcast(course.orgId, "courses");
      return { ok: true };
    },
  );

  // Delete a course everywhere — the course's editors OR the owners of its home branch
  // (and above) may delete it. Completion records survive (keyed by the never-reused
  // course code); prerequisite links pointing at it are released.
  app.delete<{ Params: { code: string } }>(
    "/courses/:code",
    { preHandler: app.authenticate },
    async (req, reply) => {
      const course = await courseByCode(req.params.code);
      if (!course) return reply.status(404).send({ error: "Course not found" });
      if (!(await canManageCourse(req.profileId, course))) {
        return reply
          .status(403)
          .send({ error: "Only the course's editors or its branch owners can delete it" });
      }

      const releasedPrereqs = await db.coursePrerequisite.count({
        where: { requiresCourseId: course.id },
      });
      const ref = course.storageRef as unknown as {
        adapter?: string;
        fileId?: string;
        objectKey?: string;
      };
      await db.$transaction([
        db.coursePrerequisite.deleteMany({
          where: { OR: [{ courseId: course.id }, { requiresCourseId: course.id }] },
        }),
        db.coursePlacement.deleteMany({ where: { courseId: course.id } }),
        db.courseAdminAccess.deleteMany({ where: { courseId: course.id } }),
        db.courseReview.deleteMany({ where: { courseId: course.id } }),
        // Sittings of a deleted exam go with it; the completion records they produced
        // survive, keyed by the never-reused course code.
        db.examAttempt.deleteMany({ where: { courseId: course.id } }),
        // Releases whatever the ref holds: a Postgres row for `inline`, a queued remote
        // delete for `s3` — the remote call cannot run inside this transaction (§9.10).
        ...deletionOpsFor(course.orgId, ref),
        db.course.delete({ where: { id: course.id } }),
      ]);
      drainSoon();
      await audit(course.orgId, "course.delete", {
        actorProfileId: req.profileId,
        ip: req.ip,
        detail: { code: course.code, title: course.title },
      });
      broadcast(course.orgId, "courses");
      return { ok: true, releasedPrerequisiteLinks: releasedPrereqs };
    },
  );

  // The organization library: every member can browse courses published to it.
  // Each entry carries the signals the detail view needs — description, completions,
  // and the branches currently using it.
  app.get<{ Params: { id: string }; Querystring: { q?: string } }>(
    "/orgs/:id/library",
    { preHandler: app.authenticate },
    async (req, reply) => {
      const member = await db.membership.findUnique({
        where: { profileId_orgId: { profileId: req.profileId, orgId: req.params.id } },
      });
      if (!member) return reply.status(404).send({ error: "Organization not found" });

      const q = (req.query.q ?? "").trim().toLowerCase();
      const list = await db.course.findMany({
        // Out of deployment = off the shelves until its next edition is published.
        where: { orgId: req.params.id, inLibrary: true, withdrawn: false },
        include: { placements: true },
        orderBy: { createdAt: "desc" },
      });
      const filtered = q
        ? list.filter(
            (c) =>
              c.title.toLowerCase().includes(q) ||
              (c.description ?? "").toLowerCase().includes(q) ||
              (c.category ?? "").toLowerCase().includes(q) ||
              c.code.includes(q),
          )
        : list;

      const nodeIds = [...new Set(filtered.flatMap((c) => [c.uploaderRoleNodeId, ...c.placements.map((p) => p.roleNodeId)]))];
      const nodes = await db.roleNode.findMany({ where: { id: { in: nodeIds } } });

      // ── Where the reader already stands ────────────────────────────────────
      // The library used to hand everyone the same "request this for my branch" form,
      // including for courses already sitting in their own My Learning. Working that out
      // here — once, over the placements we already loaded — is what lets a card open the
      // document instead of asking permission for something the reader already has.
      const myPlacements = await db.placement.findMany({
        where: { membership: { profileId: req.profileId, orgId: req.params.id } },
        include: { roleNode: true },
      });
      const allOrgNodes = await db.roleNode.findMany({ where: { orgId: req.params.id } });
      const nodeById = new Map(allOrgNodes.map((n) => [n.id, n]));
      /** Which of my branches does this course reach, and through which placement? */
      const reachFor = (course: (typeof filtered)[number]) => {
        const via = new Set<string>();
        const mineReached = new Set<string>();
        for (const cp of course.placements) {
          const cpNode = nodeById.get(cp.roleNodeId);
          if (!cpNode) continue;
          for (const mine of myPlacements) {
            const reaches =
              cpNode.path === mine.roleNode.path ||
              (cp.inheritToDescendants && isSelfOrAncestor(cpNode.path, mine.roleNode.path));
            if (!reaches) continue;
            via.add(cpNode.name);
            mineReached.add(mine.roleNodeId);
          }
        }
        return { via: [...via], mineReached };
      };
      const myRecords = await db.completionRecord.findMany({
        where: { profileId: req.profileId, courseId: { in: filtered.map((c) => c.id) } },
      });
      const supersessors = await db.course.findMany({
        where: {
          id: {
            in: filtered
              .map((c) => c.supersededByCourseId)
              .filter((id): id is string => Boolean(id)),
          },
        },
        select: { id: true, code: true },
      });

      const completions = await db.completionRecord.groupBy({
        by: ["courseId"],
        where: { courseId: { in: filtered.map((c) => c.id) }, status: "COMPLETED" },
        _count: true,
      });
      const ratings = await db.courseReview.groupBy({
        by: ["courseId"],
        where: { courseId: { in: filtered.map((c) => c.id) }, rating: { not: null } },
        _avg: { rating: true },
        _count: { rating: true },
      });

      return {
        courses: filtered.map((c) => {
          const rating = ratings.find((r) => r.courseId === c.id);
          const { via, mineReached } = reachFor(c);
          const record = myRecords.find((r) => r.courseId === c.id);
          return {
            code: c.code,
            title: c.title,
            kind: c.kind,
            description: c.description,
            category: c.category,
            classification: c.classification,
            archived: c.archived,
            version: c.version,
            uploaderRoleName: nodes.find((n) => n.id === c.uploaderRoleNodeId)?.name ?? "—",
            createdAt: c.createdAt.toISOString(),
            completedCount: completions.find((x) => x.courseId === c.id)?._count ?? 0,
            usedIn: c.placements
              .map((p) => nodes.find((n) => n.id === p.roleNodeId)?.name)
              .filter((n): n is string => Boolean(n)),
            usedInNodeIds: c.placements.map((p) => p.roleNodeId),
            avgRating: rating?._avg.rating ? Math.round(rating._avg.rating * 10) / 10 : null,
            ratingCount: rating?._count.rating ?? 0,
            inMySpace: via.length > 0,
            reachesViaRoleNames: via,
            myStatus: via.length > 0 ? (record?.status ?? "AVAILABLE") : null,
            // Only the branches it does NOT already reach are worth requesting it for —
            // asking for something a branch already has is exactly the pointless step the
            // reader was complaining about.
            requestableRoles: myPlacements
              .filter((p) => !mineReached.has(p.roleNodeId))
              .map((p) => ({
                roleNodeId: p.roleNodeId,
                roleName: p.roleNode.name,
                kind: p.kind as "OWNER" | "MEMBER",
              })),
            supersededByCode:
              supersessors.find((s) => s.id === c.supersededByCourseId)?.code ?? null,
          };
        }),
      };
    },
  );

  // Category suggestion: matches the new course's words against existing shelves so
  // similar content lands on the same shelf ("AI AWS doc" → suggests "AI"). The
  // uploader can always override.
  app.post<{ Params: { id: string } }>(
    "/orgs/:id/library/suggest-category",
    { preHandler: app.authenticate },
    async (req, reply) => {
      const member = await db.membership.findUnique({
        where: { profileId_orgId: { profileId: req.profileId, orgId: req.params.id } },
      });
      if (!member) return reply.status(404).send({ error: "Organization not found" });
      const { title, description } = z
        .object({ title: z.string().default(""), description: z.string().default("") })
        .parse(req.body ?? {});

      const courses = await db.course.findMany({
        where: { orgId: req.params.id, category: { not: null } },
        select: { category: true, title: true, description: true },
      });
      const categories = [...new Set(courses.map((c) => c.category!))];

      const tokenize = (s: string) =>
        new Set(
          s
            .toLowerCase()
            .split(/[^a-z0-9+#]+/)
            .filter((w) => w.length > 1),
        );
      const inputTokens = tokenize(`${title} ${description}`);

      // Score each shelf: direct name mention weighs most, then word overlap with the
      // shelf's existing content
      let best: { category: string; score: number } | null = null;
      for (const category of categories) {
        let score = 0;
        for (const t of tokenize(category)) {
          if (inputTokens.has(t)) score += 5;
        }
        for (const c of courses.filter((x) => x.category === category)) {
          for (const t of tokenize(`${c.title} ${c.description ?? ""}`)) {
            if (inputTokens.has(t)) score += 1;
          }
        }
        if (score > 0 && (!best || score > best.score)) best = { category, score };
      }
      return { suggestion: best?.category ?? null, categories };
    },
  );

  // Per-course compliance across EVERY branch it reaches — course managers and the owners
  // of any branch it's placed on (or above). Mandatory courses report compliant vs
  // non-compliant; opt-in courses report who completed. Not visible to plain members.
  app.get<{ Params: { code: string } }>(
    "/courses/:code/compliance",
    { preHandler: app.authenticate },
    async (req, reply): Promise<CourseComplianceView> => {
      const course = await courseByCode(req.params.code);
      if (!course) return reply.status(404).send({ error: "Course not found" });
      const member = await db.membership.findUnique({
        where: { profileId_orgId: { profileId: req.profileId, orgId: course.orgId } },
      });
      if (!member) return reply.status(404).send({ error: "Course not found" });

      const placements = await db.coursePlacement.findMany({ where: { courseId: course.id } });
      const allNodes = await db.roleNode.findMany({ where: { orgId: course.orgId } });
      const actor = await actorPlacements(req.profileId, course.orgId);

      // Access: the course's managers, OR an owner governing any branch it's placed on
      const manages = await canManageCourse(req.profileId, course);
      const governsAPlacement = placements.some((cp) => {
        const n = allNodes.find((x) => x.id === cp.roleNodeId);
        return n && can(actor, "add_people", toRoleRef(n));
      });
      if (!manages && !governsAPlacement) {
        return reply
          .status(403)
          .send({ error: "Only this course's managers can see its compliance" });
      }

      // Audience = union of each placement's occupants (subtree occupants when inheriting)
      const occupants = await db.placement.findMany({
        where: { roleNode: { orgId: course.orgId } },
        include: { membership: { include: { profile: true } }, roleNode: true },
      });
      const mandatory = placements.some((cp) => cp.mandatory);
      const audience = new Map<string, { profile: (typeof occupants)[number]["membership"]["profile"]; viaRoleName: string }>();
      for (const cp of placements) {
        const cpNode = allNodes.find((n) => n.id === cp.roleNodeId);
        if (!cpNode) continue;
        for (const o of occupants) {
          const reaches = cp.inheritToDescendants
            ? isSelfOrAncestor(cpNode.path, o.roleNode.path)
            : o.roleNodeId === cp.roleNodeId;
          if (reaches && !audience.has(o.membership.profileId)) {
            audience.set(o.membership.profileId, {
              profile: o.membership.profile,
              viaRoleName: cpNode.name,
            });
          }
        }
      }

      const records = await db.completionRecord.findMany({ where: { courseId: course.id } });
      const compliantMembers: CourseComplianceView["compliantMembers"] = [];
      const nonCompliantMembers: CourseComplianceView["nonCompliantMembers"] = [];
      for (const [profileId, { profile, viaRoleName }] of audience) {
        const rec = records.find((r) => r.profileId === profileId);
        const done =
          rec?.status === "COMPLETED" && (!rec.validUntil || rec.validUntil > new Date());
        if (done) {
          compliantMembers.push({
            profileId,
            displayName: profile.displayName,
            username: profile.username,
            viaRoleName,
            completedAt: rec?.completedAt?.toISOString() ?? null,
          });
        } else {
          nonCompliantMembers.push({
            profileId,
            displayName: profile.displayName,
            username: profile.username,
            viaRoleName,
            status: rec?.status ?? (mandatory ? "ASSIGNED" : "AVAILABLE"),
            overdue: false,
          });
        }
      }

      return {
        code: course.code,
        title: course.title,
        mandatory,
        total: audience.size,
        compliant: compliantMembers.length,
        usedIn: [
          ...new Set(
            placements
              .map((cp) => allNodes.find((n) => n.id === cp.roleNodeId)?.name)
              .filter((n): n is string => Boolean(n)),
          ),
        ],
        compliantMembers,
        nonCompliantMembers,
      };
    },
  );

  // Reviews: visible to every member on the library detail view
  app.get<{ Params: { code: string } }>(
    "/courses/:code/reviews",
    { preHandler: app.authenticate },
    async (req, reply) => {
      const course = await courseByCode(req.params.code);
      if (!course) return reply.status(404).send({ error: "Course not found" });
      const member = await db.membership.findUnique({
        where: { profileId_orgId: { profileId: req.profileId, orgId: course.orgId } },
      });
      if (!member) return reply.status(404).send({ error: "Course not found" });

      const rows = await db.courseReview.findMany({
        where: { courseId: course.id },
        orderBy: { updatedAt: "desc" },
        take: 50,
      });
      const profiles = await db.profile.findMany({
        where: { id: { in: rows.map((r) => r.profileId) } },
      });
      const rated = rows.filter((r) => r.rating !== null);
      return {
        reviews: rows.map((r) => {
          const p = profiles.find((x) => x.id === r.profileId);
          return {
            displayName: p?.displayName ?? "Former member",
            username: p?.username ?? "unknown",
            rating: r.rating,
            comment: r.comment,
            updatedAt: r.updatedAt.toISOString(),
          };
        }),
        avgRating: rated.length
          ? Math.round((rated.reduce((s, r) => s + r.rating!, 0) / rated.length) * 10) / 10
          : null,
        count: rated.length,
        mine: rows.find((r) => r.profileId === req.profileId)
          ? {
              rating: rows.find((r) => r.profileId === req.profileId)!.rating,
              comment: rows.find((r) => r.profileId === req.profileId)!.comment,
            }
          : null,
      };
    },
  );

  // Rate & comment — only after completing the course; rating stays optional
  app.post<{ Params: { code: string } }>(
    "/courses/:code/review",
    { preHandler: app.authenticate },
    async (req, reply) => {
      const body = reviewCourseSchema.parse(req.body);
      const course = await courseByCode(req.params.code);
      if (!course) return reply.status(404).send({ error: "Course not found" });
      const completed = await db.completionRecord.findFirst({
        where: { courseId: course.id, profileId: req.profileId, status: "COMPLETED" },
      });
      if (!completed) {
        return reply
          .status(403)
          .send({ error: "Complete the course before rating or reviewing it" });
      }
      await db.courseReview.upsert({
        where: { courseId_profileId: { courseId: course.id, profileId: req.profileId } },
        create: {
          courseId: course.id,
          profileId: req.profileId,
          rating: body.rating ?? null,
          comment: body.comment?.trim() ? body.comment.trim() : null,
        },
        update: {
          rating: body.rating ?? null,
          comment: body.comment?.trim() ? body.comment.trim() : null,
        },
      });
      broadcast(course.orgId, "courses");
      return { ok: true };
    },
  );

  // Grant admin-page access (2-layer: only creator or canGrant holders may grant)
  app.post<{ Params: { code: string } }>(
    "/courses/:code/admin/access",
    { preHandler: app.authenticate },
    async (req, reply) => {
      const body = grantAdminAccessSchema.parse(req.body);
      const course = await courseByCode(req.params.code);
      if (!course) return reply.status(404).send({ error: "Course not found" });
      const access = await adminLevel(req.profileId, course.id, course.createdByProfileId);
      if (!access?.canGrant) {
        return reply.status(403).send({ error: "You cannot grant access to this page" });
      }
      const target = await db.profile.findUnique({ where: { username: body.username.toLowerCase() } });
      if (!target) return reply.status(404).send({ error: "No profile with this username" });
      // Layer 2 cannot mint further granters — keeps the tree at two layers
      const canGrant = req.profileId === course.createdByProfileId ? body.canGrant : false;
      await db.courseAdminAccess.upsert({
        where: { courseId_profileId: { courseId: course.id, profileId: target.id } },
        create: {
          courseId: course.id,
          profileId: target.id,
          level: body.level,
          canGrant,
          grantedBy: req.profileId,
        },
        update: { level: body.level, canGrant },
      });
      return { ok: true };
    },
  );
}
