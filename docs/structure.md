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

### 3.6 Exams — DEFERRED OUT OF v1 ✅ DECIDED
- v1 ships **no exams**: a scored exam requires the platform to know questions and answers,
  which belongs to the authoring suite. The full exam system (builder, pass/fail scoring,
  thresholds, retake-after-failure flow, certificates) moves to `future.md`.
- Recurrence (`retake_every_n_days`) is **not** exam-specific and stays in v1 for all courses.

### 3.7 Completion (v1) ✅ DECIDED
- Manual **"mark as complete"** for all v1 content. Advanced tracking → `future.md`.
- A completion record is keyed to the **course's unique platform code** and is part of the
  **user's data**, carrying: the course code, the completed course version, the completion
  date, and the **expiry time** (`completedAt + retake_every_n_days`, when recurrence is set).
  When exams arrive (future), the re-attempt time joins the same record.

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
