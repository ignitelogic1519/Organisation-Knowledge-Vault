# Data Storage Architecture

**Status: design in progress. Nothing here is built yet.**

This folder is the working record of one decision: **moving document bytes off our
infrastructure and onto storage the organization provides and pays for.**

It is kept up to date as we talk. Each conversation adds to the decision log at the bottom,
and the numbered documents are rewritten to match whatever we settle on.

| Document | What it covers |
|----------|----------------|
| [00 — Handoff brief](00-handoff-brief.md) | **Start here.** Self-contained briefing for a fresh session: the job, the current state, the conclusions, the open decisions |
| [01 — Where data lives today](01-where-data-lives-today.md) | The current state, honestly measured, and why it doesn't scale |
| [02 — Backend requirements](02-backend-requirements.md) | Every storage type, what we need from the organization, and what each can and can't do |
| [03 — The Knowledge Vault map](03-knowledge-vault-map.md) | The manifest file we write into their storage |
| [04 — Security & encryption](04-security-and-encryption.md) | How "nobody else can look at this document" is actually achieved |
| [05 — Open questions](05-open-questions.md) | What I need decided before any of this can be built |
| [06 — Risks & concerns](06-risks-and-concerns.md) | What worries me about the migration, ranked by cost of discovering it late |

---

## What I understand you want

In your words, then mine.

1. **The organization chooses its own storage backend** — NAS, Google Drive, OneDrive, S3,
   Cloudflare R2, Google Cloud Storage, a VPS, a Windows server, and so on.
2. **They supply whatever that backend needs** to be set up, and the setup form differs per
   backend because each one authenticates and addresses files differently.
3. **We write a `Knowledge_vault_map` file into their storage** laying out the structure,
   the people, the permission levels on each document, and the configuration.
4. **We keep the viewing and the security.** Knowledge Vault remains the only way to *read*
   a document properly, and nobody outside the permitted audience should be able to look at
   one — including, as I read it, people who have access to the storage itself.
5. **Our infrastructure still runs everything else.** Roles, people, compliance, exams,
   requests, the mailbox — all of that stays in our database. Only the bytes move.
6. **The reason is cost.** Storage is the expensive part and it should sit with the company
   generating it.

If I have any of that wrong, correct me before you read further — several conclusions below
depend on point 4 in particular.

---

## The three things that decide this design

Everything in the numbered documents comes back to these. I want them on the first page
because they are the parts that are easy to get wrong and expensive to change later.

### 1. Reachability is the real constraint, not the API

Our API runs in a datacentre. An organization's NAS usually sits behind their office
firewall with no public address. **We cannot reach it, and no amount of correct credentials
changes that.** The same is true of an internal Windows file server.

This splits every backend into two families, and they need genuinely different plumbing:

- **Internet-reachable** (S3, R2, GCS, Azure, Drive, OneDrive, an exposed VPS) — our server
  can talk to it directly, and for most of them the *browser* can too, via time-limited
  signed URLs. That is the cheap path: bytes never touch us at all.
- **Not reachable from outside** (NAS, LAN server) — something inside their network has to
  do the work. Either the reader's browser talks to it directly (it is on the same network),
  or they install a small connector, or they expose it to the internet (which most security
  teams will refuse, correctly).

**This is the single biggest fork in the design.** Document 02 lays out the options; question 1
in document 05 is where you decide.

### 2. "Nobody else can look at it" and "it lives in their Drive" are in tension

If a PDF sits in the organization's Google Drive as a PDF, then their Google Workspace admin
can open it. So can anyone they have shared that folder with, and anyone who compromises that
Google account. Our permission model — which is genuinely good — governs *our* front door,
and their storage has its own front door that we do not control.

There is exactly one way to have both: **we encrypt each file before it leaves us, and what
lands in their storage is ciphertext.** Their admin sees `a7f3c2e1.kvblob`, not
`Safety-Procedure.pdf`. Knowledge Vault decrypts on the way to a reader who passes our
permission check.

That buys the security you asked for, and it costs something real: they can no longer open
their own documents from their own Drive without going through us. Document 04 works through
this properly, including a design that keeps their custody intact.

### 3. The map file must be a mirror, never the authority

You want the permission structure written into their storage. Good — for portability, for
disaster recovery, and for a human being able to see what is where.

But it must never be the thing we *read permissions from*. If it were, anyone with write
access to that folder — their IT contractor, a compromised laptop, an over-permissive share —
could edit a line and grant themselves access to everything. Our database stays the
authority. The map is a signed, tamper-evident copy of what our database says. Document 03
specifies it.

---

## What is not changing

To be explicit, because scope creep here would be expensive:

- Roles, placements, capabilities, requests, compliance, exams, the mailbox, plans and coins
  all stay in our Postgres. None of that is storage-heavy.
- The `.main` and `.bkp` custody files stay as they are, with one addition (document 04).
- **All organization content moves** — uploaded files, Studio-authored documents, and
  exams/quizzes. What stays is the catalogue: structure, course metadata, placements,
  completion records and exam results. See document 01 for the exact line.
- The existing `storage` adapter port already isolates all of this behind one interface. No
  course, exam, viewer or compliance code has to change.

---

## Decision log

Appended as we agree things. Nothing is settled until it appears here.

| Date | Decision | Why |
|------|----------|-----|
| 2026-08-04 | Document bytes move to organization-provided storage; our DB keeps everything else | Free-tier Postgres holds ~50 files platform-wide; storage cost should sit with the company generating it |
| 2026-08-04 | Scope widened: **Studio documents and exams move too**, not just uploads | Anything the organization creates is their content and belongs on their storage unit |
| 2026-08-04 | *(open)* Reachability strategy for NAS / LAN servers | See question 1 |
| 2026-08-04 | *(open)* Encryption posture | See question 2 |

---

*Last updated: 2026-08-04*
