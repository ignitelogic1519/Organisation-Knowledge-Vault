# Knowledge Vault — The Main Guide Book

**A complete, plain-language guide to using Knowledge Vault, for the people who use it.**

Knowledge Vault is your organization's training and knowledge platform. It maps your company
as a living **constellation of roles**, delivers the right courses to the right people, keeps
a proper **library** of your documents, runs **exams** that mark themselves, and shows you —
in real time — who has completed what. Everything stays in **your** custody.

This book walks through every feature the way you actually meet it in the product, one chapter
at a time. Every screen shown here comes from a real sample organization, **Aurora Robotics**,
so you can follow along and recognise exactly what you'll see.

![The Knowledge Vault welcome screen](images/welcome-landing.png)

> **This book is for end users, owners and managers.** The Knowledge Base team's own console —
> approving requests, issuing codes, gifting coins, editing plans — is deliberately **not** in
> this book. It lives in the separate **Super Admin Guide Book**, held by that team.

---

## How to read this book

- **New to the platform?** Read Chapters 1–4 in order — they take you from creating a profile
  to understanding the constellation.
- **Setting up your company?** Chapters 3, 5, 6 and 16 cover founding an organization, building
  its structure, placing people, and safeguarding it.
- **Publishing knowledge?** Chapters 7, 8, 9 and 10 cover courses, the Studio, exams and the
  library.
- **A learner or team member?** Chapters 11 and 14 are for you — My Learning and the Mailbox.
- **A manager?** Chapters 12 and 13 cover Requests and Compliance — including why someone is
  not compliant, and how to reset an exam for them.
- **Paying for it — or just starting out?** Chapter 15 explains Knowledge Coins, the plan
  ladder, what the free plan includes, and how upgrading works.
- **Just want it to look right?** Chapter 17 covers themes and the navigation bar.
- **Wondering where the files actually go?** Chapter 20 walks through every storage
  arrangement end to end — NAS on your own hardware, the KVEP perk, and what is coming after.
- **Coming back after a while?** Chapter 21 is the dated record of what changed.

Each chapter is self-contained, with a short **"What it is"**, a step-by-step **"How to use
it"**, and **Tips** at the end.

---

## Table of contents

| # | Chapter | What you'll learn |
|---|---------|-------------------|
| 1 | [Getting started — your profile](chapter-01-getting-started.md) | Register, sign in, manage your account |
| 2 | [The big idea — core concepts](chapter-02-core-concepts.md) | Constellation, roles, custody, classifications |
| 3 | [Founding an organization](chapter-03-founding-an-organization.md) | Create an org and set the Supreme password |
| 4 | [The Constellation — your org map](chapter-04-the-constellation.md) | Read, navigate and act on the star map |
| 5 | [Building your structure](chapter-05-building-your-structure.md) | Roles, sub-groups, visibility |
| 6 | [People & governance](chapter-06-people-and-governance.md) | Owners, members, least-privilege rights, username suggestions |
| 7 | [Courses — publishing knowledge](chapter-07-courses.md) | Publish, classify and assign courses |
| 8 | [The Document Studio](chapter-08-the-studio.md) | Build documents visually, block by block |
| 9 | [Exams & assessment](chapter-09-exams-and-assessment.md) | Build a paper, set attempts, mark, and reset |
| 10 | [The Library](chapter-10-the-library.md) | Browse, filter and request courses |
| 11 | [My Learning & the viewer](chapter-11-my-learning.md) | Complete your assigned courses; PDF zoom |
| 12 | [Requests — ask & approve](chapter-12-requests.md) | The ask-and-approve centre |
| 13 | [Compliance tracking](chapter-13-compliance.md) | Who's done what, why they haven't, and how to nudge |
| 14 | [The Mailbox](chapter-14-the-mailbox.md) | Folders, labels, priority, expiry and the chime |
| 15 | [Plans, pricing & Knowledge Coins](chapter-15-plans-and-access.md) | Coins, the plan ladder, the free plan, access codes, upgrades |
| 16 | [The Supreme zone — custody & recovery](chapter-16-supreme-and-custody.md) | Backups, `.main`, `.bkp`, the Recovery |
| 17 | [Appearance & navigation](chapter-17-appearance-and-navigation.md) | Themes, accents, and the icon-first nav bar |
| 18 | [Flow diagrams — every setting at a glance](chapter-18-flow-diagrams.md) | A diagram + screenshot for each owner action, member capability & request flow |
| 19 | [Help & support](chapter-19-help-and-support.md) | Where to find answers in-app |
| 20 | [Where your documents live](chapter-20-where-your-documents-live.md) | NAS, the KVEP perk, and the storage backends still to come |
| 21 | [What's new](chapter-21-whats-new.md) | A dated record of what changed |
| A | [Appendix — Glossary & quick reference](appendix-glossary-and-reference.md) | Every term and code, at a glance |

---

## The one-minute summary

| You want to… | Go to |
|--------------|-------|
| Create a profile | **Register** — a username and password, no email |
| Found an organization | **Pricing** → request a plan → **Create organization** with your code |
| See your company's shape | **Constellation** |
| Add someone | Click their branch → **People** → **+ Add person** (type to see who exists) |
| Publish a document | Click a branch → **Courses** → **Upload** or **✍ Create in Studio** |
| Set an exam | **✍ Create in Studio** → *exam* |
| Do your training | **My Learning** |
| See who's behind | **Compliance** |
| Read what the platform told you | The **bell** — your Mailbox |
| Get your organization back | **Organizations** → **Recovery**, bottom-left |
| Change how it looks | The **palette** button, top right |
| Understand where your documents are stored | **Storage**, in the navigation bar |

---

## Downloading this book

The whole book is published as a single PDF —
**`Knowledge-Vault-Main-Guide-Book.pdf`** — in this folder, and from the platform's own
**Help** page, which always serves the current edition.

To rebuild the PDF after editing a chapter:

```bash
cd "Main Guide Book/tools"
npm install      # one-off: markdown-it, mermaid, sharp, playwright
node build-pdf.mjs
```

---

*Knowledge Vault — your structure, your knowledge, your custody.*
