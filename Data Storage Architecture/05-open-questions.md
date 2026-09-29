# 05 — Open questions

What I need decided before this can be built. Ordered by how much of the design each answer
changes.

---

> **Questions 1 and 2 are decided (2026-08-04).** See the answers inline below and the
> decision log in `README.md`. The behaviour they settle is specified in `docs/structure.md`
> §9, which is now the normative source.
>
> **Questions 9–17 (2026-09-29) are about Google Drive** and are open. They are at the end of
> this document.

---

## 1 · Private-network NAS — which route? ✅ DECIDED

**Decision: NAS is the first backend, served by an S3-compatible adapter with MinIO as the
recommended server. Reachability is the organization's responsibility, and Cloudflare Tunnel
is the documented route.**

This is D4's substance reached by a better path. The options below were framed as "support the
NAS or don't", but they missed a fifth route: a **tunnel daemon** (Cloudflare Tunnel, Tailscale
Funnel) running on the NAS makes an **outbound** connection and yields a real HTTPS hostname
with a valid certificate. No port forwarding, no inbound firewall rule, no NAS exposed to the
internet — D2's security posture with none of D2's build cost. It takes the organization about
ten minutes.

The protocol question was decided on cost. WebDAV and SFTP are already built into every NAS
and need no container, but neither issues presigned URLs, so every byte of every read would
proxy through our API — paid egress, and whole files resident in a 512 MB instance. MinIO
speaks S3, so the browser fetches straight from their NAS: free for them, **zero for us**, and
the adapter is reusable for every cloud backend later. WebDAV/SFTP may follow as additional
protocols under the same NAS option, understood as the expensive path.

*Original analysis follows.*

### The original framing

An organization's NAS at `192.168.1.50` is unreachable from our datacentre. No credential
fixes that. Document 02 · Group D covers the options.

| Option | Build cost | Works remotely | My view |
|--------|-----------|----------------|---------|
| **D1** Browser-direct | Low | **No** — office only | Fails for anyone at home; browsers block much of it |
| **D2** Connector they install | **High** — weeks, then forever | Yes | The proper answer, if demand justifies it |
| **D3** They expose the NAS | None | Yes | I would not recommend a customer do this |
| **D4** Don't support it; point them at MinIO | None | Yes | Honest, and MinIO genuinely is right for most |

**My recommendation: D4 now, D2 if organizations actually ask.** Ship S3 and the cloud drives,
write a good five-minute guide for putting MinIO in front of a NAS, and build the connector
only when there is real demand. A cross-platform agent built before a single customer needs it
would be the most expensive thing in this folder.

**Your call:** D4 now, or is NAS support important enough to fund D2 up front?

---

## 2 · Encryption posture ✅ DECIDED

**Decision: a per-organization choice made at setup — `ENCRYPTED` (Posture 1) by default,
`PLAIN` (Posture 3) available to organizations that knowingly choose it. Posture 2
(by classification) is not built.**

So the answer to *"are you comfortable telling an organization their documents will be
unreadable blobs in their own storage?"* is: **that is offered, not imposed.** An organization
that wants "not even our own IT can read this" gets it; one that wants its storage to stay
browsable gets that instead, having been told what it gives up.

Two consequences now specified in `docs/structure.md` §9.5:

- **The posture is fixed once storage is activated.** Changing it re-encrypts or decrypts every
  stored object — a migration with a progress bar, not a settings toggle.
- **The Supreme-wrapped DEK is never persisted.** It is computed at `.main` export time from
  the live DEK and the just-verified Supreme password. Storing it in the database would make
  every database dump an offline attack on a human-chosen password (`.main` derives its key
  with scrypt), which would defeat the entire point of keeping the platform key out of the
  database.

*Original analysis follows.*

Document 04 sets out three. In short:

- **Posture 1 — encrypt everything.** Meets your requirement literally. Their Drive shows blobs.
- **Posture 2 — encrypt by classification.** `PUBLIC` readable, everything else encrypted.
  Flexible, harder to explain, and misunderstanding it leaks documents.
- **Posture 3 — no encryption.** Simple. Their storage admin can read anything.

**My recommendation: Posture 1, as a per-organization setting, with Posture 3 available to
those who knowingly choose it.**

**Your call.** And specifically: are you comfortable telling an organization *"your documents
will be unreadable blobs in your own Google Drive — only Knowledge Vault, or your `.main` file,
can open them"*? That sentence is the whole trade, and everything in document 04 follows from
your answer.

---

## 3 · Is organization-provided storage required, or optional?

Three shapes:

- **Required for everyone.** No organization can upload until storage is configured. Cleanest
  for us — we host no bytes at all, ever. Brutal onboarding: a new customer cannot try the
  product without first creating a bucket.
- **Required above the free plan.** Free plan uses our inline storage with its small caps
  (which is roughly what the caps are already sized for); every paid plan brings its own.
  **This is what the current pricing implies**, and it lets someone evaluate the product in
  five minutes.
- **Always optional.** We keep hosting for anyone who does not configure storage. Comfortable
  for customers, and it leaves us with the bill we are trying to remove.

**My recommendation: required above the free plan**, with the free plan's ceilings cut to
something the database can genuinely hold — see question 6.

---

## 4 · Existing files — migrate, or leave them?

There are files in `StoredFile` today.

- **Migrate in the background** when an organization connects storage: copy up, verify the
  hash, rewrite the `storageRef`, drop the row. Resumable, one file at a time. Clean end
  state — nothing of theirs left with us.
- **Leave them, new uploads go to the new backend.** No migration to build; two adapters live
  side by side for those courses forever, which is a small permanent complication.

**My recommendation: migrate.** It is a background job with a clear finish line, and "we still
hold 300 of your old files" is a question you do not want to keep answering.

---

## 5 · The map file — how much detail?

Document 03 proposes structure, people per role, and one entry per document with its effective
audience.

The question is the **effective audience list**. Computing `["a.stone", "r.patel", "l.chen"]`
per document is genuinely useful for an auditor — and it means a document's readers are named
in a file sitting in their storage. For a 500-person organization with 2,000 documents it is
also a large file to regenerate on every change.

Options: full effective lists · roles only, resolve people at read time · both, with the
detailed one written nightly rather than on change.

**My recommendation: roles only in the JSON, plus a nightly `.md` with the resolved names.**
The audit use case is not real-time; the machine-readable one does not need names.

---

## 6 · The free plan's numbers

The Pricing page currently promises the free plan **150 GB**. On our database that is fiction —
it would die at roughly 0.3% of it.

Once organization storage exists, two coherent stories:

- **Free plan on our storage, small and honest.** Say 500 MB and 30 documents. Cheap for us,
  enough to evaluate, and true.
- **Free plan also brings its own storage.** Then 150 GB is fine because it is *their* 150 GB,
  and our only cost is bandwidth.

**My recommendation: the first.** A free plan that demands a bucket before you can upload one
PDF is a free plan nobody completes. Fix the number to something we can honour, and let the
150 GB conversation belong to paid plans, where it is their storage anyway.

---

## 7 · Who configures storage — and does it need the Supreme password?

Setting up storage is a governance act: it decides where the organization's documents live and
who could reach them.

- **Root owners only** — consistent with how ownership works elsewhere.
- **Behind the Supreme gate** — consistent with the other custody actions (owner management,
  deletion, `.main` export). Given that the DEK is escrowed into the `.main` file, gating this
  behind the Supreme password is coherent: the same password that protects the key protects
  the decision about where the ciphertext goes.

**My recommendation: root owners, behind the Supreme gate**, with changing an existing backend
gated the same way.

---

## 8 · How big should files be allowed to get?

The 10 MB cap exists because the bytes are in Postgres. Once they are not, it can rise a lot.

The constraints become: the browser's memory during encryption, multipart upload above ~100 MB,
and — for Group B, where bytes flow through us — our own request limits and timeouts.

Sensible: **200 MB on S3-family** (with multipart and browser-side encryption), **50 MB on
Drive/OneDrive** (because it transits us), with the number configurable per plan and shown in
the Studio before someone picks a 2 GB video.

**Your call** on whether large media is a real use case, or whether the `LINK` adapter —
which already handles YouTube and similar for zero bytes — covers it.

---

## Once these are answered

I will rewrite documents 02, 03 and 04 to match, add a phased implementation plan with the
schema changes and the new endpoints, and log the decisions in the README. Then we code.

---

# Google Drive — questions 9 to 17 (2026-09-29)

**Already decided by you, 2026-09-29:** Google Drive is the next backend; it serves both
Google Workspace and personal accounts; both postures — encrypted and readable — are offered on
it; and when speed and compression pull against each other, speed wins. These are in the
decision log and are not re-asked here.

What follows are the choices the design in `07-google-drive-architecture.md` needs from you.
Each carries my recommendation. Ordered by how much of the design each one moves.

---

## 9 · Which ways of connecting Google ship, and in what order?

Two modes survive the analysis in document 07, §3:

- **A · A connected Google account** (OAuth, `drive.file`). One sign-in. Works for personal
  accounts and for Workspace. We hold one sealed refresh token, which can reach only files
  Knowledge Vault created.
- **B · A keyless service identity** (Workload Identity Federation). For Workspace organizations
  with a GCP project. We hold nothing secret; no person is in the chain.

Three were rejected: service-account JSON keys (a long-lived key to their Drive in our database,
blocked by default for newer GCP organizations, and strictly dominated by B); one Knowledge Vault
service account shared by all customers (shared quotas, one credential reaching everyone, a
confused-deputy risk); domain-wide delegation (impersonation of anyone in their domain).

**My recommendation: A first — it is the only mode personal accounts can use — then B.** Never
the three rejected ones, even when a customer asks.

---

## 10 · PLAIN on Drive — readable file names?

A NAS in `PLAIN` posture stores `objects/2026/09/<hex>.bin`: readable bytes behind meaningless
names. On Drive, the point of choosing readable storage is usually being able to *use* the
folder — and a folder of hex names is not usable.

- **Readable names:** *"Arm Lockout Procedure — 100-101-0003 v2.pdf"*, with the real file type,
  so Drive previews and searches them. The logical object key underneath is unchanged.
- **Content-free names**, as on NAS.

A readable name reveals nothing the readable content does not, to exactly the same people.

**My recommendation: readable names on Drive in PLAIN.** ENCRYPTED stays content-free, as
everywhere.

---

## 11 · Where the streaming gateway runs

Drive puts bytes through us — both directions, not optional (document 07, §1). Something has to
carry them.

- **In the API process** — nothing new to deploy; shares 512 MB and the free instance's sleep.
- **Its own always-on service** — scales on bandwidth, never sleeps, costs money.
- **Behind Cloudflare's CDN** — ruled out for media: Cloudflare's terms restrict video hosted
  outside Cloudflare.

**My recommendation: in the API process for the first release, behind a feature flag and tight
concurrency caps; its own service before general availability.**

---

## 12 · Close the recovery gap before encrypted Drive ships?

Verified in the code: `.main` escrows no data key, per-file keys live only in our database, and
revival marks every stored object unreachable. So §9.11's recovery promise does not hold today,
for NAS either (document 07, §11).

The proposal: carry each object's wrapped key in its own header (backward compatible — readers
ignore fields they do not know); escrow the data key in `.main`; let revival re-link objects;
ship the decrypt tool.

**My recommendation: yes — and ENCRYPTED does not ship on Drive until it is done.** A personal
account holding encrypted blobs with no working recovery route is one bad day from total loss.

---

## 13 · Frame size for new objects

Frames are the unit of decryption, so the frame size is the minimum wait before a video starts
and the minimum waste on a seek. Today's is 4 MiB: 6.7 seconds before the first frame on a
5 Mbps phone. At 256 KiB it is 0.42 seconds. The format already carries the frame size in each
object's header, so this needs no format change.

**My recommendation: 256 KiB for new Drive objects**, confirmed on a low-end phone in spike S5
(1 MiB if not); NAS adopts it when the streaming client reaches NAS.

---

## 14 · Deleting from a Shared Drive — trash, or permanent?

A **Content Manager** can only move files to trash, which Google purges after 30 days. A
**Manager** can purge at once — and can also change the drive's membership and settings.

**My recommendation: Content Manager.** Deletion leaves the drive within 30 days, and we say so
honestly. Asking for the power to rearrange a customer's drive, to shorten that, is the wrong
trade.

---

## 15 · Personal accounts — any conditions?

You have decided personal accounts are supported. The question is how plainly to say what they
mean: files owned by a person, 15 GB shared with Gmail and Photos, and no way back if the account
is lost.

**My recommendation: allowed on every plan, both postures, with one sentence the owner must tick
at setup** — *"These files belong to this Google account. If the account is lost, so are they."*
— and ENCRYPTED recommended, as everywhere. On a Workspace account the same tick is required for
My Drive, with a Shared Drive offered instead.

---

## 16 · Who pays for the bandwidth?

§9.12 stops metering storage for organizations that bring their own, because it took that cost
off us. On Drive it did not take all of it: every byte streamed crosses our gateway, and we pay
for it.

- **A monthly gateway transfer allowance per plan**, shown in the storage panel, with a clear
  message when it is reached.
- **Absorb it**, and price Drive into the plans.

**My recommendation: an allowance per plan, sized generously.** ENCRYPTED organizations cost us
less — their repeat reads come from the cache — which is one more reason to recommend it.

---

## 17 · Studio documents and exams on Drive

§9 keeps Studio documents, exam papers and drafts in our database for now: they are kilobytes,
and moving them adds a round trip to the most common action in the product. Drive's round trip is
slower than a NAS's.

**My recommendation: the same on Drive — they stay with us until the authored-content phase (G4),
which brings the read-through cache from document 06, risk 1.** Files, audio and video are what
move first, and they are what streaming is for.

---

*Last updated: 2026-09-29*
