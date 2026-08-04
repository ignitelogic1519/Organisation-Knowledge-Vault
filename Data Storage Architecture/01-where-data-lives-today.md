# 01 — Where data lives today

Measured from the code, not remembered.

## Everything is in Postgres

There is no object store, no disk volume, no bucket. One database holds all of it.

| What | Where exactly | Notes |
|------|--------------|-------|
| **Uploaded files** (PDF, image, audio, video) | `StoredFile.data` — a `Bytes` column | gzipped at rest when that helps; **hard 10 MB cap per file** |
| **Studio documents** | `Course.storageRef` JSON, `adapter: "authored"` | the block array lives inside the JSON |
| **Exam papers** | `Course.storageRef` JSON, `adapter: "exam"` | questions *and* answer key |
| **External links** | `Course.storageRef` JSON, `adapter: "link"` | just a URL — **zero bytes stored** |
| **Studio drafts** | `StudioDraft.document` JSON | |
| **Avatars** | `Profile.avatar` | base64 data-URL, ~300 KB cap |

Files are served **through the API**: `GET /courses/:code/content` authenticates the reader,
checks the course reaches them, pulls the row, inflates it, sniffs the real content type from
magic bytes, and streams it back. Bytes go database → API → browser on **every single read**.

## Why it does not scale

**Space.** Neon's free tier is around 0.5 GB. At the 10 MB ceiling that is roughly **50 files
across the entire platform** — not per organization, per *platform*. The 150 GB free-plan
allowance now shown on the Pricing page is, on this infrastructure, fiction: the database
would die at about 0.3% of it.

**Contention.** `StoredFile` sits in the same database as roles, placements and completion
records. Document bytes compete for connections, cache and I/O with the data that actually
needs to be transactional, and they inflate every backup and every restore.

**Bandwidth.** Every read is a full round trip through our API. A 200-person org opening a
5 MB induction PDF once each is a gigabyte of egress off our host, for a file that never
changes.

**Cost sits in the wrong place.** An organization with 40 GB of training video costs us
money and costs them nothing. That is the thing being fixed.

## What is already right

The escape hatch was built in from the start, and it is the reason this is a contained change
rather than a rewrite.

`apps/api/src/storage/adapter.ts` is a **port**. Every course carries
`storageRef: { adapter: "...", ... }`, and `storage.resolve()` is the only thing that turns
that into content. No course route, exam route, viewer, library or compliance code touches
bytes directly.

Adding a backend means implementing `save*` and `resolve` for one more adapter name. The
`"link"` adapter already proves the pattern end to end — those courses store **nothing** with
us and work perfectly today.

There is also an `"unreachable"` adapter, used after a `.main` revival to mark media that
needs its storage reconnected. That state — *"we know this document exists, we cannot fetch
it right now"* — is exactly the state an org-provided backend will hit when credentials
expire, and the viewer already handles it.

## What moves, and what does not

**Moves:** uploaded files. That is the whole storage problem.

**Stays:** Studio documents and exam papers. They are structured data rather than files —
small, queried, versioned, and in the exam's case security-critical (the answer key must
never leave the server). Moving them would buy nothing and cost a great deal.

**Also stays:** everything non-storage. Roles, placements, capabilities, requests,
compliance records, exam attempts, the mailbox, plans, coins. None of it is large.

---

*Last updated: 2026-08-04*
