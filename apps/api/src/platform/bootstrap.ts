import { hash } from "@node-rs/argon2";
import { db } from "../db.js";
import { ensureDefaultCoinsSetting } from "./settings.js";

// Self-healing platform bootstrap — runs on every server start (idempotent). Guarantees the
// first super-admin and the starter pricing plans exist, so a fresh deploy (e.g. Render +
// Neon) is usable immediately without a separate `prisma db seed` step. Safe to run
// repeatedly; it only creates what's missing and never clobbers admin-edited data.

const FIRST_ADMIN = {
  username: (process.env.ADMIN_USERNAME ?? "adminbase").trim().toLowerCase(),
  password: process.env.ADMIN_PASSWORD ?? "CJP@2000",
  displayName: "Knowledge Base Admin",
};

// documentLimit = documents built in the Studio; uploadLimit = files/links brought in;
// allowDrafts = may authors park an unfinished Studio document on the server (premium).
const STARTER_PLANS = [
  { key: "demo", name: "Demo", tagline: "Try Knowledge Vault free", category: "Plans", priceCoins: 0, durationDays: 60, memberLimit: 10 as number | null, documentLimit: 20 as number | null, uploadLimit: 30 as number | null, allowDrafts: false, isCustom: false, criteria: "One demo organization per profile. Expires after 2 months.", badge: "Free", highlights: ["Full features for evaluation", "Up to 10 members", "20 Studio documents · 30 uploads", "2-month time limit", "No Knowledge Coins required"], sortOrder: 10 },
  { key: "monthly", name: "Monthly", tagline: "Keep your organization running month to month", category: "Plans", priceCoins: 50, durationDays: 30, memberLimit: 1000 as number | null, documentLimit: null as number | null, uploadLimit: null as number | null, allowDrafts: true, isCustom: false, criteria: "Renew every 30 days.", badge: null as string | null, highlights: ["30 days of full access", "Up to 1000 members", "Unlimited documents & drafts", "Renewable"], sortOrder: 20 },
  { key: "organisation", name: "Organisation", tagline: "For established teams — duration set with the admin", category: "Plans", priceCoins: 150, durationDays: null as number | null, memberLimit: null as number | null, documentLimit: null as number | null, uploadLimit: null as number | null, allowDrafts: true, isCustom: true, criteria: "Duration agreed with the Knowledge Base team.", badge: "Best value", highlights: ["Admin-set duration", "Custom member limit", "Unlimited documents & drafts", "Custom terms"], sortOrder: 30 },
];

// Locked out of the console? Render's free plan has no shell, so `db:admin` isn't reachable
// there. Set ADMIN_PASSWORD_RESET=1 in the dashboard and redeploy: the password goes back to
// ADMIN_PASSWORD (default CJP@2000) and the account is reactivated. Remove the var afterwards.
//
// This is not a privilege escalation — anyone who can set env vars on the service can already
// deploy arbitrary code against the same database. The reset always forces a password change
// at next login, so a forgotten env var can't leave a known password in place unnoticed.
async function applyAdminPasswordReset(): Promise<void> {
  if (!/^(1|true|yes)$/i.test(process.env.ADMIN_PASSWORD_RESET ?? "")) return;

  const updated = await db.platformAdmin.updateMany({
    where: { username: FIRST_ADMIN.username },
    data: {
      passwordHash: await hash(FIRST_ADMIN.password),
      active: true,
      mustChangePassword: true,
    },
  });
  if (updated.count === 0) return; // nothing to reset — the create path below uses this password

  console.warn(
    `[bootstrap] ADMIN_PASSWORD_RESET set — reset the password for @${FIRST_ADMIN.username} ` +
      "and reactivated the account. You must change the password at next login. " +
      "Remove ADMIN_PASSWORD_RESET from the environment now.",
  );
}

export async function ensurePlatformBootstrap(): Promise<void> {
  try {
    await applyAdminPasswordReset();
    const admin = await db.platformAdmin.findUnique({ where: { username: FIRST_ADMIN.username } });
    if (!admin) {
      await db.platformAdmin.create({
        data: {
          username: FIRST_ADMIN.username,
          passwordHash: await hash(FIRST_ADMIN.password),
          displayName: FIRST_ADMIN.displayName,
          mustChangePassword: true,
        },
      });
      console.log(`[bootstrap] created super-admin @${FIRST_ADMIN.username} (must change password on first login)`);
    }

    // Seed plans only when the table is empty, so we never overwrite admin edits.
    if ((await db.pricingPlan.count()) === 0) {
      await db.pricingPlan.createMany({ data: STARTER_PLANS });
      console.log(`[bootstrap] seeded ${STARTER_PLANS.length} starter pricing plans`);
    }
    await ensureDefaultCoinsSetting();

    // Backfill member limits on the starter plans for existing deployments — only where
    // still unset, so an admin's own limit is never overwritten.
    for (const p of STARTER_PLANS) {
      if (p.memberLimit != null) {
        await db.pricingPlan.updateMany({
          where: { key: p.key, memberLimit: null },
          data: { memberLimit: p.memberLimit },
        });
      }
    }

    // Same for the free plan's content allowances: an org evaluating the product may
    // publish 20 Studio documents and bring in 30 uploads, and cannot park drafts on the
    // server. Keyed on documentLimit still being unset, so this lands exactly once on a
    // deployment that predates the allowances and never re-writes an admin's own numbers.
    await db.pricingPlan.updateMany({
      where: { key: "demo", documentLimit: null },
      data: { documentLimit: 20, uploadLimit: 30, allowDrafts: false },
    });
  } catch (err) {
    // Never let bootstrap crash the server — log and continue (e.g. if migrations haven't
    // applied yet). The admin can be created later with `db:admin`.
    console.error("[bootstrap] skipped:", err instanceof Error ? err.message : err);
  }
}
