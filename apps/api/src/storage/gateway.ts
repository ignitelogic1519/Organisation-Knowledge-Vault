import { Readable, Transform } from "node:stream";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { OrgStorage } from "@prisma/client";
import { GATEWAY_CHUNK_BYTES, MAX_OBJECT_BYTES } from "@vault/shared";
import { db } from "../db.js";
import { DriveError, putChunk, querySession } from "./google.js";
import { driveForOrg, outcomeFor, sessionUriOf } from "./gdrive-store.js";
import { gatewayIsExternal } from "./gateway-url.js";
import { readTicket, ticketFrom, type TicketClaims } from "./tickets.js";

// The streaming gateway (docs/structure.md §9.16).
//
// Google Drive has no signed link for a single file, and its upload endpoint cannot be
// driven from a browser, so for a Drive organization every document byte crosses a
// server we run. This is that server's whole job:
//
//   GET/HEAD /stream/r/:objectId    ranged reads of the revision we wrote
//   PUT      /stream/u/:sessionId   one upload chunk, piped straight into Google
//
// It decides nothing. Each request carries a ticket the API signed after its own
// permission check, naming exactly one object or upload. The gateway checks the
// signature, the expiry and the organization's ticket epoch, and carries bytes.
//
// It never buffers a file: request and response bodies are piped, so memory per stream
// is a socket buffer however large the document. And it keeps a monthly byte budget.
// On a free host that budget is what keeps a busy month from costing money — or, on
// Render's free plan, from switching the whole product off (5 GB a month, then every
// service stops until the 1st). At the limit it pauses new transfers; nothing else in
// the product is affected.

const SAFE_INLINE = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "audio/mpeg",
  "audio/mp4",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "video/mp4",
  "video/webm",
  "video/ogg",
  "text/plain",
]);

const GiB = 1024 ** 3;

// ── The monthly budget ───────────────────────────────────────────────────────

function numberEnv(name: string): number | null {
  const raw = process.env[name]?.trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Platform-wide bytes per month. Inside the API on a free host the default is 2 GiB —
 * well inside Render's 5 GB, leaving the rest for the API's own traffic. A gateway on
 * its own machine (STREAM_GATEWAY_URL) defaults to 9.5 TiB, inside Oracle Cloud's free
 * 10 TB.
 */
export function monthlyLimitBytes(): number {
  return numberEnv("STREAM_MONTHLY_LIMIT_BYTES") ?? (gatewayIsExternal() ? 9.5 * 1024 * GiB : 2 * GiB);
}

/** Each organization's share, so one organization can never spend everyone else's. */
export function orgMonthlyLimitBytes(): number {
  return numberEnv("STREAM_ORG_MONTHLY_LIMIT_BYTES") ?? monthlyLimitBytes();
}

export function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export async function streamUsage(orgId: string): Promise<{ month: string; bytes: number; limitBytes: number }> {
  const month = currentMonth();
  const row = await db.streamUsage.findUnique({ where: { month_orgId: { month, orgId } } });
  return { month, bytes: Number(row?.bytes ?? 0), limitBytes: orgMonthlyLimitBytes() };
}

async function budgetRefusal(orgId: string): Promise<string | null> {
  const month = currentMonth();
  const rows = await db.streamUsage.findMany({ where: { month, orgId: { in: ["*", orgId] } } });
  const total = Number(rows.find((r) => r.orgId === "*")?.bytes ?? 0);
  const mine = Number(rows.find((r) => r.orgId === orgId)?.bytes ?? 0);
  if (total >= monthlyLimitBytes()) {
    return "Streaming from Google Drive has reached this month's free allowance, so it is paused until the 1st. Everything else keeps working.";
  }
  if (mine >= orgMonthlyLimitBytes()) {
    return "This organization has used its streaming allowance for the month, so opening and uploading Google Drive documents is paused until the 1st.";
  }
  return null;
}

async function recordBytes(orgId: string, bytes: number): Promise<void> {
  if (bytes <= 0) return;
  const month = currentMonth();
  for (const who of ["*", orgId]) {
    await db.streamUsage.upsert({
      where: { month_orgId: { month, orgId: who } },
      create: { month, orgId: who, bytes: BigInt(bytes) },
      update: { bytes: { increment: BigInt(bytes) } },
    });
  }
}

/** Counts what actually flowed, so the budget records bytes sent, not bytes promised. */
function counter(onDone: (bytes: number) => void): Transform {
  let bytes = 0;
  let reported = false;
  const report = () => {
    if (reported) return;
    reported = true;
    onDone(bytes);
  };
  const t = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      bytes += chunk.length;
      cb(null, chunk);
    },
  });
  t.on("end", report);
  t.on("close", report);
  t.on("error", report);
  return t;
}

// ── Ticket epochs: the kill switch ───────────────────────────────────────────

async function storeFor(orgId: string): Promise<OrgStorage | null> {
  return db.orgStorage.findUnique({ where: { orgId } });
}

/** A ticket issued before the organization's last revocation or reconnection is dead. */
function epochOk(claims: TicketClaims, store: OrgStorage): boolean {
  return claims.g === store.ticketEpoch;
}

// ── Responses ────────────────────────────────────────────────────────────────

function secureHeaders(reply: FastifyReply): FastifyReply {
  return reply
    .header("x-content-type-options", "nosniff")
    .header("content-security-policy", "default-src 'none'; sandbox")
    .header("referrer-policy", "no-referrer")
    .header("cache-control", "private, no-store")
    .header("cross-origin-resource-policy", "cross-origin");
}

function fail(reply: FastifyReply, status: number, error: string, extra: Record<string, unknown> = {}) {
  return secureHeaders(reply).status(status).send({ error, ...extra });
}

function driveFailure(reply: FastifyReply, err: unknown) {
  if (err instanceof DriveError) {
    if (err.failure === "rate" || err.failure === "download-quota") {
      return fail(reply.header("retry-after", "10"), 503, err.message);
    }
    if (err.failure === "not-found") return fail(reply, 404, "This document is missing from the Google Drive.");
    if (err.failure === "auth" || err.failure === "permission" || err.failure === "quota") {
      return fail(reply, 409, `This content is unreachable until the organization reconnects its storage (${err.message})`);
    }
    return fail(reply, 502, err.message);
  }
  return fail(reply, 502, err instanceof Error ? err.message : "The storage could not be reached");
}

/** Feed a failure into the organization's health, so a revoked grant degrades at once. */
async function noteFailure(store: OrgStorage, err: unknown): Promise<void> {
  if (!(err instanceof DriveError) || !err.definitive) return;
  const { recordHealth } = await import("./org-storage.js");
  const result = await recordHealth(store, outcomeFor(err));
  if (result.changed) {
    const { runHealthChecks } = await import("./jobs.js");
    // Let the regular sweep send the owners' message for this organization.
    void runHealthChecks([store.orgId]).catch(() => {});
  }
}

/** Parse a single `bytes=` range against a known length. Multiple ranges are not served. */
export function parseRange(
  header: string | undefined,
  total: number,
): { start: number; end: number } | "invalid" | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return "invalid";
  const [, a, b] = m;
  if (a === "" && b === "") return "invalid";
  let start: number;
  let end: number;
  if (a === "") {
    // suffix: the last N bytes
    const n = Number(b);
    if (n === 0) return "invalid";
    start = Math.max(0, total - n);
    end = total - 1;
  } else {
    start = Number(a);
    end = b === "" ? total - 1 : Math.min(Number(b), total - 1);
  }
  if (start > end || start >= total) return "invalid";
  return { start, end };
}

/**
 * When an upstream ignores a Range request and sends the whole file, cut the requested
 * window out of it rather than sending the wrong bytes.
 */
function window(skip: number, take: number): Transform {
  let seen = 0;
  return new Transform({
    transform(chunk: Buffer, _enc, cb) {
      const from = Math.max(0, skip - seen);
      const to = Math.min(chunk.length, skip + take - seen);
      seen += chunk.length;
      cb(null, from < to ? chunk.subarray(from, to) : undefined);
    },
  });
}

// ── Routes ───────────────────────────────────────────────────────────────────

type ReadReq = FastifyRequest<{ Params: { objectId: string }; Querystring: { t?: string } }>;
type UploadReq = FastifyRequest<{ Params: { sessionId: string }; Querystring: { t?: string } }>;

export async function gatewayRoutes(app: FastifyInstance) {
  // Upload chunks arrive as raw bytes. Hand the stream through untouched — the route
  // pipes it to Google and checks its length itself — rather than buffering 8 MiB.
  app.addContentTypeParser("application/octet-stream", (_req, payload, done) => done(null, payload));

  // ── Read ────────────────────────────────────────────────────────────────
  const read = async (req: ReadReq, reply: FastifyReply) => {
    let claims: TicketClaims;
    try {
      claims = readTicket(ticketFrom(req.headers, req.query));
    } catch (err) {
      return fail(reply, 401, (err as Error).message);
    }
    if (claims.m !== "r" || claims.s !== req.params.objectId) {
      return fail(reply, 403, "This ticket is for a different document.");
    }
    const [object, store] = await Promise.all([
      db.storageObject.findUnique({ where: { id: req.params.objectId } }),
      storeFor(claims.o),
    ]);
    if (!object || object.orgId !== claims.o || !object.remoteId) {
      return fail(reply, 404, "This document is not in the organization's storage.");
    }
    if (!store || store.adapter !== "gdrive") return fail(reply, 409, "This organization has no Google Drive connected.");
    if (!epochOk(claims, store)) {
      return fail(reply, 401, "This ticket was revoked. Reopen the document.");
    }

    const total = object.cipherBytes ?? object.bytes;
    const range = parseRange(req.headers.range, total);
    if (range === "invalid") {
      return fail(reply.header("content-range", `bytes */${total}`), 416, "That byte range is not in this document.");
    }
    const start = range?.start ?? 0;
    const end = range?.end ?? total - 1;
    const length = end - start + 1;

    // ENCRYPTED objects are ciphertext for the browser to open; PLAIN ones are served
    // as themselves, inline only when the type cannot run script in anyone's origin.
    const inline = !object.encrypted && SAFE_INLINE.has(object.mime);
    const success = (r: FastifyReply) => {
      secureHeaders(r)
        .header("accept-ranges", "bytes")
        .header("content-type", inline ? object.mime : "application/octet-stream")
        .header("content-disposition", `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(object.filename)}"`)
        .header("content-length", String(length));
      if (range) r.header("content-range", `bytes ${start}-${end}/${total}`);
      return r.status(range ? 206 : 200);
    };
    if (req.method === "HEAD") return success(reply).send();

    const refusal = await budgetRefusal(claims.o);
    if (refusal) return fail(reply.header("retry-after", "3600"), 429, refusal, { code: "STREAM_BUDGET" });

    const drive = driveForOrg(store);
    let upstream: Response;
    try {
      // The revision we wrote, kept forever: a new version uploaded over the file in
      // the Drive UI is never what a reader receives.
      upstream = await drive.download(object.remoteId, {
        revisionId: object.remoteRevision,
        range: range ? { start, end } : null,
      });
    } catch (err) {
      if (object.remoteRevision && err instanceof DriveError && (err.failure === "invalid" || err.failure === "permission")) {
        // Some revisions cannot be fetched directly. Fall back to the file itself:
        // encrypted frames still authenticate every byte, and reconciliation reports
        // a replaced file to the owners.
        try {
          upstream = await drive.download(object.remoteId, { range: range ? { start, end } : null });
        } catch (err2) {
          await noteFailure(store, err2);
          return driveFailure(reply, err2);
        }
      } else {
        await noteFailure(store, err);
        return driveFailure(reply, err);
      }
    }
    if (!upstream.body) return fail(reply, 502, "Google Drive sent no data.");
    success(reply);

    const source = Readable.fromWeb(upstream.body as import("node:stream/web").ReadableStream<Uint8Array>);
    const sliced = range && upstream.status === 200 ? source.pipe(window(start, length)) : source;
    const counted = sliced.pipe(counter((bytes) => void recordBytes(claims.o, bytes).catch(() => {})));
    source.on("error", (e) => counted.destroy(e));
    return reply.send(counted);
  };
  // Fastify answers HEAD from the GET route itself; `read` returns headers only for it.
  app.get("/stream/r/:objectId", read);

  // ── Upload ──────────────────────────────────────────────────────────────
  app.put("/stream/u/:sessionId", async (req: UploadReq, reply) => {
    let claims: TicketClaims;
    try {
      claims = readTicket(ticketFrom(req.headers, req.query));
    } catch (err) {
      return fail(reply, 401, (err as Error).message);
    }
    if (claims.m !== "u" || claims.s !== req.params.sessionId) {
      return fail(reply, 403, "This ticket is for a different upload.");
    }
    const session = await db.storageUploadSession.findUnique({ where: { id: req.params.sessionId } });
    if (!session || session.orgId !== claims.o) return fail(reply, 404, "This upload was not found. Start it again.");
    if (session.expiresAt < new Date()) return fail(reply, 410, "This upload expired. Start it again.");
    if (session.completedAt) return secureHeaders(reply).send({ confirmed: session.totalBytes, done: true });

    const store = await storeFor(claims.o);
    if (!store || store.adapter !== "gdrive") return fail(reply, 409, "This organization has no Google Drive connected.");
    if (store.status !== "ACTIVE") return fail(reply, 503, "Your storage is not reachable right now, so uploads are paused.");
    if (!epochOk(claims, store)) return fail(reply, 401, "This upload ticket was revoked. Start the upload again.");

    const uri = sessionUriOf(session);
    const cr = /^bytes (?:(\d+)-(\d+)|\*)\/(\d+)$/.exec(String(req.headers["content-range"] ?? ""));
    if (!cr || Number(cr[3]) !== session.totalBytes) {
      return fail(reply, 400, "Each chunk needs a Content-Range naming this upload's exact size.");
    }

    // A status question — how much has Google got? — used to resume after a failure.
    if (cr[1] === undefined) {
      try {
        const status = await querySession(uri, session.totalBytes);
        await db.storageUploadSession.update({
          where: { id: session.id },
          data: { confirmedBytes: status.confirmed, ...(status.file ? { completedAt: new Date() } : {}) },
        });
        return secureHeaders(reply).send({ confirmed: status.confirmed, done: !!status.file });
      } catch (err) {
        return driveFailure(reply, err);
      }
    }

    const start = Number(cr[1]);
    const end = Number(cr[2]);
    const length = end - start + 1;
    const declared = Number(req.headers["content-length"] ?? -1);
    if (start !== session.confirmedBytes) {
      return fail(reply, 409, "This chunk does not follow the last one Google confirmed.", {
        confirmed: session.confirmedBytes,
      });
    }
    if (length <= 0 || declared !== length || length > GATEWAY_CHUNK_BYTES) {
      return fail(reply, 400, `Chunks are at most ${GATEWAY_CHUNK_BYTES / (1024 * 1024)} MiB, with a matching Content-Length.`);
    }
    // Google needs every chunk but the last to be a multiple of 256 KiB.
    if (end + 1 < session.totalBytes && length % (256 * 1024) !== 0) {
      return fail(reply, 400, "Every chunk except the last must be a multiple of 256 KiB.");
    }
    if (session.totalBytes > MAX_OBJECT_BYTES * 1.01 + 1024 * 1024) {
      return fail(reply, 413, "This upload is larger than the platform allows.");
    }
    const refusal = await budgetRefusal(claims.o);
    if (refusal) return fail(reply.header("retry-after", "3600"), 429, refusal, { code: "STREAM_BUDGET" });

    const body = req.body as Readable;
    let sent = 0;
    const counted = body.pipe(
      counter((bytes) => {
        sent = bytes;
      }),
    );
    try {
      const result = await putChunk(uri, counted, start, length, session.totalBytes);
      await recordBytes(claims.o, sent || length);
      await db.storageUploadSession.update({
        where: { id: session.id },
        data: { confirmedBytes: result.confirmed, ...(result.file ? { completedAt: new Date() } : {}) },
      });
      return secureHeaders(reply).send({ confirmed: result.confirmed, done: !!result.file });
    } catch (err) {
      await recordBytes(claims.o, sent).catch(() => {});
      // Find out what Google actually kept, so the browser resumes from the right byte.
      const status = await querySession(uri, session.totalBytes).catch(() => null);
      if (status) {
        await db.storageUploadSession.update({ where: { id: session.id }, data: { confirmedBytes: status.confirmed } });
      }
      if (err instanceof DriveError && err.failure === "not-found") return fail(reply, 410, err.message);
      await noteFailure(store, err);
      return driveFailure(reply.header("x-kv-confirmed", String(status?.confirmed ?? session.confirmedBytes)), err);
    }
  });
}
