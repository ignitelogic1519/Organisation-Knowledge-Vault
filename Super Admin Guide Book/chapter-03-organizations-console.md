# Chapter 3 — The organizations console

## What it is

The **Organizations** tab is the god view: every organization on the platform, live, as a grid
of cards. It refreshes itself every eight seconds, so counts, plan states and expiry dates stay
current while you work.

![All organizations in the Knowledge Base portal](images/admin-portal.png)

Each card shows, at a glance:

- **Name and organization number** (permanent, never reused), and a *deleted* badge if it is
  sitting in its owner's Recycle Bin;
- **Owners**, by username;
- **Plan**, **status** and **expiry date**;
- **People**, **custom documents**, **uploads** and **storage** — each as *used / limit*, with
  ∞ where the plan does not meter it;
- **Roles** and **tree depth**;
- **Last activity** — the most recent thing anyone did there, which is how you spot an
  abandoned organization.

Search matches name, number, owner, plan and status. The sort control orders by any column.

---

## 1. Opening a card — the property table

Select a card and it expands into a **property/value table**. Everything metered or dated is
**editable in place**:

| Property | Notes |
|----------|-------|
| **Name** | Free text. |
| **Organization number** | Read-only, permanent. |
| **Plan** | Any key from the pricing table. |
| **Plan status** | `NONE` · `DEMO` · `ACTIVE` · `EXPIRED`. |
| **Expires on** | A date, or blank for no expiry. |
| **People limit** | Blank = use the plan's limit. |
| **Custom-document limit** | Blank = the plan's limit (unlimited on every paid plan). |
| **Upload limit** | Blank = the plan's limit. |
| **Storage limit (MB)** | Blank = the plan's limit. |
| **People / documents / uploads / storage used** | Read-only, live. |
| **Roles, depth, created** | Read-only. |

Change what you need and select **Save changes**. This is the manual override for every count
on the platform: a per-organization number always beats the plan's.

> **Blank means "inherit", not "zero".** Clearing a limit hands the decision back to the plan.
> To actually forbid something, set it to `0`.

The panel also lists the organization's **owners** (with their coin balances) and its **recent
activity**, so you can see what has been happening without leaving the card.

---

## 2. Selecting several

Each card has a checkbox. Tick two or more and a selection bar appears with two actions:

- **✉ Send message** — one message to every owner of every selected organization.
- **Delete selected** — a permanent purge of all of them, behind an inline confirmation.

This is how you run a campaign ("the yearly plan now includes two free months") or clear a
batch of abandoned trials, without repeating yourself once per organization.

---

## 3. Messaging owners

The message form asks for a **subject**, a **body** and a **priority**.

- It lands in every recipient's mailbox under **Knowledge Base**, labelled *Announcement*.
- **High priority** pins it to the top of their mailbox and turns their bell red. Use it for
  things that block someone, not for offers.
- Delivery is live — an owner with a page open sees it arrive.
- Messages expire after **30 days** like all Knowledge Base mail, so a campaign does not
  accumulate in customers' mailboxes forever.
- The broadcast is audited with the subject and the recipient count.

> **Advertising is legitimate here; nagging is not.** These are your customers' working
> mailboxes. One message about a real change beats four about the same one.

---

## 4. Deleting an organization

Two very different things share the word "delete":

| | Customer's delete | Your purge |
|---|---|---|
| Where | Their Supreme zone | This console |
| Effect | Soft — goes to their **Recycle Bin** | **Permanent, immediate** |
| Reversible | One click, for 30 days | Only from their own `.main` file |
| Needs | Their Supreme password | Your admin account |

**A purge from this console bypasses the 30-day retention entirely.** There is no undo on this
side. Before you use it, be certain the organization is what you think it is — check the number,
not just the name, because names repeat and numbers never do.

---

## 5. Reading the structure

`/admin/orgs/:orgNumber/tree` returns an organization's role tree — names, numbers, depth,
public/hidden, and owner and member counts per node. It is read-only and carries no document
content. Use it when a customer describes a structural problem and you need to see the shape
they are describing.

---

## Tips

- **Sort by last activity to find dead trials.** Anything untouched for months on a lapsed plan
  is a purge candidate — after you have messaged its owners.
- **Fix the limit, not the plan, for a one-off.** A customer who needs 40 seats on a plan that
  says 10 does not need a bespoke plan row; they need a per-organization override.
- **Check `used` before you lower a limit.** Setting a ceiling below what an organization
  already holds does not delete anything, but it does stop them adding more — which is a
  surprise if they did not ask for it.
