# Chapter 17 — Plans, pricing & Knowledge Coins

## What it is

Creating an organization is not open to everyone by default — it is gated behind a **plan**
and a one-time **access code**. Plans are bought with **Knowledge Coins**, the platform's
virtual currency (some teams call them *education coins* — same thing).

This chapter covers the whole money-and-access side of Knowledge Vault: what a coin is, how
pricing works, how many people a plan lets you have, the **free Demo plan** you use as a
testing environment, how to get your access code, how to read the countdown timer on your
organization, and what happens when a plan runs out.

> **Who does what:** everything in this chapter is *your* side — the Pricing page, your code,
> your organization's timer. The Knowledge Base team's side (approving requests, issuing
> codes, gifting coins, setting plans) is [Chapter 18](chapter-18-knowledge-base-portal.md).

---

## 1. Knowledge Coins

A **Knowledge Coin** is the unit Knowledge Vault prices plans in. Coins are not money and
they don't expire — think of them as tokens sitting in your profile's wallet, spent when you
found or restore an organization.

| Question | Answer |
|----------|--------|
| **How many do I start with?** | **150 coins**, granted the moment you register. (The Knowledge Base team can change the starting amount for *future* sign-ups — it never touches balances that already exist.) |
| **Where do I see my balance?** | On the **Pricing** page, as the `🪙 200 coins` chip in the top bar — and on the **Buy coins** page. It's deliberately kept off every other screen. |
| **What can I spend them on?** | Plans. The **Demo** plan costs nothing; paid plans cost whatever the card says. |
| **When are they taken?** | **Only when you use your access code** — never when you send a request, and never when it's approved. If you never redeem the code, you never pay. |
| **Can I get more?** | The Knowledge Base team can gift or adjust your balance at any time; you get a message when they do. **Buying coins with real money is coming soon.** |
| **Is there a record?** | Yes — every grant, gift, adjustment and spend is written to a ledger with the resulting balance. |

![Your Knowledge Coin balance and the plan cards on the Pricing page](images/pricing-page.png)

### Buying coins (coming soon)

The **Buy coins** button next to your balance opens the top-up page. The payment gateway
isn't live yet, so today the page explains that coins are granted by the Knowledge Base team
— ask them if you need more.

![The Buy coins page](images/buy-coins-coming-soon.png)

---

## 2. How pricing works

Open **Pricing** from the site footer, the home page, or the 🪙 item in the app's navigation.
Plans are shown as cards, grouped into **tabs**, and are managed centrally by the Knowledge
Base team — so the page always reflects what's actually on offer, including limited-time
offers that appear and disappear on their own dates.

Each card tells you five things:

1. **Price** — in coins, or **Free**.
2. **Duration** — e.g. *60 days*, *30 days*, or *Custom duration* (agreed with the team).
3. **👥 People** — how many members the organization may hold. See §3.
4. **Criteria** — any conditions (e.g. *"One demo organization per profile"*).
5. **Highlights** — what you get, in plain words.

The starter plans every deployment ships with:

| Plan | Price | Duration | People | Best for |
|------|-------|----------|--------|----------|
| **Demo** | Free | 60 days (2 months) | up to **10** | Evaluating and testing — see §4 |
| **Monthly** | 50 coins | 30 days, renewable | up to **1 000** | Keeping a real organization running month to month |
| **Organisation** | 150 coins | Agreed with the team | Agreed with the team | Established teams on an annual or custom agreement |

> **The page wins over this table.** Prices, durations and member limits are edited centrally
> and can change; whatever the Pricing page shows is what you'll be charged.

There are two buttons on a card, depending on the plan:

- **Request this plan** — for fixed plans (Demo, Monthly). One click sends the request.
- **Propose terms** — for custom plans (Organisation). You enter **the days you want** and
  **the coins you offer**, and the team replies with the final terms.

---

## 3. How many people can I have? (member limits)

Every plan carries a **member limit** — the maximum number of *people* in one organization.

- The limit counts **people, not positions**. Someone who already belongs to the
  organization can be placed on as many roles as you like without using another seat.
- The Knowledge Base team can set a **per-organization limit** that overrides the plan's
  (for example, 250 seats on an annual agreement). A blank override means "use the plan's
  number"; some plans are unlimited.
- The limit is enforced the moment a **new** person would join — when an owner adds someone
  to a role, and when a **Join request** is approved. If the organization is full you'll see:

  > *This organization's plan allows up to 250 members. Upgrade the plan to add more.*

- Nothing is deleted when you hit the ceiling — existing people keep working normally. You
  either remove someone or move to a bigger plan.

If you're planning a rollout, count **every person who will need a login inside that one
organization**, and pick the plan from that number. Separate organizations have separate
limits — a person in two organizations occupies a seat in each.

---

## 4. The free plan — your testing environment

The **Demo** plan is the sandbox. It is:

- **Free** — 0 coins, so it works even with an empty wallet;
- **Full-featured** — the constellation, courses, Studio, library, requests, compliance,
  backups and `.main` custody all behave exactly as they do on a paid plan;
- **Time-boxed to 2 months** (60 days) and **capped at 10 members**;
- **One per profile** — the criteria line on the card says so.

That makes it the right way to trial a structure, rehearse a rollout, or train the people who
will run the platform, before anyone pays anything.

Two things to plan for before you start:

1. **It ends.** At 60 days the organization's timer lapses and the card turns red.
2. **A lapsed Demo cannot be restored for free.** If you delete it (or lose it) after expiry,
   bringing it back needs a plan and a restore code — §7. If the trial content matters, move
   the organization onto a paid plan *before* the two months are up.

> **Tip:** treat a Demo organization as disposable. Build the shape you want, learn from it,
> then found the real organization on a paid plan and build it properly.

---

## 5. Getting an access code

Because organization creation is controlled, you **request** a plan and the Knowledge Base
team sends you a one-time code.

```
You choose a plan  →  the team approves (with final terms)  →  you get an 8-character code
      │                                                                      │
      └──── Pricing page ────────────────────────────────────────────────────┘
                                                              valid 24 hours · single use
```

1. On **Pricing**, choose a plan and select **Request this plan** — or **Propose terms** for
   a custom plan, entering the days you want and the coins you offer.
2. Your request lands with the Knowledge Base team.
3. They **approve** it (setting the final duration, price and a message) or **decline** it
   (with a reason).
4. On approval you receive an **8-character access code** as a message **from the Super
   Admin**, valid for **24 hours** and usable **once**.

### Tracking your requests

The Pricing page lists **Your requests** underneath the cards, with their live status —
*pending*, *approved*, *denied* or *used* — plus any reply from the team. While a request is
still pending you can **Withdraw** it.

![Your requests, tracked on the Pricing page](images/pricing-my-requests.png)

### Your code lives on your Account page

The code arrives in your notification bell **and** in a dedicated **"Messages from the Super
Admin"** panel on your **Account** page — so you can read it any time, even before you belong
to any organization. These messages stay for **30 days**.

![Your access code on the Account page](images/account-admin-messages.png)

---

## 6. Creating the organization with your code

Go to **Create organization**. The page has two halves:

- **Left — the founding form:** your access code, the organization name, the first role name,
  and the Supreme password (with its unrecoverable-password acknowledgement — see
  [Chapter 3](chapter-03-founding-an-organization.md)).
- **Right — the plan chooser:** your coin balance and every plan, so you can request one
  without leaving the page. Each plan shows its status once you've asked: *requested —
  awaiting approval*, then *approved — code in your 🔔*.

![Creating an organization, with the plan chooser beside the form](images/create-organization.png)

On submit the platform verifies the code, deducts the plan's coins, stamps the organization
with the plan and its expiry date, and marks the code **used**. If your balance is short,
nothing is created and you're told exactly how many coins the plan costs and how many you
have.

---

## 7. The countdown timer, expiry and restoring

### The timer

Every organization card carries a **countdown chip above its name**:

| Chip | Meaning |
|------|---------|
| `⏳ organisation · 364d 23h left` | Time remaining on the plan |
| `⏳ Demo · 12h left` | Under a day — the chip turns **red** inside the last 3 days |
| `⏰ monthly expired — upgrade to keep it` | The plan has lapsed |
| `organisation · no expiry` | An open-ended plan |

![The plan countdown timer above each organization card](images/org-plan-timer.png)

### When a plan expires

The organization and its data stay where they are — expiry does not delete anything. What
changes is your ability to bring the organization **back** once it's gone:

- Deleted organizations sit in a **30-day retention** list and can be restored with the
  Supreme password.
- If the plan has **expired** (or it was a **Demo**), restoring is blocked with a clear
  message that sends you to the **Pricing page**.
- Choose a plan there and the team issues a **restore code**. Enter it when you restore —
  you may need to upload the `.main` file again — and the organization comes back on the new
  plan, with the coins deducted then.

### Why the plan travels inside your `.main` file

Your `.main` file (Chapter 14) carries an encrypted, **server-signed** snapshot of the plan.
On revival the platform checks that signature:

- **Active and unexpired** → the organization revives directly.
- **Demo, expired, or a file made before plans existed** → you're told plainly that the plan
  has lapsed and pointed at Pricing for a restore code.

The signature is what stops an expired file being edited into a "paid forever" one — custody
of your organization and the truth about its plan stay together in the same file.

---

## 8. Tips

- **Request early.** Codes expire in 24 hours, so ask for your plan shortly before you intend
  to create the organization — not days ahead.
- **Your code is always on your Account page** for 30 days; no need to hunt through the bell.
- **Coins leave your wallet only at redemption.** Requesting and being approved cost nothing.
- **Size the plan by people, not roles.** Roles are free; people occupy seats.
- **Watch the chip.** Inside the last three days it turns red — upgrade before it lapses and
  you'll never need the restore path at all.
- **Use the Demo as a rehearsal, not as the real thing.** It's free and complete, but it ends
  after two months and can't be restored for free once it does.

**Next:** [Chapter 18 — The Knowledge Base portal →](chapter-18-knowledge-base-portal.md) ·
**Back to:** [Table of contents](README.md)
