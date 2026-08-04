# 02 — Backend requirements

What we need from an organization for each storage type they might choose, what each one can
actually do, and where the sharp edges are.

---

## The two questions that classify every backend

Before the table of credentials, two capabilities decide how much work a backend is and how
much it costs us to run:

**Can our server reach it?** If the storage has no public address — a NAS in their office, a
file server on their LAN — then our API cannot read or write it, however correct the
credentials are. This is not a permissions problem and no configuration fixes it.

**Can it issue signed URLs?** A signed (or "presigned") URL is a time-limited link that lets a
browser upload or download **directly to the storage**, without the bytes passing through us.
This is the difference between us paying for bandwidth on every read and paying for none.
S3-family storage does this natively. Google Drive and OneDrive do not, in the form we need.

Those two answers put every backend into one of four groups.

| Group | Reachable by us | Signed URLs | Bytes through our server | Effort |
|-------|-----------------|-------------|--------------------------|--------|
| **A · S3-compatible** | Yes | Yes | **Never** | Low — one adapter covers many products |
| **B · Cloud drives** | Yes | Not usefully | On upload and download | Medium — OAuth, token refresh, quotas |
| **C · Reachable servers** | Yes | Depends | Usually yes | Medium |
| **D · Private network** | **No** | N/A | Impossible directly | High — needs a different approach entirely |

---

## Group A — S3-compatible object storage

**Products:** Amazon S3, Cloudflare R2, Google Cloud Storage *(S3 interoperability mode)*,
Backblaze B2, Wasabi, DigitalOcean Spaces, MinIO on their own VPS, Ceph/RGW.

One adapter serves all of them. They speak the same API; only the endpoint differs.

**This is the group to build first, and the one to recommend.** It is the cheapest to run
(zero bandwidth through us), the cheapest for them (R2 charges nothing for egress), and the
simplest to get right.

### What we ask the organization for

| Field | Example | Notes |
|-------|---------|-------|
| Provider | `Cloudflare R2` | Picks the endpoint template and the docs we show |
| Endpoint URL | `https://<account>.r2.cloudflarestorage.com` | Pre-filled for AWS; required for R2, MinIO, others |
| Region | `auto` / `us-east-1` | R2 uses `auto`; AWS needs the real region |
| Bucket name | `acme-knowledge-vault` | Must already exist — we do not create buckets |
| Access key ID | `AKIA…` | |
| Secret access key | `••••` | Encrypted at rest in our database |
| Path prefix *(optional)* | `knowledge-vault/` | Lets them share a bucket with other systems |
| Force path-style *(optional)* | on/off | MinIO and some on-prem gateways need it on |

### What they must configure on their side

1. **A bucket that is not public.** We check this at connection time and refuse to activate
   if the bucket allows anonymous reads. A public bucket makes every permission rule we have
   decorative.
2. **A dedicated access key**, scoped to that bucket and prefix only. We show them the exact
   IAM policy to paste. It needs `GetObject`, `PutObject`, `DeleteObject`, `ListBucket`, and
   `AbortMultipartUpload` for large files. Nothing else — no bucket creation, no policy
   editing, no access to their other buckets.
3. **CORS**, so the reader's browser may upload and download directly. We generate the exact
   JSON, scoped to our web origin, with `GET`, `PUT`, `HEAD` and the headers signing needs.
   This is the step people get wrong most often, so the setup screen should show a live
   "test upload" that either goes green or names the missing rule.
4. **Lifecycle rules — theirs to choose.** We do not set retention. If they want versioning
   or Glacier tiering, that is their call on their bucket.

### What we do

- Upload: browser asks us for a presigned `PUT`, we authorise it against our permission
  model, browser sends the bytes straight to their bucket. We only ever see the object key.
- Download: same in reverse with a presigned `GET`, valid a few minutes, single object.
- Delete: our server calls `DeleteObject` when a course is deleted.
- Usage: `ListBucket` under our prefix gives real consumption for the admin console.

### Sharp edges

- **A presigned URL is a bearer token.** Anyone holding it can fetch that object until it
  expires. Short lifetimes (5 minutes), never logged, never emailed, and — importantly — a
  fresh one minted per view rather than stored anywhere.
- **Clock skew** breaks signature validation. Rare, but the error is baffling when it happens;
  the connection test should catch it.
- **GCS in S3 mode needs HMAC keys**, not the service-account JSON people expect. Worth
  saying plainly in the setup screen or we will field the question forever.

---

## Group B — Cloud drives (Google Drive, Microsoft OneDrive / SharePoint)

These are the ones you named first, and they are the ones people *ask* for — the storage they
already pay for and already understand. They are also meaningfully harder than Group A, and I
want the reasons on the record.

### Google Drive

**Two ways to connect, and the choice matters:**

**Service account with a Shared Drive** *(recommended)*
| Field | Notes |
|-------|-------|
| Service account JSON key | Uploaded once; encrypted at rest |
| Shared Drive ID | They create the drive and add the service account as Content Manager |
| Folder path | Optional; we create `Knowledge Vault/` under it |

The service account owns nothing personally, survives staff leaving, and needs no interactive
re-consent. **A service account cannot store files in a personal My Drive** — Google gives
service accounts no storage quota of their own — so this path *requires* Google Workspace
with Shared Drives. That is the trade-off.

**OAuth as a named user** *(fallback for non-Workspace)*
| Field | Notes |
|-------|-------|
| OAuth consent by an admin | We hold a refresh token |
| Folder ID | |

Works with an ordinary Google account, and inherits that account's problems: the files are
owned by a **person**, the refresh token can be revoked by a password change or an inactivity
policy, and if that person leaves the company the storage can go with them. Every
organization choosing this route should be told so in the setup screen, plainly.

**What Drive costs us technically:** no usable presigned URLs. Drive's sharing links are
either "anyone with the link" — which defeats the entire permission model — or require the
user's own Google session, which our readers will not have. **So bytes flow through our API
in both directions.** That is the price of Drive: it solves their storage bill, not our
bandwidth bill.

Also: Drive rate-limits per user, it counts against their Workspace quota, and file IDs are
opaque — we store the ID, never a path, because a user dragging a folder in the Drive UI
would otherwise break every link.

### Microsoft OneDrive / SharePoint

Same shape, via Microsoft Graph.

| Field | Notes |
|-------|-------|
| Azure tenant ID | |
| App registration client ID | They register an app in Entra ID |
| Client secret *or* certificate | Certificate preferred; secrets expire, typically 6–24 months |
| Drive / site ID | The document library we write into |
| Folder path | |

Needs `Files.ReadWrite.All` (app-only) with admin consent. **SharePoint document libraries
are the better target than personal OneDrive** — same reasoning as Shared Drives: they belong
to the organization, not to a person.

Graph *does* offer short-lived download URLs, which helps, but they are not signed in the S3
sense and the flow still routes through us for permission checks. Treat it as "bytes through
us", same as Drive.

**The recurring failure here is credential expiry.** A client secret quietly expires and
every document in the organization stops loading. We need expiry tracking, a warning in the
mailbox 30 days out, and a clear degraded state rather than a wall of errors.

---

## Group C — Reachable servers (VPS, Windows Server, exposed NAS)

**Products:** a VPS with SFTP or WebDAV, a Windows server exposed over HTTPS, a NAS the
organization has deliberately published (Synology, QNAP, TrueNAS all speak WebDAV).

| Protocol | Fields we need | Notes |
|----------|----------------|-------|
| **SFTP/SSH** | Host, port, username, **private key** (preferred) or password, base path | Key auth only, ideally. Host key pinned on first connect and verified after. |
| **WebDAV** | Base URL, username, password, path | Must be HTTPS. Self-signed certs need us to pin the fingerprint. |
| **MinIO on their VPS** | See Group A | **This is the better answer** — an S3 API on their own hardware gives them Group A's economics with Group D's control |

**What we tell them:** if you are standing up a server for this anyway, **run MinIO on it**.
It is one container, it speaks S3, and it gets presigned URLs — which means their users
download at their server's full speed instead of being funnelled through our API.

**Sharp edges:** every one of these is a long-lived credential to a machine that probably has
other things on it. We ask for a dedicated account, chrooted to one directory, with no shell.
And an exposed NAS is a real attack surface — if they are considering it, MinIO behind a
reverse proxy with a proper certificate is a better shape than opening SMB.

---

## Group D — Private network storage (NAS or file server, not exposed)

**This is the group with no clean answer, and the one I need your decision on.**

The situation: their NAS lives at `192.168.1.50`. Our API is in a datacentre. There is no
route. Correct credentials do not help.

Four ways out, none free:

### D1 · Browser-direct
The reader's browser is *inside* their network, so it can reach the NAS even though we cannot.
We hand the browser an address and a short-lived credential; it fetches the file itself.

- **For:** no bandwidth cost to anyone, no connector to install, works today for staff in the office.
- **Against:** breaks completely for anyone working from home or on their phone, unless the
  company runs a VPN. Browsers also refuse many of these requests outright (mixed content,
  CORS, no HTTPS on a LAN address). In practice this works for a subset of NAS products with
  a proper certificate, and fails confusingly for the rest.

### D2 · A connector they install
A small service inside their network, which we publish. It makes an **outbound** connection to
us — no inbound firewall rule, which is the part their security team cares about — and serves
files on request.

- **For:** works from anywhere, no ports opened, we control the protocol, it can report health
  and usage properly. This is how every serious product solves this (Tailscale, Cloudflare
  Tunnel, backup agents, hybrid connectors).
- **Against:** it is a second thing to build, package, sign, document, update and support,
  across Windows/Linux/Docker. Realistically weeks, not days, and it never stops needing
  maintenance.

### D3 · They expose it
Port-forward or reverse-proxy the NAS. Then it is Group C.

- **For:** nothing for us to build.
- **Against:** we would be advising customers to put a NAS on the public internet. Most
  security teams will say no, and they should. I am not comfortable recommending it.

### D4 · Don't support it
Say plainly: private-network storage needs MinIO or a reverse proxy in front of it, which
makes it Group C. Point them at a five-minute setup guide.

- **For:** zero build, honest, and MinIO genuinely is the right answer for most of them.
- **Against:** "we have a NAS, use it" is a request you will hear often, and this answers it
  with homework.

**My recommendation: D4 now, D2 later if demand is real.** Ship Groups A and B, document the
MinIO path properly for NAS owners, and build the connector only when enough organizations
have actually asked. Building a cross-platform agent before a single customer needs it would
be the most expensive thing on this page.

---

## What every backend needs, regardless of type

Common machinery, built once:

1. **A connection test before activation.** Write a probe object, read it back, compare bytes,
   delete it. Report the exact failure — wrong key, no permission, bucket public, CORS
   missing, certificate untrusted, clock skew. A storage backend that "seems configured" but
   silently fails on the first real upload is the worst possible outcome.
2. **Credentials encrypted at rest** in our database, with a key that is not in the database.
   Never returned to the browser after saving — the form shows `••••` and a Replace button.
3. **A health check on a schedule**, because credentials expire and quotas fill. Failure puts
   the organization into a degraded read-only state with a high-priority mailbox message to
   its owners, not a wall of broken documents.
4. **Usage reporting**, so the admin console and the org's own courses panel can show real
   consumption against whatever ceiling they have set.
5. **Orphan collection.** Deleting a course must delete its object. A failure there must be
   recorded and retried, or their bill grows quietly forever.
6. **Migration from inline**, for the files already in our Postgres. Background, resumable,
   verifying each object before dropping the row.
7. **A per-object integrity check** — SHA-256 recorded at upload, verified on read. Their
   storage is now the weak link in a way ours was not, and a silently corrupted file should
   be an error rather than a broken PDF.


---

## Quick reference — what we ask for, per backend

One table, for the setup form and for answering "what do I need to get ready?".

| Backend | Group | Credentials & fields | They must also | Bytes via us | Signed URLs |
|---------|-------|---------------------|----------------|--------------|-------------|
| **Amazon S3** | A | Region · bucket · access key ID · secret · prefix | Non-public bucket · scoped IAM policy · CORS | No | Yes |
| **Cloudflare R2** | A | Account ID · endpoint · bucket · access key · secret | Non-public bucket · API token scoped to it · CORS | No | Yes |
| **Google Cloud Storage** | A | HMAC key + secret · endpoint · bucket *(S3 interop mode)* | Enable interoperability · non-public bucket · CORS | No | Yes |
| **Backblaze B2 / Wasabi / DO Spaces** | A | Endpoint · region · bucket · key ID · secret | Non-public bucket · CORS | No | Yes |
| **MinIO** (their VPS/NAS) | A | Endpoint URL · bucket · access key · secret · path-style on · TLS cert if self-signed | Public HTTPS address · valid certificate · CORS | No | Yes |
| **Azure Blob Storage** | A* | Account name · container · account key **or** SAS token | Private container · CORS | No | Yes (SAS) |
| **Google Drive** (Workspace) | B | Service-account JSON key · Shared Drive ID · folder | **Shared Drive** (service accounts have no personal quota) · add SA as Content Manager | **Yes** | No |
| **Google Drive** (personal) | B | OAuth client ID + secret · refresh token · folder ID | Admin consent · accept that files are owned by a person | **Yes** | No |
| **OneDrive / SharePoint** | B | Tenant ID · client ID · client secret **or** certificate · drive/site ID · folder | Entra app registration · `Files.ReadWrite.All` app-only · admin consent · **track secret expiry** | **Yes** | Partial |
| **SFTP / VPS** | C | Host · port · username · **private key** (preferred) or password · base path | Public address · dedicated chrooted no-shell account · host key pinned | **Yes** | No |
| **WebDAV** (NAS, server) | C | HTTPS base URL · username · password · path | Public HTTPS · valid certificate (or we pin the fingerprint) | **Yes** | No |
| **NAS on a private LAN** | D | — | See Group D: **MinIO or a reverse proxy in front of it**, which makes it Group C | — | — |

\* Azure is S3-shaped in behaviour but a different SDK — a small adapter of its own, not a
free rider on the S3 one.

**Reading the last two columns:** "Bytes via us — No" means the reader's browser talks straight
to their storage and we pay nothing for the transfer. That is the whole economic argument for
steering organizations towards Group A.

---

## Recommended order of work

1. **S3-compatible adapter** — covers S3, R2, GCS, MinIO, Wasabi, B2, Spaces in one go, with
   presigned URLs so our bandwidth cost goes to zero. Highest value per unit of work by a
   wide margin.
2. **Common machinery** — connection test, credential vault, health checks, usage, GC,
   migration.
3. **Google Drive** — most requested; bytes proxy through us.
4. **OneDrive / SharePoint** — same shape as Drive, different SDK.
5. **SFTP/WebDAV** — for the VPS crowd, if wanted.
6. **A connector for private networks** — only if organizations actually ask.

---

*Last updated: 2026-08-04*
