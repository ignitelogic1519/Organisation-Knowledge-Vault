# Chapter 2 — The big idea: core concepts

Before diving into individual screens, it helps to understand the six ideas Knowledge Vault
is built on. Everything else in this book is an application of these.

---

## Why it matters

These six ideas are not architecture trivia — each one removes a job somebody would otherwise
be doing by hand:

| Parameter | What the model buys you |
|-----------|-------------------------|
| **Time** | The tree *is* the assignment rule. Nobody maintains a training matrix, and a new team inherits the company's mandatory material the moment it exists. |
| **Risk & compliance** | Classification is compulsory, completions are records, and editions are dated — so "which version were they trained on?" has an answer that nobody had to write down. |
| **Security & custody** | Least privilege is structural (you cannot grant what you do not hold), and the Supreme password is held by you alone. |
| **Cost** | One platform covers structure, authoring, delivery, assessment and reporting. The parts do not need to be integrated because they were never separate. |
| **Adoption** | People see their own company on the screen — their branch, their courses, their deadline — rather than a generic course catalogue. |

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

> **Why a tree and not a group list?** Because a group list has to be maintained by hand for
> every new starter, and a tree does not. Put a person on a branch and everything published
> above them arrives; move them, and their obligations move with them. Nobody has to remember
> to add them to eleven groups.

---

## 2. People are placed on roles, as owners or members

Every person in an organization occupies one or more **positions** on the tree. Each
position is one of two kinds:

- **Member** — they *learn* from that branch. Courses reaching that role appear in their
  **My Learning**.
- **Owner** — they *manage* that branch: add people, publish courses, create sub-groups,
  and so on. An owner is a manager for their part of the tree.

A single person can hold several positions — e.g. an owner of *Engineering* who is also a
member of a company-wide *Safety* branch. The dashboard card shows every position you hold,
owners first ([Chapter 4](chapter-04-your-organizations.md)).

---

## 3. Least-privilege governance

Ownership is not all-or-nothing. Owners hold **only the specific rights they've been
granted** — for example, "may create sub-groups" or "may appoint co-owners" — and, crucially,
**an owner can never grant a right they don't hold themselves**. This keeps authority
flowing safely down the tree and prevents anyone from quietly escalating their own power.

Deleting a branch needs sign-off from the level above; branches are **public by default**
but can be **hidden**, cascading privacy down the subtree.
[Chapter 6](chapter-06-building-your-structure.md) covers visibility, and
[Chapter 7](chapter-07-people-and-governance.md) covers the rights themselves.

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
[Chapter 18](chapter-18-supreme-and-custody.md) covers this in full, and
[Chapter 23](chapter-23-where-your-documents-live.md) covers where the document bytes
themselves sit.

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

## 6. Nothing is overwritten — everything gets an edition

A published document is never quietly edited underneath its readers. Revising it produces a
**new edition** — v1.0 becomes v2.0 — with a dated line in its **edition log** saying what
changed and who changed it. Readers keep the live edition until you publish the new one, and
an edition can be set to **reset completions**, so a materially changed policy asks everyone
to read it again.

The same idea covers *replacing* one document with another: a new document can **coexist**
with the old one or **supersede** it, retiring the old code onto the new one so nothing is
left pointing at a document nobody maintains.
[Chapter 11](chapter-11-editions-and-review.md) is the whole story.

---

## The vocabulary you'll meet

| Term | Quick meaning |
|------|---------------|
| **Constellation** | Your organization drawn as a star map of roles |
| **Role / branch / node** | A position in the tree (used interchangeably) |
| **Owner** | Manages a branch |
| **Member** | Learns from a branch |
| **Course** | Any published knowledge — document, book, link, audio, video or exam |
| **Edition** | One published version of a course, with a dated note saying what changed |
| **Supreme** | The protected root of your org, guarded by the Supreme password |
| **Request** | A formal ask that someone with authority approves |
| **Classification** | The sensitivity label every document must carry |
| **Session** | One signed-in browser, which ends after an hour away ([Chapter 19](chapter-19-sessions-and-security.md)) |

A fuller glossary is in the [Appendix](appendix-glossary-and-reference.md).

---

## 🎬 Make a video of this

**Length:** ~2 minutes. **Working title:** *"Six ideas, and the rest is detail."*

| # | Shot | Say |
|---|------|-----|
| 1 | The constellation, slowly zooming out | "An organization here is a tree of roles, not a list of people." |
| 2 | Drop a course on a high branch, show it appear in a junior's My Learning | "Publish once, at the right height, and it reaches everyone below." |
| 3 | The People panel, an owner's rights chips | "Owners hold named rights — and can never hand on a right they don't have." |
| 4 | The Supreme warning on the creation form | "One password we never store. It is what makes the data yours." |
| 5 | A published document's cover page | "Everything published gets the same cover, the same scope page, and a classification." |
| 6 | The Studio's *Publish v2.0* button and edition log | "And nothing is overwritten — you publish editions." |

**Script beat to close on:** *"Structure, custody, classification, editions. Everything else in
the product is one of those four wearing a different hat."*

**Next:** [Chapter 3 — Founding an organization →](chapter-03-founding-an-organization.md)
