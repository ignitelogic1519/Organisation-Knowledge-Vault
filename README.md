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
- **Library** — an organization-wide catalog shelved by dynamic **category tags** (with
  similarity-based shelf suggestions at upload), filterable by type / shelf / rating,
  sortable, searchable; detail view shows description, completions, branches using it,
  and member ratings & comments (written after completing a course).
- **Compliance** — a manager tab: per-course compliance for any branch you govern
  (ownership can sit on several levels), non-compliant lists, and one-click reminders
  with a default or custom message.
- **Notifications** — categorized, informative, clickable (deep-links to the exact
  request), live over SSE, per-message dismiss / clear-all, 7-day auto-cleanup and a
  nudge when the inbox passes 10 messages.

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
| [docs/architecture.md](docs/architecture.md) | Stack, data model, API surface, storage adapter port |
| [docs/design.md](docs/design.md) | Design language: glassmorphism tokens, constellation graph |
| [docs/setup-guide.md](docs/setup-guide.md) | Step-by-step Vercel / Render / Neon deployment |
| [docs/future.md](docs/future.md) | Deferred features register — including the planned AI library assistant |
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
