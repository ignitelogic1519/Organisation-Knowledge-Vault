# 00 — Handoff brief

*A self-contained briefing for a fresh session. Everything needed to start work on
organization-provided storage, with no prior conversation.*

---

## The project

**Knowledge Vault** — a multi-tenant organizational training and compliance platform. An
organization is a tree of roles; people are placed on roles as owners or members; documents
and exams are published onto roles and can inherit down the branch; compliance tracks who has
completed what.

- `apps/api` — Fastify + Prisma + **PostgreSQL** (Neon), deployed on Render
- `apps/web` — Next.js 15 / React 19, deployed on Vercel
- `packages/shared` — types, zod schemas, and the central `can()` policy function
- Working agreement: behaviour changes go into `docs/structure.md` **before** code, and all
  authorization goes through `can()` in `packages/shared`

Read `docs/architecture.md` and `docs/structure.md` first — they are the normative spec.

---

## The job

**Remove our dependency on storing organization content.** Today every byte lives in our
Postgres. It must move to storage the organization chooses, configures and pays for — S3,
Cloudflare R2, Google Cloud Storage, Azure Blob, Google Drive, OneDrive/SharePoint, a NAS, a
VPS, MinIO, and so on.

**Scope is everything the organization creates**, not just uploads:

- uploaded files (PDF, image, audio, video)
- **Studio-authored documents** (the block array)
- **exams / quizzes** (questions and answer key)
- Studio drafts

**What stays in our database** — the catalogue, not the contents:

- structure: roles, placements, capabilities
- course *metadata*: code, title, description, classification, kind, version, category,
  placements, prerequisites, deadlines, recurrence
- completion records, exam *results* (score, pass/fail, attempts, violations)
- requests, mailbox, plans, coins, audit logs
- the `storageRef` pointer and a per-object integrity hash

Rule of thumb: **we keep the index, they keep the books.**

---

## Where data lives today (verified in code, not remembered)

| Content | Exact location | Notes |
|---------|---------------|-------|
| Uploaded files | `StoredFile.data` — a Postgres `Bytes` column | gzipped at rest; **hard 10 MB cap** |
| Studio documents | `Course.storageRef` JSON, `adapter:"authored"` | block array inside the JSON |
| Exams | `Course.storageRef` JSON, `adapter:"exam"` | questions **+ answer key** |
| External links | `Course.storageRef` JSON, `adapter:"link"` | URL only — **zero bytes stored** |
| Studio drafts | `StudioDraft.document` JSON | |
| Avatars | `Profile.avatar` | base64 data-URL, ~300 KB cap |

Files are served **through the API**: `GET /courses/:code/content` authenticates, checks the
course reaches the reader, pulls the row, inflates it, sniffs the real MIME from magic bytes,
streams it back. Bytes go DB → API → browser on **every read**.

**Why it must change:** Neon free tier ≈ 0.5 GB. At the 10 MB cap that is ~50 files across the
*entire platform*. The Pricing page currently promises the free plan 150 GB, which the
database would die at roughly 0.3% of.

---

## The good news — the port already exists

`apps/api/src/storage/adapter.ts` is a **storage adapter port**. Every course carries
`storageRef: { adapter: "...", ... }` and `storage.resolve(ref)` is the *only* thing that
turns that into content. No course route, exam route, viewer, library or compliance code
touches bytes directly.

Current adapters: `inline` · `link` · `authored` · `exam` · `unreachable`.

- `link` already proves the pattern end to end — those courses store **nothing** with us.
- `unreachable` is a post-revival marker meaning *"we know this exists, we can't fetch it
  right now"* — **exactly the state an org backend hits when credentials expire**, and the
  viewer already handles it gracefully.

Adding a backend = implementing `save*`/`resolve` for one more adapter name.

Relevant existing pieces:
- `apps/api/src/orgs/plan.ts` — `orgStorageUsedMb()`, `assertContentQuota()`; `Organization.storageLimitMb` and `PricingPlan.storageLimitMb` already exist
- `apps/api/src/vault-files/` — `.main` (org existence backup, encrypted with the Supreme password) and `.bkp` (per-branch backup)
- `apps/api/src/exams/routes.ts` — `loadExam()` calls `storage.resolve()`; marking is server-side and the answer key never reaches the browser

---

## Design already written

`Data Storage Architecture/` in the repo:

| Doc | Contents |
|-----|----------|
| `01-where-data-lives-today.md` | Current state, measured; what moves and what stays |
| `02-backend-requirements.md` | Every backend, grouped by capability; exact credentials per provider; a quick-reference matrix |
| `03-knowledge-vault-map.md` | The `Knowledge_vault_map` manifest written into their storage |
| `04-security-and-encryption.md` | Envelope encryption; three postures; the custody model |
| `05-open-questions.md` | Eight decisions still open, each with a recommendation |

**Read all five before proposing a design.** The conclusions below are load-bearing.

---

## Five conclusions that shape everything

### 1. Reachability is the real constraint, not credentials
Our API is in a datacentre. A NAS at `192.168.1.50` is unreachable — no correct credential
fixes that. Backends split into:

- **Internet-reachable** (S3, R2, GCS, Azure, Drive, OneDrive, exposed VPS/MinIO) — workable
- **Private LAN** (NAS, internal file server) — needs a connector we build and maintain, or
  browser-direct (fails for remote workers), or them exposing the NAS (not recommendable)

Current recommendation: point NAS owners at **MinIO in front of it** (one container, speaks
S3, gets presigned URLs). Build a connector only when organizations actually ask.

### 2. Signed URLs decide our bandwidth bill
S3-family issues presigned URLs → the browser talks **straight to their bucket** → bytes never
touch us. Google Drive and OneDrive cannot do this usefully → bytes **proxy through us** in
both directions. Drive fixes *their* storage bill, not *our* bandwidth bill.

**Build the S3-compatible adapter first** — one adapter covers S3, R2, GCS, MinIO, Wasabi, B2
and DO Spaces, with zero egress cost.

### 3. "Only permitted people see it" requires encryption
If a PDF sits in their Google Drive as a PDF, their Workspace admin can open it. Our
permission model guards *our* door; their storage has its own door we do not control.

Resolution: **envelope encryption**. Per-file key → per-org data key (DEK) → wrapped **twice**:
- by a **platform key** (in the environment, never in the DB) so normal reading is seamless
- by a **Supreme-password-derived key**, escrowed into the org's `.main` file

So if the platform disappears, *their storage + the map + their `.main`* still recovers
everything. Ship a standalone open-source decrypt tool so that promise is demonstrable.

Trade-off to state to customers plainly: **they can no longer browse their own documents in
their own Drive** — they see opaque `.kvblob` objects.

For S3-family, prefer **browser-side decryption** (Web Crypto, AES-GCM): the browser fetches
ciphertext direct from their bucket and we send only a per-file key over our authenticated
API. Bandwidth stays at zero. For Drive/OneDrive, decryption is server-side because the bytes
transit us anyway.

### 4. `Knowledge_vault_map` is a mirror, never the authority
We write a signed manifest into their storage listing structure, people and per-document
permissions — for portability, disaster recovery and audit.

**It must never be read as the source of permissions.** If it were, anyone who can write to
that folder (their IT contractor, a compromised laptop, an over-shared folder) would control
access to every document. Our DB stays authoritative; the map is a signed copy. Signature
mismatch ⇒ report tampering to owners and rewrite from the DB. Access never changes either way.

### 5. Moving exams has a specific consequence
The answer key currently lives in `Course.storageRef`. Once it is in their storage, **marking
an attempt requires our server to fetch and decrypt the paper first**. Still safe — the key
never reaches the candidate — but exam submission now depends on their storage being
reachable. Design for a short-lived server-side cache of the decrypted paper for the duration
of a sitting, and a clear failure mode if their storage is down mid-exam.

---

## Open decisions (see `05-open-questions.md` for full reasoning)

| # | Question | Standing recommendation |
|---|----------|------------------------|
| 1 | Private-network NAS: connector, browser-direct, expose, or MinIO guidance? | **MinIO guidance now**; connector only on real demand |
| 2 | Encryption: everything / by classification / none? | **Encrypt everything**, per-org setting, opt-out available |
| 3 | Org storage required, or optional? | **Required above the free plan**; free plan uses ours with small honest caps |
| 4 | Migrate existing `StoredFile` rows, or leave them? | **Migrate** — background, resumable, verify-then-drop |
| 5 | How much detail in the map? | Roles in the JSON; resolved names in a nightly `.md` |
| 6 | Free plan numbers (currently promises 150 GB on a 0.5 GB DB) | **Fix to ~500 MB / 30 documents** |
| 7 | Who configures storage? | **Root owners, behind the Supreme gate** |
| 8 | Max file size once off Postgres | ~200 MB S3-family, ~50 MB Drive/OneDrive |

**Questions 1 and 2 block the build.** Everything else can be decided as you go.

---

## Suggested first steps

1. Read the five design docs and `apps/api/src/storage/adapter.ts`.
2. Get decisions on questions 1 and 2.
3. Design the schema: an `OrgStorage` table (adapter, config JSON with encrypted credentials,
   status, last health check, wrapped DEK), plus `sha256` and `bytes` on stored objects.
4. Build **common machinery first**: credential vault (encrypted at rest, key outside the DB),
   connection test (write probe → read back → compare → delete, with precise failure
   reporting), scheduled health check, usage reporting, orphan collection.
5. Build the **S3-compatible adapter** with presigned URLs and browser-side crypto.
6. Then the background migration off `StoredFile`.
7. Then Google Drive, then OneDrive/SharePoint.

**Do not** start with Google Drive because it is the most-requested — it is the hardest, and
it is the one that leaves us paying for bandwidth.

---

## Non-negotiables

- All authorization keeps going through `can()` in `packages/shared`. Storage changes must not
  introduce a second permission path.
- The exam answer key never reaches a candidate's browser. Marking stays server-side.
- Their credentials are encrypted at rest with a key that is **not** in the database, never
  returned to the browser after saving, and every use audited.
- A storage failure is a **degraded read-only state** with a clear message — never something
  that looks like data loss.
- Behaviour changes are written into `docs/structure.md` before the code.

---

*Last updated: 2026-08-04*
