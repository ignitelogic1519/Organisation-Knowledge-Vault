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

// The plan ladder (owner decision 2026-08-03). Only the Free plan is metered: it stops at
// 30 custom documents, 30 uploads, or 150 GB of storage — whichever arrives first. Every
// paid plan carries unlimited documents and uploads; the admin can still pin a per-org
// ceiling by hand from the console. `tier` is the rung: the Pricing page uses it to work
// out what sits "above" the plan an organization runs today.
const FREE_STORAGE_MB = 150 * 1024; // 150 GB
const PLANS = [
  {
    key: "demo",
    name: "Free",
    tagline: "Try Knowledge Vault for a month",
    category: "Plans",
    priceCoins: 50,
    durationDays: 30,
    memberLimit: 10,
    documentLimit: 30, // custom documents built in the Studio
    uploadLimit: 30, // uploaded or linked documents
    storageLimitMb: FREE_STORAGE_MB,
    tier: 1,
    allowDrafts: false, // parking work on the server is a paid capability
    imageUrl: null as string | null,
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
    imageUrl: null,
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
    durationDays: 130, // 4 months + 10 days
    memberLimit: null,
    documentLimit: null,
    uploadLimit: null,
    storageLimitMb: null,
    tier: 3,
    allowDrafts: true,
    imageUrl: null,
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
    durationDays: 425, // 365 + 60
    memberLimit: null,
    documentLimit: null,
    uploadLimit: null,
    storageLimitMb: null,
    tier: 4,
    allowDrafts: true,
    imageUrl: null,
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
    priceCoins: 0, // agreed per proposal
    durationDays: null,
    memberLimit: null,
    documentLimit: null,
    uploadLimit: null,
    storageLimitMb: null,
    tier: 5,
    allowDrafts: true,
    isCustom: true,
    imageUrl: null,
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

  // 2) Pricing plans (upsert by key). The shape is identical on create and update, so a
  //    re-seed brings an existing deployment onto the current ladder.
  for (const p of PLANS) {
    const shape = {
      name: p.name,
      tagline: p.tagline,
      category: p.category,
      priceCoins: p.priceCoins,
      durationDays: p.durationDays ?? null,
      memberLimit: p.memberLimit ?? null,
      documentLimit: p.documentLimit ?? null,
      uploadLimit: p.uploadLimit ?? null,
      storageLimitMb: p.storageLimitMb ?? null,
      tier: p.tier,
      allowDrafts: (p as { allowDrafts?: boolean }).allowDrafts ?? true,
      isCustom: (p as { isCustom?: boolean }).isCustom ?? false,
      criteria: p.criteria,
      badge: p.badge,
      highlights: p.highlights,
      sortOrder: p.sortOrder,
      active: true,
    };
    await db.pricingPlan.upsert({
      where: { key: p.key },
      update: shape,
      create: { key: p.key, imageUrl: p.imageUrl, ...shape },
    });
  }
  // The old "monthly" card is superseded by "bimonthly" — retire it rather than delete it,
  // so organizations already running on it keep resolving their plan row.
  await db.pricingPlan.updateMany({ where: { key: "monthly" }, data: { active: false } });
  console.log(`  ✓ upserted ${PLANS.length} pricing plans (free, bi-monthly, quarterly, yearly, custom)`);

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
