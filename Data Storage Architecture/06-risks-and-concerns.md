# 06 — Risks & concerns

Things that worry me about this migration, ranked by how expensive they are to discover late.
None of them is a reason not to do it. Several change *how* it should be done.

---

## 1 · Studio documents and exams are not the storage problem, and moving them costs latency

**The concern.** Uploaded files are megabytes — a 40 GB video library is the thing bankrupting
the free tier. Studio-authored documents are **kilobytes**: a block array, typically 10–100 KB,
occasionally 500 KB with inline images. Ten thousand of them is under a gigabyte.

Moving them buys almost no space. What it costs is a network round trip — plus a decrypt — on
**the single most common action in the product**: a member opening a document.

Rough numbers per open:
- S3/R2 from a nearby region: +30–80 ms. Tolerable.
- Google Drive API: **+200–500 ms**, and Drive rate-limits per user. Noticeable, and a member
  working through six induction documents feels every one of them.

The library grid, the course viewer's related-document jumps, and a reviewer previewing a draft
all multiply this.

**What I'd suggest.** Either:

- **(a)** Keep authored blocks and exam papers in our JSON columns, move only files. This is
  the version that solves the cost problem with none of the latency cost. It does mean some
  organization content still sits with us — which conflicts with the stated goal.
- **(b)** Move them as decided, and build a **read-through cache** in our API keyed by
  `courseId + version` with a long TTL. Course versions are immutable — publishing an edit
  bumps `version` — so the cache never needs invalidating, only evicting. This gets latency
  back to roughly today's for anything read more than once, at the cost of holding warm copies
  of decrypted content in our memory, which slightly undercuts the encryption story.
- **(c)** Move them, accept the latency, and be honest that Drive-hosted organizations will
  feel slower than S3-hosted ones.

**My view:** (b), with the cache explicitly documented as "warm plaintext, memory only, evicted
on TTL, never written to disk". But this is worth a deliberate decision rather than a default.

---

## 2 · We would become custodian of write credentials to hundreds of companies' storage

**The concern.** Today a breach of our database leaks *our* data — bad, bounded. After this
change, our database holds live read/write credentials to two hundred companies' Google Drives,
S3 buckets and file servers. A breach becomes *"an attacker can read, alter or delete the
document estate of every customer."*

That is a categorically larger liability, and it arrives quietly as a side effect of a
cost-saving change.

**What it demands, non-negotiably:**

- Credentials encrypted with a key held **outside** the database (environment or a KMS), so a
  database dump alone is worthless.
- **Scoped credentials only.** We publish the exact IAM policy: one bucket, one prefix, five
  actions. We should *refuse* a root access key if we can detect one.
- Prefer **short-lived over long-lived**: OAuth refresh tokens (revocable by them, visible in
  their admin console) over static access keys, where the backend offers a choice.
- Never returned to the browser after saving. Every use audited.
- A documented **revocation drill**: if we are breached, what the customer does, in order, per
  backend. Written before it is needed.

**Worth considering:** for S3-family, **AWS STS / role assumption with an external ID** removes
long-lived keys entirely — they grant our AWS account a role, revocable by them at any moment
without touching us. It is more setup for them and materially safer for everyone. Same shape
exists for GCP workload identity federation.

---

## 3 · Their outage becomes their users' outage — and compliance keeps ticking

**The concern.** Today, if their Drive is down, Knowledge Vault is fine. Afterwards, their
storage failing means nobody in that organization can open a document — while mandatory-course
deadlines keep running, overdue notices keep firing, and the escalation chain keeps escalating
people for not completing something they physically could not open.

**What it needs:**

- A **storage-health state on the organization**, and deadline/overdue processing that
  **pauses** while it is unhealthy. An overdue notice generated during a storage outage is
  worse than no notice — it is a false accusation with an audit trail.
- The existing `unreachable` adapter state surfaced clearly in the viewer, which it already
  does well.
- A high-priority mailbox message to owners on transition into and out of the unhealthy state.

**And specifically for exams:** if storage fails mid-sitting, the attempt **must not be
consumed**. A candidate losing one of two attempts to our infrastructure problem is the kind of
thing that ends up in a grievance. The attempt should be voided automatically — the machinery
for that already exists from the manager-reset feature.

---

## 4 · The `.main` custody promise gets weaker, and users must be told

**The concern.** Today `.main` plus the Supreme password genuinely rebuilds an organization —
including its inline content. Afterwards, `.main` holds structure, people, course metadata and
the wrapped encryption key, but **not the bytes**. Recovery becomes `.main` + *their storage
still existing*.

If they delete the bucket, or the Drive account lapses, or an employee cleans out a folder, the
`.main` file cannot bring the documents back. That is a real reduction in what custody means,
and the current wording in the Main Guide Book (Chapter 16) would become misleading.

**What it needs:** the chapter rewritten, the export screen saying plainly what `.main` does and
does not now contain, and — worth considering — a **"belt and braces" export** that bundles
`.main` *with* the actual objects for organizations that want a true offline copy.

---

## 5 · Browser-side encryption of large files needs chunking, not one call

**The concern.** Once the 10 MB cap lifts, the plan is browser-side AES-GCM so bytes go straight
to their bucket. But **Web Crypto's AES-GCM does not stream** — `crypto.subtle.encrypt()` takes
one buffer and returns one buffer. A 200 MB file means 200 MB in memory, twice, and on a mid-range
phone that is a tab crash.

**What it needs:** a chunked format — fixed-size frames (say 4 MB), each with its own nonce
derived from a counter, plus a small header describing the scheme. This is a solved problem
(it is roughly what age and Tink's streaming AEAD do) but it is a **format decision that must be
made before the first file is written**, because changing it later means re-encrypting
everything.

Multipart upload to S3 wants roughly the same chunk boundaries, so the two align neatly if
designed together.

---

## 6 · Erasure and deletion now span two systems

**The concern.** "Delete this course" today is one transaction. Afterwards it is a database
delete plus a remote delete that can fail, be slow, or be soft (Drive has a trash, S3 may have
versioning, some NAS setups snapshot).

For a GDPR erasure request the honest answer becomes *"we have deleted our copy and issued the
delete to your storage"* — with the caveat that we cannot guarantee their versioning or backups
have honoured it.

**What it needs:** a durable delete queue with retry, a reconciliation job that finds objects
with no course, and documentation that is honest about soft-delete behaviour per backend.

---

## 7 · Testing across eight backends is its own project

**The concern.** You cannot meaningfully CI-test against real S3, Drive, OneDrive, SFTP and
WebDAV. Storage bugs are exactly the kind that only appear against the real service — signature
mismatches, CORS, token refresh, clock skew, partial uploads.

**What it needs:** MinIO in CI to cover the whole S3 family for real, contract tests every
adapter must pass, and a manual pre-release checklist for the OAuth backends. Budget for this;
it is not free.

---

## 8 · Onboarding friction, regardless of pricing

**The concern.** Independent of how plans are priced: if configuring storage is required before
anyone can upload a single document, a first-time user must go and create a bucket, an IAM
policy and a CORS rule before they can try the product. Most will not.

**What it needs:** a decision on whether *some* small allowance stays on our infrastructure
purely so evaluation is possible — a few hundred megabytes, clearly temporary, migrated the
moment they connect real storage. This is a product decision rather than a cost one; the
amounts involved are trivial either way.

---

## What I am *not* worried about

For balance:

- **The adapter port.** It was designed for exactly this and it holds up.
- **Permission correctness.** Storage moves bytes; it does not touch `can()`. As long as the
  map file stays a mirror, the authorization model is unchanged.
- **The exam answer key.** It stays server-side. Moving where it is *stored* does not change
  who can read it, as long as marking stays where it is.
- **Data residency.** It gets *better* — the customer picks the region, which is an answer we
  cannot currently give at all.

---

*Last updated: 2026-08-04*
