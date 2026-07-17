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

### 2.2 The "Supreme" (org root object — NOT an account) ✅ DECIDED
- The Supreme is **not a user profile and cannot perform actions**. It is the organization's
  **root data object** — the common starting point of every organization.
- It contains the organization's structural data (and its platform-unique organization number),
  but holds **no permission** to add courses or make changes.
- The hierarchy always begins: **Supreme → Owner** (the first role; the creator chooses its
  display name — Owner / CEO / Principal / etc.).
- Changing the Owner sub-profile (owner-level structural change) requires the **password set at
  organization creation time** — this password belongs to the Supreme layer, not to any profile.

### 2.3 The `.main` file ✅ DECIDED
- **Extension:** `.main` (custom).
- **Contents:** a **full encrypted export** of the organization — the platform deliberately does
  NOT retain the org's crucial backup data; custody of the file is entirely the owner's
  responsibility (they decide which colleagues get copies).
- The **decryption key is stored by the platform for 30 days only**, then destroyed forever
  (⚠ see open question #1 on the revival implication).
- **Revival:** uploading a `.main` file revives a deleted organization. If the organization
  **still exists, the upload is rejected**.

### 2.4 The `.bkp` file (node-level backups) ✅ DECIDED
- Every **node manager** (role owner) can create and manage a `.bkp` backup of **their node/branch**.
- The Owner profile can create a `.bkp` of the **full tree** and restore it when needed.
- `.bkp` is **not** the same as `.main` — `.main` is the org's existence/revival file;
  `.bkp` is an operational branch backup.

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

- The **organization number** lives in the Supreme/`.main` (e.g., `456`).
- Each role gets a unique code (e.g., HR = `989`).
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

### 7.2 Authentication ✅ DECIDED
- **Both** email+password (with verification) **and** Google sign-in — free-tier friendly
  implementation required.

### 7.3 Infrastructure (free tier) ✅ DECIDED
| Concern            | v1 choice                       |
|--------------------|---------------------------------|
| Frontend hosting   | Vercel (Next.js)                |
| Database           | Neon (serverless Postgres)      |
| Backend API server | Render (kept separate from day 1 to serve the future mobile app) |
| Media storage      | Per-org adapter (Drive first)   |

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

## 9. Open Questions (final round)

1. **The 30-day key paradox (structural!).** If the platform destroys the decryption key after
   30 days, a `.main` file older than 30 days can never be decrypted — revival becomes impossible
   exactly when it's most needed. Options:
   (a) derive the encryption key from the **org-creation password** so the platform never stores
   it and the file is decryptable forever by whoever has file + password (recommended);
   (b) owner must re-download a fresh `.main` at least every 30 days.
2. **`.bkp` restore semantics.** Does restoring a node `.bkp` overwrite the current subtree?
   Are completion records included? Can only the node's owners upload/restore it?
3. **Owner replacement flow.** Where is the org-creation password entered — a dedicated
   "Supreme access" page per org? Can the first role (Owner/CEO) have multiple co-owners like
   any other role?
4. **Role numbers.** Org numbers are platform-unique (456). Are role numbers (989) unique
   platform-wide too, or only within their organization?
5. **Notifications v1.** In-app only, or also email (free tier permitting)?

---

## 10. Deliverables Roadmap (meta)

1. ✅ Requirement discussion (this document)
2. ⬜ `plan.md` — phased delivery plan
3. ⬜ `structure.md` — org/data structure specification
4. ⬜ `architecture.md` — technical architecture (stack, API design, data model, storage adapter port)
5. ✅ `future.md` — deferred features register
