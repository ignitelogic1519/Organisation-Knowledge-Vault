# plan.md — Phased Delivery Plan

> What gets built, in what order, and how we know each phase is done.
> Specs live in `structure.md`; technical design in `architecture.md`; deferred scope in
> `future.md`. Written for step-by-step guided execution (the project owner is new to this
> stack — every phase ends with something visible and testable).

Ordering principle: each phase produces a usable increment, and nothing later forces a redesign
of anything earlier — the entities (Profile / Supreme / Role tree / Placement / Course code) are
locked by `structure.md` from Phase 1.

---

## Phase 0 — Foundations & "hello world" deploys ✅ DONE (2026-07-18)

**Goal:** the empty skeleton runs on all three services, so deployment is never a surprise later.

- pnpm monorepo: `apps/web` (Next.js), `apps/api` (Fastify), `packages/shared`.
- Prisma connected to Neon; first migration (empty).
- Deploy: web → Vercel, api → Render; web calls `GET /health` on api.
- Guided setup docs for creating the Vercel / Neon / Render / Google Cloud accounts.

**Done when:** visiting the Vercel URL shows a page that displays the Render API's health
response, with data read from Neon.

## Phase 1 — Global profiles & auth ✅ BUILT (2026-07-18 — awaiting production env setup, see setup-guide §4)

**Goal:** the "profile is the actor for everything" foundation.

- Register / login with email+password (Argon2id). Google OAuth: built dormant, activation
  deferred by owner decision (future.md §9).
- JWT access + refresh flow; `GET /me`; email verification sent via the platform Gmail account.
- Profile deletion endpoint with the owner-block rule stubbed (activates fully in Phase 2).

**Done when:** a person can sign up both ways, log in, refresh their session, and see their
profile page on the web app.

## Phase 2 — Organizations, Supreme & Owner role ✅ BUILT (2026-07-18)

**Goal:** org creation exactly as specified in `structure.md` §4.1.

- Create org → Supreme object (org number from global sequence) + Supreme password, with the
  explicit unrecoverability warning + confirmation in the creation flow.
- Owner role created with creator as first occupant; co-owners addable (invariant I2 enforced).
- Supreme-access gate endpoint (verify password, rate-limited, audit-logged).
- Profile deletion block now live: cannot delete while owning orgs.

**Done when:** a user creates an org, names the first role (CEO/Principal/…), adds a co-owner,
and the Supreme password gates owner-level changes.

## Phase 3 — Role tree, delegation & onboarding ✅ BUILT (2026-07-18)

**Goal:** the full "3D tree" structure.

- Create sub-roles (materialized path, per-org role numbers); `is_terminal` and
  `can_create_subgroups` flags with the change rules of invariant I6.
- Central `can()` policy function — all endpoints authorize through it from this phase on.
- Email onboarding: invite existing profile / sign-up link for new ones.
- Deletion rules: block non-empty subtree deletes; top-layer branch restructure.
- **My Structure** page: user's slice of the tree, add-people UI for delegation-enabled owners.

**Done when:** HR can be created under Owner, HR creates Assistant HR, adds people with
individual delegation flags, and a profile can verifiably sit in two branches at different
heights with correctly scoped powers in each.

## Phase 4 — Courses: upload, codes & placements ✅ BUILT (2026-07-18)

**Goal:** knowledge items with the platform-unique code scheme, no duplication.

- Storage adapter port + `GoogleDriveAdapter` (org connects its own Drive via OAuth,
  **`drive.file` scope only**; guided setup walkthrough included — the port stays open for
  future NAS/cloud adapters).
- Upload flow → code `org-role-item` generated; kinds: document/book/link/audio/video.
- Course placements: mandatory vs opt-in, inherit-to-descendants; share-by-code across branches
  (no approval).
- Course admin page with its separate 2-layer view/edit ACL.

**Done when:** HR uploads a PDF to the org's own Drive, gets code `456-989-0001`, places it as
mandatory+inherited; an unrelated branch adds the same course by code; usage shows on the
course admin page.

## Phase 5 — Learning experience & completion ✅ BUILT (2026-07-18)

**Goal:** the learner's side.

- **My Learning** page: mandatory (flagged) + opt-in catalog + enroll.
- Manual "mark as complete"; completion records are part of the user's data, keyed by the
  course's unique platform code, carrying course version and expiry time.
- Prerequisites: hard-block until required course completed; prereq state visible.
- Content viewing/streaming via adapter URLs.

**Done when:** a member sees their mandatory course, is blocked from course B until course A is
complete, finishes both, and the records show the right versions.

## Phase 6 — Compliance engine ✅ BUILT (2026-07-18)

**Goal:** recurrence, deadlines, escalation. (Exams are deferred out of v1 entirely —
see `future.md`; recurrence applies to all course kinds.)

- `retake_every_n_days` recurrence: `validUntil` computed; expiry re-assigns (nightly job,
  triggered via a free external scheduler — GitHub Actions `schedule` hitting a protected
  endpoint, since Render's free tier sleeps).
- Optional deadlines; overdue → in-app notification to user + escalation target with fallback
  chain (adder → node owners → up the branch).
- Course update flag: `resets_completion_on_update` honored and communicated to end users.
- In-app notification center (feed + read state) — the channel all of the above uses.

**Done when:** a security course set to 365-day recurrence expires a completion and
re-assigns it; an overdue mandatory course notifies the user and the correct escalation
person even after the original adder has left the org.

## Phase 7 — `.main`, `.bkp` & the deletion lifecycle ✅ BUILT (2026-07-18)

**Goal:** the existence/backup machinery — last, because it exports everything the earlier
phases created.

- `.main` export: encrypted full-org bundle, key derived from Supreme password (download gated
  by the Supreme password); **versioned bundle format** with import migrations; org/role numbers
  never reused; revival ends with the storage-reconnection step and pending-member re-attachment.
  (This machinery gets a walkthrough explanation during website testing.)
- Deletion flow: prompt `.main` download → confirmation email from platform mail → soft delete →
  30-day retention → nightly purge job.
- Revival: within 30 days from DB; after, via `.main` upload (rejected if org still exists).
- `.bkp` per node: export by node owners; restore with full-restore semantics, current-node-only,
  no children; **identical-structure-only** gate (`structureHash` exact match, else deny with
  message); orphan-handling table applied; restore report shown to the restorer.

**Done when:** a deleted org is revived from its `.main` after the 30-day purge, and a node
restore correctly denies when the branch was restructured beyond tolerance.

## Phase 8 — Polish & v1 release

- Landing page, org switcher, empty states, mobile-responsive pass (the web app is the only
  client until the mobile app).
- Seed/demo organization; guided admin walkthrough.
- Security review (rate limits, upload validation, policy-function audit) and free-tier load
  sanity check.

**Done when:** a stranger can sign up, create an org, build a small tree, upload a course, and
a second stranger can be onboarded and complete it — with no guidance from us.

---

## Explicitly Out of v1 (tracked in `future.md`)

**Exams (entire system: builder, scoring, thresholds, retake-after-failure, certificates)** ·
granular capability switches · advanced completion tracking (watch %, acknowledgments) ·
org-chart graph tab · incident templates for restructuring · authoring suite (templates, AI
conversion, audiobooks) · NAS/S3/cloud adapters · mobile app · email/push notification
channels (post-incident-management).

## Working Agreement

- Documents are the contract: behavior changes get written into `structure.md` **before** code.
- Every phase merges to `main` deployed and demonstrable — no long-lived half-built states.
- All server logic authorizes through the single `can()` policy function; anything else is a bug.
