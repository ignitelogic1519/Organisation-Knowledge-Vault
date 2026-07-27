// Seed the platform baseline: the first super-admin, the starter pricing plans, and a
// safety backfill of Knowledge Coins. Idempotent (safe to re-run).
//
// Runs automatically after `prisma migrate reset`, or on demand via `pnpm db:seed`.
import { PrismaClient } from "@prisma/client";
import { hash } from "@node-rs/argon2";

const db = new PrismaClient();

// The first super-super-admin. NOTE: this password is a bootstrap credential only —
// it is stored hashed and `mustChangePassword` forces a rotation on first login.
const FIRST_ADMIN = { username: "adminbase", password: "CJP@2000", displayName: "Knowledge Base Admin" };

// Default Knowledge Coins every profile starts with (also the Profile.coins default).
const DEFAULT_COINS = 150;

// Starter plans. The Organisation plan is fixed at exactly 150 coins (product decision);
// Monthly's price is a placeholder the admin can edit from the console. Demo is free and
// capped at 2 months (60 days).
const PLANS = [
  {
    key: "demo",
    name: "Demo",
    tagline: "Try Knowledge Vault free",
    category: "Plans",
    priceCoins: 0,
    durationDays: 60, memberLimit: 10, // 2-month cap
    imageUrl: null as string | null,
    criteria: "One demo organization per profile. Expires after 2 months.",
    badge: "Free",
    highlights: ["Full features for evaluation", "2-month time limit", "No Knowledge Coins required"],
    sortOrder: 10,
  },
  {
    key: "monthly",
    name: "Monthly",
    tagline: "Keep your organization running month to month",
    category: "Plans",
    priceCoins: 50, // PLACEHOLDER — editable from the admin console
    durationDays: 30,
    memberLimit: 1000,
    imageUrl: null,
    criteria: "Renew every 30 days.",
    badge: null,
    highlights: ["30 days of full access", "Renewable", "Priority in the roadmap"],
    sortOrder: 20,
  },
  {
    key: "organisation",
    name: "Organisation",
    tagline: "For established teams — duration set with the admin",
    category: "Plans",
    priceCoins: 150, // fixed by product decision
    durationDays: null, memberLimit: null, // admin sets duration + member cap per grant
    isCustom: true,
    imageUrl: null,
    criteria: "Duration agreed with the Knowledge Base team.",
    badge: "Best value",
    highlights: ["Admin-set duration", "Custom terms", "Expiry reminders"],
    sortOrder: 30,
  },
];

async function main() {
  // 1) First super-admin (idempotent by username).
  const existingAdmin = await db.platformAdmin.findUnique({ where: { username: FIRST_ADMIN.username } });
  if (!existingAdmin) {
    await db.platformAdmin.create({
      data: {
        username: FIRST_ADMIN.username,
        passwordHash: await hash(FIRST_ADMIN.password),
        displayName: FIRST_ADMIN.displayName,
        mustChangePassword: true,
      },
    });
    console.log(`  ✓ created super-admin @${FIRST_ADMIN.username} (must change password on first login)`);
  } else {
    console.log(`  · super-admin @${FIRST_ADMIN.username} already exists`);
  }

  // 2) Starter pricing plans (upsert by key).
  for (const p of PLANS) {
    await db.pricingPlan.upsert({
      where: { key: p.key },
      update: {
        name: p.name,
        tagline: p.tagline,
        category: p.category,
        priceCoins: p.priceCoins,
        durationDays: p.durationDays ?? null,
        memberLimit: (p as { memberLimit?: number|null }).memberLimit ?? null,
        isCustom: (p as { isCustom?: boolean }).isCustom ?? false,
        criteria: p.criteria,
        badge: p.badge,
        highlights: p.highlights,
        sortOrder: p.sortOrder,
      },
      create: {
        key: p.key,
        name: p.name,
        tagline: p.tagline,
        category: p.category,
        priceCoins: p.priceCoins,
        durationDays: p.durationDays ?? null,
        memberLimit: (p as { memberLimit?: number|null }).memberLimit ?? null,
        isCustom: (p as { isCustom?: boolean }).isCustom ?? false,
        imageUrl: p.imageUrl,
        criteria: p.criteria,
        badge: p.badge,
        highlights: p.highlights,
        sortOrder: p.sortOrder,
      },
    });
  }
  console.log(`  ✓ upserted ${PLANS.length} pricing plans (demo, monthly, organisation)`);

  // 3) Safety backfill: any profile below the default gets topped up to 150 (the ADD COLUMN
  //    default already covers pre-existing rows, but this makes a fresh seed explicit).
  const topped = await db.profile.updateMany({
    where: { coins: { lt: DEFAULT_COINS } },
    data: { coins: DEFAULT_COINS },
  });
  if (topped.count > 0) console.log(`  ✓ topped up ${topped.count} profiles to ${DEFAULT_COINS} coins`);
}

main()
  .then(() => console.log("Seed complete."))
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
