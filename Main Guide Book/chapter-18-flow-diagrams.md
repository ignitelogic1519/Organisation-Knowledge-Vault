# Chapter 18 — Flow diagrams: every setting at a glance

This chapter is the **visual reference** for the whole platform. It pairs a **flow diagram**
with a **screenshot** for each setting, grouped into three topics:

- **A.** [What an **owner** can do](#a--owner-settings--actions) — every management setting.
- **B.** [What a **member** can have / do](#b--what-a-member-can-have--do) — the learner side.
- **C.** [**Request ↔ response** flows](#c--request--response-flows) — ask-and-approve.
- **D.** [**Plans, coins & access codes**](#d--plans-knowledge-coins--access-codes) — how an
  organization is paid for, sized and renewed.

> The flow diagrams below are drawn with Mermaid and render automatically on GitHub. Each
> setting also links back to the chapter where it's explained in full.

---

## A — Owner settings & actions

Owners act from the **constellation**: click a star you govern to open its action panel, then
choose a section (Group configuration · People · Courses · Backup).

![The owner's action panel on a governed role](images/node-action-panel.png)

### A1 · Create a sub-role
*Where: Group configuration → + Sub-role · [Chapter 5](chapter-05-building-your-structure.md)*

```mermaid
flowchart LR
    A["Group configuration"] --> B{"Hold 'create sub-groups'?"}
    B -->|No| X["+ Sub-role not shown"]
    B -->|Yes| C["+ Sub-role -> name it, optional Hidden"]
    C --> D["Create -> new star appears below"]
```

![Creating a sub-role](images/sub-role-form.png)

### A2 · Set visibility (public / hidden)
*Where: Group configuration → Visibility · [Chapter 5](chapter-05-building-your-structure.md)*

```mermaid
flowchart LR
    A["Visibility checkbox"] -->|Unticked| B["Public - visible, joinable"]
    A -->|Ticked| C["Hidden - whole subtree hidden; owners above still see it"]
    B --> D{"A level above hidden?"}
    D -->|Yes| E["Stays hidden -> Request visibility"]
```

### A3 · Delete a branch (direct or by request)
*Where: Group configuration → Delete / Request deletion · [Chapter 5](chapter-05-building-your-structure.md)*

```mermaid
flowchart LR
    A["Branch must be empty"] --> B{"Own the level above?"}
    B -->|Yes| C["Delete directly"]
    B -->|No| D["Request deletion -> level above decides"]
```

### A4 · Add a person (member or co-owner)
*Where: People → + Add person · [Chapter 6](chapter-06-people-and-governance.md)*

```mermaid
flowchart LR
    A["+ Add person"] --> B{"Member or co-owner?"}
    B -->|Member| C["Username + optional 'create content'"]
    B -->|Co-owner| D["Username + granted rights"]
    C --> E["Placed on branch"]
    D --> E
```

![Choosing member or co-owner](images/add-person-choose.png)

### A5 · Grant a co-owner's rights (least privilege)
*Where: People → Add a co-owner · [Chapter 6](chapter-06-people-and-governance.md)*

```mermaid
flowchart LR
    A["Rights you hold"] --> B{"Hold the right?"}
    B -->|No| C["Not offered"]
    B -->|Yes| D["Grant: sub-groups / appoint co-owners"]
    D --> E["Toggle Allow / Revoke anytime"]
```

![Granting only the rights you hold](images/add-coowner-form.png)

### A6 · Grant a member the "create content" right
*Where: People → Add a member · [Chapter 6](chapter-06-people-and-governance.md) & [7](chapter-07-courses.md)*

```mermaid
flowchart LR
    A["Member + create content"] --> B["Authors a document"]
    B --> C["Draft -> Document review"]
    C -->|Owner approves| D["Publishes"]
    C -->|Owner rejects| E["Stays draft"]
```

![Member form with "may create content"](images/add-member-form.png)

### A7 · Publish a course
*Where: Courses → + Upload course / Create in Studio · [Chapter 7](chapter-07-courses.md)*

```mermaid
flowchart LR
    A["Upload or Studio"] --> B["Set title, classification, shelf, kind, deadline, recurrence"]
    B --> C{"Owner or member?"}
    C -->|Owner| D["Publishes now"]
    C -->|Member| E["Draft -> review -> publish"]
    D --> F["Placed: mandatory + inherit"]
```

![The upload-course form](images/upload-course-form.png)

### A8 · Configure a placed course
*Where: Courses → per-course controls · [Chapter 7](chapter-07-courses.md)*

```mermaid
flowchart LR
    A["Course on a role"] --> B["mandatory / opt-in"]
    A --> C["inherit down / this role only"]
    A --> D["Unplace"]
    A --> E["Archive"]
    A --> F["Delete everywhere"]
```

![Per-course placement controls](images/courses-panel.png)

### A9 · Back up / restore a branch (`.bkp`)
*Where: Backup section · [Chapter 16](chapter-16-supreme-and-custody.md)*

```mermaid
flowchart LR
    A["Backup"] --> B["Download .bkp + password"]
    A --> C["Restore: upload .bkp + password"]
    C --> D["Report: applied / skipped"]
```

![The Backup section](images/backup-panel.png)

### A10 · The Supreme zone (root only)
*Where: root → Group configuration → Supreme zone · [Chapter 16](chapter-16-supreme-and-custody.md)*

```mermaid
flowchart LR
    A["Enter Supreme password"] --> B["Add / remove top owner"]
    A --> C["Download .main"]
    A --> D["Delete org -> 30-day retention -> purge"]
    D --> E["Revive only with .main + password"]
```

![Group configuration including the Supreme zone](images/group-configuration.png)

---

## B — What a member can have / do

A member *learns* from the branches they're placed on. Everything assigned to them gathers in
**My Learning**.

### B1 · Complete assigned courses
*Where: My Learning · [Chapter 11](chapter-11-my-learning.md)*

```mermaid
flowchart LR
    A["Course reaches your position"] --> B["Open in viewer"]
    B --> C{"Prerequisites done?"}
    C -->|No| D["Mark complete locked"]
    C -->|Yes| E["Mark complete"]
    E --> F["Rate & review"]
    E --> G{"Recurs?"}
    G -->|Yes| H["Re-opens on expiry"]
```

![My Learning — assigned, completed, overdue](images/my-learning.png)

### B2 · Read in the in-app viewer
*Where: My Learning / Library → Open · [Chapter 11](chapter-11-my-learning.md)*

The viewer opens every document in the organization's standard frame (cover, classification,
version, author) — never in a second tab.

![The in-app course viewer](images/course-viewer.png)

### B3 · Propose content (if granted)
*Where: Studio → Propose a document · [Chapter 8](chapter-08-the-studio.md)*

```mermaid
flowchart LR
    A["Member with content right"] --> B["Build in Studio"]
    B --> C["Submit draft"]
    C --> D["Owner reviews"]
    D -->|Approve| E["Published"]
    D -->|Reject| F["Draft"]
```

![The Studio document builder](images/studio.png)

### B4 · Ask to join a public branch
*Where: click a public star → Send Join request · [Chapter 12](chapter-12-requests.md)*

```mermaid
flowchart LR
    A["Public star"] --> B["Join request: member or sub-owner"]
    B --> C["Owners decide"]
    C -->|Approve| D["Added to the branch"]
```

### Member capability map

```mermaid
flowchart TD
    M["Member of a branch"] --> L["Receive & complete courses"]
    M --> V["Read in the in-app viewer"]
    M --> R["Rate & review after completing"]
    M --> J["Send Join requests to public branches"]
    M --> P{"Granted 'create content'?"}
    P -->|Yes| PC["Propose documents - published after review"]
    P -->|No| PN["Learn only"]
```

---

## C — Request ↔ response flows

Requests route sensitive actions to whoever has the authority. Deciders act from the
**Requests inbox**; everyone is kept informed by **notifications**.

![The Requests inbox](images/requests.png)

### C0 · The lifecycle every request shares

```mermaid
flowchart TD
    A["Request raised"] --> B["Decider's Inbox - live badge"]
    B --> C{"Approve or reject"}
    C -->|Approve| D["Action takes effect"]
    C -->|Reject| E["Rejected"]
    D --> F["Requester notified live"]
    E --> F
    F --> G["Auto-cleans after 7 days"]
    A -. withdraw while pending .-> H["Removed"]
```

### C1 · Course request

```mermaid
flowchart LR
    A["Library -> Request for my branch"] --> B["Handler's Inbox"]
    B --> C["Configure: mandatory, inherit, deadline, recurrence"]
    C --> D["Approve -> placed configured"]
```

### C2 · Join request

```mermaid
flowchart LR
    A["Public star"] --> B["Join as member or sub-owner"]
    B --> C["Owners / level above decide"]
    C -->|Approve| D["Added in that role"]
    C -->|Reject| E["Not added"]
```

### C3 · Deletion request

```mermaid
flowchart LR
    A["Branch owner"] --> B["Request deletion"]
    B --> C["Level above decides"]
    C -->|Approve| D["Deleted (must be empty)"]
    C -->|Reject| E["Kept"]
```

### C4 · Visibility request

```mermaid
flowchart LR
    A["Hidden by a level above"] --> B["Request visibility"]
    B --> C["Level above decides"]
    C -->|Approve| D["Chain unhidden"]
    C -->|Reject| E["Stays hidden"]
```

### C5 · How you hear about it — notifications

Every request, decision, assignment and reminder arrives as a **live, clickable
notification** that deep-links to the exact item.

![The notifications panel](images/notifications.png)

---

## D — Plans, Knowledge Coins & access codes

Every organization runs on a **plan**, bought with **Knowledge Coins** and unlocked with a
one-time **access code**. Full detail in [Chapter 15](chapter-15-plans-and-access.md); the
staff side is the **Super Admin Guide Book** (a separate book, held by the Knowledge Base team).

![The Pricing page](images/pricing-page.png)

### D1 · Choose a plan and get an access code
*Where: Pricing → Request this plan / Propose terms · [Chapter 15](chapter-15-plans-and-access.md)*

```mermaid
flowchart LR
    A["Pricing page"] --> B{"Fixed or custom plan?"}
    B -->|Fixed| C["Request this plan"]
    B -->|Custom| D["Propose terms: days wanted + coins offered"]
    C --> E["Knowledge Base team decides"]
    D --> E
    E -->|Approve| F["8-character code - valid 24h, single use"]
    E -->|Deny| G["Reason delivered - request again"]
    F --> H["Bell + Account page - kept 30 days"]
```

![Your requests, tracked on the Pricing page](images/pricing-my-requests.png)

### D2 · Create the organization with the code
*Where: Create organization · [Chapter 3](chapter-03-founding-an-organization.md)*

```mermaid
flowchart LR
    A["Paste access code + org details"] --> B{"Code valid and unexpired?"}
    B -->|No| C["Refused - request a new code"]
    B -->|Yes| D{"Enough Knowledge Coins?"}
    D -->|No| E["Refused - shows cost vs balance"]
    D -->|Yes| F["Coins deducted - code marked used"]
    F --> G["Organization created - plan countdown starts"]
```

![Creating an organization with the plan chooser](images/create-organization.png)

### D3 · Knowledge Coins — where they come from and go
*Where: Pricing (balance) · Buy coins · [Chapter 15](chapter-15-plans-and-access.md)*

```mermaid
flowchart TD
    A["Register - 150 coins granted"] --> W["Your wallet"]
    G["Knowledge Base gift or adjustment"] --> W
    P["Buy coins - coming soon"] -.-> W
    W --> S{"Redeem an access code"}
    S -->|Demo plan| F["Free - nothing deducted"]
    S -->|Paid plan| D["Plan price deducted - logged in the ledger"]
```

### D4 · How many people a plan allows
*Where: People → + Add person · [Chapter 6](chapter-06-people-and-governance.md)*

```mermaid
flowchart LR
    A["Add a person / approve a Join request"] --> B{"Already in this organization?"}
    B -->|Yes| C["Placed on the role - no seat used"]
    B -->|No| D{"Members below the plan limit?"}
    D -->|Yes| E["Added - seat used"]
    D -->|No| F["Refused: upgrade the plan to add more"]
```

### D5 · Expiry and restoring
*Where: the countdown chip above each org card · [Chapter 15](chapter-15-plans-and-access.md)*

```mermaid
flowchart TD
    A["Plan countdown"] -->|More than 3 days| B["Normal chip"]
    A -->|Under 3 days| C["Red chip - upgrade soon"]
    A -->|Lapsed| D["expired - upgrade to keep it"]
    D --> E{"Organization deleted and being restored?"}
    E -->|Plan active and unexpired| F["Restores directly"]
    E -->|Demo, expired or legacy file| G["Blocked - choose a plan on Pricing"]
    G --> H["Restore code -> restore on the new plan"]
```

![The plan countdown timer above each organization card](images/org-plan-timer.png)

### D6 · The staff side

Everything that happens on the Knowledge Base team's side of a plan request — the requests
inbox, approvals, access codes, coins, and the organizations console — lives in the separate
**Super Admin Guide Book**, held by that team. From your side, the whole interaction is:
send the request on the Pricing page, then read the answer in your mailbox.

```mermaid
flowchart LR
    A["You: choose a plan on Pricing"] --> B["Request filed"]
    B --> C["Knowledge Base team decides"]
    C --> D["Answer lands in your mailbox"]
    D --> E["New organization: redeem the code"]
    D --> F["Existing organization: the upgrade is already applied"]
```

---

## Master index — setting → where → screenshot

| Setting | Who | Chapter | Screenshot |
|---------|-----|---------|-----------|
| Create a sub-role | Owner | 5 | `sub-role-form.png` |
| Set visibility (public/hidden) | Owner | 5 | `group-configuration.png` |
| Delete / request branch deletion | Owner | 5 | `group-configuration.png` |
| Add a person (member/co-owner) | Owner | 6 | `add-person-choose.png` |
| Grant co-owner rights | Owner | 6 | `add-coowner-form.png` |
| Grant member "create content" | Owner | 6 | `add-member-form.png` |
| Publish a course | Owner | 7 | `upload-course-form.png` |
| Configure placement (mandatory/inherit/archive) | Owner | 7 | `courses-panel.png` |
| Back up / restore a branch (`.bkp`) | Owner | 16 | `backup-panel.png` |
| Supreme zone (owners, `.main`, delete) | Top owner | 16 | `group-configuration.png` |
| Restore from the Recycle Bin | Founder | 16 | `organizations-list.png` |
| Complete assigned courses | Member | 11 | `my-learning.png` |
| Read in the in-app viewer (PDF zoom) | Member | 11 | `course-viewer.png` |
| Propose content | Member | 8 | `studio.png` |
| Send a join request | Member | 12 | `requests.png` |
| Decide a request (inbox) | Decider | 12 | `requests.png` |
| Read the Mailbox | Everyone | 14 | `notifications.png` |
| See why someone is not compliant | Manager | 13 | `compliance.png` |
| Reset a candidate's exam attempts | Manager | 13 | `compliance.png` |
| Build an exam & set its attempt limit | Owner | 9 | `studio.png` |
| Choose a plan / see your coin balance | Anyone | 15 | `pricing-page.png` |
| Track a plan request | Anyone | 15 | `pricing-my-requests.png` |
| Read your access code | Anyone | 15 | `account-admin-messages.png` |
| Create an org with a code | Founder | 15 | `create-organization.png` |
| Read the plan countdown | Owner | 15 | `org-plan-timer.png` |
| Upgrade an existing organization | Owner | 15 | `pricing-page.png` |
| Change theme & accent | Everyone | 17 | — |
| Buy coins (coming soon) | Anyone | 15 | `buy-coins-coming-soon.png` |

---

**Back to:** [Table of contents](README.md) · **Reference:**
[Appendix — Glossary & quick reference](appendix-glossary-and-reference.md)
