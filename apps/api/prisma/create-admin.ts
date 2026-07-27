// Create OR reset the first super-admin — a recovery tool for a locked-out console.
// Idempotent: creates @adminbase if missing, otherwise resets its password and reactivates
// it. Override via env: ADMIN_USERNAME / ADMIN_PASSWORD.
//
//   pnpm --filter @vault/api db:admin
//   ADMIN_PASSWORD='NewPass123' pnpm --filter @vault/api db:admin
import { PrismaClient } from "@prisma/client";
import { hash } from "@node-rs/argon2";

const db = new PrismaClient();
const username = (process.env.ADMIN_USERNAME ?? "adminbase").trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD ?? "CJP@2000";

async function main() {
  const passwordHash = await hash(password);
  const existing = await db.platformAdmin.findUnique({ where: { username } });
  if (existing) {
    await db.platformAdmin.update({
      where: { username },
      data: { passwordHash, active: true, mustChangePassword: true },
    });
    console.log(`✓ Reset password for existing super-admin @${username} (active, must-change on next login).`);
  } else {
    await db.platformAdmin.create({
      data: { username, passwordHash, displayName: "Knowledge Base Admin", mustChangePassword: true },
    });
    console.log(`✓ Created super-admin @${username} (must-change on first login).`);
  }
  console.log(`  Log in at /kbase/login with username "${username}" and the password you set.`);
}

main()
  .catch((e) => {
    console.error("Failed:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
