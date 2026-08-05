# Chapter 3 — Founding an organization

## What it is

Founding an organization creates a brand-new constellation with **you as its first owner**
and sets its **Supreme password** — the single most important credential in Knowledge Vault.
This is how a company, team or department comes into existence on the platform.

> **You need a plan and an access code first.** Every organization runs on a plan, and
> creating one needs a one-time 8-character code from the Knowledge Base team. Pick a plan on
> the **Pricing** page (the free **Demo** plan costs nothing), and your code arrives in your
> notifications. [Chapter 15](chapter-15-plans-and-access.md) walks through it end to end.

---

## Your organizations home

The **Organizations** page lists every organization you belong to. Each card shows the
organization's name, its number (e.g. `#100`), and your position inside it.

![Your organizations](images/organizations-list.png)

From here you can:

- **Open** any organization by selecting its card.
- **Create organization** — the button in the top-right.
- **Revive a deleted organization from a `.main` file** — the expandable option at the
  bottom (covered in Chapter 14).

---

## Creating the organization

Select **Create organization** to open the founding form:

![Creating an organization](images/create-organization.png)

The page has the founding form on the left and a **plan chooser** on the right — your coin
balance, every plan, and a button to request one without leaving the page.

Fill in the fields:

1. **Access code** — the 8-character code the Knowledge Base team sent you (it's in your
   notification bell and on your Account page). It's valid for 24 hours and works once.
2. **Organization name** — your company or team name (e.g. *Aurora Robotics*).
3. **Organization logo** — optional. Upload a square-ish image and it appears on your
   organization card and on every document you publish. Skip it and Knowledge Vault draws a
   badge from the first letter of your name instead, in a colour picked for your
   organization — so you never end up with a blank square.
4. **First role name** — the name of the top role you'll occupy. This is the root of your
   whole structure. Common choices: *Owner*, *CEO*, *Principal*, *Executive Office*.
5. **Supreme password** — at least **12 characters**. Retype it to confirm.
6. **Where your documents will live** — see the next section.

## Where your documents will live

Knowledge Vault always keeps your structure, your people and your records. Your **documents
themselves** are a separate question, and the founding form asks it.

**NAS — your own storage.** The normal choice. Your documents live on hardware you own and
control: the space is yours, the running cost is yours, and you can walk away with everything
at any time. You enter the address, the bucket and an access key, then press **Test
connection** — Knowledge Vault writes a test file, reads it back, checks the bytes match,
confirms the storage isn't readable by the public, and cleans up after itself. It tells you
exactly which of those steps failed if one does.

You also choose here whether documents are **encrypted** on your storage. Encrypted is
recommended and means nobody can open them from the storage itself — not even your own IT —
only through Knowledge Vault, or with your `.main` file and Supreme password. The alternative
keeps them as ordinary browsable files. **This choice is fixed once storage is connected**,
because changing it means re-encrypting everything you have stored.

If you don't have a NAS, the setup guide in the repository walks through turning a folder on
an ordinary laptop into one, so you can try the whole thing before buying hardware.

**KVEP — Knowledge Vault Employee Perk.** Reserved for Knowledge Vault staff. Documents stay
on Knowledge Vault's own storage with nothing to set up, and the plan's storage allowance
applies as usual. It needs a **super-admin username and password**, entered both when the
access code is requested and again when the organization is created — which is what keeps the
perk internal. An ordinary access code will not create a KVEP organization, and a KVEP code
will not create an ordinary one.

![The creation form, with the storage choice below the Supreme password](images/create-organization-storage.png)

> **Want the whole picture before you decide?**
> [Chapter 20 — Where your documents live](chapter-20-where-your-documents-live.md) walks
> through each arrangement step by step, says exactly what stays with us and what goes to you,
> and lists the storage backends still to come. The public **Storage** page in the navigation
> bar carries the same material.

### The Supreme password — read this carefully

The form shows a prominent warning, and it means every word of it:

> **This password cannot be recovered. By anyone. Ever.**

The platform stores **no copy** of your Supreme password. It is used to:

- protect owner-level changes to the top of your structure, and
- encrypt your organization's `.main` revival file.

If it is lost, changing the owner structure and reviving a deleted organization become
**permanently impossible**. Because of this, you must tick the acknowledgement box —
**"I understand the Supreme password is unrecoverable"** — before you can continue.

Select **Create organization**, and you'll land on your new, empty constellation with a
single star: your top role, with you as its owner. The platform checks your code, deducts the
plan's coins, and starts the plan's countdown — visible from then on as the chip above the
organization's card.

---

## Tips

- **Store the Supreme password somewhere durable and offline** — a password manager or a
  sealed record. Treat it like the master key to a safe, because that's exactly what it is.
- **Choose the top role name thoughtfully.** It's the label everyone sees at the crown of
  your constellation. You can grow everything else beneath it later.
- **You don't need everything ready on day one.** Found the org first; add roles, people and
  courses whenever you're ready — the next chapters show how.
- **Trying the platform out?** Found a **Demo** organization — free, full-featured, 2 months,
  up to 10 people — and rehearse there before you build the real one
  ([Chapter 15](chapter-15-plans-and-access.md)).

**Next:** [Chapter 4 — The Constellation: your org map →](chapter-04-the-constellation.md)
