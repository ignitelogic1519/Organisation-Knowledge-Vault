-- Banning a profile: refused at login, signed out everywhere, and reversible.
--
-- Deliberately not a delete. A banned person's completion records, exam attempts and
-- audit trail stay exactly where they are — the history of what happened in an
-- organization should not depend on whether someone is still welcome in it.
ALTER TABLE "Profile" ADD COLUMN "bannedAt" TIMESTAMP(3);
