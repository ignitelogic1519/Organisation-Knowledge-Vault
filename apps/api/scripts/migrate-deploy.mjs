#!/usr/bin/env node
// Runs `prisma migrate deploy` against a connection that can actually hold a session
// advisory lock, then exits. Used by `start:prod` before booting the server.
//
// Why this exists: Neon hands out two endpoints for the same database — a pooled one
// (host contains `-pooler`, PgBouncer in transaction mode) and a direct one. Prisma's
// migration engine takes a *session-level* advisory lock (`SELECT pg_advisory_lock(...)`),
// which a transaction-mode pooler cannot hold, so migrating through the pooled endpoint
// dies with:
//
//   Error: P1002 — The database server was reached but timed out.
//   Context: Timed out trying to acquire a postgres advisory lock. Timeout: 10000ms.
//
// Rather than requiring whoever set up the deploy to hand-edit DATABASE_URL, we derive the
// direct endpoint here and migrate through that. The server process keeps using the
// original DATABASE_URL — pooled is the better choice for runtime traffic.

import { spawn } from "node:child_process";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Neon free-tier computes scale to zero; the first connection has to wake one, which can
// outlast Prisma's 10 s lock timeout on its own. Retry rather than failing the deploy.
const ATTEMPT_DELAYS_MS = [0, 3_000, 8_000, 15_000, 30_000];

/**
 * Splits a connection string into `scheme://`, `user:pass@host:port`, and `/db?params`.
 * Deliberately not `new URL()` — re-serializing rewrites percent-encoding in passwords.
 */
function splitUrl(raw) {
  const m = /^([^:]+:\/\/)([^/?#]*)(.*)$/s.exec(raw);
  return m ? { scheme: m[1], authority: m[2], rest: m[3] } : null;
}

/** `ep-foo-pooler.c-3.region.aws.neon.tech` → `ep-foo.c-3.region.aws.neon.tech` */
function unpoolHost(hostPort) {
  return hostPort.replace(/^([^.:]*?)-pooler(?=[.:]|$)/, "$1");
}

/** Pooler-only query params confuse a direct connection; drop them. */
function stripPoolerParams(rest) {
  const q = rest.indexOf("?");
  if (q === -1) return rest;
  const params = new URLSearchParams(rest.slice(q + 1));
  for (const key of ["pgbouncer", "connection_limit", "pool_timeout", "statement_cache_size"]) {
    params.delete(key);
  }
  // A cold Neon compute can take ~10 s to accept connections — the libpq default of 5 s
  // turns that into a spurious failure.
  if (!params.has("connect_timeout")) params.set("connect_timeout", "30");
  const query = params.toString();
  return rest.slice(0, q) + (query ? `?${query}` : "");
}

/** The URL migrations should run through, plus how we arrived at it (for logging). */
export function resolveMigrationUrl(envVars = process.env) {
  // An explicit override always wins — Neon's dashboard calls this the direct connection
  // string, and Prisma's own docs use DIRECT_URL for exactly this split.
  const override = (envVars.DIRECT_DATABASE_URL ?? envVars.DIRECT_URL ?? envVars.MIGRATE_DATABASE_URL)?.trim();
  if (override) return { url: override, source: "override" };

  const raw = envVars.DATABASE_URL?.trim();
  if (!raw) return { url: null, source: "missing" };

  const parts = splitUrl(raw);
  if (!parts) return { url: raw, source: "unparseable" };

  const at = parts.authority.lastIndexOf("@");
  const credentials = at === -1 ? "" : parts.authority.slice(0, at + 1);
  const hostPort = at === -1 ? parts.authority : parts.authority.slice(at + 1);
  const directHost = unpoolHost(hostPort);
  if (directHost === hostPort) return { url: raw, source: "already-direct" };

  return {
    url: `${parts.scheme}${credentials}${directHost}${stripPoolerParams(parts.rest)}`,
    source: "derived",
    from: hostPort,
    to: directHost,
  };
}

function runPrismaMigrate(databaseUrl) {
  const env = { ...process.env };
  if (databaseUrl) env.DATABASE_URL = databaseUrl;
  // Last-resort escape hatch for a lock wedged by a killed deploy. Only safe because a
  // single instance migrates at a time (WEB_CONCURRENCY=1); off unless explicitly asked for.
  if (/^(1|true|yes)$/i.test(process.env.MIGRATE_DISABLE_ADVISORY_LOCK ?? "")) {
    env.PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK = "true";
  }

  const attempt = (command, args) =>
    new Promise((resolve) => {
      const child = spawn(command, args, { env, stdio: "inherit" });
      child.on("error", (err) => resolve({ code: 1, error: err }));
      child.on("close", (code) => resolve({ code: code ?? 1 }));
    });

  // `prisma` is on PATH inside a package-manager run script; fall back for direct invocation.
  return attempt("prisma", ["migrate", "deploy"]).then((result) =>
    result.error?.code === "ENOENT" ? attempt("pnpm", ["exec", "prisma", "migrate", "deploy"]) : result,
  );
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const resolved = resolveMigrationUrl();

  if (resolved.source === "missing") {
    console.error("[migrate] DATABASE_URL is not set — cannot apply migrations.");
    process.exit(1);
  }
  if (resolved.source === "derived") {
    console.log(`[migrate] DATABASE_URL points at Neon's pooled endpoint (${resolved.from}).`);
    console.log(`[migrate] Migrating through the direct endpoint instead (${resolved.to}) — a`);
    console.log("[migrate] transaction-mode pooler cannot hold Prisma's session advisory lock.");
  } else if (resolved.source === "override") {
    console.log("[migrate] Using the configured direct migration URL.");
  }

  for (const [index, delay] of ATTEMPT_DELAYS_MS.entries()) {
    if (delay) {
      console.log(`[migrate] Retrying in ${delay / 1000}s (attempt ${index + 1}/${ATTEMPT_DELAYS_MS.length})…`);
      await sleep(delay);
    }
    const { code } = await runPrismaMigrate(resolved.url);
    if (code === 0) {
      process.exit(0);
    }
    console.error(`[migrate] prisma migrate deploy exited with code ${code}.`);
  }

  // The derived host is a guess about someone else's DNS. If it never came up, fall back to
  // the URL as configured so this script can only ever do better than a plain
  // `prisma migrate deploy`, never worse.
  if (resolved.source === "derived") {
    console.error(`[migrate] The direct endpoint (${resolved.to}) never answered.`);
    console.error("[migrate] Falling back to DATABASE_URL exactly as configured…");
    const { code } = await runPrismaMigrate(process.env.DATABASE_URL);
    if (code === 0) process.exit(0);
  }

  console.error("[migrate] Migrations did not apply after all retries.");
  console.error("[migrate] If this is a P1002 advisory-lock timeout, see the Neon section of");
  console.error("[migrate] docs/setup-guide.md — set DIRECT_DATABASE_URL to Neon's direct");
  console.error("[migrate] (non-pooled) connection string, or clear a stuck lock with:");
  console.error("[migrate]   SELECT pg_advisory_unlock_all();");
  process.exit(1);
}

// Guarded so the URL logic above can be imported and exercised without migrating anything.
const invokedDirectly =
  process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
if (invokedDirectly) await main();
