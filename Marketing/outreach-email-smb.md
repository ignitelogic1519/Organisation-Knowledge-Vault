# Outreach email — small & mid-sized organizations

The cold-outreach mail for Knowledge Vault, written for an organization of roughly
**20–500 people** that trains its staff, has to prove it, and is billed per head for the
privilege.

Formal register, deliberately specific about architecture — the buyer here is usually an
operations, HR or quality head who will forward it to someone technical. Everything in
square brackets is a placeholder. Fees are the ladder in [README.md](README.md); change
them there and in both mail files together.

---

## Subject lines

1. **Organization-wide training and compliance at a flat annual fee**
2. **[Organization name]: unlimited users, ₹43,999 a year, your files on your own storage**
3. **An alternative to per-seat training software**

**Preheader:** One fee per organization. No per-user billing. Documents remain on your storage.

---

## The main email

> Send as plain text, or paste `outreach-email-smb.html` for the formatted version.

---

Subject: **Organization-wide training and compliance at a flat annual fee**

Dear [Contact name],

I am writing to introduce **Knowledge Vault**, a training and compliance platform for
organizations that must train their people and prove afterwards that they did.

Software in this category is billed per employee — ₹80 to ₹250 per user per month in this
market at your size — so proving your workforce is trained costs more every time you hire.
Knowledge Vault is licensed at a flat fee per organization, with no limit on headcount.

**The platform**

- **Role-based distribution.** Your organization is modelled as a tree of roles. A course
  published to *Plant → Shift B → Operators* reaches everyone holding that role, including
  anyone who joins next month. Mandatory status, deadlines, recurrence, prerequisites and
  escalation are set per branch and inherited down the subtree.
- **Authoring included.** The Document Studio produces the material itself — structured
  documents with tables, images, audio and video, versioned editions, and a review step
  before publication. No separate authoring licence is required.
- **Assessment.** Single-choice, multiple-choice and true/false papers with pass marks,
  weighted questions, randomised order, time limits and attempt caps, marked server-side —
  the answer key is never transmitted to the candidate's browser.
- **Evidence.** Compliance is reported per course and per person, with the reason on every
  row and reminders issued in one click. Every document carries a compulsory
  classification — Public, Confidential, Private or Secret — an auto-generated cover and
  scope page, and a versioned header and footer.

**Services included**

| | Monthly | Quarterly | Yearly |
|---|---|---|---|
| Platform — unlimited people, documents, uploads | ✓ | ✓ | ✓ |
| Role-structure design | Self-serve | Included | Included |
| Storage connection and verification | Guided | Included | Included |
| Migration of existing material | — | Up to 50 documents | Up to 200 documents |
| Administrator training | — | One session | Two sessions |
| Compliance configuration | Guided | Included | Included |
| Custody and backup drill | Self-serve | Included | Included, reviewed quarterly |
| Support | Next business day | Next business day | Priority |
| Updates, monitoring, guide book | ✓ | ✓ | ✓ |

**Commercials**

| Plan | Term | Fee (ex-GST) | Effective monthly |
|---|---|---|---|
| Evaluation | 30 days · 10 people · 150 GB | Nil | — |
| **Monthly** | 30 days | **₹6,999** | ₹6,999 |
| **Quarterly** | **130 days** | **₹15,999** | ₹3,692 — *47% lower* |
| **Yearly** | **425 days** | **₹43,999** | ₹3,106 — *56% lower* |
| Custom | Term and scale by agreement | On application | — |

Fees are per organization, exclusive of GST. Both longer terms run past their names: 130
days is a quarter plus forty, 425 days a year plus two months.

**The cost in practice**

Independent 2026 surveys place Indian LMS pricing at ₹80–250 per user per month at this
size, and first-year cost of ownership at 1.5 to 3 times the subscription once
implementation, content production and training are added. On the yearly plan those
services are in the fee, so that multiplier does not apply.

| Your size | Per-seat, 12 months | Knowledge Vault | Per person / month | Difference |
|---|---|---|---|---|
| 80 people at ₹150 | ₹1,44,000 | ₹43,999 | **₹46** | ₹1,00,001 |
| 250 people at ₹100 | ₹3,00,000 | ₹43,999 | **₹15** | ₹2,56,001 |
| 500 people at ₹70 | ₹4,20,000 | ₹43,999 | **₹7** | ₹3,76,001 |

Charged against twelve months the yearly fee is ₹3,667 a month: below the cheapest rate in
that band from about 46 people upward, and below the middle of it from about 25. Beyond
that, every additional employee is free — and the table is conservative, since ₹43,999 buys
425 days rather than 365.

**Why the fee can be flat**

Document bytes never reside on our infrastructure. They stream through a storage adapter to
S3-compatible storage you own — a NAS in your own building — with a manifest alongside
them describing structure and permissions. We hold the roles, the records and the
reading experience; the files stay on hardware you have already paid for, under your own
backup policy. The storage cost that forces per-gigabyte billing elsewhere is not on our
bill at all.

The rest is conventional and auditable: a TypeScript monorepo, a Next.js application and a
separate Fastify and Prisma API over PostgreSQL; Argon2id password hashing with JWT access
and refresh tokens; sessions that end after sixty minutes of inactivity, enforced by the API
on every request; and one authorization function shared by both applications, so permissions
are decided in a single place rather than across thirty screens. Each organization also holds
an encrypted, server-signed custody file with which it can restore its own existence.

**Next step**

The evaluation plan is the complete product for 30 days — up to 10 people and 150 GB — not a
restricted demonstration. I would be glad to configure it around your own structure and one
of your existing documents, so that you assess your material rather than a sample.

I can be reached at [Phone] or [Email], and a twenty-minute walkthrough booked at
[demo link].

Yours sincerely,

[Your name]
[Designation], Knowledge Vault
[Phone] · [Email] · [Website]

---

## The short version

For a cold list or a second touch — roughly 130 words.

---

Subject: **An alternative to per-seat training software**

Dear [Contact name],

Training and compliance software is normally billed per employee — ₹80 to ₹250 per user per
month in this market. **Knowledge Vault** is licensed at a flat fee per organization, with
no limit on headcount: **₹6,999 a month, ₹15,999 for 130 days, or ₹43,999 for 425 days,
exclusive of GST.** For an organization of 250 people that is ₹15 per person per month
against roughly ₹3,00,000 a year on a per-seat licence.

Courses attach to roles rather than to names, the material is authored and examined inside
the platform, and your documents remain on storage you own — a NAS in your own building —
rather than on ours. Structure design, migration and administrator training are included in
the fee.

The 30-day evaluation is the full product. I would be glad to set it up for you.

[Your name] · [Phone] · [Email]

---

## Follow-ups

**Follow-up 1 — five working days later, in the same thread.**

> Dear [Contact name],
>
> May I return this to the top of your inbox. The quickest way to judge Knowledge Vault is
> to use it: the evaluation plan takes about ten minutes to provision and requires nothing
> to be installed. If it is helpful, I will build your first role branch and publish one of
> your existing documents into it, so that the assessment is made on your own material.
>
> Would twenty minutes this week or next be convenient?
>
> Kind regards, [Your name]

**Follow-up 2 — two weeks later. The close-the-loop mail.**

> Dear [Contact name],
>
> I will leave it here so as not to crowd your inbox. Should training records come onto the
> agenda this quarter, the offer stands: a 30-day evaluation, no payment details, and your
> files on your own storage throughout. If it is a matter for next year, I will write again
> then.
>
> Thank you for your time. Kind regards, [Your name]

---

## Notes before you send

- **The fees are proposed, not live.** The product prices plans in Knowledge Coins and the
  payment gateway is not built, so a plan is invoiced directly and applied by the Knowledge
  Base team. Rupee figures may be quoted; a self-serve card payment may not be promised.
  See [README.md](README.md).
- **The included services are a commitment.** Migration counts, training sessions and the
  priority-support line are promises someone has to keep. Confirm the capacity before the
  mail goes to a list.
- **Sign-in.** Identity is username-based today and email sign-in is planned. The mail
  raises neither, which is correct — do not volunteer it, and if asked, describe email
  sign-in as on the roadmap.
- **Do not promise in-product email.** Notifications, expiry reminders and compliance nudges
  are delivered **in-app**; email delivery is deferred.
- **Do not promise cloud storage or a mobile application.** NAS (S3-compatible) and KVEP are
  live. Cloud object storage is planned, cloud drives are under examination, and the mobile
  client is a roadmap answer.
- **The market band is sourced, and it moves.** The ₹80–250 figure and the 1.5–3× first-year
  multiplier come from the 2026 surveys cited in [README.md](README.md). Re-check them
  before a large send; a prospect who finds one number wrong will check the rest.
