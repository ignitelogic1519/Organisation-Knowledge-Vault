# Knowledge Vault

Multi-tenant organizational training & compliance platform — mandatory and role-based
learning (documents, books, audio, video), structured as a tree of roles where every
organization owns its own data and its own existence (`.main` file custody model).

## Repository layout

```
apps/web          Next.js frontend (Vercel) — themes, constellation UI
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
| [docs/design.md](docs/design.md) | Design language: Apple/Intune-inspired, theme tokens, constellation graph |
| [docs/setup-guide.md](docs/setup-guide.md) | Step-by-step Vercel / Render / Neon deployment |
| [docs/future.md](docs/future.md) | Deferred features register |
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
