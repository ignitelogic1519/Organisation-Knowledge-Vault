import { hash } from "@node-rs/argon2";
import { db } from "../db.js";

// Self-healing platform bootstrap — runs on every server start (idempotent). Guarantees the
// first super-admin and the starter pricing plans exist, so a fresh deploy (e.g. Render +
// Neon) is usable immediately without a separate `prisma db seed` step. Safe to run
// repeatedly; it only creates what's missing and never clobbers admin-edited data.

const FIRST_ADMIN = {
  username: (process.env.ADMIN_USERNAME ?? "adminbase").trim().toLowerCase(),
  password: process.env.ADMIN_PASSWORD ?? "CJP@2000",
  displayName: "Knowledge Base Admin",
};

const STARTER_PLANS = [
  { key: "demo", name: "Demo", tagline: "Try Knowledge Vault free", category: "Plans", priceCoins: 0, durationDays: 60, isCustom: false, criteria: "One demo organization per profile. Expires after 2 months.", badge: "Free", highlights: ["Full features for evaluation", "2-month time limit", "No Knowledge Coins required"], sortOrder: 10 },
  { key: "monthly", name: "Monthly", tagline: "Keep your organization running month to month", category: "Plans", priceCoins: 50, durationDays: 30, isCustom: false, criteria: "Renew every 30 days.", badge: null as string | null, highlights: ["30 days of full access", "Renewable", "Priority in the roadmap"], sortOrder: 20 },
  { key: "organisation", name: "Organisation", tagline: "For established teams — duration set with the admin", category: "Plans", priceCoins: 150, durationDays: null as number | null, isCustom: true, criteria: "Duration agreed with the Knowledge Base team.", badge: "Best value", highlights: ["Admin-set duration", "Custom terms", "Expiry reminders"], sortOrder: 30 },
];

export async function ensurePlatformBootstrap(): Promise<void> {
  try {
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
  } catch (err) {
    // Never let bootstrap crash the server — log and continue (e.g. if migrations haven't
    // applied yet). The admin can be created later with `db:admin`.
    console.error("[bootstrap] skipped:", err instanceof Error ? err.message : err);
  }
}
