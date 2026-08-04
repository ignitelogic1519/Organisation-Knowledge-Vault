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

**Owner decision, 2026-08-04:** *everything that is the organization's own content* moves to
their storage — uploaded files, Studio-authored documents, and exams/quizzes alike. If an
organization created it, it lives on their storage unit.

**Moves:**

| Content | Today | Note |
|---------|-------|------|
| Uploaded files | `StoredFile.data` (Bytes) | the obvious one |
| Studio documents | `Course.storageRef` JSON, `adapter:"authored"` | the block array becomes an object in their storage |
| Exams / quizzes | `Course.storageRef` JSON, `adapter:"exam"` | questions **and** answer key |
| Studio drafts | `StudioDraft.document` JSON | work in progress is still their content |

**Stays with us — and must, for the platform to work at all:**

Everything that answers *who may see what* and *what has been done*. This is not content; it
is the index and the record, it is small, and it has to be queryable and available even when
their storage is not.

- Roles, placements, capabilities, the whole structure
- Course **metadata**: code, title, description, classification, kind, version, category,
  placements, prerequisites, deadlines, recurrence
- Completion records and exam **results** (score, pass/fail, attempts used, violations)
- Requests, mailbox, plans, coins, audit logs
- The `storageRef` pointer itself, and the per-file integrity hash

The dividing line: **we keep the catalogue, they keep the contents.** A library card index
stays with the librarian; the books go on their shelves.

> **Consequence to design for.** Moving exams means the answer key lives in their storage, so
> marking an attempt now needs a fetch-and-decrypt on our server before it can grade. That is
> workable — the key is still never sent to the candidate's browser — but it makes exam
> submission depend on their storage being reachable, and it wants a short-lived server-side
> cache of the decrypted paper for the duration of a sitting. See the handoff brief.

---

*Last updated: 2026-08-04*
