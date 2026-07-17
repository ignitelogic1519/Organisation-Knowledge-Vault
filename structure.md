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
- Platform-wide identity: email, password hash and/or Google identity, display name.
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
  tagged the role on them**.

### 3.5 Prerequisites
- Hard prerequisites: item X requires completed item Y first.
- Courses form their own small dependency trees, fully independent of the org tree.

### 3.6 Exams
- Pass/fail with scoring.
- `issues_certificate` — on/off chosen by the creator at publish.
- On failure: retake unlocks ("refresh") after a notification is sent to the person who added
  the failed user to the group.

### 3.7 Completion (v1)
- Non-exam content: manual **"mark as complete"**. Advanced tracking → `future.md`.

---

## 4. Lifecycle Flows

### 4.1 Organization creation
1. Person signs up / logs in with their global profile.
2. Creates the organization → sets the **Supreme password** → Supreme object + org number issued.
3. Names the Owner role; creator becomes its first occupant. Co-owners can be added (I2 applies).

### 4.2 People onboarding
1. An authorized role owner enters an **email address**.
2. Profile exists → org invitation. No profile → sign-up link; joining completes on registration.

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

### 5.2 `.bkp` — node backup file
- Scope: **one node** (its owners, members, placements, records). The Owner role may also export
  a full-tree `.bkp`.
- **Restore semantics:**
  - Restores every data point of the node "like nothing ever happened" — including completion
    records; post-snapshot progress is lost (accepted trade-off, node head communicates it).
  - Restricted to the node itself — requires **complete access + restore rights on that node**;
    **child nodes are not restored**.
  - If the live structure diverged **severely** from the snapshot structure → restore **denied**
    with an explanatory message (structure-hash comparison, see `architecture.md`).
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
- Sole email exception: the transactional **deletion confirmation** mail (§4.3).
