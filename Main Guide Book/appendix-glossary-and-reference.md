# Appendix — Glossary & quick reference

A one-stop reference for the terms, codes and rules you'll meet across Knowledge Vault.

---

## Glossary

| Term | Meaning |
|------|---------|
| **Profile** | Your single global identity — a username and password, no email. Works across every organization. |
| **Organization** | A company/team on the platform, structured as a tree of roles. Has a number, e.g. `#100`. |
| **Constellation** | The organization's main page: its structure drawn as a top-down star map. |
| **Role / branch / node** | A position in the tree. The three words are used interchangeably. |
| **Root role** | The single role at the top of the tree; its owners hold the Supreme. |
| **Owner** | Someone who *manages* a branch (adds people, publishes courses, etc.). |
| **Co-owner** | An additional owner appointed to a branch, with specific granted rights. |
| **Member** | Someone who *learns* from a branch — its courses appear in their My Learning. |
| **Supreme** | The protected root of your organization. |
| **Supreme password** | The unrecoverable password that guards top-level changes and encrypts the `.main` file. |
| **Course** | Any published knowledge: Document, Book, Link, Audio, Video or Exam. |
| **Edition** | One published version of a course — `v1.0`, `v2.0` — each with a dated note saying what changed. |
| **Edition log** | The timeline of a course's editions: version, note, author, and whether it expired completions. |
| **Coexist / Supersede** | What a new document does to one already covering the subject: both stay live, or the old one is retired onto the new one. |
| **Review channel** | The route a member's proposed document takes: approve & publish, send back with changes, or decline. |
| **Deployment** | Whether a course is currently reaching anyone. Taken out while it is being revised, put back when the new edition publishes. |
| **Classification** | The compulsory sensitivity label on every course (Public/Confidential/Private/Secret). |
| **Category / shelf** | The tag that groups a course on a library shelf (e.g. *Safety*). |
| **Mandatory** | A course people *must* complete (vs. *opt-in*). |
| **Inherit** | A course setting that pushes it down to every branch beneath the one it's placed on. |
| **Prerequisite** | A course that must be completed before another can be started. |
| **Placement** | A course's presence on a particular role, with its mandatory/inherit settings. |
| **Studio** | The visual drag-and-drop document builder. |
| **Library** | The org-wide catalogue of published courses, shelved by category. |
| **My Learning** | A learner's page of assigned, completed and overdue courses. |
| **Reader** | The in-app viewer that opens courses in the standard document frame, with zoom and full screen. |
| **Request** | A formal ask (Course, Join, Deletion, Visibility, Document review) that an authorised person approves. |
| **Compliance** | The manager dashboard showing per-course completion across a branch. |
| **Mailbox** | The mail client behind the bell: folders by category, labels per organization, priority, expiry and a chime. |
| **Session** | One signed-in browser. Ends after an hour of inactivity; the last minute is announced. |
| **`.main` file** | The encrypted existence backup that can revive an entire organization. |
| **`.bkp` file** | An encrypted backup of a single branch (roles, people, placements). |
| **Custody** | The principle that your data and your org's existence stay in your hands, not the platform's. |
| **Knowledge Coin** | The platform's virtual currency (sometimes called an *education coin*). 150 per new profile; spent on plans. |
| **Plan** | What an organization runs on — its price, duration and limits: Free, Bi-monthly, Quarterly, Yearly, or Custom. |
| **Free plan** | 50 coins, 30 days, up to 10 people, 30 custom documents, 30 uploads, 150 GB. The only metered plan. |
| **Member limit** | The maximum number of *people* one organization may hold, set by its plan (or a per-org override). |
| **Access code** | The one-time 8-character code that unlocks organization creation. Valid 24 hours, single use. |
| **Restore code** | The same kind of code, issued to bring back an organization whose plan expired. |
| **Plan chip** | The plan's name and remaining time on an organization's card, in the largest unit that still means something. Pulses only in the last three days. |
| **Super Admin** | The Knowledge Base team member who approves plan requests and issues codes. |
| **Knowledge Base portal** | The staff-only administration console. Documented in the separate *Super Admin Guide Book*, not in this one. |
| **NAS** | Storage on hardware you own, spoken to over the S3 protocol. The ordinary way an organization stores its documents ([Chapter 23](chapter-23-where-your-documents-live.md)). |
| **KVEP** | *Knowledge Vault Employee Perk* — an organization created by Knowledge Vault staff, whose documents stay on our storage. Not available to customers. |
| **Bucket** | The container inside your storage that holds this organization's objects. It must already exist; Knowledge Vault never creates one. |
| **Encryption posture** | Whether documents are written to your storage **encrypted** (opaque `.kvblob` objects) or **readable** (ordinary browsable files). Fixed once storage is active. |
| **Connection test** | The five-step probe — reach, write, read back, compare, delete — run against your storage *before* the organization is created. A failure names the step and does not consume your access code. |
| **Signed link** | A short-lived link that lets your browser talk to your storage directly, so document bytes never cross Knowledge Vault's servers. |
| **`Knowledge_vault_map`** | The signed manifest written into your storage describing the structure and what each object is for. A mirror, never the authority on permissions. |
| **Degraded / unreachable** | Your storage could not be reached on the last health check. Not data loss — new uploads have nowhere to go until it returns. |

---

## Course codes

Every course has a code like **`100-101-0001`**. Read it as:

```
100     -   101      -   0001
 │           │            │
 org #    uploading    sequence
          role #       number
```

- **`100`** — the organization number.
- **`101`** — the number of the role the course was uploaded from.
- **`0001`** — a running sequence number.

So `100-100-0002` is the second course uploaded from *Aurora Robotics'* root role.

---

## Classifications at a glance

| Badge colour | Classification | Use it for |
|--------------|----------------|-----------|
| 🟢 Green | **Public** | Anyone in the organization |
| 🟡 Amber | **Confidential** | Need-to-know material |
| 🟣 Purple | **Private** | A specific, restricted group |
| 🔴 Red | **Secret** | The most tightly held material |

---

## Request types at a glance

| Request | Raised from | Decided by | On approval |
|---------|-------------|------------|-------------|
| **Course** | The Library | The target branch's handler | Configured, then placed on the branch |
| **Join** | A public star on the constellation | The branch's owners / level above | Person added as member or sub-owner |
| **Deletion** | Group configuration | The level above | The branch is deleted |
| **Visibility** | Group configuration | The level above | The hidden chain is unhidden |

*Decided requests auto-clean after 7 days. You can withdraw your own while still pending.*

---

## Owner rights (least privilege)

| Right | Lets an owner… | Rule |
|-------|----------------|------|
| **Create sub-groups** | Add sub-roles beneath the branch | — |
| **Appoint co-owners** | Add other owners to the branch | — |
| **Create content** *(members)* | Propose documents for review | Publishes only after owner approval |

> **The golden rule:** an owner can only grant a right they hold themselves.

---

## Plans at a glance

| Plan | Price | Duration | People | Notes |
|------|-------|----------|--------|-------|
| **Demo** | Free | 60 days | up to 10 | One per profile; can't be restored free once lapsed |
| **Monthly** | 50 coins | 30 days | up to 1 000 | Renewable |
| **Organisation** | 150 coins | Agreed with the team | Agreed with the team | Propose your own terms |

*Plans are managed centrally — the Pricing page is always the authority on current prices,
durations and limits.*

### Knowledge Coins at a glance

| Rule | Value |
|------|-------|
| Starting balance for a new profile | **150** (staff can change it for future sign-ups) |
| Where the balance is shown | The **Pricing** page and the **Buy coins** page — nowhere else |
| When coins are deducted | Only when an access code is **redeemed** |
| Free plan cost | **50 coins** · 30 days |
| Buying coins with money | **Coming soon** — staff gift coins today |

---

## Automatic housekeeping

| Thing | Behaviour |
|-------|-----------|
| Decided requests | Auto-clean after **7 days** |
| Mailbox: Knowledge Base team, plans & coins | Kept **30 days** |
| Mailbox: requests, publishing, people | Kept **14 days** |
| Mailbox: learning | Kept **10 days** · system notes **3 days** |
| Access / restore codes | Expire after **24 hours**; usable **once** |
| Deleted organization | **30-day** retention, then purged (revive with `.main`) |
| Plan chip | Turns red and pulses inside the last **3 days**, then reads *expired* |
| Sessions | End after **1 hour** of inactivity; absolute cap **30 days**; ended sessions pruned after 15 days |
| Exam attempts | Kept for ever, including sittings voided by a reset |

---

## The sample organization (for reference)

**Aurora Robotics (#100)** — used in every screenshot in this book.

```
Executive Office (#100)          Avery Stone (owner), Priya Raman (co-owner)
├── Engineering (#101)           Priya Raman (owner), Noah Kim (member, creates content)
│   ├── Firmware Team (#105)     Noah Kim (member), Hana Oyelaran (member)
│   └── Robotics QA (#106)       Ravi Shah (member)
├── Operations (#102)            Sam Okoro (owner), Maya Torres (member)
│   └── Safety & Compliance (#107)   Leo Fernandes (member)
├── People & Culture (#103)      Ines Duarte (owner)
└── Research Lab (#104)          Ravi Shah (member) — hidden / private branch
```

The sample courses:

| Code | Title | Class | Placed on | Rules |
|------|-------|-------|-----------|-------|
| `100-100-0001` | Code of Conduct & Ethics | Confidential | Executive Office, inherited | mandatory · 14-day deadline · annual · resets on update |
| `100-100-0002` | Data Handling Standard | Secret | Executive Office, inherited | mandatory · 30-day deadline · annual |
| `100-100-0003` | Welcome to Aurora Robotics | Public | Executive Office, inherited | opt-in |
| `100-101-0001` | Firmware Release Checklist | Private | Engineering, inherited | mandatory · 30-day deadline |
| `100-102-0001` | Robot Cell Safety — Level 1 | Confidential | Operations, inherited | mandatory · 7-day deadline · annual · resets on update |
| `100-102-0002` | Robot Cell Safety — Assessment | Confidential | Operations, inherited | **exam** · 70% to pass · 2 attempts · 12 minutes · requires `100-102-0001` |
| `100-104-0001` | Lab Notebook Standard | Confidential | Research Lab | opt-in |

The people illustrate the cases the Compliance chapter is about:

| Person | What they show |
|--------|----------------|
| **Priya Raman** | An annual completion that lapsed last month — *due again*, not a year late |
| **Maya Torres** | An exam with both attempts spent — locked until a manager resets it |
| **Leo Fernandes** | Genuinely overdue: assigned weeks ago, never opened |
| **Ravi Shah** | Placed in the Firmware Team this morning — his deadlines start today |
| **Noah Kim** | A member with the *create content* right, whose rig notes are awaiting review |

Aurora Robotics runs on the **Yearly** plan. Five more organizations appear on the dashboard
screenshots so the filter bar and search have something to work on: **Northwind Logistics
(#101)**, **Helios Energy (#102)**, **Cedar Health Group (#103)**, **Meridian Schools (#104)**
on the free plan, and **Kestrel Marine (#105)**.

---

*End of the Main Guide Book. Return to the [table of contents](README.md).*
