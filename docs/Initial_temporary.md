# Organisation Knowledge Vault — Initial Working Document (Temporary)

> Living capture of requirements, decisions, and open questions during the discovery phase.
> This file will later be split into `plan.md`, `structure.md`, and `architecture.md`.
> Deferred/roadmap features live in `future.md`.

Last updated: 2026-07-17

---

## 1. Product Vision

A **multi-tenant organizational training & compliance platform** ("Knowledge Vault"):

- Organizations host **mandatory** and **opt-in** learning content: books, documents, courses, exams, audio, video.
- Web application first; **mobile application later** → backend must be **API-first** so both clients consume the same API.
- Compliance is a core driver: tracking who was assigned what, completion status, exam results.
- Target cost for v1: **free-tier infrastructure only**.

---

## 2. Identity Model

### 2.1 Global Profiles
- A **profile is a global entity**, independent of any organization (GitHub/GitLab model).
- **Nothing can be done without a profile** — the profile is the actor for every action.
- One profile can belong to **N organizations**; organizations attach memberships + roles to
  existing global profiles, they never own the profile.
- **Profile deletion rule:** a user cannot delete their profile while they still own projects —
  they must first delete those organizations or transfer the owner role to another user.

### 2.2 The "Supreme" (org root object — NOT an account) ✅ DECIDED
- The Supreme is **not a user profile and cannot perform actions**. It is the organization's
  **root data object** — the common starting point of every organization.
- It contains the organization's structural data (and its platform-unique organization number),
  but holds **no permission** to add courses or make changes.
- The hierarchy always begins: **Supreme → Owner** (the first role; the creator chooses its
  display name — Owner / CEO / Principal / etc.).
- The Owner role can have **multiple occupants, minimum one** — same invariant as every role.
- Changing the Owner sub-profile (owner-level structural change) requires the **password set at
  organization creation time** ("Supreme password") — this password belongs to the Supreme layer,
  not to any profile. It is entered on a dedicated Supreme-access gate for the org
  (assumption: a protected page/modal, not part of normal login).

### 2.3 The `.main` file & organization deletion lifecycle ✅ DECIDED
- **Extension:** `.main` (custom).
- **Contents:** a **full encrypted export** of the organization — the platform deliberately does
  NOT retain the org's crucial backup data; custody of the file is entirely the owner's
  responsibility (they decide which colleagues get copies).
- **Encryption:** the key is **derived from the Supreme password** — the platform never stores a
  decryption key, so a `.main` file stays revivable forever for whoever holds file + password.
- **Deletion flow:**
  1. When the owner clicks "delete project", the platform first prompts them to **download the
     `.main` file**; downloading requires entering the **Supreme password**.
  2. On correct password, a confirmation email is sent from the platform mail
     (`ignite.logic1519@gmail.com` for now) to the organization, and the notice goes to the
     owner's mail id.
  3. After deletion, the org's database data is **retained for 30 days** (soft delete) in case
     they change their mind, then **purged forever**.
- **Revival:** within the 30-day window, restore from retained DB data; after that, only by
  uploading the `.main` file. If the organization **still exists, a `.main` upload is rejected**.

### 2.4 The `.bkp` file (node-level backups) ✅ DECIDED
- Every **node manager** (role owner) can create and manage a `.bkp` backup of **their node**.
- The Owner profile can create a `.bkp` of the **full tree** and restore it when needed.
- `.bkp` is **not** the same as `.main` — `.main` is the org's existence/revival file;
  `.bkp` is an operational node backup.
- **Restore semantics:**
  - Restoring puts back **every data point** of that node "like nothing ever happened"
    (completion records included). Any progress made after the snapshot is lost — accepted;
    the node head owns the apology.
  - Restore is restricted to the **current node only** — the restorer must have **complete
    access + restore rights on that particular node**. **Child nodes are NOT restored.**
  - If the live structure has diverged **severely** from the `.bkp` structure, the restoration
    is **denied** with a message that the structure has changed too much.

---

## 3. Organization Structure (the role tree)

### 3.1 Node shape ✅ DECIDED
Each node in the tree is:

```
<Role>  →  n role-OWNERS  →  m MEMBERS
```

- A **role** is the parent entity; people are occupants of it, not nodes themselves.
- **Invariant:** a role must always have **at least one owner**. Removing the last owner requires
  the layer above to restructure first.
- Role holders create **sub-roles** (e.g., HR → Assistant HR, Resource HR), infinitely deep.
- Role names may repeat across branches.

### 3.2 Delegation flags ✅ DECIDED
- **Per role:** "terminal/final role" — no sub-roles allowed beneath. Changeable later.
- **Per person:** "can create sub-groups". Changeable later.
- **Who can change these flags:** anyone **above in the same branch**, plus the **Owner**
  (never the Supreme — it is not an account).

### 3.3 Deletion & restructuring ✅ DECIDED
- Deleting a role is **blocked while its subtree is non-empty**.
- Deleting/restructuring an **entire branch** is allowed only by the **top layer** of that branch.
- Incident templates for managed restructuring: later (see `future.md`).

### 3.4 Capabilities ✅ DECIDED (v1)
- v1 ships a **fixed capability bundle** for role owners (create content + add people, gated by
  the delegation flags).
- Granular per-user capability switches (can-upload / can-assign-mandatory / can-view-reports …)
  are deferred → `future.md`.

### 3.5 Multi-membership — the "3D tree"
- One profile can occupy **multiple positions in the same org**, at different heights
  (bottom of HR branch, top of Technical branch). One profile, many placements.

### 3.6 Org chart tab (later phase — design note)
- Each user sees their own position(s) with layers **above and below**.
- Graph shows **roles as nodes, not users**; clicking a role opens its people list with search.

---

## 4. Member Experience

Entering an organization, a user sees two primary areas:

1. **My Learning** — assigned courses (mandatory clearly flagged) + opt-in courses to enroll in.
2. **My Structure** — their slice of the org tree; delegation-enabled users add people here.

---

## 5. Knowledge Items (courses/content)

### 5.1 Course identity ✅ DECIDED
- Course codes are **auto-generated and platform-unique**, hierarchical:

```
<org-number> - <role-number> - <document-number>
   456       -     989       -     xxxx…
```

- The **organization number** lives in the Supreme/`.main` (e.g., `456`) and is
  **platform-unique**.
- Each role gets a code **unique within its organization** (e.g., HR = `989`); the combined
  code stays globally unique.
- Rationale: content may live on many storage backends/servers per org, so IDs must be globally
  resolvable to org + role + item.
- **No duplication** — unrelated branches share a course **by its code**, never by copying.

### 5.2 Cross-branch sharing & the course admin page ✅ DECIDED
- Sharing by code needs **no approval**.
- Every course has its **own admin page** showing everywhere it is used.
- Access to that page is a **separate permission**, independent of org roles, with its own
  **2-layer tree**: the course owner decides per user whether they get **view** or **edit** on the
  page, and whether they may grant page access to more people.
- This permission chain is controlled by the Owner/Admin/Principal level.

### 5.3 Assignment mechanics ✅ DECIDED
- At upload/placement, the uploader chooses: **inherited by lower branches or not**, and
  **mandatory vs opt-in**.
- **Deadlines:** optional — some courses have none.
- **Recurrence:** "retake every N days" (e.g., security training every 365 days) is a property
  **set on the course at upload**, not per individual.
- **Escalation:** overdue/failure notifications go to **the person who added the user to the
  group / tagged the role** on them.

### 5.4 Prerequisites ✅ DECIDED
- A course/exam may **hard-require** completion of another course first.
- Courses form their own small dependency trees, independent of the org tree.

### 5.5 Completion ✅ DECIDED (v1)
- v1: simple **manual "mark as complete"** for non-exam content.
- Watch-percentage / read-acknowledgment tracking deferred → `future.md`.

### 5.6 Exams ✅ DECIDED
- Pass/fail with scoring.
- **Certificates:** on/off is chosen by the **creator at publish time**.
- **On failure:** the user's retake is unlocked ("refreshed") after a notification is sent to the
  person who added them to the group.

### 5.7 Content updates ✅ DECIDED
- The creator can modify content and sets a flag: **does this update reset completions or not**.
  End users are informed accordingly.

### 5.8 Authoring roadmap
- **v1:** upload-based only (files/links).
- Future (see `future.md`): template-based docs, AI conversion to standard documentation,
  video/audio/audiobook pipelines, exam builder.

---

## 6. People Onboarding ✅ DECIDED

- Admin enters an **email address** →
  - profile exists → org invitation;
  - no profile → sign-up link; joining the org completes on registration.
- Admins never create profiles for others — profiles are global and self-owned.

---

## 7. Storage & Auth

### 7.1 Media storage — pluggable, open-ended ✅ DECIDED (direction)
- No single storage decision for v1. Each organization connects **its own** backend
  (Google Drive first; later NAS, cloud object storage, …) depending on its capability.
- Architecture requirement: a **storage adapter interface** ("open port") so backends plug in
  without touching the core. Google Drive is the first adapter we build.

### 7.2 Notifications ✅ DECIDED (v1)
- **In-app notifications only** for v1 (assignment, overdue, exam failure escalation, etc.).
- Email notifications come later, most probably after the incident management system
  (see `future.md`). One exception exists today: the **transactional deletion email** in the
  org-deletion flow (§2.3), sent from the platform mail account.

### 7.3 Authentication ✅ DECIDED (revised 2026-07-18)
- **v1 active method: email+password with verification.**
- **Google sign-in: DEFERRED** by owner decision — fully built but dormant until its env vars
  are configured (activation steps preserved in `setup-guide.md` §4.2; see `future.md` §9).
  Note: Google OAuth client IDs are free — no billing account required.

### 7.3 Infrastructure (free tier) ✅ DECIDED
| Concern            | v1 choice                       |
|--------------------|---------------------------------|
| Frontend hosting   | Vercel (Next.js)                |
| Database           | Neon (serverless Postgres)      |
| Backend API server | Render (kept separate from day 1 to serve the future mobile app) |
| Media storage      | Per-org adapter (Drive first)   |
| Transactional mail | Platform Gmail account (deletion flow only) |

- Note: the user is new to this stack — documentation and steps must be **guided, step by step**.

---

## 8. Design Implications (agreed direction)

- Separated concepts: **Profile** (global identity) ⟷ **Membership** (profile ↔ org) ⟷
  **Placement** (membership ↔ role node, as owner or member).
- Permission checks are **scope-inherited** down the tree; layer isolation falls out naturally.
- Courses are org-level entities with **placements** (branch, mandatory flag, inheritance flag),
  never branch-owned copies.
- Live operational data lives in the platform DB (Neon); `.main`/`.bkp` are offline
  owner-custody backups, not the primary store.

---

## 9. Open Questions

None — all discovery rounds resolved. Decisions are folded into the sections above.

---

## 10. Deliverables Roadmap (meta)

1. ✅ Requirement discussion (this document)
2. ✅ `plan.md` — phased delivery plan
3. ✅ `structure.md` — org/data structure specification
4. ✅ `architecture.md` — technical architecture (stack, API design, data model, storage adapter port)
5. ✅ `future.md` — deferred features register
