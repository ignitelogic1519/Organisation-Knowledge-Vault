# Marketing

Outreach material for Knowledge Vault. Written from the product as it actually stands —
where a claim would outrun what ships today, the note saying so is in the file beside it.

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

All prices are **per organization**, not per user. Every paid plan carries unlimited
people, unlimited documents and unlimited uploads.

| Plan | Access period | Price (ex-GST) | With 18% GST | Effective ₹/month | Saving vs monthly |
|------|---------------|---------------:|-------------:|------------------:|------------------:|
| **Free** | 30 days | ₹0 | ₹0 | — | — |
| **Monthly** | 30 days | ₹4,999 | ₹5,899 | ₹4,999 | — |
| **Quarterly** | 130 days | ₹13,999 | ₹16,519 | ₹3,231 | **35%** (₹7,663) |
| **Yearly** | 425 days | ₹41,999 | ₹49,559 | ₹2,965 | **41%** (₹28,820) |
| **Custom / Organizational** | You state the days | By agreement | — | — | — |

The free plan is metered — 10 people, 30 Studio documents, 30 uploads, 150 GB, whichever
ceiling arrives first. Nothing else is.

### Where the numbers come from

The rungs and durations are the product's own (`seed.ts`): 30 / 130 / 425 days. The anchor
is **1 Knowledge Coin ≈ ₹100** at the monthly rung — the 50-coin, 30-day plan becomes
₹4,999 — and the longer plans are then discounted below that line so each rung is visibly
cheaper per month than the one beneath it:

| Plan | Coins | ₹ at 1 coin = ₹100 | Actual price | Effective rate |
|------|------:|-------------------:|-------------:|---------------:|
| Monthly (30 d) | 50 | ₹5,000 | ₹4,999 | ₹100 / coin |
| Quarterly (130 d) | 150 | ₹15,000 | ₹13,999 | ₹93 / coin |
| Yearly (425 d) | 500 | ₹50,000 | ₹41,999 | ₹84 / coin |

**A note on the coin ladder itself.** As seeded, the yearly plan is *worse* value per day
than the quarterly one — 500 coins ÷ 425 days = **1.18 coins/day**, against 150 ÷ 130 =
**1.15 coins/day**. A customer who does the arithmetic finds that buying four quarterly
plans beats one yearly plan, which is the opposite of what "Best value" on the card
promises. The INR ladder above corrects the inversion (₹3,231 → ₹2,965 per month); the
coin prices in `seed.ts` still carry it, and are worth revisiting: anything under **490
coins** for the yearly plan restores the ordering, and **440** gives it a margin worth
printing on the card.

### Why a flat, per-organization price is the pitch

It is not only friendlier — it is what the architecture makes possible. Document bytes sit
on storage **the organization provides** (`docs/structure.md` §9: NAS today, KVEP for
employees, cloud object storage planned), so the cost that normally forces per-seat,
per-GB billing is not on our bill at all. That is worth saying out loud in the mail: the
price is flat *because* the expensive part stays with the customer, on hardware they
already own.

Against typical Indian per-seat LMS pricing of roughly ₹100–300 per user per month, the
yearly plan lands at:

| Headcount | Per person, per month |
|-----------|----------------------:|
| 25 | ₹119 |
| 50 | ₹59 |
| 100 | ₹30 |
| 250 | ₹12 |
| 500 | ₹6 |

The curve is the argument. A per-seat competitor gets more expensive exactly when the
customer is growing; this gets cheaper.

### How a customer actually pays today

There is no self-serve checkout yet. The working flow is:

1. The prospect registers a profile (150 Knowledge Coins are granted automatically).
2. They request a plan from `/pricing`; you invoice them in rupees at the ladder above.
3. On payment, the Knowledge Base team gifts the coins or applies the plan directly from
   `/kbase`, and an access code (valid 24 hours, single use) lands in their Mailbox.
4. They redeem it when founding the organization. Coins leave the wallet at redemption —
   never at request or approval.

So the mail can quote rupee prices honestly; it must not promise a card payment page.
