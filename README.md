# Knowledge Vault

Multi-tenant organizational training & compliance platform — mandatory and role-based
learning (documents, books, links, audio, video), structured as a tree of roles where every
organization owns its own data and its own existence (`.main` file custody model).

## Current status

The platform is live end-to-end. What works today:

- **Identity** — username-based global profiles (no email), refresh-token sessions that
  **end after an hour of inactivity** (announced with a minute to spare, enforced by the
  API on every request), retype-to-confirm on every new password.
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
  profile) drive it. Plans travel (signed) inside the `.main` file, so an expired free org
  routes to Pricing on restore. Plans also meter **content**: the free demo structure allows
  **20 Studio documents** and **30 uploads**, and server-side **drafts** are a premium
  capability. See [docs/pricing.md](docs/pricing.md).
- **The Knowledge Base console** (`/kbase`, footer login) — the staff portal, rebuilt on a
  section rail with seven sections: an **Overview** of the whole platform, **Organizations**
  (search, filter, sort, cards or table, and a five-tab drawer where every property is
  editable in place), **Users**, **Requests**, **Coins**, **Administrators** and a
  **Glossary**. Every property explains itself on hover, and the whole console is built to be
  used in a quarter-screen window beside a support ticket.
- **Storage** — documents live on storage the organization provides. `/storage` describes each
  backend end to end: **NAS** on your own hardware and the **KVEP** employee perk today, cloud
  object storage next, cloud drives and private-network NAS under examination. The set is a
  register (`apps/web/src/lib/storage-backends.ts`), so a new backend is one entry rather than
  a page rewrite — see [docs/structure.md](docs/structure.md) §9.15.

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
| [docs/confidence-report.md](docs/confidence-report.md) | Pre-coding design review & scores |

## Design in progress

| Folder | Purpose |
|--------|---------|
| [Data Storage Architecture](Data%20Storage%20Architecture/README.md) | Moving document bytes off our infrastructure and onto storage the organization provides — backend requirements, the `Knowledge_vault_map` manifest, the encryption model, and the open questions |

## Guide books

Two books, two audiences. Both are Markdown chapters with a single-file PDF built from them.

| Book | For | PDF |
|------|-----|-----|
| [Main Guide Book](Main%20Guide%20Book/README.md) | End users, owners and managers. Published with the product — the Help page serves it for download. | `Main Guide Book/Knowledge-Vault-Main-Guide-Book.pdf` |
| [Super Admin Guide Book](Super%20Admin%20Guide%20Book/README.md) | **The Knowledge Base team only.** The administration console. Never published with the product. | `Super Admin Guide Book/Knowledge-Vault-Super-Admin-Guide-Book.pdf` |

The main book contains **no** super-admin material by design: what a customer can download
should not double as a map of the staff console.

```bash
cd guide-book-tools
npm install                  # one-off: markdown-it, mermaid, sharp, playwright
npm run build                # rebuild both PDFs
npm run build:publish        # rebuild the main book and copy it into apps/web/public/guide
```

## Quick start

```bash
pnpm install
pnpm --filter @vault/shared build
pnpm --filter @vault/api dev    # terminal 1 → http://localhost:4000
pnpm --filter @vault/web dev    # terminal 2 → http://localhost:3000
```

Working agreement: behavior changes are written into `docs/structure.md` **before** code, and
all authorization goes through the single `can()` policy function in `packages/shared`.
