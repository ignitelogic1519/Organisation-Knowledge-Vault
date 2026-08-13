# Future Features Register

> Features explicitly deferred out of v1. Each entry notes what was decided so the v1 design
> keeps the door open without building it yet.

## 1. Granular capability-based permissions
v1 gives every role owner a **fixed capability bundle**. Later, each user made an owner of a
branch gets **individual capability switches**, provisioned separately per person, e.g.:
- can-upload-content
- can-assign-mandatory
- can-view-reports
- can-manage-members
- can-create-sub-roles (exists in v1 as the single delegation flag — will fold into this system)

Design note: v1 permission checks should go through one central policy function so swapping the
fixed bundle for per-capability checks later does not touch call sites.

## 2. Advanced completion tracking
v1 uses manual "mark as complete". Later:
- Video/audio: watch/listen percentage thresholds.
- Documents: open + explicit acknowledgment ("I have read and understood").
- Per-content-type completion rules configured by the uploader.

## 3. Org chart graph tab ("3D tree" view)
- Every user gets a graph tab showing their own position(s) with layers above and below.
- Nodes are **roles, not users** (keeps the graph small); clicking a role opens its people list
  with a search box.
- Must handle one profile occupying multiple positions at different heights.

## 4. Incident templates for restructuring
Managed workflows for deleting/restructuring branches (approvals, handover of orphaned subtrees,
audit trail), replacing the v1 rule of "top layer may delete/restructure the branch".

## 5. Content authoring suite
v1 is upload-only. Later:
- Template-based documentation authoring.
- AI conversion of uploaded documents into standardized documentation.
- Video / audio / audiobook upload pipelines (processing, previews).

## 5b. Exam system (partly shipped 2026-08-03 — see structure.md §3.6)
Deferred on 2026-07-17 because a scored exam needs the platform to know the questions and
answers. The Studio supplied that, so the multiple-choice core shipped with it:
- ✅ In-platform MCQ builder (one answer / several answers / true-false), pass percentage,
  equal or unequal question weights, randomised questions and options, time limit, attempt
  cap, and author-controlled answer reveal (live / after submission / never).
- ✅ Server-side marking, one `ExamAttempt` per sitting, and a passing attempt writing the
  ordinary `CompletionRecord`.

Still ahead:
- Free-text and numeric questions, question banks, and drawing N questions from a pool.
- A results dashboard for the exam's managers (per-question difficulty, score spread) on
  top of the attempts already recorded.
- Retake-after-failure flow: notification to the escalation target → retake unlock.
- Certificates (`issues_certificate` toggle at publish) and pass expiry.
- Server-enforced timing (an issued-paper token) rather than the client's own clock.
- Score and re-attempt time on `CompletionRecord` itself, so a report needs no join.

## 6. Additional storage adapters — SUPERSEDED (2026-08-05)
The original note here assumed Google Drive would be the first backend. It was not: S3-compatible
storage ships as **NAS** (`docs/structure.md` §9.2), and the queue of backends after it is now a
register the product renders from rather than a paragraph — `apps/web/src/lib/storage-backends.ts`,
specified in `docs/structure.md` §9.15 and published at `/storage`. See §12 below for the current
state of each candidate.

## 7. Mobile application
API-first backend (Render) is kept separate from the web frontend from day 1 specifically so a
mobile app can consume the same API.

## 10. Email system reintroduction (removed 2026-07-19)
Owner decision: v1 runs entirely WITHOUT email. Identity is a unique username; people are
added to roles by username (unknown usernames become reserved placements that apply on
registration); the .main file is download-only. What returns when this reopens:
- Email as a verified contact channel on profiles (verification links)
- Invitation/deletion/notification emails and the .main-by-mail delivery
- Password reset (impossible without a verified channel — until then, lost profile
  passwords are unrecoverable; communicate this in product copy)
- Provider decision (owner wants to avoid third-party services; options: own SMTP relay,
  or revisit Brevo/Gmail — prior wiring is preserved in git history at commit d0c6fa8)

## 9. Google sign-in activation (deferred 2026-07-18)
Owner decision: launch v1 with username+password only. The Google path is **already fully
implemented and tested** (API `/auth/google` with same-email profile linking; web button via
Google Identity Services) but dormant. Activation is configuration only, no code:
1. Create a free OAuth client ID in Google Cloud (no billing account needed) —
   steps preserved in `setup-guide.md` §4.2.
2. Set `GOOGLE_CLIENT_ID` on Render and `NEXT_PUBLIC_GOOGLE_CLIENT_ID` on Vercel; redeploy web.
The button then appears on login/register automatically.

## 8. Notification channel expansion
v1 is **in-app only** (sole exception: the transactional org-deletion email). Email
notifications are planned **after the incident management system** is established; later also
push notifications (mobile) and richer escalation chains.

## 11. AI library assistant (planned 2026-07-22)
Two AI features scoped for the Library tab, in order:

**11a. "Ask about this book" — per-course chat (first).**
A limited chat on the library detail view that answers questions about ONE course:
what it is for, its scope, who should take it, prerequisites, rough time investment.
- Grounding: course title, description, category, prerequisites, reviews, and (where
  the storage adapter allows) extracted text of the content itself.
- Guardrails: answers only from the grounded material; explicit "I can only speak
  about this course" refusal outside scope; no access to org structure or people data.
- Serving: one API endpoint (`POST /courses/:code/ai/ask`) proxying an LLM with the
  grounding stuffed into context — no persistent chat history in v1 of the feature.

**11b. Recommendation chat — "what should I take?"**
A library-level chat where a member describes what they want to learn in free text and
gets recommendations from THEIR org's library only.
- Retrieval: embed course title+description+category+reviews into a vector index per
  org (pgvector on the existing Postgres keeps the stack unchanged); the chat retrieves
  top-k courses and the model ranks/explains them.
- Personalization: filter/boost by the member's placements (what already reaches them,
  what their branch mandates) and completion history (skip what's done, respect
  prerequisites).
- Output is always a list of real course cards (code-linked) with a one-line "why" —
  never invented titles.
- Category suggestion (shipped, word-overlap based) upgrades to the same embedding
  index once it exists.

Prereqs for both: an LLM provider decision + per-org API budget, and a text-extraction
step in the storage adapter port. Ship 11a first — it needs no index.


## 12. Storage backends — the queue after NAS (updated 2026-08-05)
The storage adapter port (`apps/api/src/storage/adapter.ts`, `storageRef.adapter`) is kept
deliberately open. Shipped: `inline` (gzip-compressed Postgres bytes, ≤10 MB, and the KVEP
path), `link`, `authored` (Studio blocks), and **S3-compatible storage presented as NAS**.

The remaining candidates are registered in `apps/web/src/lib/storage-backends.ts` with a public
status, so the roadmap on `/storage` and this register can never disagree:

| Backend | Status | What is actually left to do |
|---------|--------|-----------------------------|
| **Cloud object storage** (S3, R2, GCS, Wasabi, B2, Spaces) | `planned` | Nothing in the adapter — a provider list, endpoint templates, and per-provider IAM/CORS documentation. This is the whole return on choosing S3 first. |
| **Cloud drives** (Google Drive, OneDrive) | `exploring` | OAuth, token refresh, and an answer to the fact that neither issues signed URLs in the form we need — so every byte would proxy through our API, which is the one thing §9 exists to avoid. |
| **NAS with no public address** | `exploring` | A connector the organization runs beside the storage, opening outbound only. The unsolved part is the off-network read: any design that ends in us proxying the bytes is the cloud-drive problem in different clothes. |

Large-media upload pipelines and previews still land here. Changing a status is one edit in the
register; the public page, its comparison table and the home-page teaser follow.

## 13. Enterprise features to consider (SNOW / Veeva Vault / Confluence)
A running backlog of proven ideas from mature platforms, ranked roughly by value/effort:
- **Document lifecycle & e-signatures (Veeva Vault)**: Draft → In Review → Approved →
  Effective → Superseded states, controlled-copy watermarks, and 21 CFR Part 11-style signed
  approvals. Our draft/review flow is the seed; add explicit states + signature capture.
- **Version history & compare (Confluence)**: per-document version list with restore and a
  visual diff. Version already increments; surface history + rollback.
- **Full-text search (Confluence/SNOW)**: Postgres `tsvector` across titles, descriptions and
  authored/extracted text; later the pgvector semantic search (see §11).
- **Spaces / labels / templates (Confluence)**: reusable document templates in the Studio,
  cross-branch label taxonomy, saved views.
- **Approvals & flows (ServiceNow)**: multi-step approval chains, SLAs on requests, escalation
  timers, and a visual flow designer for course assignment rules.
- **Knowledge feedback loop (SNOW KB)**: "was this helpful?", flag-for-review, and staleness
  reminders that nudge owners to re-verify aging documents.
- **Audit & reporting (all)**: surface the AuditLog in an owner-facing report; CSV/PDF export
  of compliance; scheduled digest emails once a channel exists.
- **Delegated administration & groups (SNOW)**: reusable people-groups placed as a unit, and
  time-boxed/temporary access grants.
- **Bulk operations**: bulk assign/remove people, bulk course placement, CSV import of an org
  structure.

---

## 14. Your devices / sign out everywhere (2026-08-13)

Sessions became rows when the idle timeout landed (structure.md §8.8): one per sign-in, each
carrying when it started, when the person was last seen and the browser they used. That is
almost the whole of a "your devices" screen — a list on the account page, a *Sign out* button
per row, and *Sign out everywhere* for the panic case (`endSession` / `endAllSessions` already
exist and are what a ban uses). Left for later because the timeout closes the actual hole; a
device list is convenience on top of it.

The related piece: **admin console sessions live in memory**, so they cannot be listed the
same way. If a "who is signed into the console" view is ever wanted, they need a table first.
