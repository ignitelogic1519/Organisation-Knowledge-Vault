# Chapter 16 — Flow diagrams: every setting at a glance

This chapter is the **visual reference** for the whole platform. It pairs a **flow diagram**
with a **screenshot** for each setting, grouped into three topics:

- **A.** [What an **owner** can do](#a--owner-settings--actions) — every management setting.
- **B.** [What a **member** can have / do](#b--what-a-member-can-have--do) — the learner side.
- **C.** [**Request ↔ response** flows](#c--request--response-flows) — ask-and-approve.

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
*Where: Backup section · [Chapter 14](chapter-14-supreme-and-custody.md)*

```mermaid
flowchart LR
    A["Backup"] --> B["Download .bkp + password"]
    A --> C["Restore: upload .bkp + password"]
    C --> D["Report: applied / skipped"]
```

![The Backup section](images/backup-panel.png)

### A10 · The Supreme zone (root only)
*Where: root → Group configuration → Supreme zone · [Chapter 14](chapter-14-supreme-and-custody.md)*

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
*Where: My Learning · [Chapter 10](chapter-10-my-learning.md)*

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
*Where: My Learning / Library → Open · [Chapter 10](chapter-10-my-learning.md)*

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
*Where: click a public star → Send Join request · [Chapter 11](chapter-11-requests.md)*

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
| Back up / restore a branch (`.bkp`) | Owner | 14 | `backup-panel.png` |
| Supreme zone (owners, `.main`, delete) | Top owner | 14 | `group-configuration.png` |
| Complete assigned courses | Member | 10 | `my-learning.png` |
| Read in the in-app viewer | Member | 10 | `course-viewer.png` |
| Propose content | Member | 8 | `studio.png` |
| Send a join request | Member | 11 | `requests.png` |
| Decide a request (inbox) | Decider | 11 | `requests.png` |
| Notifications | Everyone | 13 | `notifications.png` |

---

**Back to:** [Table of contents](README.md) · **Reference:**
[Appendix — Glossary & quick reference](appendix-glossary-and-reference.md)
