# Marketing

Outreach material for Knowledge Vault. Written from the product as it actually stands —
where a claim would outrun what ships today, the note saying so sits in the file beside it.

| File | What it is |
|------|------------|
| [outreach-email-smb.md](outreach-email-smb.md) | The cold-outreach mail for small & mid-sized organizations: subject lines, the full mail, a short version, two follow-ups, and what not to claim |
| [outreach-email-smb.html](outreach-email-smb.html) | The same mail as a formatted HTML email, ready to paste into Gmail or Outlook |

---

## The proposed INR price ladder

> **This pricing does not exist in the product yet.** Plans are priced in **Knowledge
> Coins** (`apps/api/prisma/seed.ts`), `/payment` is a "coming soon" placeholder, and
> `docs/pricing.md` records that a real payment gateway is deferred. The rupee figures
> below are a **proposed launch ladder** derived from the coin ladder — decide them, then
> change them here and in both email files together.

All fees are **per organization**, not per user. Every paid plan carries unlimited people,
unlimited documents and unlimited uploads.

| Plan | Term | Fee (ex-GST) | With 18% GST | Effective ₹/month | Saving vs monthly |
|------|------|-------------:|-------------:|------------------:|------------------:|
| **Evaluation** | 30 days | ₹0 | ₹0 | — | — |
| **Monthly** | 30 days | ₹6,999 | ₹8,259 | ₹6,999 | — |
| **Quarterly** | 130 days | ₹15,999 | ₹18,879 | ₹3,692 | **47%** (₹14,330) |
| **Yearly** | 425 days | ₹43,999 | ₹51,919 | ₹3,106 | **56%** (₹55,154) |
| **Custom / Organizational** | You state the days | By agreement | — | — | — |

The evaluation plan is metered — 10 people, 30 Studio documents, 30 uploads, 150 GB,
whichever ceiling arrives first. Nothing else is.

### Where the numbers come from

The rungs and terms are the product's own (`seed.ts`): 30 / 130 / 425 days. The anchor is
the monthly rung at **₹7,000 — ₹140 per Knowledge Coin** — and the longer terms are then
discounted below that line, so each rung is visibly cheaper per month than the one beneath
it:

| Plan | Coins | ₹ at ₹140/coin | Actual fee | Effective rate |
|------|------:|---------------:|-----------:|---------------:|
| Monthly (30 d) | 50 | ₹7,000 | ₹6,999 | ₹140 / coin |
| Quarterly (130 d) | 150 | ₹21,000 | ₹15,999 | ₹107 / coin |
| Yearly (425 d) | 500 | ₹70,000 | ₹43,999 | ₹88 / coin |

**A note on the coin ladder itself.** As seeded, the yearly plan is *worse* value per day
than the quarterly one — 500 coins ÷ 425 days = **1.18 coins/day**, against 150 ÷ 130 =
**1.15 coins/day**. A customer who does the arithmetic finds that buying four quarterly
plans beats one yearly plan, which is the opposite of what "Best value" on the card
promises. The rupee ladder above corrects the inversion (₹3,692 → ₹3,106 per month); the
coin prices in `seed.ts` still carry it, and are worth revisiting: anything under **490
coins** for the yearly plan restores the ordering, and **440** gives it a margin worth
printing on the card.

---

## What the fee includes

The mail commits to a service breakdown. These are promises somebody has to keep — confirm
the capacity before sending to a list, and change the mail rather than the delivery if the
numbers are not sustainable.

| Service | Monthly | Quarterly | Yearly |
|---------|---------|-----------|--------|
| Platform — unlimited people, documents, uploads | ✓ | ✓ | ✓ |
| Role-structure design and build (the Constellation) | Self-serve | Included | Included |
| Storage connection and verification (S3-compatible NAS: endpoint, credentials, connectivity test) | Guided | Included | Included |
| Migration of existing material into the Library, classified and shelved | — | Up to 50 documents | Up to 200 documents |
| Administrator and owner training | — | One session | Two sessions |
| Compliance configuration — mandatory flags, deadlines, recurrence, escalation | Guided | Included | Included |
| Custody and backup drill — `.main` custody file and per-branch `.bkp` | Self-serve | Included | Included, reviewed quarterly |
| Support | Next business day | Next business day | Priority |
| Platform updates, monitoring, guide book and in-app Help | ✓ | ✓ | ✓ |

Two of these are real cost centres: **migration** (200 documents is a working week if the
source material is untidy) and **training sessions**. Both are deliberately restricted to
the longer terms, where the fee supports them.

---

## Costing against the market

### What the market actually charges

Figures below are from 2026 published surveys, gathered September 2026. They move — re-check
before a large send.

| Measure | Figure | Source |
|---------|--------|--------|
| Indian LMS, SMB (50–500 staff) | **₹80–250** per user / month | [AlphaLearn](https://www.alphalearn.com/blog/lms-pricing-in-india-2026/) |
| Indian LMS, mid-market (200–2,000 staff) | **₹50–150** per user / month | AlphaLearn |
| Small deployments (50–200 learners) | **₹5,000–25,000** / month | AlphaLearn |
| Mid-market deployments (200–2,000 learners) | **₹25,000–1,50,000** / month | AlphaLearn |
| First-year total cost of ownership | **1.5–3×** the subscription, once implementation, content production, integration and training are added | AlphaLearn |
| TalentLMS published tiers | **$119**/mo to 40 users · **$229** to 70 · **$449** to 100 (billed annually); ≈₹22,000–55,000/mo at 500 users | [Educate-Me](https://www.educate-me.co/blog/talentlms-pricing), [LMSCost](https://lmscost.com/) |
| Docebo | Quote-only; ≈₹60,000–1,50,000/mo, implementation ₹2–5 lakh | [Compono](https://www.compono.com/articles/docebo-pricing-2026-true-costs) |
| LearnUpon | Quote-only, no published rate | [ITQlick](https://www.itqlick.com/learnupon/pricing) |

### Three real-world scenarios

Knowledge Vault is charged at the **yearly fee against twelve months** — deliberately
conservative, since ₹43,999 in fact buys 425 days. The per-seat column uses the middle of
the published band for that size.

| Scenario | Per-seat licence, 12 months | Knowledge Vault | KV per person / month | Difference |
|----------|---------------------------:|----------------:|----------------------:|-----------:|
| **80-person manufacturer**, one plant, ₹150/user | ₹1,44,000 | ₹43,999 | ₹46 | **₹1,00,001** (69%) |
| **250-person services firm**, three sites, ₹100/user | ₹3,00,000 | ₹43,999 | ₹15 | **₹2,56,001** (85%) |
| **500-person logistics operator**, ₹70/user | ₹4,20,000 | ₹43,999 | ₹7 | **₹3,76,001** (90%) |

Year one widens the gap further. The surveyed 1.5–3× TCO multiplier covers implementation,
content production and administrator training — all of which are inside the quarterly and
yearly fee here. On the 250-person scenario, a per-seat licence at 2× lands near **₹6 lakh**
in year one against **₹43,999**.

### The break-even headcount

The yearly fee charged against twelve months is **₹3,667 a month**. That is the whole
argument in one number:

| Competing per-seat rate | Knowledge Vault becomes cheaper at |
|------------------------:|-----------------------------------:|
| ₹80 / user / month (floor of the band) | **46 people** |
| ₹100 / user / month | **37 people** |
| ₹150 / user / month (middle) | **25 people** |
| ₹250 / user / month (ceiling) | **15 people** |

Below roughly 25 people a per-seat licence is genuinely cheaper, and the honest pitch there
is the evaluation plan and the quarterly term rather than the yearly one. Above it, the
curve only widens: a per-seat competitor costs more exactly when the customer is growing.

### Why the flat fee is affordable to us

Document bytes sit on storage **the organization provides** (`docs/structure.md` §9 — NAS
today, KVEP for employees, cloud object storage planned). The per-gigabyte cost that forces
per-seat and per-storage billing elsewhere is not on our bill, which is what makes a flat
fee possible rather than merely generous. Say it in the mail; it is the answer to "how can
this be so cheap?", and the answer is architectural rather than promotional.

### The objection this pricing does not answer

At the bottom of the market the real competitor is a **self-hosted open-source LMS**, where
the licence is free and the cost is operational — a server, an administrator, upgrades, and
whoever builds the content. Against that, the argument is not price: it is the included
services above, the fact that nobody has to run the platform, and the custody model that
gives the organization its data back without giving it a system to maintain. Do not claim to
undercut free.

---

## How a customer actually pays today

There is no self-serve checkout yet. The working flow is:

1. The prospect registers a profile (150 Knowledge Coins are granted automatically).
2. They request a plan from `/pricing`; you invoice them in rupees at the ladder above.
3. On payment, the Knowledge Base team gifts the coins or applies the plan directly from
   `/kbase`, and an access code — valid 24 hours, single use — lands in their Mailbox.
4. They redeem it when founding the organization. Coins leave the wallet at redemption,
   never at request or approval.

So the mail may quote rupee fees honestly; it must not promise a card payment page.
