# architecture.md — Technical Architecture

> How `structure.md` gets implemented on the chosen free-tier infrastructure.
> Written to be beginner-friendly: every technology choice notes *why*.

---

## 1. System Overview

```
 ┌────────────┐        HTTPS/JSON         ┌─────────────┐       SQL        ┌────────┐
 │  Next.js   │ ────────────────────────► │  API server │ ───────────────► │  Neon  │
 │  (Vercel)  │   REST API (same API      │  (Render)   │                  │Postgres│
 │  web app   │   the mobile app will     │ Node + TS   │                  └────────┘
 └────────────┘   use later)              │  Fastify    │
                                          │  + Prisma   │──► Storage Adapter ──► Google Drive
                                          └─────────────┘    (port; per-org)     (org's own)
```

- **Frontend:** Next.js (React) on Vercel. Renders the website, login, dashboards.
- **Backend:** a separate API server on Render — deliberately independent of the frontend so the
  future **mobile app consumes the exact same API**.
- **Database:** Neon serverless Postgres — the live operational store.
- **Media:** never in our DB — streamed to the organization's own storage backend through the
  **storage adapter port** (Google Drive is adapter #1).

## 2. Stack Choices (and why)

| Layer | Choice | Why |
|-------|--------|-----|
| Language | **TypeScript everywhere** | One language for web, API, and shared types — least to learn, types catch mistakes early. |
| Frontend | **Next.js 14+ (App Router)** | First-class on Vercel free tier; file-based routing is beginner-friendly. |
| API framework | **Fastify** | Small, fast, well-documented; simpler mental model than NestJS for a first backend. |
| ORM | **Prisma** | Schema-as-code, generated types, painless migrations against Neon. |
| Auth | Email+password (**Argon2id** hashes) + **Google OAuth**; API issues **JWT access + refresh tokens** | Token auth works identically for the future mobile app; both methods are free. |
| Validation | **Zod** shared between web and API | One schema validates a form on the client and the request on the server. |
| Monorepo | **pnpm workspaces**: `apps/web`, `apps/api`, `packages/shared` | Shared types/Zod schemas without publishing packages. |

### Repository layout

```
/apps
  /web          → Next.js app (deployed to Vercel)
  /api          → Fastify app (deployed to Render)
/packages
  /shared       → types, Zod schemas, constants (course-code format, policy types)
/docs           → these documents
```

---

## 3. Data Model (Prisma-style sketch)

```prisma
model Profile {            // global identity (structure.md §1.1)
  id            String   @id @default(uuid())
  email         String   @unique
  passwordHash  String?              // null if Google-only
  googleId      String?  @unique
  displayName   String
  memberships   Membership[]
}

model Organization {       // the Supreme is this row's root aspect (§1.2)
  id             String  @id @default(uuid())
  name           String
  orgNumber      Int     @unique     // platform-unique, e.g. 456
  supremeHash    String              // Argon2id of the Supreme password
  deletedAt      DateTime?           // soft delete; purge job after 30 days
  roles          RoleNode[]
  courses        Course[]
}

model RoleNode {
  id           String   @id @default(uuid())
  orgId        String
  parentId     String?              // null only for the Owner role
  name         String               // "HR", "Owner", "CEO", …
  roleNumber   Int                  // unique within org, e.g. 989
  isTerminal   Boolean  @default(false)
  path         String               // materialized path, e.g. "root.hr.assistant_hr"
  @@unique([orgId, roleNumber])
}

model Membership {         // profile ↔ org
  id        String @id @default(uuid())
  profileId String
  orgId     String
  @@unique([profileId, orgId])
}

model Placement {          // membership ↔ role node (§1.4)
  id                 String  @id @default(uuid())
  membershipId       String
  roleNodeId         String
  kind               PlacementKind   // OWNER | MEMBER
  canCreateSubgroups Boolean @default(false)  // meaningful for OWNER
  addedByProfileId   String          // escalation target (§3.4 structure.md)
  @@unique([membershipId, roleNodeId, kind])
}

model Course {
  id                       String  @id @default(uuid())
  orgId                    String
  code                     String  @unique  // "456-989-0001"
  uploaderRoleNodeId       String
  kind                     CourseKind      // DOCUMENT | AUDIO | VIDEO | BOOK | LINK (EXAM: post-v1)
  title                    String
  storageRef               Json            // adapter-specific pointer (Drive fileId, …)
  deadlineDays             Int?            // optional deadline
  retakeEveryNDays         Int?            // recurrence (§3.4) — applies to all course kinds
  resetsCompletionOnUpdate Boolean @default(false)
  version                  Int     @default(1)
  prerequisites            CoursePrerequisite[]
  placements               CoursePlacement[]
}

model CoursePlacement {    // where a course is used (§3.2)
  id                  String  @id @default(uuid())
  courseId            String
  roleNodeId          String
  mandatory           Boolean
  inheritToDescendants Boolean
  placedByProfileId   String
  @@unique([courseId, roleNodeId])
}

model CoursePrerequisite { // course dependency trees (§3.5)
  courseId       String
  requiresCourseId String
  @@id([courseId, requiresCourseId])
}

model CourseAdminAccess {  // the separate per-course permission page (§3.3)
  id         String @id @default(uuid())
  courseId   String
  profileId  String
  level      AccessLevel   // VIEW | EDIT
  canGrant   Boolean       // may add more people (2-layer tree)
  grantedBy  String
  @@unique([courseId, profileId])
}

model CompletionRecord {   // part of the USER's data, keyed by course code (structure.md §3.7)
  id           String   @id @default(uuid())
  courseId     String
  courseCode   String            // platform-unique code, stored denormalized for exports
  profileId    String
  orgId        String
  status       CompletionStatus  // ASSIGNED | IN_PROGRESS | COMPLETED | EXPIRED
  completedAt  DateTime?
  validUntil   DateTime?         // expiry: completedAt + retakeEveryNDays
  courseVersion Int              // which version was completed
  // exam fields (score, pass/fail, re-attempt time) join here when exams ship (future.md)
}

model Notification {       // in-app only (v1)
  id        String   @id @default(uuid())
  profileId String
  orgId     String?
  kind      String
  payload   Json
  readAt    DateTime?
  createdAt DateTime @default(now())
}
```

Sequences: `orgNumber` from a global DB sequence; `roleNumber` per-org counter on
`Organization`; item number per-role counter on `RoleNode`.

### Tree representation
**Materialized path** (`RoleNode.path`) — chosen over closure tables for simplicity:
- Ancestor check (the heart of the permission model) is one `LIKE 'prefix%'` / string-prefix test.
- Course inheritance ("all descendants of node X") is the same prefix query.
- Restructuring rewrites paths of a subtree in one UPDATE — acceptable at our scale.

### Permission engine
One central function, exactly as `structure.md` §2.1 defines — **no permission logic anywhere
else** (this is what lets `future.md`'s granular capabilities replace the v1 bundle without
touching call sites):

```ts
// packages/shared — used by the API on every request
can(profile, action, node): boolean
```

---

## 4. Storage Adapter Port

```ts
interface StorageAdapter {
  upload(orgId: string, file: Stream, meta: FileMeta): Promise<StorageRef>;
  getStreamUrl(ref: StorageRef): Promise<string>;   // playback/download URL
  delete(ref: StorageRef): Promise<void>;
  healthCheck(): Promise<AdapterStatus>;
}
```

- Each organization connects **its own backend** (own quota, own custody).
- v1 ships `GoogleDriveAdapter` (org connects via OAuth; files live in the org's Drive).
  - **Scope rule:** request only the **`drive.file`** scope (access limited to files this app
    created). It is non-restricted — avoids Google's app-verification process and user caps —
    and is all we need. Setup will be a guided, step-by-step walkthrough.
- The `Course.storageRef` JSON keeps adapter name + adapter-specific pointer, so NAS/S3/cloud
  adapters (see `future.md`) drop in later without schema changes — this end stays open by design.

---

## 5. `.main` and `.bkp` File Design

Both are **encrypted JSON bundles**:

```
[ magic bytes ][ header: version, orgNumber, scope, structureHash, kdfParams ][ AES-256-GCM payload ]
```

- **Key derivation:** Argon2id over the Supreme password (for `.main`) — the platform stores
  neither key nor plaintext. `.bkp` uses the same construction with the node scope in the header.
- **`.main` payload:** full org export — structure, memberships, placements, course metadata,
  completion records. Storage media itself is NOT inside (it lives in the org's own Drive);
  the export carries the `storageRef`s.
- **`.bkp` payload:** one node's owners/members/placements/records (or full tree when exported
  by the Owner role). Child nodes are excluded from restore.
- **`structureHash` (the restore gate):** hash of the node's normalized structural fingerprint
  (path, role number, child skeleton) at export time. On restore, the live fingerprint is
  recomputed — **any mismatch ⇒ restore denied** ("structure has changed severely"). v1 uses
  exact equality, no tolerance; a successful restore emits a **restore report** (applied /
  skipped / why, per the orphan-handling table in `structure.md` §5.2).
- **Revival:** upload `.main` + Supreme password → decrypt → reject if `orgNumber` still active →
  otherwise rebuild rows in a transaction → mandatory **storage reconnection step** (media marked
  unreachable until reconnected) → unmatched `profileId + email` entries become **pending
  members** re-attached when that email joins.
- **Durability rules (hard requirements):** versioned bundle format with import migrations for
  every format change; org numbers (and role numbers) are **never reused**, sequences only
  increment. (Full rationale demonstrated during website testing — structure.md §5.1.)

Deletion lifecycle (implements structure.md §4.3): `deletedAt` soft delete → nightly purge job
removes orgs where `deletedAt < now() - 30 days` → after purge, `.main` is the only way back.

---

## 6. API Surface (v1 sketch)

```
POST   /auth/register | /auth/login | /auth/google | /auth/refresh
GET    /me                          → profile + memberships
DELETE /me                          → blocked while owning orgs (I-rule)

POST   /orgs                        → create org (+ Supreme password)
POST   /orgs/:id/supreme/verify     → Supreme-access gate (owner-level changes, .main download)
DELETE /orgs/:id                    → deletion flow (prompts .main download first)
POST   /orgs/revive                 → upload .main

GET/POST /orgs/:id/roles            → tree read / create sub-role
PATCH  /orgs/:id/roles/:rid         → flags (is_terminal), rename, restructure
POST   /orgs/:id/roles/:rid/people  → invite/add owner or member (email flow)

POST   /orgs/:id/courses            → upload (goes through storage adapter)
GET    /courses/:code               → resolve by platform-unique code
POST   /courses/:code/placements    → place into a branch (mandatory/inherit flags)
GET    /courses/:code/admin         → course admin page (separate ACL)

GET    /orgs/:id/my-learning        → assignments + opt-in catalog + prereq state
GET    /orgs/:id/my-structure       → user's slice of the tree
POST   /courses/:code/complete      → mark complete (exam submission arrives post-v1)
GET    /notifications               → in-app feed

POST   /orgs/:id/roles/:rid/backup  → export .bkp
POST   /orgs/:id/roles/:rid/restore → upload .bkp (structureHash check)
```

All endpoints JSON over HTTPS, JWT bearer auth, Zod-validated. This same API is the future
mobile app's contract — no web-only shortcuts allowed.

---

## 7. Free-Tier Constraints & Mitigations

| Service | Constraint | Mitigation |
|---------|-----------|------------|
| Render (free) | API sleeps after inactivity → cold starts ~30-60 s | Acceptable for v1; health-ping later if needed. |
| Neon (free) | ~0.5 GB storage, connection limits | Prisma connection pooling; media never in DB. |
| Vercel (free) | Serverless limits | Frontend only; heavy work lives on the API. |
| Google Drive | 15 GB per account; not a streaming CDN | Per-org OAuth (each org brings its own quota); playback via Drive preview/stream URLs — accepted v1 limitation. |
| Gmail (transactional mail) | Low daily send limits | Only two mail types in v1: deletion confirmation + sign-up email verification. |
| Nightly jobs | Render free tier sleeps; no reliable built-in cron | Jobs exposed as a protected API endpoint, triggered by a free external scheduler (GitHub Actions `schedule`). |

---

## 8. Security Notes

- Argon2id for both profile passwords and the Supreme password; Supreme password is additionally
  the `.main` encryption key source — it is **never** stored in recoverable form.
- JWT: short-lived access token + rotating refresh token; org context re-checked server-side on
  every request via the central `can()` policy (never trust client-sent role info).
- Supreme-access gate is rate-limited and audit-logged (gate entries only — Supreme performs no
  actions itself).
- All uploads virus-size-type checked before hitting the storage adapter.
- Secrets (DB URL, JWT keys, Google OAuth creds, mail creds) live in Vercel/Render environment
  settings — never in the repo.
