# Chapter 11 — Requests: ask & approve

## What it is

**Requests** is the platform's ask-and-approve centre. Rather than letting anyone change the
structure directly, Knowledge Vault routes certain actions through a request that someone
with the right authority approves. It keeps governance clean and auditable.

Open it from the **Requests** tab. A **live badge** on the tab shows how many requests need
your attention, so you never miss one.

![The Requests centre](images/requests.png)

---

## The two views

The page is split in two:

### Inbox — waiting on you
Requests **you have the authority to decide**. In the sample, *Avery Stone* sees *Lena
Novak's* request to join *Robotics QA* as a member, complete with her message. Each inbox
card lets you **Approve**, **Reject**, or **Delete** it.

### My requests
Everything **you've** asked for, with its live status (**pending**, **approved** or
**rejected**), so you can track your own asks.

---

## The four kinds of request

| Kind | Who raises it | What approval does |
|------|---------------|--------------------|
| **Course** | Someone who wants a library course on their branch | The decider **configures** it (mandatory, inheritance, deadline, recurrence) *before* approving |
| **Join** | Someone who wants to join a public branch | Adds them to the branch — as a member or sub-owner, whichever they asked for |
| **Deletion** | A branch's own owner who wants it removed | Lets the level above authorise the deletion |
| **Visibility** | An owner whose branch is hidden by a level above | Asks that level to unhide the chain |

Course requests are special: because the decider configures placement at approval time, the
course arrives on the branch correctly set up, not as a raw drop-in.

---

## How it flows

1. Someone raises a request — from the library (Course), a public star (Join), or a Group
   configuration panel (Deletion, Visibility).
2. It lands in the **inbox** of whoever has authority — the branch's handler or the level
   above.
3. That person **decides**. Approvals take effect immediately; the requester sees the status
   change live.
4. Decided requests **clean themselves up automatically after 7 days**, keeping inboxes tidy.

You can always **withdraw** a request you raised while it's still pending.

---

## Flows at a glance

**The request lifecycle (all types share this shape):**

```mermaid
flowchart TD
    A["Someone raises a request"] --> B["Lands in the decider's Inbox - live badge on the tab"]
    B --> C{"Decision"}
    C -->|Approve| D["The action takes effect"]
    C -->|Reject| E["Marked rejected"]
    D --> F["Requester notified live - status updates"]
    E --> F
    F --> G["Decided requests auto-clean after 7 days"]
    A -. withdraw while still pending .-> H["Removed"]
```

**Course request** — configured *before* approval:

```mermaid
flowchart LR
    A["Find a course in the Library"] --> B["Request it for my branch"]
    B --> C["Branch handler's Inbox"]
    C --> D["Configure: mandatory, inherit, deadline, recurrence"]
    D --> E["Approve - placed already configured"]
```

**Join request** — carries the desired position:

```mermaid
flowchart LR
    A["A public star on the constellation"] --> B["Send Join request as member or sub-owner"]
    B --> C["Owners / the level above decide"]
    C -->|Approve| D["Added to the branch in that role"]
    C -->|Reject| E["Not added"]
```

**Deletion request** — needs the level above:

```mermaid
flowchart LR
    A["Branch owner wants it deleted"] --> B["Request deletion"]
    B --> C["Level above decides"]
    C -->|Approve| D["Branch deleted - must be empty"]
    C -->|Reject| E["Kept"]
```

**Visibility request** — unhide a chain:

```mermaid
flowchart LR
    A["Branch hidden by a level above"] --> B["Request visibility"]
    B --> C["Level above decides"]
    C -->|Approve| D["Chain unhidden - branch becomes visible"]
    C -->|Reject| E["Stays hidden"]
```

---

## Tips

- **Watch the badge.** The live count on the Requests tab is your cue that a colleague is
  waiting on you — decisions unblock people.
- **Configure course requests thoughtfully.** Approving one is your chance to set the right
  deadline and recurrence for *your* branch, not just accept a default.
- **Join requests carry intent.** They state whether the person wants to be a *member* or a
  *sub-owner* — check that before approving.

**Next:** [Chapter 12 — Compliance tracking →](chapter-12-compliance.md)
