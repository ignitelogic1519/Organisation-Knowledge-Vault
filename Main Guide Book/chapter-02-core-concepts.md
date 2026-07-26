# Chapter 2 — The big idea: core concepts

Before diving into individual screens, it helps to understand the five ideas that Knowledge
Vault is built on. Everything else in this book is an application of these.

---

## 1. An organization is a tree of roles

A Knowledge Vault organization isn't a flat list of employees — it's a **structure of
roles**, drawn as a top-down tree. At the very top sits one root role (in our sample,
*Executive Office*). Beneath it grow branches and sub-branches — *Engineering*, then
*Firmware Team* and *Robotics QA*, and so on.

**Knowledge flows down this tree.** A course placed on a role can be set to **inherit** to
every branch beneath it, so publishing once at the right level reaches everyone below
automatically.

![The constellation — an organization drawn as a tree of roles](images/constellation.png)

---

## 2. People are placed on roles, as owners or members

Every person in an organization occupies one or more **positions** on the tree. Each
position is one of two kinds:

- **Member** — they *learn* from that branch. Courses reaching that role appear in their
  **My Learning**.
- **Owner** — they *manage* that branch: add people, publish courses, create sub-groups,
  and so on. An owner is a manager for their part of the tree.

A single person can hold several positions — e.g. an owner of *Engineering* who is also a
member of a company-wide *Safety* branch.

---

## 3. Least-privilege governance

Ownership is not all-or-nothing. Owners hold **only the specific rights they've been
granted** — for example, "may create sub-groups" or "may appoint co-owners" — and, crucially,
**an owner can never grant a right they don't hold themselves**. This keeps authority
flowing safely down the tree and prevents anyone from quietly escalating their own power.

Deleting a branch needs sign-off from the level above; branches are **public by default**
but can be **hidden**, cascading privacy down the subtree. Chapter 6 covers all of this.

---

## 4. Custody — your data is yours

Knowledge Vault is built so that the platform **holds nothing it could hold hostage**. The
top of every organization is protected by a **Supreme password** that only you know — the
platform stores no copy. That password:

- authorises owner-level changes to the top of the structure, and
- encrypts your organization's **`.main` file** — the single, offline key that can revive
  your organization even after it's been deleted and purged.

If you ever leave the platform, your `.main` file (and per-branch `.bkp` backups) mean your
structure and knowledge remain **in your custody**, not locked inside someone else's system.
Chapter 14 covers this in full.

---

## 5. Standardized, classified documents

Every piece of knowledge you publish is treated as a proper document. On publish, Knowledge
Vault automatically wraps it in a **standard cover** (organization, title, version, date,
author), a **scope page**, and a header/footer — so every document looks consistent and
auditable.

Every document also carries a compulsory **classification**:

| Classification | Meaning |
|----------------|---------|
| **Public** | Anyone in the org may see it |
| **Confidential** | Sensitive; shared on a need-to-know basis |
| **Private** | Restricted to a specific group |
| **Secret** | The most tightly held material |

You'll see these classification badges throughout the library, courses and viewer.

---

## The vocabulary you'll meet

| Term | Quick meaning |
|------|---------------|
| **Constellation** | Your organization drawn as a star map of roles |
| **Role / branch / node** | A position in the tree (used interchangeably) |
| **Owner** | Manages a branch |
| **Member** | Learns from a branch |
| **Course** | Any published knowledge — document, book, link, audio or video |
| **Supreme** | The protected root of your org, guarded by the Supreme password |
| **Request** | A formal ask that someone with authority approves |
| **Classification** | The sensitivity label every document must carry |

A fuller glossary is in the [Appendix](appendix-glossary-and-reference.md).

**Next:** [Chapter 3 — Founding an organization →](chapter-03-founding-an-organization.md)
