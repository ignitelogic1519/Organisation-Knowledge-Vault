# structure.md — Organisation & Data Structure Specification

> Normative specification of the entities, the org tree, the permission model, and the file
> formats. `architecture.md` describes how this is implemented; `plan.md` describes when.

---

## 1. Entity Overview

```
                    PLATFORM
                       │
        ┌──────────────┼──────────────────┐
        │              │                  │
     PROFILE      ORGANIZATION        COURSE CODE REGISTRY
   (global user)   (Supreme root)      (platform-unique org numbers)
        │              │
        │         ┌────┴─────────────────────────┐
        │         │                              │
        │      ROLE TREE                     COURSES
        │    (nodes = roles)              (org-level entities)
        │         │                              │
        └── MEMBERSHIP ── PLACEMENTS      COURSE PLACEMENTS
            (profile↔org)  (owner/member       (role node + flags)
                            of role nodes)
```

### 1.1 Profile (global)
- Platform-wide identity: **unique username**, password hash, display name.
  (Owner decision 2026-07-19: the email system is removed from v1 — `future.md` §10;
  Google sign-in also parked — `future.md` §9.)
- The actor of every action. Self-owned; admins never create profiles for others.
- Can belong to N organizations via **Memberships**.
- **Cannot be deleted** while the profile still owns any organization — the user must first
  delete those organizations or transfer the owner role.

### 1.2 Organization & the Supreme
- Creating an organization creates its **Supreme**: the root data object, named "Supreme".
  - Not an account. Performs no actions. Holds the org's structural data and its
    **platform-unique organization number**.
  - Carries the **Supreme password** (set at creation) — required for owner-level structural
    changes and for downloading the `.main` file. Entered on a dedicated Supreme-access gate.
- The tree always starts `Supreme → Owner role`. The creator picks the Owner role's display
  name (Owner / CEO / Principal / …) and becomes its first occupant.

### 1.3 Role (tree node)
Shape of every node:

```
<Role>
 ├─ owners   (n ≥ 1 profiles — managers of the node)
 └─ members  (m ≥ 0 profiles — learners/occupants of the node)
```

- Role names may repeat across branches; each role has a **role number unique within the org**.
- Attributes: `name`, `role_number`, `parent_node`, `is_terminal` (no sub-roles allowed).
- Per-occupant attribute (owners): `can_create_subgroups` (delegation flag).

### 1.4 Membership & Placement
- **Membership** = profile ↔ organization (exists once per profile per org).
- **Placement** = membership ↔ role node, with `kind ∈ {owner, member}` plus per-placement flags.
- One profile may hold **many placements** in the same org, at any heights in different branches
  ("3D tree": bottom of HR, top of Technical, simultaneously).

---

## 2. Tree Rules & Invariants

| # | Invariant |
|---|-----------|
| I1 | Every org has exactly one Supreme and exactly one Owner role directly under it. |
| I2 | Every role node has **≥ 1 owner** at all times. Removing the last owner is blocked; the layer above must restructure first. |
| I3 | Authority flows **down only** — a role holder acts within their node and its descendants, never sideways or upward. |
| I4 | A node marked `is_terminal` cannot receive sub-roles. |
| I5 | A role cannot be deleted while its subtree is non-empty. Whole-branch delete/restructure is allowed only for the **top layer of that branch**. |
| I6 | Delegation flags (`is_terminal`, `can_create_subgroups`) are changeable by anyone **above in the same branch** and by the **Owner role** — never by the Supreme (not an account). |

### 2.1 Permission model
A single central policy check answers every authorization question:

```
allowed(profile, action, node) :=
    profile has an OWNER placement on `node` or on any ANCESTOR of `node`
    AND the v1 capability bundle includes `action`
    AND (action == create_sub_role ⇒ placement.can_create_subgroups AND NOT node.is_terminal)
```

The v1 **capability bundle** for role owners (fixed; granular switches → `future.md`):
1. Create knowledge items in their layer.
2. Add owners/members below them (bounded by their own scope and flags).
3. Add learners who consume the layer's courses.

---

## 3. Courses (Knowledge Items)

### 3.1 Identity — the code scheme
Platform-unique, hierarchical, auto-generated:

```
<org-number> - <role-number> - <item-number>
    456      -     989       -    xxxx…
```

- `org-number`: platform-unique, stored in the Supreme / `.main`.
- `role-number`: unique within the org (uploading role).
- `item-number`: sequence within that role.
- Guarantees global resolvability of any item to org + role even across multiple storage
  backends/servers later.

### 3.2 Placements — no duplication
A course is an **org-level entity**; branches receive **placements**, never copies:

- Placement fields: `role_node`, `mandatory | opt-in`, `inherit_to_descendants (bool)`.
- Unrelated branches reuse a course **by its code** — no approval required.

**Precedence rules ✅ DECIDED:**
1. If the same course reaches a user via multiple paths with conflicting flags,
   **mandatory wins over opt-in**.
2. A sub-role created *after* an inherited placement exists **inherits it automatically**.
3. Removing a placement **keeps** existing completion records (history is never destroyed);
   only the active assignment disappears.

### 3.3 Course admin page (per course)
- Shows everywhere the course is used.
- Access is a **separate permission system**, independent of org roles: a 2-layer tree where the
  course owner grants per user **view** or **edit** on the page, and whether that user may grant
  page access onward. Chain controlled at the Owner/Admin/Principal level.

### 3.4 Scheduling & compliance fields (set on the course at upload)
- `deadline` — optional; some courses have none.
- `retake_every_n_days` — recurrence (e.g., security training every 365 days); course-level,
  not per individual.
- `resets_completion_on_update` — flag chosen by the creator when modifying content.
- Escalation target for overdue/failure: **the person who added the user to the group /
  tagged the role on them**, with a **fallback chain** if that person has left the org:
  adder → current owners of the node → owners up the branch. ✅ DECIDED

### 3.5 Prerequisites
- Hard prerequisites: item X requires completed item Y first.
- Courses form their own small dependency trees, fully independent of the org tree.

### 3.6 Exams — MCQ exams ship with the Studio ✅ DECIDED (revised 2026-08-03)
Originally deferred (a scored exam needs the platform to know the questions and answers,
which needed the authoring suite). The Studio now IS that suite, so the multiple-choice half
ships with it; the rest of the exam roadmap stays in `future.md` §5b.
- The Studio asks what is being created — a **document** or an **exam** — and an exam is a
  Course of kind `EXAM`: same platform code, classification, description/scope, library
  shelf, mandatory/inherit placement and member-proposal review as any document.
- Question types: one answer, several answers (the whole set must be picked), true/false.
- Marking: **equal weights by default**; an exam may be switched to unequal weights, where
  each question carries the marks its author gave it. A **pass percentage** decides the
  outcome.
- Delivery options: randomise the question order, randomise the options, one question per
  screen, a time limit, and a cap on attempts.
- **Answer reveal** is the author's choice: as the candidate answers (live), after they
  submit, or never — with separate switches for showing which option was right, the
  author's explanation, and the score itself.
- Marking happens **on the server**: the answer key never travels to a candidate, and the
  live-feedback mode asks the server one question at a time.
- Completion: passing the exam writes the ordinary completion record (§3.7), so exams reach
  compliance through the same door documents do. An exam is never "marked complete" by hand.
- Recurrence (`retake_every_n_days`) is **not** exam-specific and applies to all courses.

### 3.6b Where unfinished work lives ✅ DECIDED
- **The browser** keeps whatever is open in either Studio editor (one document and one exam
  per branch), on every plan. It is a crash guard, not a store: this device only.
- **The server** (`StudioDraft`) holds what an author explicitly parks with *Save draft* —
  the body plus its publish settings, under their account, reopenable anywhere. A **paid**
  capability (docs/pricing.md §2b).
- Both are private to the author until they publish. The Studio's front door lists both under
  *Continue a draft*, and each entry reopens in the editor that wrote it.

### 3.6c Invigilation (MCQ exams) ✅ DECIDED
- A candidate's sitting runs **full screen**, and the paper is covered whenever it is not.
- Leaving the paper — another tab, another window — for more than **5 seconds** is counted.
  **Two** interruptions earn a warning; the **third** hands the paper in as it stands, marked
  on whatever was answered.
- An absence is counted either while it happens or on return, so suspending the tab does not
  evade it. An author's preview is never invigilated.
- `ExamAttempt` records the count and whether the paper was handed in by the invigilator, so
  a result can always be read in context.
- This is a deterrent, not a proctor: it is client-side, and deliberately says so. Real
  proctoring (identity, camera, screen) is out of scope — see future.md.

### 3.7 Completion (v1) ✅ DECIDED
- Manual **"mark as complete"** for all v1 content. Advanced tracking → `future.md`.
- A completion record is keyed to the **course's unique platform code** and is part of the
  **user's data**, carrying: the course code, the completed course version, the completion
  date, and the **expiry time** (`completedAt + retake_every_n_days`, when recurrence is set).
  When exams arrive (future), the re-attempt time joins the same record.

### 3.8 Editions: revising something already published ✅ DECIDED
Studio-built material (documents and exams) is revised in place, by the people who answer
for it — **the course's editors, the branch's owner, and the owners above them**.

The order is deliberate, because readers are on the current edition:
1. **Take it out of deployment.** It reaches nobody and leaves the library; every placement
   is kept exactly as it was.
2. **Revise it** in the Studio, which opens the edition as published.
3. **Publish**, which bumps the version (`v1.0` → `v2.0`), returns it to deployment on the
   same placements, and — when *updates reset completion* is set — expires the completions
   of the older edition and asks those people to read (or sit) it again.

- The API refuses a content change while the course is still deployed; the Studio disables
  publishing until it is withdrawn, and says why.
- Placement (mandatory / inherited) is NOT part of a revision: it belongs to the branch, and
  a new edition inherits it untouched.
- The version is written as an **edition label** — `v1.0`, `v2.0` — wherever people see the
  course: library, My Learning, the viewer's header, and the branch's course list.

---

## 4. Lifecycle Flows

### 4.1 Organization creation
1. Person signs up / logs in with their global profile.
2. Creates the organization → sets the **Supreme password** → Supreme object + org number issued.
   - The flow shows an **explicit, loud warning with confirmation**: this password is
     unrecoverable by anyone, including the platform; losing it permanently forfeits
     owner-structure changes, `.main` download, and revival. ✅ DECIDED
3. Names the Owner role; creator becomes its first occupant. Co-owners can be added (I2 applies).

### 4.2 People onboarding ✅ REVISED (2026-07-19 — username-based)
1. An authorized role owner enters a **username**.
2. Profile exists → placed immediately. No profile → the placement is **reserved** and applies
   automatically when someone registers with exactly that username.

### 4.3 Organization deletion (30-day soft delete)
1. Owner clicks delete → platform prompts to **download `.main` first**.
2. Download requires the **Supreme password**; on success a confirmation email is sent from the
   platform mail to the organization / owner's mail id.
3. Org data is soft-deleted, **retained 30 days**, then purged forever.
4. Revival: within 30 days from retained data; afterwards **only** via `.main` upload.
5. `.main` upload while the org still exists → **rejected**.

### 4.4 Owner-level structural change
- Requires the Supreme password at the Supreme-access gate (e.g., replacing/adding owners when
  normal delegation cannot resolve it).

---

## 5. File Formats

### 5.1 `.main` — organization existence/revival file
- **Full encrypted export** of the organization (structure, placements, course metadata,
  compliance records). The platform retains **no copy and no key**.
- Encryption key **derived from the Supreme password**; whoever holds file + password can revive
  at any time in the future.
- Custody and sharing are entirely the owner's responsibility.
- **Export delivery:** browser download only (the email copy was removed with the email
  system, 2026-07-19 — returns with `future.md` §10).

**Durability rules ✅ DECIDED** (locked before coding; will be demonstrated during website testing):
1. The bundle header carries a **format version**; every future format change ships an import
   migration so old files stay revivable forever.
2. **Org numbers are never reused**, even after purge — the global sequence only increments.
3. Revival ends with a mandatory **storage reconnection step**; media stays listed but marked
   unreachable until the org reconnects its storage backend.
4. Exports store **`profileId + email`** for every person; unmatched profiles on import become
   **pending members**, re-attached automatically when that email registers/joins.

### 5.2 `.bkp` — node backup file
- Scope: **one node** (its owners, members, placements, records). The Owner role may also export
  a full-tree `.bkp`.
- **Restore semantics ✅ DECIDED (v1 — strictest rule first, loosened later with incident management):**
  - Restore is allowed **only when the node's structural fingerprint is IDENTICAL** to the
    snapshot (same path, role number, child skeleton). Any divergence → **denied** with the
    "structure has changed severely" message. No tolerance percentage in v1.
  - When allowed, restores every data point of the node "like nothing ever happened" —
    including completion records; post-snapshot progress is lost (accepted trade-off, node head
    communicates it).
  - Restricted to the node itself — requires **complete access + restore rights on that node**;
    **child nodes are not restored**.
  - **Orphan-handling table** (pre-agreed): referenced course deleted ⇒ drop the record;
    course version newer ⇒ keep record with its stored `courseVersion`; person left the org ⇒
    skip that placement and log it.
  - Every restore produces a **restore report** shown to the restorer: what was applied, what
    was skipped, and why.
- `.bkp` ≠ `.main`: operational backup vs. existence/revival file.

---

## 6. Member Experience Surfaces

Every user entering an org sees:
1. **My Learning** — assigned courses (mandatory flagged), opt-in catalog, prerequisites state.
2. **My Structure** — their slice of the tree; delegation-enabled users manage people here.

Later (per `future.md`): the org-chart graph tab — roles as nodes (never user lists), own
position(s) highlighted with layers above/below, role click → people list with search.

---

## 7. Notifications (v1)

- **In-app only**: assignment received, deadline approaching/overdue, exam failed (to the
  escalation target), retake unlocked, invitation received, restore/deletion events.
- No email exists in v1 at all (owner decision 2026-07-19 — `future.md` §10): all
  notifications are in-app; the `.main` file is download-only.

---

## 8. Evolution log (post-v1 shipped changes)

The platform has moved well past the original v1 slice. This section is the normative
record of what shipped after the base spec above; where they conflict, this section wins.

### 8.1 Governance & structure
- **Terminal roles removed.** Any non-root role may hold sub-roles.
- **Granted capabilities.** Owner rights are individual flags — `canCreateSubgroups` and
  `canAddCoOwners` — and **no one may grant a capability they do not hold** (see
  `canGrantCapability` in `packages/shared/src/policy.ts`). Appointing co-owners is its own
  policy action (`add_co_owner`).
- **Visibility.** Branches are **public by default**; a per-node `isPublic=false` hides the
  branch from same-layer and lower personnel and **cascades down the whole subtree** (hidden
  inherits to the last end). Owners above a hidden node always still see it (hierarchy
  transparency). A node is *effectively* public only when it and every ancestor below the
  root are public.
- **Branch deletion** by a branch's own owners goes through a **Deletion request** to the
  level above; the level above can delete directly.

### 8.2 Requests (ask-and-approve)
Labeled categories, each routed to the right decider, with a live count badge:
- **Course request** → the branch **handler** (nearest level with an owner) configures it
  (mandatory / inheritance / deadline / recurrence) on approval. **Boss auto-approve:** when
  the requester already governs the target branch, the request is approved immediately, the
  course is placed, and the course's home owners get a courtesy **adoption** notification.
- **Join request** → carries the desired position (member or sub-owner); owners of the
  target decide (sub-owner needs `add_co_owner`).
- **Deletion request** / **Visibility request** → owners above / owners of the topmost
  hidden level.
Requesters and deciders can delete request entries; decided requests auto-purge after 7 days.

### 8.3a Member-authored content & document review
- Adding a MEMBER can carry a `canCreateContent` grant (settable later too by any branch
  owner). Granted members may **propose** documents for their branch via the Studio or a
  file upload — the content is created as a **draft** (never in the library, reaching
  nobody) and a **Document-review** request (`CONTENT_REVIEW`) is filed to the branch's
  handler.
- The handler **previews** the draft in a read-only viewer, then **approves** (configures
  mandatory / inheritance / deadline / recurrence + library, un-drafts and places it) or
  **rejects** (the draft is discarded). Owners still publish directly, no review.

### 8.3 Library, documents & the Studio
- **Library** groups courses into shelves by a dynamic **category** tag (similarity-suggested
  at upload, always overridable), filterable by type / shelf / **classification** / rating,
  with member **ratings & comments** (post-completion) shown on the detail view.
- **Document standard.** Every course carries a compulsory **classification**
  (Public / Confidential / Private / Secret), an optional **scope**, and an owner-controlled
  **allowDownload** flag. The in-app viewer wraps all content in the standard frame: an
  auto-generated **cover** (org, title, classification, version, published date, author) and
  a **description & scope** page, plus a header/footer on the framed content. Downloads are
  offered only when the owner enabled them (`GET /courses/:code/content?download=1`).
- **Document Studio** (`/orgs/:id/studio`): a three-pane editor — an **insert/pages/drafts
  rail**, a **paper canvas** of drag-and-drop block cards, and a **block inspector** — under a
  formatting **ribbon** (paragraph style, font, size, bold/italic/underline/strikethrough,
  text colour, highlight, alignment, lists, indent, link, clear formatting, undo/redo,
  zoom). Modes: **Edit**, **Preview** (the standard frame) and **Present** (full-screen deck).
  Blocks: heading, rich text, table, checklist, callout, quote, code, image, audio/video,
  **embed**, button, columns, **collapsible panels**, **contents**, divider, spacer and page
  break. Every block carries a typed `style`
  (alignment, colours, font, size, width, padding, border, shadow, entrance animation), so
  no author-supplied CSS is ever stored. Stored through the `authored` storage adapter and
  rendered natively by the same renderer the viewer uses. Owners publish; granted members
  submit for review (§8.3a).
  - **Tables** behave like a sheet: row/column headers with insert & delete menus, a
    rectangular cell selection formatted in one go (bold, italic, alignment, fill),
    column widths, header row/column, banding, border style, frozen header, and paste of
    tab- or comma-separated text straight into the grid. A paragraph or checklist can be
    **converted into a table** (and back) from the block's "turn into" menu.
  - **Audio & video** carry playback rules: speed control (0.5×–2×), a **quality ladder**
    (renditions the reader switches between without losing their place), poster, captions,
    clip window, autoplay/loop/mute, a watched-in-full marker, and a **non-skippable** mode
    that permits rewinding but refuses any jump past the furthest point actually watched.
  - **Pages** turn with a per-page animation (fade, slide, push, flip, zoom, reveal) chosen
    on the page break; readers turn pages with ← → in the viewer.
  - **Drag and drop** runs on pointer events, not the browser's HTML5 drag API: one
    implementation for mouse, pen and **touch**, with a ghost that follows the pointer, an
    insertion line measured from the block cards themselves, auto-scroll near the edges and
    **Esc** to cancel. Blocks are grabbed by a full-height grip on their left edge; palette
    entries drop onto the page; pages reorder in the rail; column dividers drag to rebalance.
  - **Collapsible panels** (FAQs, optional detail) and a **contents** block built from the
    document's own headings, with anchors that scroll.
  - **Embeds** frame content from an allow-listed host only — YouTube, Vimeo, Google Drive,
    Docs/Sheets/Slides, Forms, Maps and Calendar. The address is re-parsed and the embed URL
    is **rebuilt by us** (server-side, on save), then rendered in a sandboxed iframe.
  - **Themes** set the whole document at once — type pairing, accent, paper, ink, density,
    heading treatment and page measure — and travel with the blocks so the reader sees what
    the author chose. **Templates** (Policy, Procedure, Handbook, Training, Announcement)
    open a real document instead of a blank page. **Preview** switches between desktop,
    tablet and phone widths.
  - **Drafts**: work in progress is always kept in the author's browser; **saving a draft to
    the server** (reopen from any device, `StudioDraft`) is a premium capability — see
    docs/pricing.md.
- **Archival**: `POST /courses/:code/archive` keeps the course and its history but refuses new
  placements. **Deletion** is allowed for the course's editors **and the owners of its home
  branch** (and above).
- **In-app viewer only.** Content never opens in a second tab. Uploaded files stream as a
  same-origin blob into a **non-sandboxed** iframe (so the browser PDF viewer works — the old
  "blocked by Chrome" sandbox bug); external links embed sandboxed with an open-externally
  fallback.

### 8.4 Compliance
`Compliance` tab (managers): pick any branch you govern (ownership can sit on several
levels), see per-course compliance across its subtree, list the non-compliant, and send them
a reminder (`POST /roles/:roleId/compliance/remind`) with a default or custom message.

### 8.5 Real-time & retention
- **Live updates** over per-org Server-Sent Events (`GET /orgs/:id/events`): mutations
  broadcast which slice changed (structure / requests / courses / notifications) and clients
  refetch — no page refresh.
- **Notifications** are categorized, informative and clickable (deep-link to the exact
  request); per-message dismiss + clear-all; a cleanup nudge past 10 messages.
- **Retention:** notifications and decided requests self-clean after **7 days**; transient
  operational data (Supreme verification audits, spent refresh tokens) clears after **15
  days** (nightly job + opportunistic on read).
- **Passwords**: every new password (registration, org creation, backup export) must be
  retyped to confirm.

### 8.6 Security, storage & authoring hardening (2026-07-24)
- **Rate limiting**: credential endpoints (`/auth/login`, `/auth/register`) are throttled
  per IP (10 / 5 min); `/auth/refresh` looser (60 / 5 min). In-memory (single-instance).
- **Content sanitization**: authored document HTML is sanitized server-side (tag whitelist +
  a **filtered `style` attribute**) on create, update AND draft save — defence-in-depth over
  the client sanitizer — so a member author cannot land stored XSS. The declaration
  whitelist lives in `@vault/shared/rich-text` and is shared by both sanitizers: colour,
  highlight, font, size, alignment and spacing survive the round trip; anything that could
  fetch a resource or escape a declaration (`url()`, `expression`, `position`, …) is dropped.
- **Content-route hardening**: inline file serving carries a locked-down CSP
  (`default-src 'none'; … sandbox`), `X-Content-Type-Options: nosniff`, `X-Frame-Options`
  and `Referrer-Policy` — an uploaded HTML/SVG can never execute with our privileges.
- **Audit log**: a general append-only `AuditLog` records sensitive governance actions
  (`person.add`, `course.delete`, `request.decide`, …) with actor + ip; 90-day retention.
- **Inline files are gzip-compressed at rest** (transparently inflated on read); the user
  always gets the original, correctly-formatted file. Storage adapter port stays open for
  NAS / Google Drive / OneDrive backends (client's choice, TBD).
- **Studio**: multi-page documents via a `pagebreak` block (books turn page-by-page in the
  viewer, with the author's chosen transition) and **localStorage autosave** (draft recovery,
  cleared on publish) on every plan; server-side drafts on premium plans.
- **Profiles**: optional profile picture — a client-downscaled 256px JPEG data URL,
  size-capped and type-checked server-side.

---

## 9. Organization-provided storage ✅ DECIDED (2026-08-04) — built for files

> This section is normative. The working record of how it was reached lives in
> `Data Storage Architecture/`; where that folder and this section disagree, **this section
> wins**.
>
> **Shipped:** uploaded files. An organization connects an S3-compatible backend at creation,
> and its files go browser → their storage, encrypted in the browser when the posture is
> `ENCRYPTED`. Migration, the delete queue, health checks and the degraded state are live.
>
> **Not yet moved:** Studio-authored documents, exam papers and Studio drafts still live in
> `Course.storageRef` / `StudioDraft.document` JSON exactly as before. They are kilobytes
> each and are not the cost problem; moving them adds a network round trip to the most common
> action in the product, so they follow as their own phase. §9.9 describes the exam behaviour
> that phase must implement.
>
> **Required environment variable:** `STORAGE_KEK` — 32 bytes, hex or base64. The API refuses
> to boot without it in production. See §9.5.

### 9.1 The principle

Organization content moves out of our database and onto storage the organization provides,
configures and pays for. **We keep the catalogue; they keep the contents.**

| Moves to their storage | Stays in our database |
|------------------------|-----------------------|
| Uploaded files (PDF, image, audio, video) | Roles, placements, capabilities |
| Studio-authored documents (the block array) | Course *metadata* — code, title, description, classification, kind, version, category, placements, prerequisites, deadlines, recurrence |
| Exams / quizzes (questions **and** answer key) | Completion records, exam *results* (score, pass/fail, attempts, violations) |
| Studio drafts | Requests, mailbox, plans, coins, audit logs |
| | The `storageRef` pointer, object size and SHA-256 |

The dividing line: anything that answers *who may see what* or *what has been done* stays
with us, is small, and must stay queryable when their storage is not.

### 9.2 The backend — one adapter, presented as "NAS"

The first (and initially only) backend is **S3-compatible object storage**, offered to
organizations as **NAS** and documented with **MinIO** as the recommended server to run on it.

The adapter speaks the S3 API. That is a deliberate economy: the same adapter later serves
Amazon S3, Cloudflare R2, Google Cloud Storage (interoperability mode), Wasabi, Backblaze B2
and DigitalOcean Spaces as **configuration**, not as new code.

**Why S3-compatible rather than the WebDAV or SFTP already built into every NAS:** only
S3 issues **presigned URLs**, so the reader's browser fetches straight from the organization's
NAS and the bytes never enter our infrastructure. WebDAV and SFTP would proxy every byte of
every read through our API — which we pay for, and which would hold whole files in the memory
of a 512 MB instance. S3 is free for them (open-source server, hardware they own), free for us
(zero egress), and the least code.

WebDAV and SFTP may be added later as additional protocols under the same **NAS** option, on
the explicit understanding that they are the expensive path.

### 9.3 Storage is chosen when the organization is created

The organization creation form carries a **Storage** dropdown. It currently offers one option
— **NAS** — with its configuration fields beneath it. More backends appear in this dropdown as
adapters ship; nothing else about the flow changes when they do.

Fields collected:

| Field | Required | Notes |
|-------|----------|-------|
| Endpoint URL | yes | `https://storage.acme.com` — their MinIO address. HTTPS only |
| Bucket | yes | Must already exist; we never create buckets |
| Access key ID | yes | |
| Secret access key | yes | Encrypted at rest; never returned to the browser after saving |
| Path prefix | no | Lets them share a bucket with other systems |
| Region | no | `us-east-1` by default; MinIO ignores it |
| Force path-style | no | **On** by default — MinIO needs it |
| TLS fingerprint | no | Only when their certificate is self-signed |
| Encryption posture | yes | See §9.5 |

**Ordering rule (load-bearing).** The connection test (§9.4) is a network call to their
storage and **must complete before the creation transaction opens**. A failed test aborts
creation and **does not consume the access code** — the creator fixes their storage and
retries with the same code.

**Consequence, stated plainly:** an organization cannot be created until its storage is
reachable and working. That is the cost of choosing storage at creation time rather than
after it.

### 9.4 The connection test

Before any backend is activated — at creation, and again whenever credentials are replaced:

1. Write a probe object under the configured prefix.
2. Read it back.
3. Compare the bytes.
4. Delete it.

The test reports the **exact** failure, never a generic one: bad credentials, bucket missing,
no write permission, **bucket is publicly readable** (refused — a public bucket makes every
permission rule in this document decorative), certificate untrusted, CORS missing, clock skew.

A backend that "seems configured" but fails on the first real upload is the outcome this test
exists to prevent.

### 9.5 Encryption — a per-organization choice, fixed at setup

The organization chooses one of two postures when it connects storage:

**`ENCRYPTED` (default, recommended).** Every object is encrypted before it leaves us. Their
storage holds opaque `.kvblob` objects. Nobody with access to the storage — including their
own IT administrator — can read a document without going through Knowledge Vault or the
recovery route in §9.11.

**`PLAIN`.** Objects are stored as ordinary files. Their storage stays browsable, and anyone
with access to it can read anything in it. Offered for organizations that knowingly want this
and are told what it means.

**The posture is fixed once storage is activated.** Changing it re-encrypts or decrypts every
object already stored, so it is a migration with a progress bar, not a settings toggle. The
setup screen must say so before the choice is made.

**Key hierarchy** (`ENCRYPTED` only):

```
File Key (FK)      fresh 256-bit key per object, AES-256-GCM
     │ wrapped by
Data Key (DEK)     one per organization
     │ wrapped by ─┬─ Platform KEK   environment variable, never in the database
                   └─ Supreme KEK    derived from the Supreme password
```

- The **platform wrap is persisted** in the database and makes normal reading seamless.
- The **Supreme wrap is never persisted.** It is computed at `.main` export time, from the
  live DEK and the Supreme password the export route has just verified, and written only into
  the exported file. Storing it would put an offline attack on a human-chosen password into
  every database dump, which defeats the point of holding the platform key outside the
  database.

**Decryption happens in the reader's browser** (Web Crypto, AES-GCM). Our API sends the
per-file key over its already-authenticated channel; the ciphertext travels from their storage
to the browser directly. Bandwidth cost stays at zero and **our server never holds plaintext**.

**Object format (fixed before the first object is written — changing it later means
re-encrypting everything).** Objects are written as a small plaintext header followed by
fixed **4 MB frames**, each sealed independently with a nonce derived from its frame counter.
Frame boundaries align with S3 multipart upload parts. Web Crypto's AES-GCM does not stream:
without framing, a 200 MB file would need 200 MB in memory twice and would crash a mid-range
phone.

### 9.6 Object layout

```
<bucket>/<prefix>/
├── Knowledge_vault_map.json     signed manifest — see §9.7
├── Knowledge_vault_map.md       the same, readable by a person
├── README.txt                   "what is this folder, do not edit"
└── objects/2026/08/3f2a…c1.kvblob
```

Objects are **content-addressed and date-sharded**, never named after the document. A filename
like `Redundancy-Consultation-Legal-Advice.pdf` leaks confidential information to anyone who
can list the folder; date shards keep any one directory small.

### 9.7 The `Knowledge_vault_map` manifest

We write a signed manifest into their storage describing the role tree, the people on it, and
one entry per object with the audience our database says it reaches.

**It is a mirror, never the authority.** Permissions are read from our database and nowhere
else. If the map were ever consulted for access decisions, anyone able to write to that folder
would control access to every document in the organization.

On read we verify its Ed25519 signature. A mismatch raises a **tampering** message to the
owners and the map is rewritten from the database. **Access is unaffected either way.**

It contains role numbers, not resolved member lists; a nightly `.md` twin carries resolved
names for auditors. It must never contain the Supreme password or anything derived from it,
storage credentials, encryption keys, exam answer keys, password hashes, session material, or
document contents.

Rewritten on any change it describes, **debounced by about a minute**, plus a nightly rewrite
that doubles as a storage health check.

### 9.8 Degraded state — never data loss

`OrgStorage.status` is one of `ACTIVE`, `DEGRADED` or `UNCONFIGURED`. A scheduled health check
maintains it.

While `DEGRADED`:

- **Uploads and publishing are blocked**, with a message naming the storage problem.
- **Existing documents report "unreachable until your storage is reconnected"** — the
  `unreachable` adapter state, surfaced by the viewer as **its own state with an explanation
  and a link to the storage settings**, not as a generic load error. (This is new work: the
  viewer currently renders the API's error string.)
- **Owners receive a high-priority mailbox message** on entering and on leaving the state.
- **Deadline, overdue and escalation processing pauses.** An overdue notice generated during a
  storage outage is a false accusation with an audit trail against someone who physically
  could not open the document.

Nothing in this state is presented as data loss, because it is not.

### 9.9 Exams

The answer key moves to the organization's storage with the rest of the paper. Marking stays
**server-side** and the key is **never** sent to a candidate's browser — unchanged.

**The paper is fetched and decrypted when it is dealt** (`GET /courses/:code/exam`) and held
in a short-lived server-side cache, keyed to the sitting, with a TTL covering the exam's
duration. Marking reads that cache.

The rule exists because the alternative fails badly: if the paper were fetched at submission
time instead, a storage outage during a sitting would reject the submission **after** the
candidate had spent the full duration answering, losing their answers. Their *attempt* is
already safe — `loadExam()` runs before any attempt row is written — but their work is not.

If the cache is missing and storage is unreachable at submission, the submission is rejected
with a message naming the storage problem, and **no attempt is consumed**.

### 9.10 Deletion and orphan collection

Deleting a course deletes its object. The remote delete **cannot run inside the database
transaction**, so deletion is recorded as a durable queue entry committed with the transaction
and executed after it, with retries.

A reconciliation job finds objects with no course and removes them. Deletion is soft on some
backends (bucket versioning, NAS snapshots); the map and the deletion documentation say so
honestly rather than implying a shredder.

### 9.11 Custody — what `.main` now promises

`.main` continues to hold structure, people, course metadata and completion records, and now
additionally the **Supreme-wrapped DEK** (§9.5). It does **not** hold the bytes.

Recovery therefore becomes: **their storage + the map + `.main` + the Supreme password.** A
competent engineer with those four things can recover everything without us, and we ship a
standalone open-source decrypt tool so that promise is demonstrable rather than merely stated.

**This is a real reduction in what `.main` alone guarantees**, and it must be stated on the
export screen and in the Main Guide Book (Chapter 16): if the organization deletes its bucket,
`.main` cannot bring the documents back.

### 9.12 Quotas, limits and migration

- **Usage is measured from stored objects**, counting uploads, authored documents, exams and
  drafts alike. (The current `orgStorageUsedMb()` sums `StoredFile.size` only, so authored
  documents and exams have never counted toward any ceiling.)
- **Maximum object size rises to 200 MB** with multipart upload and framed browser-side
  encryption, from the 10 MB the Postgres-backed `inline` adapter allowed.
- **Existing `StoredFile` rows migrate in the background** when an organization connects
  storage: copy up, verify the SHA-256, rewrite the `storageRef`, drop the row. Resumable, one
  object at a time, verify-then-drop.
- Plan ceilings are re-stated against organization-provided storage. The free plan's current
  **150 GB** figure is unbuildable on our database and paid plans currently carry **no storage
  ceiling at all** (`storageLimitMb: null`); both are corrected when this ships.
- **The storage ceiling only meters what we hold.** An organization storing on its own
  hardware has taken that cost off us, so the ceiling stops applying to it; the document and
  upload counts still do. A KVEP organization (§9.13) is metered normally, because its content
  is on our disks.

### 9.13 KVEP — the Knowledge Vault Employee Perk ✅ DECIDED (2026-08-04)

An organization created by one of **our own staff**, for staff use. It is the one shape that
does **not** bring its own storage: its content stays in our database through the `inline`
adapter, exactly as every organization worked before §9 existed, and the plan's storage
ceiling applies to it normally.

**What makes the perk internal is a double gate on a super-admin's own credentials:**

1. **At request time** — the request is raised as kind `KVEP_ORG` rather than `CREATE_ORG`.
2. **At creation time** — a super-admin **username and password** are entered again and
   verified against the `PlatformAdmin` table.

Both are required. Creation refuses:

- a KVEP code with no credentials,
- credentials supplied against an ordinary code,
- storage fields on a KVEP creation.

Credential failure is **deliberately generic** — it never reveals whether a username exists,
and it is checked before any coins are charged or any row is created.

The organization carries `isKvep` so every later surface can tell the two apart. In the
owner's Group configuration it shows a statement of fact in place of the storage panel —
offering a connection form to an organization that cannot use one would only produce a form
that refuses everything typed into it. It never enters the degraded state of §9.8, and never
appears in the migration of §9.12 because it has nowhere to migrate to. Uploads fall through
to the `inline` adapter exactly as they did before §9 existed.

### 9.14 Organization logo ✅ DECIDED (2026-08-04)

An optional logo, chosen when the organization is created and stored as a **client-downscaled
square data URL** (256 px, ≤ 300 KB) in the same shape as a profile picture. It is never
required.

**Without one, the badge is generated**: the first letter of the organization's name on a hue
derived from its `orgNumber`, so two organizations are distinguishable at a glance and no
organization ever renders as a blank square.

The badge appears wherever an organization is identified — the organization card, the
super-admin console, and the document frame, so a published or printed document carries the
mark of the organization that issued it.
