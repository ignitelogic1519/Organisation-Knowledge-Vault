# Chapter 5 — Building your structure

## What it is

Your structure is the shape of your organization — the roles and sub-roles that knowledge
and people hang from. You grow and shape it from the **Group configuration** section of any
role you govern. This chapter covers **sub-groups**, **visibility**, and **deleting a
branch**.

Open it by clicking a star you govern on the constellation, then choosing **Group
configuration**.

![Group configuration for a role](images/group-configuration.png)

---

## Adding a sub-group (sub-role)

Branches only ever grow **downward**. To add a new role beneath the one you're on:

1. In **Group configuration**, find the **Sub-groups** row.
2. Select **+ Sub-role**.
3. Enter the new role's name (e.g. *Firmware Team* under *Engineering*).
4. Optionally tick **Hidden (private)** to make the new branch private from the start
   (see visibility below).
5. Select **Create**.

![Creating a sub-role from Group configuration](images/sub-role-form.png)

The new star appears immediately on the constellation, connected beneath the current role.

> You'll only see the **+ Sub-role** option if you hold the *"may create sub-groups"* right
> on that branch. Least-privilege governance (Chapter 6) decides who can grow the tree.

---

## Visibility: public by default, hidden on purpose

Every branch is **public by default** — meaning every member of the organization can see it
and send a **Join request** to it. You control this with a single checkbox:

- Leave it unticked → the branch is **public**.
- Tick **Hidden (private) branch** → the branch is hidden from people on the same layer and
  below. Hiding cascades: **everything beneath a hidden branch is hidden too**, all the way
  down.

Two important rules:

- **Owners above a hidden branch always keep seeing it.** Hiding never blinds the people
  responsible for that part of the tree.
- If your branch is marked public but a **level above** is hidden, your branch stays hidden
  too. In that case the panel tells you, and — if you have the right — offers a **Request
  visibility** button to ask the level above to unhide the chain.

In the sample *Aurora Robotics*, the **Research Lab** branch is hidden — it doesn't appear
to ordinary members, only to the executives above it.

---

## Deleting a branch

A branch can be removed only when it is **completely empty** — no sub-roles and no people.
How you delete depends on your authority:

- **If you own the level above**, you can delete the branch **directly** — the **Delete**
  button appears in Group configuration.
- **If you own the branch itself** (but not the level above), deletion needs sign-off. You'll
  see **Request deletion** instead, which files a **Deletion request** with the level above;
  they approve or reject it from their Requests inbox (Chapter 11).

The platform always confirms before deleting.

---

## Flows at a glance

**Creating a sub-role:**

```mermaid
flowchart TD
    A["Group configuration"] --> B{"Hold 'create sub-groups'?"}
    B -->|No| X["+ Sub-role is not shown"]
    B -->|Yes| C["Click + Sub-role"]
    C --> D["Name it - optionally tick Hidden (private)"]
    D --> E["Create"]
    E --> F["New star appears below on the constellation"]
```

**Setting visibility:**

```mermaid
flowchart TD
    A["Group configuration - Visibility"] --> B{"Hidden checkbox"}
    B -->|Unticked| C["Public: everyone sees it and can send Join requests"]
    B -->|Ticked| D["Hidden: removed from the same layer and below"]
    D --> E["The whole subtree is hidden too"]
    D --> F["Owners above always keep seeing it"]
    C --> G{"Is a level above hidden?"}
    G -->|Yes| H["Branch stays hidden - use Request visibility"]
    G -->|No| I["Visible to everyone"]
```

**Deleting a branch:**

```mermaid
flowchart TD
    A["Want to delete a branch"] --> B{"Is it empty? no sub-roles, no people"}
    B -->|No| C["Empty it first"]
    B -->|Yes| D{"Do you own the level above?"}
    D -->|Yes| E["Delete directly (with confirmation)"]
    D -->|No - you own the branch| F["Request deletion - the level above decides"]
```

---

## Tips

- **Design top-down.** Create the big divisions first (Engineering, Operations, People), then
  add teams beneath them. Courses placed high can inherit down to everything you add later.
- **Use hidden branches for sensitive teams** — a security team, an M&A workstream, an
  unannounced project. Remember the whole subtree inherits the privacy.
- **Empty before you delete.** Move or remove people and sub-roles first; the branch must be
  empty for deletion to succeed.

**Next:** [Chapter 6 — People & governance →](chapter-06-people-and-governance.md)
