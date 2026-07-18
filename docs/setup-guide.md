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

### 4.2 Optional — Google sign-in
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

### 4.3 Optional — verification emails via the platform Gmail
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
5. (If Google configured) "Sign in with Google" → lands on the account page with
   Google sign-in **Linked**.

## 5. Google Drive storage (Phase 4 — skip for now)

Its own guided walkthrough when we get there: same Google Cloud project, **`drive.file`**
scope only (no verification process needed).

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Chip: "API offline" locally | API not running | `pnpm --filter @vault/api dev` in another terminal |
| Chip: "API offline" in prod | Render asleep or `NEXT_PUBLIC_API_URL` wrong | Wait 60 s and refresh; verify the env var has no trailing slash, then redeploy |
| Browser console CORS error | `WEB_ORIGIN` mismatch | Set it to the exact Vercel URL (scheme included) |
| Vercel build fails | Root directory not set | Project Settings → Root Directory → `apps/web` |
| Render build: `EROFS: read-only file system, unlink '/usr/bin/pnpm'` | `corepack enable` in the build command | Remove `corepack enable &&` — Render pre-installs pnpm; build command is just `pnpm install && pnpm --filter @vault/shared build && pnpm --filter @vault/api build` |
