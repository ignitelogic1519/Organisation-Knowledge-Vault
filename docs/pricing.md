# Pricing, Knowledge Coins & the Super-Admin realm

The paywall and administration layer: dynamic pricing, a virtual currency, OTP-gated
organization creation, and a separate "Knowledge Base" employee console. This is the
normative contract for that feature set (companion to `structure.md` and `architecture.md`).

## 1. Why

Organizations can no longer be created freely. Creation is gated behind a **plan** and a
**one-time access code (OTP)** the super-admin issues after reviewing a request. Plans are
paid for with **Knowledge Coins** (a virtual currency; a real payment gateway is deferred —
`/payment` is a "coming soon" placeholder). Every profile starts with **150 coins**.

## 2. Data model (Prisma)

| Model | Purpose |
|-------|---------|
| `PricingPlan` | One active row = one card on `/pricing`; `category` is its tab. `priceCoins`, `durationDays` (null = admin-set/unlimited), `isCustom`, `imageUrl`, `criteria`, `badge`, `highlights`, `validFrom/validUntil` (offer window), `active`, `sortOrder`. |
| `PlatformAdmin` | Super-admin accounts (separate realm). Seeded with `adminbase`. `mustChangePassword` forces a first-login rotation. |
| `PlatformRequest` | The user↔admin channel: `CREATE_ORG` / `CUSTOM_PLAN` / `RESTORE_ORG`, with the proposal (`requestedDays`, `offeredCoins`, `message`), the decision (`grantedDays`, `priceCoins`, `adminMessage`), and the hashed OTP (`otpHash`, `otpExpiresAt` = 24h). |
| `CoinTransaction` | Ledger of every coin change (`SIGNUP_GRANT`, `ADMIN_GIFT`, `ADMIN_DEDUCT`, `PLAN_SPEND`, `REFUND`) with a balance snapshot. |
| `PlatformAdminAudit` | Append-only log of every super-admin action. |
| `Profile.coins` | The wallet balance (default 150). |
| `Organization.plan*` | `planKey`, `planStatus` (`NONE`/`DEMO`/`ACTIVE`/`EXPIRED`), `planActivatedAt`, `planExpiresAt`, `planIsCustom`, `planGrantedById`. **This is the authoritative plan state** — the super-admin edits it directly (the Supreme *password* is unknown to the server). `NONE` = legacy/grandfathered org (no timer, no restriction). |

### Starter seed
- Admin `adminbase` (hashed, must-change-on-first-login).
- Plans: **Demo** (free, 60 days), **Monthly** (50 coins, 30 days — placeholder price), **Organisation** (150 coins, admin-set duration, `isCustom`).
- Every profile backfilled to 150 coins.

## 2b. What a plan allows (content limits)

A plan meters three things. `null` anywhere means unlimited, and a per-organization
override on `Organization` always wins over the plan's own number, so the super-admin can
tune one customer without touching the plan card.

| Allowance | Plan column | Org override | Demo (free) | Paid plans |
| --- | --- | --- | --- | --- |
| People in the org | `PricingPlan.memberLimit` | `Organization.memberLimit` | 10 | plan/admin set |
| **Custom documents** (built in the Studio) | `PricingPlan.documentLimit` | `Organization.documentLimit` | **20** | unlimited |
| **Uploaded documents** (files & external links) | `PricingPlan.uploadLimit` | `Organization.uploadLimit` | **30** | unlimited |
| **Server-side Studio drafts** | `PricingPlan.allowDrafts` | — | **off** | on |

- Which allowance a course counts against is decided at creation from
  `Course.source` (`STUDIO` for `authored` content, `UPLOAD` for files and links) — a plain
  indexed count, and it survives a `.main` revival.
- The API is authoritative: `assertContentQuota` runs **before any bytes are stored**, and
  `assertDraftsAllowed` answers **402** for a draft save on a plan without drafts. The UI
  reads `GET /orgs/:id/plan-limits` only to show the remaining allowance and to explain the
  limit in the same words before the author starts work.
- Every refusal names the same next step: **ask the organization's main administrator to
  arrange a premium plan** with the Knowledge Base team (or free capacity by deleting
  material that is no longer required).

## 3. Knowledge Coins

- Default **150** per profile; **only ever exposed on `/pricing` and `/payment`** (via `GET /wallet`).
- Demo needs **0** coins. The Organisation plan costs **exactly 150**.
- The super-admin can **gift/adjust** any user's balance (`POST /admin/coins/gift`), notifying the user.
- Coins are deducted **at redemption** — i.e. when an org is created/restored with the OTP, never at request or approval time.

## 4. The request ↔ response flow (OTP-gated creation)

1. User picks a plan on `/pricing`. Fixed plans → a `CREATE_ORG` request; custom plans → a `CUSTOM_PLAN` request carrying the days + coins they offer.
2. The request lands in the super-admin's console inbox (`GET /admin/requests`).
3. The admin **approves** (setting final `grantedDays` + `priceCoins` + a custom message) or **denies** (with a message). Approval mints an **8-char alphanumeric OTP** (unambiguous alphabet, hashed at rest, **24h** expiry).
4. The OTP is delivered to the user as a **notification "from the Super Admin"** — retained **30 days** and shown both in the bell and on a dedicated **Account page panel**, so the user can read the code any time (even before they belong to any org).
5. The user enters the code in the create-org form. The server redeems it: validates the code, deducts coins, stamps the org's plan/expiry, and marks the request **USED** (single-use).

Single round of negotiation; a denied/expired request is simply re-requested.

### 4b. Renewing an organization that already exists (`PLAN_RENEWAL`)

The OTP dance above exists because the organization does not exist yet — the code is what
the create/restore form redeems. A **renewal or upgrade of a live org has nothing to
redeem**, so it takes a shorter path:

1. An owner opens their org and uses the **plan banner** on the main board (§6) — choosing a
   plan, optionally naming the days they need and the coins they can offer, plus a message.
   Filed as a `PLAN_RENEWAL` request carrying `targetOrgNumber`.
2. Guards on the way in: only a **root-role owner** of that org may file it (403 otherwise),
   and only **one may be pending per org** at a time (409), so the inbox stays readable.
3. The request appears in the console inbox with the org's **current plan and expiry**
   resolved beside it, so the admin decides in context.
4. **Approving applies the plan immediately** — no OTP. The admin picks the plan, duration,
   and any per-org member / document / upload overrides, sets the coin price, and may gift
   coins in the same action (`grantCoins`, applied before the charge so "gift 200, charge
   200" nets to zero).
5. If the requester cannot cover the price, the approval is **refused with a 409** naming
   their balance rather than overdrawing them — the admin gifts the difference or lowers the
   price and decides again. The org's plan is untouched until the charge succeeds.
6. The request is marked **USED** (there is no code outstanding), and every root owner is
   notified that the plan changed.

Both this path and the admin's direct **Set plan** action go through one function —
`applyPlanToOrg()` in `apps/api/src/orgs/plan.ts` — so they cannot drift apart. It also
clears `planReminderDays`, which re-arms the reminder ladder for the new period (§6).

## 5. Plans in the `.main` file (custody)

`.main` is format **v2**: the encrypted payload now carries a **plan snapshot** plus a
**server HMAC signature** (`vault-files/plan-sign.ts`). Because the org owner holds the
Supreme password (and could re-encrypt a tampered file), the signature — keyed with a
server secret — is what the server trusts on revive.

**Revive / undelete gate:**
- A file/row whose signed plan is **ACTIVE and unexpired** revives directly.
- **Demo, expired, or legacy (v1/unsigned)** → blocked with a **clear message** explaining
  the plan expired and directing the user to `/pricing`. Restoring then requires a
  **`RESTORE_ORG` access code** (same OTP mechanism), which deducts coins and re-stamps the
  new plan. The user may need to re-upload the `.main` with the code.

## 6. Expiry

- Demo is capped at **2 months** (60 days). Any plan past `planExpiresAt` reads as
  **EXPIRED** (`effectivePlanStatus`, computed on read — no write needed).
- The org card shows a **countdown timer above the name** (Demo/Monthly/custom remaining,
  or "expired — upgrade").
- Reminders are delivered in-app (notifications); email is deferred.

### 6b. The reminder ladder

Owners are warned before the plan lapses, on a fixed ladder defined once in
`@vault/shared` as `PLAN_REMINDER_DAYS = [20, 7, 1]`. The first notice lands **20 days
out** — early enough to arrange a renewal, an upgrade, or a conversation with the
Knowledge Base team without any interruption.

- The **nightly job** (`POST /jobs/run`) walks every org with a DEMO/ACTIVE plan and an
  expiry date, works out the rung from the days remaining, and notifies each **root-role
  owner** (`plan_expiring`). Past the date it writes `planStatus = EXPIRED` and sends
  `plan_expired`. Both kinds already sit in `ADMIN_NOTIFICATION_KINDS`, so they are durable
  30-day receipts rather than 7-day chatter.
- `Organization.planReminderDays` records the **lowest rung already sent for the current
  plan period**. The sweep only ever tightens (20 → 7 → 1), which makes it idempotent: the
  job can run any number of times a day without repeating itself. Applying a plan clears the
  field, so a renewed org starts its ladder afresh.
- On the **main board**, `PlanBanner` shows the same warning inside the org from the 20-day
  mark, with *Renew or upgrade* (root owners — files the §4b request), *See plans*, and
  *Dismiss*. An **expired** banner cannot be dismissed: at that point the org is restricted
  and hiding the notice would only hide the reason. Members never see it — it is not
  theirs to act on; non-root owners see who to ask.
- The console mirrors this: `GET /admin/summary` feeds attention badges on the
  Organizations and Requests tabs (pending requests, orgs inside the 20-day window, orgs
  already expired), and the Expires column flags how close each one is.

## 7. Super-admin ("Knowledge Base") console

Separate auth realm (`platform/tokens.ts`, audience `kv-platform-admin`; `PlatformAdmin`
table). Reached from the footer **"Knowledge base employee login"** → `/kbase/login` →
`/kbase`. Capabilities:

- **Organizations** — god view of every org (owners, plan, expiry, member/document/upload
  counts against their limits, role counts, tree depth); set/upgrade a plan with a custom
  duration and per-org member / custom-document / upload limits. The plan chooser lists the
  **live `PricingPlan` rows**, so a plan created in the console is immediately selectable.
  The Expires column flags anything inside the reminder window or already lapsed.
- **Requests** — approve or deny, both with a custom message. `CREATE_ORG` / `CUSTOM_PLAN` /
  `RESTORE_ORG` approvals issue an OTP + terms; `PLAN_RENEWAL` approvals **apply the plan
  directly** to the target org (§4b). Any decision may carry a coin gift.
- **Attention badges** — `GET /admin/summary` drives counters on the tab bar: requests
  waiting for a decision, orgs expiring within 20 days, and orgs already expired.
- **Coins** — gift/adjust any user.
- **Admins** — add any project member as a super-admin; activate/deactivate. First admin is
  seeded; new admins must change their password on first login.
- Every action is written to `PlatformAdminAudit`.

The URL is not the security boundary — auth is. The footer link is only for discovery.

## 8. Clean-setup tooling

- `pnpm --filter @vault/api db:reset` → `prisma migrate reset --force` (drops, re-migrates, re-seeds).
- `pnpm --filter @vault/api db:reset:data` → truncates all app data (keeps schema/migrations) via `prisma/reset.sql`, then re-seeds.
- Both refuse to run when `NODE_ENV=production`.

## 9. Security notes

- The bootstrap admin password is stored **hashed** and must be rotated on first login;
  treat any password shared out-of-band as compromised.
- OTPs and restore keys are **hashed at rest, single-use, 24h**.
- The super-admin realm is god-mode: isolated auth, re-checked `active` flag on every
  request, full audit trail.

## 10. Deferred

- Real payment gateway / buying coins with money (`/payment` placeholder for now).
- Per-country coin conversion chart.
- Automatic expiry reminders and read-only locking of expired orgs (status + gates are in;
  full lockout of every org route is a follow-up).
- Email delivery of codes (in-app notifications are the channel today).
