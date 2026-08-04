# 04 — Security & encryption

How "nobody else should be able to look at this document" is actually achieved once the bytes
live on storage we do not control.

---

## The problem, stated plainly

Today a confidential PDF sits in our database. The only way to it is our API, which checks
that the reader is a member, that the course reaches their position, and that drafts stay
with their author. That check is good and it is the only door.

Move that PDF to the organization's Google Drive as a PDF, and there is now a **second door**
we do not control:

- their Google Workspace admin can open it;
- anyone the folder was ever shared with can open it;
- anyone who compromises that Google account can open it;
- Google itself can, subject to their terms;
- and on an S3 bucket, anyone with the access key, or a mistaken `public-read` ACL.

Our permission model still governs *our* door perfectly. It has no opinion about theirs.

So the requirement — *only the permitted audience sees this document* — cannot be met by
access rules alone once the bytes leave us. It needs the bytes to be **unreadable** to
anyone but us.

---

## The answer: envelope encryption

We encrypt every file before it leaves us. What lands in their storage is ciphertext:
`objects/2026/08/3f2a…c1.kvblob`. Their admin sees a blob of an unhelpful size with a
meaningless name. Knowledge Vault decrypts it on the way to a reader who has passed our
permission check.

### How the keys are arranged

Three layers, which is standard practice and is what every cloud KMS does internally:

```
   File Key (FK)          fresh 256-bit key per file, AES-256-GCM
        │  wrapped by
   Data Key (DEK)         one per organization
        │  wrapped by ── ┬── Platform KEK      (our key, in the environment — never in the DB)
                         └── Supreme KEK       (derived from the Supreme password)
```

- **Every file gets its own key.** One compromised file cannot unlock the next.
- **The DEK is per organization**, so nothing crosses a tenant boundary.
- **The DEK is wrapped twice**, which is the important part.

### Why wrapped twice

**The platform wrap** is what makes normal use seamless. A reader opens a document, our
server unwraps the DEK with the platform key it already holds, decrypts, streams. No prompt,
no password, nothing for the user to think about.

**The Supreme wrap** is what keeps custody honest. That copy of the DEK goes into the
organization's `.main` file — which is already encrypted with the Supreme password, already
in their hands, and already the thing that revives an organization from nothing.

That means the answer to *"what if Knowledge Vault disappears tomorrow?"* is not "your
documents are unreadable ciphertext". It is: **their storage holds the files, the map says
what each one is, and the `.main` file holds the key that opens them.** A competent engineer
with those three things can recover everything without us. That is the same promise the
Supreme password already makes, extended to cover the bytes.

It also means we should ship a small **standalone decrypt tool** — open source, no dependency
on our service — so that promise is demonstrably true rather than merely stated.

### What it costs

Being honest about the trade-off, because it is real:

- **They cannot browse their own documents in their own Drive.** They see blobs. For some
  organizations this is exactly what they want; for others it will feel wrong, and they should
  be told before they choose it, not after.
- **Bytes must pass through us to be decrypted.** This partly defeats the presigned-URL
  bandwidth saving of Group A — the browser can fetch the ciphertext directly from their
  bucket, but something must decrypt it.
  - *Server-side decrypt:* simple, bytes flow through us, bandwidth cost returns.
  - *Browser-side decrypt:* the browser fetches ciphertext straight from their bucket, and we
    send only the file key over our (already authenticated) API. **Bandwidth cost stays at
    zero, and the file key is scoped to one file and one session.** Web Crypto does AES-GCM
    natively; a 50 MB PDF decrypts in well under a second.
  - Browser-side is the better answer for Group A. Server-side is the only option for Group B.
- **Deduplication and server-side search become impossible.** We are not doing either today.
- **Key loss is total loss.** Mitigated by the double wrap: losing the platform key still
  leaves the `.main` route, and vice versa.

---

## Three postures to choose between

This is question 2 in document 05. All three are buildable; they differ in what they promise.

### Posture 1 · Encrypt everything
Every uploaded file is ciphertext in their storage.

- **Strongest.** Delivers your requirement literally: nobody outside the permitted audience
  can look at a document, including their own IT.
- Blobs only in their Drive.
- *Right for:* legal, healthcare, defence, HR-heavy organizations, anyone with a real
  classification policy.

### Posture 2 · Encrypt by classification
`PUBLIC` files stored as normal readable files; `CONFIDENTIAL`, `PRIVATE` and `SECRET`
encrypted. The classification field is compulsory on every course already, so the machinery
exists.

- Their induction handbook stays a browsable PDF in their Drive; the redundancy consultation
  does not.
- **Explaining it is the hard part** — "some of your files are readable and some are not" is
  a sentence people misremember. The map file would have to be very clear.
- *Right for:* organizations that want their own storage to stay usable.

### Posture 3 · No encryption
Files stored as-is. Security relies on their storage being correctly locked down.

- Simplest, fastest, cheapest, and their Drive stays a normal Drive.
- **Does not meet the requirement as you stated it.** Their admin can read anything.
- *Right for:* small organizations where the storage admin and the Knowledge Vault owner are
  the same person and the distinction is meaningless.

**My recommendation: build Posture 1, and make it a per-organization setting with Posture 3
available for those who knowingly choose it.** Posture 2 is tempting and I would leave it
until someone asks — a rule with an exception is harder to explain than either rule alone,
and misunderstanding this particular rule leaks documents.

---

## Everything else that has to be right

Encryption is the interesting part. These are the parts that are boring and still matter.

**Their credentials, at rest with us.** Encrypted with a key held in the environment, not in
the database, so a database dump alone is not enough to reach their storage. Never returned
to the browser once saved — the form shows `••••` and offers Replace. Every use of them
audited.

**Signed URLs are bearer tokens.** Anyone holding one can fetch that object until it expires.
Five-minute lifetimes, one object each, minted per view, never logged, never persisted.

**The bucket must not be public.** Checked at connection time; we refuse to activate
otherwise, and re-check on the scheduled health check. A bucket that turns public later
should raise a high-priority message to the owners.

**Object names must leak nothing.** Content-addressed hashes, not titles. `objects/2026/08/`
sharding, so a directory listing reveals volume and dates and nothing else.

**Integrity.** SHA-256 recorded at upload, verified after decryption. Their storage is now the
weak link in a way ours was not; a silently corrupted file should be a clear error, not a
broken PDF.

**Deletion.** Deleting a course deletes its object, and a failure is recorded and retried
rather than shrugged off. On some backends deletion is soft — Drive has a trash, S3 has
versioning — and the map should say so honestly rather than implying a shredder.

**Degradation.** When their storage is unreachable or their credentials have expired, the
organization goes read-only for uploads, existing documents report *"unreachable until your
storage is reconnected"* — a state the viewer already handles — and the owners get a
high-priority message. It should never look like data loss, because it is not.

---

*Last updated: 2026-08-04*
