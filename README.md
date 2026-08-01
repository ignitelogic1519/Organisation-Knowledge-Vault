# Knowledge Vault

Multi-tenant organizational training & compliance platform — mandatory and role-based
learning (documents, books, links, audio, video), structured as a tree of roles where every
organization owns its own data and its own existence (`.main` file custody model).

## Current status

The platform is live end-to-end. What works today:

- **Identity** — username-based global profiles (no email), refresh-token sessions,
  retype-to-confirm on every new password.
- **Organizations** — Supreme-password custody model, `.main` existence backups and
  revival, 30-day soft-delete retention, per-branch `.bkp` backups.
- **The Constellation** — the org's main page: the role tree drawn as a top-down star
  map. Clicking a star you govern opens the action panel (Group configuration / People /
  Courses / Backup); the Supreme zone lives on the root star. Clicking a position you
  have no access to says so. Live-updates over SSE for every member.
- **Governance** — owners hold only granted rights (create sub-groups, appoint
  co-owners) and can never grant a right they don't hold themselves; branch deletion
  needs the level above (by request); branches are public by default with hidden
  cascading down the subtree (owners above always keep seeing their branches).
- **Requests** — labeled ask-and-approve center (Course / Join / Deletion / Visibility
  requests) with a live count badge, inbox for deciders, withdraw/delete, 7-day
  auto-cleanup, and per-branch configuration on course-request approval. Join requests
  carry the desired position (member or sub-owner).
- **Courses & learning** — role-scoped publishing with per-branch overrides (mandatory,
  inheritance, deadline, recurrence), prerequisites, manual completion, recurrence
  expiry, overdue escalation. Content opens in the **in-app viewer** (complete,
  fullscreen, related documents, rate & review) — never a second tab.
- **Library & documents** — an org-wide catalog shelved by dynamic **category tags**,
  filterable by type / shelf / classification / rating; every document carries a compulsory
  **classification** (Public/Confidential/Private/Secret), a standard auto-generated cover
  (org, title, version, date, author) + scope page and header/footer, and an
  owner-controlled download option. Ratings & comments after completion.
- **Authoring** — a **Document Studio**: a three-pane editor (insert rail · paper canvas ·
  block inspector) with a formatting ribbon (fonts, sizes, text colour, highlight,
  alignment, lists, links), drag-and-drop blocks, a **spreadsheet-style table editor**
  (add/remove rows & columns, per-cell formatting, paste TSV/CSV), an **audio/video player**
  with speed, quality ladder and non-skippable playback, **page-turn animations**,
  block entrance motion, live preview and a **present** mode — plus file upload. Owners
  publish directly; **members granted content rights propose** documents that publish only
  after a manager's **Document-review** approval.
- **Compliance** — a manager tab: per-course compliance for any branch you govern
  (ownership can sit on several levels), non-compliant lists, and one-click reminders
  with a default or custom message.
- **Notifications** — categorized, informative, clickable (deep-links to the exact
  request), live over SSE, per-message dismiss / clear-all, 7-day auto-cleanup and a
  nudge when the inbox passes 10 messages.
- **Plans, coins & administration** — organization creation is gated behind a **plan** and a
  one-time **access code (OTP)**; a dynamic **Pricing** page and **Knowledge Coins** (150 per
  profile) drive it, and a separate **super-admin console** (`/kbase`, footer login) approves
  requests, gifts coins, and sets plans. Plans travel (signed) inside the `.main` file, so an
  expired free org routes to Pricing on restore. Plans also meter **content**: the free demo
  structure allows **20 Studio documents** and **30 uploads**, and server-side **drafts** are a
  premium capability. See [docs/pricing.md](docs/pricing.md).

## Repository layout

```
apps/web          Next.js frontend (Vercel) — glass design system, constellation UI
apps/api          Fastify + Prisma API (Render) — same API the future mobile app uses
packages/shared   Shared types, course-code helpers, THE central policy function
docs/             The project contract — read these first
```

## Documentation

| File | Purpose |
|------|---------|
| [docs/plan.md](docs/plan.md) | Phased delivery plan (Phase 0–8) with "done when" criteria |
| [docs/structure.md](docs/structure.md) | Normative spec: entities, tree invariants, permissions, file formats |
| [docs/pricing.md](docs/pricing.md) | Plans, Knowledge Coins, OTP-gated creation, the super-admin console & `.main` v2 |
| [docs/architecture.md](docs/architecture.md) | Stack, data model, API surface, storage adapter port |
| [docs/design.md](docs/design.md) | Design language: glassmorphism tokens, constellation graph |
| [docs/setup-guide.md](docs/setup-guide.md) | Step-by-step Vercel / Render / Neon deployment |
| [docs/future.md](docs/future.md) | Deferred features register — including the planned AI library assistant |
| [docs/enterprise-identity.md](docs/enterprise-identity.md) | Feasibility study: Entra ID / Active Directory SSO, SCIM user lifecycle, Intune device trust |
| [docs/document-signing.md](docs/document-signing.md) | Design study: electronic signatures, document lifecycle states, signed acknowledgement |
| [docs/confidence-report.md](docs/confidence-report.md) | Pre-coding design review & scores |

## Quick start

```bash
pnpm install
pnpm --filter @vault/shared build
pnpm --filter @vault/api dev    # terminal 1 → http://localhost:4000
pnpm --filter @vault/web dev    # terminal 2 → http://localhost:3000
```

Working agreement: behavior changes are written into `docs/structure.md` **before** code, and
all authorization goes through the single `can()` policy function in `packages/shared`.
