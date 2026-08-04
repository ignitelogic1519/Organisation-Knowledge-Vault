# 03 — The `Knowledge_vault_map` file

The manifest we write into the organization's storage, laying out the structure, the people,
and the permission level on every document.

---

## The one rule

**It is a mirror, never the authority.**

Our database decides who may read what. The map is a *published copy* of that decision,
written into their storage so it can be read by a human, audited, and used to rebuild after a
disaster.

The reason matters. If we ever read permissions *from* this file, then anyone who can write
to that folder controls access to every document in the organization: their IT contractor,
a compromised laptop, an over-shared Drive folder, a misconfigured bucket policy. The
security of the whole platform would drop to the security of a folder we do not control.

So: **we write it, we sign it, we never trust it.** On every read we compare its signature;
a mismatch is reported to the owners as tampering, and the map is rewritten from our
database. Nothing about access changes either way.

---

## Where it lives

```
<their chosen root>/
├── Knowledge_vault_map.json        ← machine-readable, signed
├── Knowledge_vault_map.md          ← the same thing, readable by a person
├── README.txt                      ← "what is this folder, do not edit"
└── objects/
    ├── 2026/08/
    │   ├── 3f2a…c1.kvblob
    │   └── 9b7e…04.kvblob
    └── 2026/09/
```

**Objects are content-addressed and dated**, not named after documents. Two reasons: a
filename like `Redundancy-Consultation-Legal-Advice.pdf` leaks confidential information to
anyone who can list the folder, and dated shards keep any one directory small enough for the
slower backends to list.

---

## What the map contains

```jsonc
{
  "format": "knowledge-vault-map/1",
  "generatedAt": "2026-08-04T09:12:33Z",
  "organization": {
    "number": 100,
    "name": "Aurora Robotics",
    "platformUrl": "https://app.knowledgevault.example"
  },
  "storage": {
    "adapter": "s3",
    "bucket": "acme-knowledge-vault",
    "prefix": "knowledge-vault/",
    "encryption": "AES-256-GCM (envelope)"   // see document 04
  },

  // The role tree, as structure — no secrets, no passwords.
  "structure": [
    { "roleNumber": 100, "name": "CEO",  "parent": null, "public": true,
      "owners": ["j.okafor"], "members": [] },
    { "roleNumber": 101, "name": "Robotics QA", "parent": 100, "public": true,
      "owners": ["a.stone"], "members": ["r.patel", "l.chen"] }
  ],

  // One entry per stored object: what it is, and who our database says may read it.
  "documents": [
    {
      "object": "objects/2026/08/3f2a…c1.kvblob",
      "code": "100-101-0003",
      "title": "Arm Lockout Procedure",
      "classification": "CONFIDENTIAL",
      "mime": "application/pdf",
      "bytes": 2411984,
      "sha256": "…",
      "publishedAt": "2026-08-02T10:04:00Z",
      "publishedBy": "a.stone",
      "reaches": {
        "roles": [101],
        "inherits": true,
        "effectiveUsernames": ["a.stone", "r.patel", "l.chen"]
      },
      "permission": "READ",
      "downloadAllowed": false
    }
  ],

  "signature": {
    "algorithm": "Ed25519",
    "publicKey": "…",          // so they can verify it without us
    "value": "…"               // over a canonical serialisation of everything above
  }
}
```

The `.md` twin is the same content as a readable document — a tree diagram, then a table of
documents with who can see each. That is the version a compliance auditor or a new IT manager
actually wants.

---

## What it must never contain

Worth stating explicitly, because a manifest is exactly the kind of file that accretes
secrets over time:

- **No Supreme password**, and nothing derived from it.
- **No storage credentials** — the file lives *in* the storage it would describe.
- **No encryption keys.** Key escrow is the `.main` file's job (document 04).
- **No exam answer keys.**
- **No password hashes, tokens, or session material.**
- **No document contents** — only metadata about them.

A useful test for anything proposed for this file: *if a competitor read this, what would
they learn?* Names, structure and document titles are already known to everyone inside the
organization. Anything beyond that needs a reason.

---

## When it is rewritten

Regenerated on any change to what it describes: a document published, deleted, withdrawn or
reclassified; a placement changed; a person added or removed; a role created or deleted.

**Debounced, not immediate.** Rewriting a manifest on every keystroke of a bulk import would
hammer their API and, on metered backends, their bill. A short delay — a minute or so — then
one write. Plus a nightly rewrite regardless, which doubles as a storage health check.

---

## Why bother at all

Three real uses, and it is worth being clear that they are the *only* uses:

1. **Portability.** If they stop using Knowledge Vault, they hold their files plus a map
   saying what each one was and who could see it. That is a genuine exit, not a hostage
   situation — and it is the same principle as the `.main` file.
2. **Disaster recovery.** Their storage plus the map plus `.main` is enough to rebuild.
3. **Audit.** A security review asking "who can see the redundancy documents" gets a file
   they can read themselves, rather than a screenshot of our UI.

What it is emphatically *not* for: telling us who may read something. That answer lives in
our database and nowhere else.

---

*Last updated: 2026-08-04*
