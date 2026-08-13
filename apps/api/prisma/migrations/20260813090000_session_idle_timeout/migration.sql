-- Sessions that end after an hour away from the keyboard.
--
-- Until now a sign-in never really ended. The refresh token lived 30 days and every
-- rotation minted a fresh one, so a browser left open on a shared machine stayed signed
-- in indefinitely and nobody was ever asked for a password again. The missing piece was
-- somewhere to record WHEN THE PERSON WAS LAST SEEN: the refresh token is the wrong home
-- for it, because the token is replaced every ~15 minutes.
--
-- So the session becomes a row of its own, and every refresh token in the rotation chain
-- points at it. `lastActivityAt` is moved by real user activity only (POST /auth/activity,
-- beaten by the browser on click / keystroke / touch) — never by background polling or by
-- a token refresh, or a forgotten tab would keep itself alive forever.
--
-- Existing sign-ins are NOT thrown away: each live refresh token adopts a session of its
-- own, starting its idle clock now. Their access tokens carry no session id, so the next
-- API call 401s, the client refreshes (as it already does for an expired access token)
-- and comes back holding a session-bound token. Nobody is forced to sign in by the deploy
-- itself — only by an hour away afterwards.

-- ── The session ─────────────────────────────────────────────────────────────
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "endedReason" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Session_profileId_endedAt_idx" ON "Session"("profileId", "endedAt");
CREATE INDEX "Session_endedAt_expiresAt_idx" ON "Session"("endedAt", "expiresAt");

ALTER TABLE "Session"
  ADD CONSTRAINT "Session_profileId_fkey"
  FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Tokens belong to a session ──────────────────────────────────────────────
ALTER TABLE "RefreshToken" ADD COLUMN "sessionId" TEXT;

-- Backfill: one session per existing token row, id borrowed from the token so the join is
-- exact. The idle clock starts at deploy time — the fairest reading of "last seen" for a
-- token issued before anyone was keeping track.
INSERT INTO "Session" ("id", "profileId", "lastActivityAt", "expiresAt", "createdAt")
SELECT "id", "profileId", CURRENT_TIMESTAMP, "expiresAt", "createdAt" FROM "RefreshToken";

UPDATE "RefreshToken" SET "sessionId" = "id" WHERE "sessionId" IS NULL;

ALTER TABLE "RefreshToken" ALTER COLUMN "sessionId" SET NOT NULL;

CREATE INDEX "RefreshToken_sessionId_idx" ON "RefreshToken"("sessionId");

ALTER TABLE "RefreshToken"
  ADD CONSTRAINT "RefreshToken_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
