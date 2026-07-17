# Organisation Knowledge Vault — Initial Working Document (Temporary)

> Living capture of requirements, decisions, and open questions during the discovery phase.
> This file will later be split into `plan.md`, `structure.md`, and `architecture.md`.

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
- One profile can belong to **N organizations**.
- Organizations do not own users; they attach **memberships + roles** to existing global profiles.

### 2.2 The "Supreme" (org root — NOT a profile)
- The Supreme is **not a user profile**. It is a special **object of existence of the organization** itself.
- It has only a name: **"Supreme"**. It owns/contains the entire organization structure and all its data.
- Created together with the organization by the founding person (who sets its password at creation).
- **Permanent** — cannot be removed; full edit rights over everything in the org.

### 2.3 The `.main` recovery file
- At/after org creation, the owner can download a special file (extension `.main` — a.k.a. the
  "supreme file") that snapshots the organization.
- If the organization or the Supreme is deleted, uploading this file to the platform **revives** the org.
- Sharing/safekeeping of this file is entirely the owner's responsibility (they choose which
  colleagues get a copy).

---

## 3. Organization Structure (the role tree)

### 3.1 Roles as tree nodes
- The Supreme creates roles (e.g., **HR**); roles are assigned to profiles.
- A role is a **scoped slice of the org** — holders act only within their branch ("layer").
- Role holders can create **sub-roles** (e.g., HR → Assistant HR, Resource HR), infinitely deep.
- Role names may be **unique or duplicated** across branches.

### 3.2 Delegation controls
- When adding a person to a role, the granter decides **per individual** whether that person can
  create sub-groups/sub-roles. This flag can be changed later.
- When creating a role, the creator decides whether it is a **terminal (final) role** of that branch
  (i.e., no sub-roles allowed beneath it). Changeable later.

### 3.3 Role-holder capabilities (within their layer only)
1. Create knowledge items (books, courses, exams, audio/video content).
2. Add N people under them with layer-scoped rights (delegation cascades **down**, never sideways/up).
3. Add plain learners/employees who consume that layer's courses (mandatory or opt-in).

### 3.4 Multi-membership — the "3D tree"
- One profile can sit in **multiple branches of the same org**, at different heights
  (e.g., bottom of the HR branch, top of the Technical branch).
- Same profile, multiple positions → the org chart is a complex graph, conceptually a "3D tree".

### 3.5 Org chart tab (later phase — design note only)
- Every user gets a planned **org-graph tab**: they see their own position(s) with the layers
  **above and below** them.
- The graph shows **roles as nodes, not individual users** (would be too big otherwise).
- Clicking a role node opens its **people list with search**.

---

## 4. Member Experience

When a user enters an organization they see two primary areas:

1. **My Learning** — courses assigned to them (mandatory clearly flagged) + opt-in courses they can enroll in.
2. **My Structure** — the part of the org tree they sit in; if they hold delegation rights, this is
   where they add people beneath them.

---

## 5. Knowledge Items (courses/content)

### 5.1 Course identity & reuse
- Every course gets a **unique course code**.
- **No duplication**: if unrelated branches need the same course, it is shared **by code**, not copied.

### 5.2 Visibility & inheritance
- At upload time the uploader chooses:
  - Whether the course is **inherited by lower branches** or stays at that level.
  - Whether it is **mandatory** or **opt-in (avail)** for its audience.

### 5.3 Prerequisites (course trees)
- A course or exam may **require completion of another course first** (hard prerequisite).
- Courses therefore form their own small dependency trees — **independent of the org tree**
  ("small branches of their own", not linked to each other globally).

### 5.4 Exams
- Exams need **pass/fail** handling (scoring). Details TBD (see open questions).

### 5.5 Content authoring roadmap
- **v1**: upload-based only (files/links).
- **Future**: template-based documentation, AI conversion of uploaded docs into standard
  documentation, video upload, audio upload, audiobook upload, exam creation/builder.

---

## 6. Infrastructure (free-of-cost v1)

| Concern            | v1 choice                    | Later                     |
|--------------------|------------------------------|---------------------------|
| Frontend hosting   | Vercel                       | —                         |
| Database           | Neon (serverless Postgres)   | —                         |
| Backend server     | Render                       | —                         |
| Media storage (A/V)| Google Drive                 | NAS / cloud object storage|

---

## 7. Design Implications (agreed direction)

- Three cleanly separated concepts: **Profile** (global auth identity) ⟷ **Membership**
  (profile ↔ org) ⟷ **Role assignment** (membership ↔ node in the org tree).
- Permission checks are **scope-inherited**: "does this user hold a role at this node or an
  ancestor node with capability X" — makes layer isolation fall out naturally.
- API-first backend; web frontend is just the first client (mobile later).
- Course sharing by code (not duplication) requires courses to be org-level entities with
  **placements** (branch + mandatory/opt-in + inheritance flags), not branch-owned copies.

---

## 8. Open Questions (pending discussion)

### Supreme & `.main` file
- File extension: `.main` or `.supreme`? (Both were mentioned — pick one.)
- What exactly is inside the file: full org snapshot (structure, members, course metadata,
  completion records) or only revival keys/credentials? Should it be passphrase-encrypted?
- Snapshot staleness: reviving from an old file restores old state — auto/periodic re-export?
- Can multiple people log in "as Supreme" concurrently? Is there an audit trail of Supreme actions?
- Revival conflicts: what if the org still exists when someone uploads the file?

### Roles & tree
- Who can later toggle the "can create sub-groups" flag — only the direct parent, or Supreme too?
- Deleting a role / removing a person that has a subtree underneath: what happens to the orphaned
  subtree?
- Are role capabilities a fixed bundle (upload + add people) or configurable per role
  (e.g., can-upload, can-assign-mandatory, can-view-reports as separate switches)?

### Courses & compliance
- Course codes: auto-generated or human-chosen? Unique per org or platform-wide?
- Cross-branch sharing by code: push by uploader, or pull by the other branch's admin? Approval?
- Mandatory courses: deadlines? recurrence (annual re-certification)? reminders/escalation?
- What counts as "completed" for non-exam content (video watch %, document acknowledgment)?
- Exams: question types, retake limits, per-exam pass threshold, certificates, expiry?
- Course updates/versioning: does an update reset completion?

### Users & learners
- Adding an employee: email invitation → create/link global profile → auto-join org?
- Can learners browse/see opt-in catalogs of branches other than their own?

### Reporting
- Scope of reports: each role holder sees only their subtree; Supreme sees all? CSV export?
- Audit log of admin actions?

### Storage & auth
- Google Drive: platform-owned service account vs. each org connecting its **own** Google account
  (quota isolation, 15 GB per account)? Drive streaming limits acceptable for v1 video?
- Login methods: email+password only, Google OAuth, or both? Email verification required?
- Backend language/framework preference for the Render server, or should Claude propose?

---

## 9. Deliverables Roadmap (meta)

1. ✅ Requirement discussion (in progress)
2. ⬜ `plan.md` — phased delivery plan
3. ⬜ `structure.md` — org/data structure specification
4. ⬜ `architecture.md` — technical architecture (stack, API design, data model, storage)
