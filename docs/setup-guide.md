# setup-guide.md — Step-by-Step Deployment (Phase 0)

> Guided setup for someone doing this the first time. Three free accounts, ~30 minutes total.
> Order matters: Render first (you need the API URL), then Vercel.

---

## 0. Run everything locally first (optional but recommended)

Requirements: Node 20+ and pnpm (`npm i -g pnpm`).

```bash
pnpm install          # once, at the repo root
pnpm --filter @vault/shared build

# Terminal 1 — API on http://localhost:4000
pnpm --filter @vault/api dev

# Terminal 2 — Web on http://localhost:3000
pnpm --filter @vault/web dev
```

Open http://localhost:3000 — you should see the landing page with the constellation, the
theme toggle (top right), and a green "API connected" chip. That chip is the Phase 0 test.

---

## 1. Render — deploy the API

1. Go to https://render.com → sign up with your GitHub account (free).
2. Click **New +** → **Blueprint**.
3. Select the `Organisation-Knowledge-Vault` repository. Render reads `render.yaml`
   automatically and shows the `knowledge-vault-api` service.
4. It will ask for two environment variables:
   - `WEB_ORIGIN` — leave blank for now; you'll paste the Vercel URL in step 2.6.
   - `DATABASE_URL` — leave blank for now; comes from Neon in Phase 1.
5. Click **Apply**. First deploy takes a few minutes.
6. When it's live, copy the service URL (looks like `https://knowledge-vault-api.onrender.com`)
   and open `<that-url>/health` in your browser — you should see
   `{"status":"ok","service":"knowledge-vault-api",...}`.

> Free-tier note: the service **sleeps after ~15 minutes idle** — the first request after a
> sleep takes 30–60 s. Normal, expected, fine for v1.

## 2. Vercel — deploy the web app

1. Go to https://vercel.com → sign up with your GitHub account (free "Hobby" plan).
2. Click **Add New…** → **Project** → import `Organisation-Knowledge-Vault`.
3. **Root Directory:** click *Edit* and select `apps/web` (important — it's a monorepo).
4. Framework preset: Next.js (auto-detected). Leave build settings as-is.
5. Under **Environment Variables** add:
   - `NEXT_PUBLIC_API_URL` = the Render URL from step 1.6 (no trailing slash).
6. Click **Deploy**. When live, copy your Vercel URL (e.g. `https://your-app.vercel.app`),
   go back to **Render → knowledge-vault-api → Environment**, set `WEB_ORIGIN` to that URL,
   and let Render redeploy.
7. Open the Vercel URL: landing page + constellation + theme toggle + green
   **"API connected"** chip. If the chip says offline, the API is probably waking from
   sleep — wait a minute and refresh.

**Phase 0 is done when that chip is green on the production URL.**

## 3. Neon — database (needed at Phase 1, fine to do now)

1. Go to https://neon.tech → sign up (free).
2. Create a project (name: `knowledge-vault`; region: closest to you; Postgres 16+).
3. On the dashboard, copy the **connection string**
   (`postgresql://...neon.tech/neondb?sslmode=require`).
4. Paste it into **Render → Environment → DATABASE_URL**.
5. For local development: copy `apps/api/.env.example` to `apps/api/.env` and paste it there
   too. (`.env` is git-ignored — never commit it.)

Phase 1 will run `prisma migrate` against this database — nothing touches it in Phase 0.

## 4. Phase 1 — activate profiles & authentication

The auth code deploys with the normal git push, but it needs the database and two env vars.

### 4.1 Required (auth won't work without these)
1. **Neon** (section 3 above): paste the connection string into
   **Render → knowledge-vault-api → Environment → `DATABASE_URL`**.
2. In the same place add **`JWT_SECRET`** — any long random string (50+ characters; a password
   generator is fine). Never reuse it anywhere else.
3. Add **`WEB_URL`** = your Vercel URL (used inside email verification links).
4. Save → Render redeploys. The start command now runs `prisma migrate deploy` automatically,
   so the database tables are created on first boot. Check the deploy log for
   "migrations have been applied".

### 4.2 Google sign-in — DEFERRED (owner decision, 2026-07-18)

> Skipped for now. The feature is fully built and dormant — the button appears on the
> login/register pages automatically once the two env vars below are set. Note: creating an
> OAuth client ID is free on Google Cloud (no billing account required). Steps kept for when
> we activate it:
1. Go to https://console.cloud.google.com → create a project (e.g. `knowledge-vault`).
2. **APIs & Services → OAuth consent screen**: External, fill app name + your email, add no
   extra scopes, save. (Basic sign-in scopes need no Google verification.)
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID → Web application**:
   - Authorized JavaScript origins: your Vercel URL **and** `http://localhost:3000`.
   - No redirect URIs needed (we use the Google Identity Services button).
4. Copy the **Client ID** (ends in `.apps.googleusercontent.com`) and set it in **both** places:
   - Render → `GOOGLE_CLIENT_ID`
   - Vercel → `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (then **redeploy** the web app — build-time var)
5. The Google button appears on the login/register pages automatically once the var is set.

### 4.3a Recommended — email via Brevo (HTTPS API, no SMTP)

Most reliable on free-tier hosting. Free plan: 300 emails/day.

1. Sign up at https://www.brevo.com (free).
2. **Verify the sender**: Brevo → Senders & Domains (Settings → Senders) → *Add a sender* →
   enter the platform address (e.g. `ignite.logic1519@gmail.com`) → click the confirmation
   link Brevo emails to that inbox.
3. **Get the API key**: Brevo → SMTP & API → **API keys** tab → Generate a new API key
   (NOT an SMTP key — the API key, it starts with `xkeysib-`).
4. Render → knowledge-vault-api → Environment:
   - `BREVO_API_KEY` = the key
   - `MAIL_FROM` = the verified sender address
5. Save → after redeploy, `/health` shows `"mail":"brevo"`. Register a test account — the
   verification mail should arrive. (Brevo's dashboard also shows every send under
   Transactional → Logs, which makes debugging trivial.)

Note: mails sent via Brevo will NOT appear in the Gmail "Sent" folder — Gmail is only the
sender identity, not the carrier. Check Brevo's Transactional Logs instead.

### 4.3b Alternative — verification emails via the platform Gmail (SMTP)
1. On the platform Gmail account: enable **2-Step Verification**, then create an
   **App Password** (Google Account → Security → App passwords).
2. Render → `SMTP_USER` = the Gmail address, `SMTP_PASS` = the app password.
3. Until these are set, the API **logs the verification link** instead of emailing it —
   find it in Render → Logs (search for `verification link`). Fine for testing.

### 4.4 Phase 1 test checklist
1. `<vercel-url>/register` → create a profile → lands on the account page.
2. Verification: click the emailed link (or the one from Render logs) → account page shows
   the green **Verified** badge.
3. Sign out → sign in again with the same credentials.
4. Wrong password → clean error message, no crash.
5. ~~Google sign-in~~ — deferred; the button is intentionally absent until §4.2 is done.

## 5. Phases 4–7 — courses, compliance job & vault files

Deploys with the normal git push. Two one-time setups:

### 5.1 JOB_SECRET (compliance nightly job)
1. **Render → Environment**: add `JOB_SECRET` = a long random string (Generate button works).
2. **GitHub repo → Settings → Secrets and variables → Actions**:
   - New **secret** `JOB_SECRET` = the same value.
   - New **variable** `API_URL` = your Render URL (no trailing slash).
3. The workflow `.github/workflows/nightly-job.yml` then runs the compliance job daily at
   02:30 UTC (recurrence expiry, overdue escalation, 30-day purge). Trigger it manually any
   time: repo → Actions → nightly-compliance-job → Run workflow.

### 5.2 Storage in v1 (no Google account needed)
The storage adapter port ships with two live backends:
- **Inline** — files up to 10 MB stored in Neon (documents, small PDFs).
- **Link** — external URLs for anything big (YouTube videos, Drive share links, podcasts…).
The **Google Drive adapter** (org connects its own Drive, `drive.file` scope) plugs into the
same port later — its Google Cloud walkthrough activates together with Google sign-in
(`future.md` §9). After a `.main` revival, media shows as *unreachable* until storage is
reconnected — inline files do not survive a purge; links resume working immediately after
re-adding them.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Chip: "API offline" locally | API not running | `pnpm --filter @vault/api dev` in another terminal |
| Chip: "API offline" in prod | Render asleep or `NEXT_PUBLIC_API_URL` wrong | Wait 60 s and refresh; verify the env var has no trailing slash, then redeploy |
| Browser console CORS error | `WEB_ORIGIN` mismatch | Set it to the exact Vercel URL (scheme included) |
| Vercel build fails | Root directory not set | Project Settings → Root Directory → `apps/web` |
| Render build: `EROFS: read-only file system, unlink '/usr/bin/pnpm'` | `corepack enable` in the build command | Remove `corepack enable &&` — Render pre-installs pnpm; build command is just `pnpm install && pnpm --filter @vault/shared build && pnpm --filter @vault/api build` |

## Troubleshooting: Render deploy fails with `P1002` advisory-lock timeout (Neon)

If `prisma migrate deploy` fails with:

```
Error: P1002 — Timed out trying to acquire a postgres advisory lock
(SELECT pg_advisory_lock(...)).
```

your `DATABASE_URL` is pointing at Neon's **pooler** endpoint (host contains `-pooler`).
Prisma migrations need a **session-level advisory lock**, which PgBouncer (transaction mode)
can't hold. Fix: set `DATABASE_URL` to the **direct, non-pooled** endpoint — the same string
with `-pooler` removed from the host, e.g.

```
# pooled (fails migrations):
postgresql://user:pass@ep-xxxx-pooler.region.aws.neon.tech/neondb?sslmode=require
# direct (use this):
postgresql://user:pass@ep-xxxx.region.aws.neon.tech/neondb?sslmode=require
```

The direct endpoint is fine at small scale (`WEB_CONCURRENCY=1`). After redeploy, the server's
idempotent bootstrap creates the first super-admin (`adminbase`) and the starter plans
automatically — no separate seed step is needed. To create/reset the admin manually instead,
run `pnpm --filter @vault/api db:admin` (honours `ADMIN_USERNAME` / `ADMIN_PASSWORD`).
