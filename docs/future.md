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

## 5b. Exam system (deferred from v1 — decided 2026-07-17)
v1 ships no exams: a scored exam requires the platform to know questions and answers, which
belongs here. The full system arrives together:
- In-platform exam builder (multiple-choice first).
- Pass/fail scoring with per-exam pass thresholds.
- Retake-after-failure flow: notification to the escalation target → retake unlock.
- Certificates (`issues_certificate` toggle at publish) and pass expiry.
- Exam fields (score, pass/fail, re-attempt time) extend the existing `CompletionRecord`,
  which already carries course code, version, and expiry — no schema redesign needed.

## 6. Additional storage adapters
v1 ships the storage adapter interface with **Google Drive** as the first backend. Later adapters
chosen per organization's capability: NAS, S3-compatible object storage, other clouds.

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


## 12. Storage backends — NAS / Google Drive / OneDrive (open)
The storage adapter port (`apps/api/src/storage/adapter.ts`, `storageRef.adapter`) is kept
deliberately open. v1 ships `inline` (gzip-compressed Postgres bytes, ≤2 MB), `link`, and
`authored` (Studio blocks). The organization's real media backend — NAS, Google Drive,
OneDrive, or S3 — is a client decision still TBD; each becomes a new adapter behind the same
`saveInline`/`resolve` port with no course-logic changes. Large-media upload pipelines,
previews, and per-org backend selection land here.

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
