import { hash } from "@node-rs/argon2";
import { db } from "../db.js";
import { ensureDefaultCoinsSetting } from "./settings.js";

// Self-healing platform bootstrap — runs on every server start (idempotent). Guarantees the
// first super-admin and the current pricing ladder exist, so a fresh deploy (e.g. Render +
// Neon) is usable immediately without a separate `prisma db seed` step. Safe to run
// repeatedly; it only creates what's missing and never clobbers admin-edited data.

const FIRST_ADMIN = {
  username: (process.env.ADMIN_USERNAME ?? "adminbase").trim().toLowerCase(),
  password: process.env.ADMIN_PASSWORD ?? "CJP@2000",
  displayName: "Knowledge Base Admin",
};

// The plan ladder (owner decision 2026-08-03). Only the Free plan is metered — 30 custom
// documents, 30 uploads, 150 GB, whichever arrives first. Paid plans carry unlimited
// documents and uploads; an admin can still pin a per-org ceiling by hand.
//
// documentLimit = documents built in the Studio; uploadLimit = files/links brought in;
// storageLimitMb = total stored bytes; allowDrafts = may authors park an unfinished
// Studio document on the server (premium); tier = rung on the upgrade ladder.
const FREE_STORAGE_MB = 150 * 1024;

interface StarterPlan {
  key: string;
  name: string;
  tagline: string;
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
  criteria: string;
  badge: string | null;
  highlights: string[];
  sortOrder: number;
}

const STARTER_PLANS: StarterPlan[] = [
  {
    key: "demo",
    name: "Free",
    tagline: "Try Knowledge Vault for a month",
    category: "Plans",
    priceCoins: 50,
    durationDays: 30,
    memberLimit: 10,
    documentLimit: 30,
    uploadLimit: 30,
    storageLimitMb: FREE_STORAGE_MB,
    tier: 1,
    allowDrafts: false,
    isCustom: false,
    criteria: "One free organization per profile. 30 days, then upgrade to continue.",
    badge: "Start here",
    highlights: [
      "30 days of full access",
      "Up to 30 custom documents and 30 uploads",
      "150 GB of storage — whichever limit comes first",
      "Up to 10 people",
    ],
    sortOrder: 10,
  },
  {
    key: "bimonthly",
    name: "Bi-monthly",
    tagline: "Two months of everything, renewable",
    category: "Plans",
    priceCoins: 100,
    durationDays: 60,
    memberLimit: null,
    documentLimit: null,
    uploadLimit: null,
    storageLimitMb: null,
    tier: 2,
    allowDrafts: true,
    isCustom: false,
    criteria: "Renew every 2 months.",
    badge: null,
    highlights: [
      "2 months (60 days) of full access",
      "Unlimited documents and uploads",
      "Unlimited people",
      "Server-side drafts on every device",
    ],
    sortOrder: 20,
  },
  {
    key: "quarterly",
    name: "Quarterly",
    tagline: "Four months and ten days — a full working quarter with room to spare",
    category: "Plans",
    priceCoins: 150,
    durationDays: 130,
    memberLimit: null,
    documentLimit: null,
    uploadLimit: null,
    storageLimitMb: null,
    tier: 3,
    allowDrafts: true,
    isCustom: false,
    criteria: "Renew every 130 days.",
    badge: "Popular",
    highlights: [
      "4 months + 10 days of full access",
      "Unlimited documents and uploads",
      "Unlimited people",
      "Expiry reminders in your mailbox",
    ],
    sortOrder: 30,
  },
  {
    key: "yearly",
    name: "Yearly",
    tagline: "A year — plus two months on the house",
    category: "Plans",
    priceCoins: 500,
    durationDays: 425,
    memberLimit: null,
    documentLimit: null,
    uploadLimit: null,
    storageLimitMb: null,
    tier: 4,
    allowDrafts: true,
    isCustom: false,
    criteria: "365 days + 2 months included.",
    badge: "Best value",
    highlights: [
      "365 days + 2 free months (425 days)",
      "Unlimited documents and uploads",
      "Unlimited people",
      "Priority support from the Knowledge Base team",
    ],
    sortOrder: 40,
  },
  {
    key: "organisation",
    name: "Custom / Organizational",
    tagline: "Tell us your shape — days, people and documents — and we price it",
    category: "Plans",
    priceCoins: 0,
    durationDays: null,
    memberLimit: null,
    documentLimit: null,
    uploadLimit: null,
    storageLimitMb: null,
    tier: 5,
    allowDrafts: true,
    isCustom: true,
    criteria: "Terms agreed with the Knowledge Base team.",
    badge: "Tailored",
    highlights: [
      "You state the days, people and document counts",
      "Unlimited documents and uploads",
      "Invoiced in Knowledge Coins at an agreed rate",
      "Dedicated onboarding",
    ],
    sortOrder: 50,
  },
];

/** Bump this when the ladder above changes — it is what makes the rollout land once. */
const PLAN_LADDER_VERSION = "2026-08-03";
const PLAN_LADDER_KEY = "plan_ladder_version";

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

/** Write the current ladder exactly once per version (never on every boot). */
async function applyPlanLadder(): Promise<void> {
  const marker = await db.platformSetting.findUnique({ where: { key: PLAN_LADDER_KEY } });
  if (marker?.value === PLAN_LADDER_VERSION) return;

  for (const p of STARTER_PLANS) {
    const { key, ...shape } = p;
    await db.pricingPlan.upsert({
      where: { key },
      update: { ...shape, active: true },
      create: { key, ...shape, active: true },
    });
  }
  // Superseded card: organizations already on "monthly" keep resolving their plan row,
  // but it stops being offered.
  await db.pricingPlan.updateMany({ where: { key: "monthly" }, data: { active: false } });
  await db.platformSetting.upsert({
    where: { key: PLAN_LADDER_KEY },
    update: { value: PLAN_LADDER_VERSION },
    create: { key: PLAN_LADDER_KEY, value: PLAN_LADDER_VERSION },
  });
  console.log(`[bootstrap] applied pricing ladder ${PLAN_LADDER_VERSION} (${STARTER_PLANS.length} plans)`);
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

    await applyPlanLadder();
    await ensureDefaultCoinsSetting();
  } catch (err) {
    // Never let bootstrap crash the server — log and continue (e.g. if migrations haven't
    // applied yet). The admin can be created later with `db:admin`.
    console.error("[bootstrap] skipped:", err instanceof Error ? err.message : err);
  }
}
