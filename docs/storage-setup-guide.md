# storage-setup-guide.md — Connecting storage, from a laptop folder to a real NAS

> Practical companion to `docs/structure.md` §9. Part 1 turns a folder on your own laptop
> into a NAS you can test against today. Part 2 puts it on the internet with Cloudflare
> Tunnel. Part 3 is the version you hand to a customer with a real NAS. **Part 4 is Google
> Drive** — switching it on once for the platform, testing it on a laptop without a Google
> account, and what an owner does.
>
> **Start with Part 1 and Track A.** It needs no Cloudflare account, no domain, no NAS, and
> nothing exposed to the internet. Get that working before adding anything else.

---

## Who this file is for, and where the customer-facing version lives

This document is written for **us** — the people building and testing Knowledge Vault. It
starts from a folder on a laptop because that is the fastest way to have something to test
against, and it spends most of its length on failure modes.

An **organization owner** connecting a real NAS does not read this. They get a different
artefact, and it is not a document at all — it is a program:

| Surface | Where | What it is |
|---|---|---|
| **The guide** | `/storage/guide`, opened from the storage form | An interviewing document. Ten steps, one card at a time, that asks the reader questions and rewrites itself around the answers. Its own tab beside the form; full-screen on a phone. |
| **The PDF** | The "PDF" button in that guide | The same steps, with the same answers already substituted, as a laid-out A4 document to email to whoever administers the NAS. |
| **This file** | `docs/storage-setup-guide.md` | The long version for us: laptop testing, the tunnel, and every error message explained. |

### What "rewrites itself" means

The guide is not a fixed sequence with variables in it. It is built from
`apps/web/src/lib/nas-guide.ts`, which is a function from **answers** to **steps**:

* **Which machine.** Synology, QNAP, TrueNAS, Unraid, a Linux server, a Windows PC, a Mac,
  or "I do not have one yet" — which produces buying advice instead of instructions. The
  answer decides what Docker is called on that machine, where it is installed from, what
  the default folder path is, how you open a terminal on it, and which backup tool the last
  step names. On a Windows PC every command is written for PowerShell, the terminal the
  guide tells that reader to open.
* **Clicking or typing.** The same three steps written twice: once as a walk through the
  machine's own screens, once as commands. Presented as a preference with its trade-offs,
  not as a fork the reader has to be qualified to take.
* **A domain, or not.** The reachability step branches three ways — a permanent named
  tunnel on their own domain, a free quick tunnel with the URL that changes on every
  restart, or an address they already have. Each option shows its pros and cons *at the
  moment of choosing*, and the choice changes the commands, the checks, and whether step 7
  is marked skippable.
* **Free text.** The folder, the bucket, the Silo user name and password, the NAS's local
  address, the domain, the hostname. Every one is substituted into every later command and
  into the final table of values, so nothing is left to fill in by hand.

Two depths — "Explain everything" and "Just the steps" — filter the same blocks, so a
reader who has done this before is not reading what a bucket is, and a reader who has not
is not being asked to guess. Answers persist in `localStorage`, because somebody who gets
to step 6 and goes off to buy a domain should not come back to an empty form.

### Keeping this file honest

Appendix A is the same sequence in prose. **When `nas-guide.ts` changes, change Appendix A
with it** — that is the reviewable version, and the only way a change to the customer's
guide gets read by anybody in a diff.

The division of labour that motivates all of it: an owner reads the guide, but the person
who does the work is often somebody else — the IT contractor, whoever looks after the NAS —
and that person never signs in to Knowledge Vault. That is why the PDF exists, why it
carries the owner's answers, and why the guide's first card explains what a NAS is rather
than what our form wants.


---

## What you are actually building

Three ideas, and the whole thing makes sense once these land.

**1 · "NAS" is not a magic box.** A NAS is a computer with disks that speaks a protocol
over the network. Your laptop is also a computer with a disk. The only thing your laptop is
missing is the software that speaks the protocol.

**2 · Silo is that software.** Silo (from PGSTY) is an open-source storage server. You point
it at an ordinary folder and it serves that folder over the **S3 API** — the same language
Amazon S3 speaks. Everything it stores lives inside that folder, in its own layout (`xl.meta`
files rather than the uploaded files themselves), so the folder *is* your storage: back it up
and you have backed up everything. Silo is built on the open-source MinIO engine, which is why
its settings are named `MINIO_*` and its folder holds a hidden `.minio.sys`.

```
   Knowledge Vault  ──speaks S3──►  Silo   ──writes files──►  C:\kv-storage\
                                  (software)                 (an ordinary folder)
```

So **"turn a folder into a NAS" = "run Silo pointed at that folder"**. That is the whole
trick, and it is the same trick on your laptop as on the customer's NAS.

**3 · Reachability is the only thing that differs.** Knowledge Vault's API runs on Render,
in a datacentre. It cannot see `localhost` on your laptop, and it cannot see
`192.168.1.50` in your customer's office. Two ways around that:

- **Run the API on your laptop too** — then everything is on one machine and there is
  nothing to reach across. This is Track A, and it is how you should test first.
- **Give the storage a public HTTPS address** with Cloudflare Tunnel — Part 2. This is what
  the customer will eventually need.

---

## Part 1 — Turn a folder on your laptop into a NAS

### Step 1 · Make the folder

This is where your "NAS" keeps its files. Anywhere is fine.

| | |
|---|---|
| **Windows** | `C:\kv-storage` |
| **macOS / Linux** | `~/kv-storage` |

```powershell
# Windows PowerShell
mkdir C:\kv-storage
```

```bash
# macOS / Linux
mkdir -p ~/kv-storage
```

### Step 2 · Install the storage server (Silo)

Knowledge Vault standardises on **Silo**: open source (AGPL-3.0), released every month or two
with a published security-advisory process, and one image that carries the server, its web
console and its `mcli` client. It passes Knowledge Vault's storage checks end to end — signed
and presigned uploads and downloads, listing, the anonymous-access refusal and the browser's
CORS preflight. (The old `dl.min.io` downloads and `quay.io/minio/minio` image are no longer
maintained; don't use them.)

**Docker (any OS — the recommended route):**
```bash
docker run -d --name kv-silo -p 9000:9000 -p 9001:9001 \
  -e MINIO_ROOT_USER=kvadmin -e MINIO_ROOT_PASSWORD=kvadmin12345 \
  -v ~/kv-storage:/data \
  docker.io/pgsty/silo:latest server /data --console-address ":9001"
```
In Windows PowerShell, use `C:\kv-storage` for the folder and end each continued line with a
backtick (`` ` ``) instead of `\`.

**Without Docker:** download the archive for your platform from
[github.com/pgsty/silo/releases](https://github.com/pgsty/silo/releases) (the server binary is
`silo`) and the client from [github.com/pgsty/mc/releases](https://github.com/pgsty/mc/releases)
(the binary is `mcli`).

### Step 3 · Start it

With Docker, Step 2 already started it — `docker logs kv-silo` shows the addresses below.
Without Docker, leave this window open — the server runs until you close it.

**Windows:**
```powershell
$env:MINIO_ROOT_USER="kvadmin"
$env:MINIO_ROOT_PASSWORD="kvadmin12345"
C:\silo\silo.exe server C:\kv-storage --console-address ":9001"
```

**macOS / Linux:**
```bash
export MINIO_ROOT_USER=kvadmin
export MINIO_ROOT_PASSWORD=kvadmin12345
./silo server ~/kv-storage --console-address ":9001"
```

> The password must be at least 8 characters or Silo refuses to start. `kvadmin12345` is
> fine for a laptop test and must never be used anywhere real.

You should see something like:

```
API: http://192.168.1.20:9000  http://127.0.0.1:9000
WebUI: http://127.0.0.1:9001
```

Two addresses matter:
- **`http://localhost:9000`** — the S3 API. This is what you give Knowledge Vault.
- **`http://localhost:9001`** — a web console for you to look around in.

### Step 4 · Create the bucket and an access key

A **bucket** is a named top-level container — it becomes a sub-folder inside `kv-storage`.
You also want an **access key**, so Knowledge Vault never holds the root password.

> **Clicking works too.** Silo's web console at `localhost:9001` has *Create Bucket* and
> *Access Keys* buttons. The commands below do the same thing, and are quicker to repeat.

**Docker** — the client is already inside the container:
```bash
docker exec kv-silo mcli alias set local http://localhost:9000 kvadmin kvadmin12345
docker exec kv-silo mcli mb local/knowledge-vault
docker exec kv-silo mcli admin user svcacct add local kvadmin
```

**Without Docker** — in a **second** terminal (leave the server running in the first), the
same three lines with `mcli` in place of `docker exec kv-silo mcli`:
```bash
mcli alias set local http://localhost:9000 kvadmin kvadmin12345
mcli mb local/knowledge-vault
mcli admin user svcacct add local kvadmin
```

The last command prints the two values you need. **Copy them now** — the secret is shown
only once:

```
Access Key: J8N2K4P6R8T0V2X4
Secret Key: aB3dE5fG7hJ9kL1mN3pQ5rS7tU9vW1xY3zA5bC7d
```

Check it worked:

```bash
docker exec kv-silo mcli ls local          # should list: knowledge-vault
```

Look in `C:\kv-storage` (or `~/kv-storage`) — there is now a `knowledge-vault` folder.
That is your bucket, sitting on your own disk.

A new Silo bucket is **private** by default, which is what Knowledge Vault requires — it
refuses to connect a bucket the whole internet can read.

**You now have a working NAS on your laptop.** Everything from here is about connecting to
it.

---

## Track A — Test entirely on your laptop *(do this first)*

No Cloudflare, no tunnel, nothing on the internet. You run Knowledge Vault locally, and it
talks to Silo across `localhost`.

Knowledge Vault normally insists on `https://` addresses so credentials are never sent in
the clear. It makes **one exception, for `localhost` only** — precisely so this test works.

### A1 · Set up local environment

If you have not run the project locally before:

```bash
pnpm install
pnpm --filter @vault/shared build
cp apps/api/.env.example apps/api/.env
```

Open `apps/api/.env` and set `DATABASE_URL` to a Postgres connection string (your Neon dev
database is fine). While you are there, generate a local storage key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Paste it as `STORAGE_KEK="…"`. Locally you can leave it blank and a throwaway key is
derived, but setting it means your test data survives restarts.

### A2 · Start the app

```bash
# Terminal 1 — the API
pnpm --filter @vault/api dev

# Terminal 2 — the web app
pnpm --filter @vault/web dev
```

Terminal 3 is Silo from Step 3. Three windows, all running.

### A3 · Connect the storage

Open **http://localhost:3000** and sign in.

**If you already have an organization** (easiest):
1. Open it → click the **root role** → **Group configuration**.
2. The **Storage** panel is at the top of the Supreme zone.
3. **Connect your storage** and fill in:

| Field | Value |
|-------|-------|
| Storage address | `http://localhost:9000` |
| Bucket | `knowledge-vault` |
| Access key ID | the Access Key from Step 4 |
| Secret access key | the Secret Key from Step 4 |
| Encryption | **Encrypted** (recommended) |

4. Press **Test connection**.

**If you are creating a new organization**, the same fields are in the creation form — but
note you need an access code from a super-admin first, so the existing-org route is quicker
for a test.

You want:

```
✓ Connected — your storage is ready.
```

That means Knowledge Vault wrote a test file into your bucket, read it back, compared the
bytes, checked the bucket is not publicly readable, and cleaned up after itself. If any
step fails it tells you which one and why — see **Troubleshooting** below.

Saving needs your **Supreme password**, because choosing where documents live is a
governance decision.

### A4 · Upload a document and watch it land

1. Go to a role → **Courses** → **+ Add**.
2. Fill in the form and attach a PDF. The file field should now say **"≤ 200 MB"** and
   "Goes straight to your own storage, encrypted in this browser first".
3. Publish.

Now look in `C:\kv-storage\knowledge-vault\objects\<year>\<month>\` on disk.

There is an entry ending in **`.kvblob`** — a folder, in fact: Silo keeps each object as an
`xl.meta` file plus data parts. Pull the object out the way any tool would, and look at it:

```bash
docker exec kv-silo mcli ls --recursive local/knowledge-vault
docker exec kv-silo mcli cat local/knowledge-vault/objects/<year>/<month>/<name>.kvblob | head -c 400
```

It opens with `KVBLOB01` and a short plaintext header — the original filename, type and size
are readable there — and everything after it is ciphertext. It is not a PDF any more.
**That is the security promise, visible on your own disk:** even standing on the storage
itself, with full access to the machine, the document's contents are unreadable.

Now open the document inside Knowledge Vault. It renders perfectly — because your browser
fetched that `.kvblob` straight from Silo and decrypted it locally, with a key our API
handed over your logged-in session.

### A5 · Prove the bytes bypass the server

This is worth seeing, because it is the entire economic argument.

1. Open your browser's **DevTools → Network** tab.
2. Open the document.
3. Look at the requests.

You will see a request to `localhost:9000` (Silo) carrying the file, and a small JSON
request to `localhost:4000` (our API) carrying only the link and the key. **The file never
passes through the API.** On a real deployment that is bandwidth we never pay for.

### A6 · Try the failure case

Stop the storage server (`docker stop kv-silo`, or Ctrl-C in its window), then reload the
document in Knowledge Vault.

You should get a **"This document is waiting on your storage"** panel — not a red error,
not anything that looks like data loss. Because it is not: the file is still sitting in
your folder, we just cannot reach it.

Start it again (`docker start kv-silo`), press **Check connection** in the storage panel, and
it recovers.

---

## Part 2 — Put it on the internet with Cloudflare Tunnel

Do this once Track A works, and only then.

**The problem it solves:** the Render-hosted API cannot see `localhost:9000` on your
laptop. Nor can it see a NAS in someone's office.

**Why not just forward a port on your router?** Because that puts your storage on the
public internet, where anyone can knock on it. Cloudflare Tunnel does something smarter:
a small program on your machine makes an **outbound** connection to Cloudflare, and traffic
comes back down that connection. **No inbound firewall rule. No open port. Nothing to scan.**
That is the reason security teams accept it.

```
   Render API  ──►  Cloudflare  ◄──outbound connection──  cloudflared  ──►  Silo
                                   (your laptop opens it)
```

### B1 · Install cloudflared

**Windows:**
```powershell
winget install --id Cloudflare.cloudflared
```

**macOS:**
```bash
brew install cloudflared
```

**Linux:**
```bash
curl -L -o cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
chmod +x cloudflared && sudo mv cloudflared /usr/local/bin/
```

### B2 · Start a quick tunnel

With Silo still running, in a new window:

```bash
cloudflared tunnel --url http://localhost:9000
```

After a few seconds it prints a box containing a URL:

```
+------------------------------------------------------------+
|  https://random-words-here.trycloudflare.com               |
+------------------------------------------------------------+
```

**That is your storage's public HTTPS address.** No account, no domain, no configuration —
Cloudflare gives you a free hostname with a valid certificate.

Test it: open `https://random-words-here.trycloudflare.com/knowledge-vault` in a browser.
An XML error about access being denied is **the correct result** — it means the tunnel
reaches Silo and Silo is refusing anonymous access, exactly as it should.

> **Quick tunnels are for testing only.** The URL is random and changes every time you
> restart cloudflared, and Cloudflare rate-limits them. For anything lasting, use a named
> tunnel on your own domain (Part 3).

### B3 · Tell Silo its public address

Silo checks that the address a request was signed for matches the address it is serving
on. Behind a tunnel those differ, so tell Silo its public name.

**Docker** — recreate the container with one more `-e`. Nothing is lost: the bucket and the
key live in the folder, not the container.
```bash
docker rm -f kv-silo
docker run -d --name kv-silo -p 9000:9000 -p 9001:9001 \
  -e MINIO_ROOT_USER=kvadmin -e MINIO_ROOT_PASSWORD=kvadmin12345 \
  -e MINIO_SERVER_URL="https://random-words-here.trycloudflare.com" \
  -v ~/kv-storage:/data \
  docker.io/pgsty/silo:latest server /data --console-address ":9001"
```

**Without Docker** — stop the server and start it again with the extra line.

**Windows:**
```powershell
$env:MINIO_ROOT_USER="kvadmin"
$env:MINIO_ROOT_PASSWORD="kvadmin12345"
$env:MINIO_SERVER_URL="https://random-words-here.trycloudflare.com"
C:\silo\silo.exe server C:\kv-storage --console-address ":9001"
```

**macOS / Linux:**
```bash
export MINIO_SERVER_URL="https://random-words-here.trycloudflare.com"
./silo server ~/kv-storage --console-address ":9001"
```

Skipping this is the single most common cause of `SignatureDoesNotMatch`.

### B4 · Reconnect Knowledge Vault to the public address

In the storage panel, press **Reconfigure** and change only the address:

| Field | Value |
|-------|-------|
| Storage address | `https://random-words-here.trycloudflare.com` |

Test connection → green. Your laptop folder is now reachable from anywhere, including a
Render-hosted API, and you can run the whole test again against the deployed app.

---

## Part 3 — The real thing, on a customer's NAS

Same three pieces. Only the machine changes.

**On the NAS** (Synology, QNAP, TrueNAS and Unraid all run Docker):

```bash
docker run -d --name silo --restart unless-stopped \
  -p 9000:9000 -p 9001:9001 \
  -e MINIO_ROOT_USER=<strong-user> \
  -e MINIO_ROOT_PASSWORD=<strong-password> \
  -e MINIO_SERVER_URL=https://vault.their-company.com \
  -v /volume1/knowledge-vault:/data \
  docker.io/pgsty/silo:latest server /data --console-address ":9001"
```

`/volume1/knowledge-vault` is the shared folder on the NAS. On QNAP it is usually
`/share/...`; on TrueNAS, a dataset path.

**The differences from your laptop test:**

1. **A named tunnel, not a quick one**, on a domain whose DNS Cloudflare runs, so the
   hostname is stable and theirs. `nslookup -type=ns their-domain.com` answers whether it
   already is (names ending in `ns.cloudflare.com`). If it isn't, there are two ways in: buy a
   separate domain inside Cloudflare, which touches nothing they already run, or move the
   existing one — Cloudflare copies its DNS records, their domain administrator checks every
   one arrived (MX above all, or email stops), turns DNSSEC off at the registrar and swaps the
   nameservers for Cloudflare's two. Tailscale Funnel is an equally good alternative to the
   tunnel itself.
2. **A scoped access key**, not one with full access, limited to `GetObject`, `PutObject`,
   `DeleteObject` and `ListBucket` on that one bucket:
   `mcli admin accesskey edit local/ <access-key-id> --policy policy.json`, or paste the same
   policy into the key in the console.
3. **Both containers set to restart automatically**, so a power cut does not silently take
   their documents offline.
4. **The NAS backed up.** Say this out loud to them: their NAS is now the only copy of
   their documents. Knowledge Vault keeps the catalogue — who may read what, who has
   completed what — but not the files. A NAS with one disk and no backup is a single point
   of failure for their training records, and RAID is not a backup: it survives a dead
   disk, not a deletion, ransomware or the loss of the whole box. Back up the whole folder —
   the hidden `.minio.sys` included — with the NAS's own tool (Hyper Backup on a Synology,
   Hybrid Backup Sync 3 on a QNAP).
5. **Nothing over 100 MB through a free-plan tunnel.** Cloudflare's Free and Pro plans cap a
   request body at 100 MB, and Knowledge Vault uploads each file as a single PUT, so files
   between 100 and 200 MB fail. Tell them to publish large videos as links.

Everything else — bucket, access key, connection test, encryption choice — is identical to
what you just did on your laptop.

---

## Part 4 — Google Drive

Google Drive works differently from a NAS in one way that matters: Google gives no private
link for a single file, so documents pass through Knowledge Vault's **streaming gateway** on
their way to and from the Drive (`docs/structure.md` §9.16). Everything else — the two
postures, the connection test, the degraded state, the recovery chain — is the NAS model.

### 4.1 · Try it on your laptop first, against a fake Google

`apps/api/test/fake-google.mjs` is a stand-in for Google's sign-in and the part of the Drive
API we use. It signs you in instantly as `owner@example.com` with a 2 TB Drive, keeps
everything in memory, and behaves like Google where it matters (PKCE, revocable tokens,
resumable uploads, byte ranges, revisions).

```bash
# Terminal 1 — the fake Google, on :4999
cd apps/api && node test/fake-google.mjs
```

In `apps/api/.env` set `GOOGLE_OAUTH_CLIENT_ID=fake-client`,
`GOOGLE_OAUTH_CLIENT_SECRET=fake-secret`, and uncomment the five `GOOGLE_*_URL` lines from
`.env.example`. Then start the API and the web app as in Track A (A2).

1. **Create an organization** → *Where your documents will live* → **Google Drive**.
2. **Connect your Google account.** A pop-up opens, lands on "Google account connected" and
   closes itself; the form says *Connected as owner@example.com*.
3. Choose **Encrypted** or **Readable files**, tick the acknowledgement, **Test connection** —
   seven ticks — then **Create organization**.
4. **Upload a video** (Courses → *+ Upload course* → Video). Open it: it plays, and seeking
   jumps straight there. Upload a PDF and open it too.
5. **Look inside the fake Drive:** `curl -s localhost:4999/__fake/files` lists every file —
   `.kvblob` names for Encrypted, the real file names for Readable.
6. **Drill a failure:** `curl -X POST localhost:4999/__fake/revoke-all` (as if the owner removed
   our access in their Google account), then **Check connection** in the storage panel: it
   turns to *We cannot reach your storage*, with the reason. Readers see *waiting on your
   storage*. **Reconnect Google** with the same account and it is back.

Restarting the fake wipes its memory, so every organization you connected to it degrades.
Create a new one.

### 4.2 · Switch it on for real — once, for the whole platform

This is the only setup Google Drive needs from us. It takes about fifteen minutes and costs
nothing. You need the address of the deployed API (for example
`https://knowledge-vault-api.onrender.com`) and of the web app.

**1. A Google Cloud project.** Sign in to <https://console.cloud.google.com> with the account
the platform should be administered from → the project picker at the top → **New project** →
name it `Knowledge Vault` → **Create**, and make sure it is selected.

**2. Turn on the Drive API.** ☰ → **APIs & Services** → **Library** → search *Google Drive API*
→ **Enable**.

**3. The consent screen** — what an owner sees when they connect. ☰ → **Google Auth Platform**
(older consoles: *APIs & Services → OAuth consent screen*) → **Get started**:

| Screen | What to enter |
|---|---|
| App information | App name **Knowledge Vault**; user support email: yours |
| Audience | **External** — so personal Gmail accounts and every company's Workspace can connect |
| Contact information | Your email |

Then, in **Branding**: the application home page is the web app's address, and the privacy
policy link is **`<web app>/privacy/google`** — the page that says exactly what we reach and
keep, which Google's user-data policy requires. Leave the logo empty: adding one makes Google
review the brand first.

In **Data access** → **Add or remove scopes**, tick exactly these three and save:

- `.../auth/drive.file` — *See, edit, create, and delete only the specific Google Drive files
  you use with this app*
- `openid`
- `.../auth/userinfo.email`

All three are **non-sensitive**, so there is no Google review, no warning screen and no user
limit. Do not add any other Drive scope: every broader one is sensitive or restricted, and
brings a review and a warning screen with it.

**4. The client.** **Clients** → **Create client** → application type **Web application** →
name it `Knowledge Vault API`. Under **Authorized redirect URIs** add exactly:

```
https://<your-api>/storage/google/callback
```

for example `https://knowledge-vault-api.onrender.com/storage/google/callback`. No JavaScript
origins are needed — the browser never calls Google's API itself. **Create**, then copy the
**Client ID** and **Client secret** (the secret is shown once; download the JSON if you want a
copy).

**5. Publish it.** **Audience** → **Publish app** → **Confirm**. The status must read **In
production**. An app left in *Testing* only lets listed test users connect, and every
connection it makes **expires after seven days**, which would degrade every Drive organization
a week after it connected.

**6. Give the API the client.** Render → `knowledge-vault-api` → **Environment**:

| Variable | Value |
|---|---|
| `GOOGLE_OAUTH_CLIENT_ID` | the Client ID |
| `GOOGLE_OAUTH_CLIENT_SECRET` | the Client secret |
| `WEB_ORIGIN` | optional — the web app's exact address (no trailing `/`). The sign-in pop-up returns to whichever site started it either way; setting this also limits the API to that one site |

**Save** — Render redeploys. The redirect address is built from `RENDER_EXTERNAL_URL`, which
Render sets itself; set `API_PUBLIC_URL` only if the API is reached at a different address
(a custom domain), and then use that address in step 4.

**7. Check it.** Open **Create organization** → **Google Drive**. It should offer **Connect your
Google account**, not *Google Drive is not switched on*. Connect a real account, run the test,
and create a throwaway organization; upload a short video and play it.

**If the owner's company uses Google Workspace**, their administrator may block apps they have
not approved. The sign-in then says *Access blocked: … has not been approved by your admin*.
The administrator approves it in the Google Admin console → **Security** → **Access and data
control** → **API controls** → **Manage Third-Party App Access** → **Configure new app** →
search by the Client ID → **Trusted** (or **Limited**).

### 4.3 · What an owner does

What the product walks them through, in order — for a support conversation:

1. **Choose Google Drive** — when creating the organization, or later in the root branch's
   **Group configuration → Storage**. Connecting and saving need the Supreme password.
2. **Connect your Google account** in the pop-up, and allow *See, edit, create, and delete only
   the specific Google Drive files you use with this app*. On Workspace, a dedicated account
   (such as `knowledge-vault@company.com`) is better than a person's own — the documents belong
   to whichever account connects.
3. **Encrypted or readable** — fixed once saved. Encrypted is recommended: nobody who opens the
   folder can read the documents, including the company's own administrators, and Drive's
   search and AI see nothing.
4. **Acknowledge** that the files belong to that account and count against its storage.
5. **Test connection** — reach, folder, write, read, compare, private, room — then save.
6. The folder appears in their Drive as **Knowledge Vault — \<organization\>**. They should not
   edit it; if someone does, the nightly check puts trashed documents back and keeps serving
   the original of anything replaced, and tells the owners.

The storage panel then shows the account, a link to the folder, the Drive's space, and
**Streaming this month** — the allowance below.

### 4.4 · The streaming allowance, and moving the gateway off Render

Every byte uploaded to or read from Google Drive crosses the gateway, and Render's free plan
includes 5 GB of outbound traffic a month — with no card on file, going over it stops every
service until the 1st. So by default the gateway runs **inside the API with a 2 GiB monthly
allowance**. At 60%, 80% and 95% the owners are told; at 100% Drive uploads and viewing pause
until the 1st, and nothing else is affected. Never an invoice.

2 GiB is about twenty views of a 10-minute HD video, or four hundred 5 MB PDFs, a month —
enough to set Drive up and try it with a team, not to run a busy organization on. When that is
not enough, run the gateway on its own machine — an **Oracle Cloud Always Free** VM carries
10 TB a month at no cost (`Data Storage Architecture/09-google-drive-cost-and-efficiency.md`):

1. Create an Always Free VM (Ubuntu), and open port 443 both in its subnet's security list and
   on the VM itself (Oracle's Ubuntu images ship with an `iptables` rule that drops it).
2. Install Node 22 and pnpm, clone this repository, and build:
   `pnpm install && pnpm --filter @vault/shared build && pnpm --filter @vault/api build`.
3. Give it the **same** `DATABASE_URL`, `STORAGE_KEK`, `GOOGLE_OAUTH_CLIENT_ID`,
   `GOOGLE_OAUTH_CLIENT_SECRET` and `WEB_ORIGIN` as the API, plus `PORT=4100`, and run
   `pnpm --filter @vault/api start:stream` as a systemd service. It serves the gateway and
   `/health`, nothing else.
4. Put HTTPS in front of it — Caddy obtains a certificate by itself. With no domain of your
   own, `<ip-with-dashes>.sslip.io` resolves to the VM and works as the hostname.
5. On Render, set `STREAM_GATEWAY_URL=https://<that hostname>`. From the next ticket on,
   documents flow through the VM, and the allowance rises to 9.5 TiB.

Do not put the gateway behind Cloudflare's CDN: its terms restrict serving video that is not
stored with Cloudflare.

### 4.5 · When it does not work

| What you see | What it means | What to do |
|---|---|---|
| *Google Drive is not switched on for this Knowledge Vault yet* | `GOOGLE_OAUTH_*` is not set on the API, or `STORAGE_KEK` is missing | 4.2 step 6; check Render redeployed |
| Google says **Error 400: redirect_uri_mismatch** | The redirect URI in the client is not exactly `<API>/storage/google/callback` | Copy it from the error's details into 4.2 step 4 — scheme, host and path must match |
| Google says **Access blocked: this app can only be used by test users**, or connections stop working after a week | The app is still in *Testing* | 4.2 step 5 |
| **Access blocked: … has not been approved by your admin** | A Workspace policy | The Workspace paragraph at the end of 4.2 |
| The pop-up never opens | The browser blocked it | Allow pop-ups for the site; the button opens it directly on the click |
| The pop-up says *connected* but the form keeps waiting, or lands on `localhost` | The pop-up returned to a different address than the form is on | If `WEB_ORIGIN` is set, it must be the exact address owners use; otherwise redeploy the API — since 2026-09-30 it returns the pop-up to the site that started the sign-in |
| Test fails at **Confirm the folder is private** | The Knowledge Vault folder is shared by link or with the whole domain | Remove that sharing in Drive, test again |
| Test fails at **Check there is room** | Less than 50 MB free in the Drive | Free space or add storage to the account |
| *This organization's documents are in X's Google Drive* | Reconnecting with a different account | Use account X — only it can see those files |
| *We cannot reach your storage* — access removed or expired | The grant was removed in the Google account, or the account changed its password with the "sign out everywhere" option | **Reconnect Google** with the same account; nothing is lost |
| *…has used its streaming allowance for the month* | The monthly allowance | Wait for the 1st, or 4.4 |
| A document shows *failed its integrity check* | Its bytes in Drive were altered | Restore the file's earlier version in Drive; the original revision is kept forever |


---

## Troubleshooting

The connection test names the stage that failed. Match it here.

**PowerShell: "The specified executable is not a valid application for this OS platform"**
The downloaded file is not a real program — almost always a failed download that saved an
error page under the program's name. Check its size:
```powershell
(Get-Item C:\silo\silo.exe).Length / 1MB     # tens of MB = good, ~0.01 = failed download
```
Download it again from the releases page (Step 2); with `curl.exe`, always pass `-L` — plain
`curl.exe -o` does **not** follow redirects and silently saves the redirect page instead.
If the file really is ~100 MB and you still get this, check whether you are on an ARM
Windows laptop: `$env:PROCESSOR_ARCHITECTURE`. `AMD64` is fine; `ARM64` needs Windows 11's
x64 emulation, and Docker is the easier route there.

**"Could not reach your storage at … "**
Nothing answered. Check Silo is still running; check the address has no trailing slash;
check the port is `:9000` and not `:9001` (`9001` is the console, not the API). Behind a
tunnel, confirm the tunnel window is still open — quick tunnels die when you close the
terminal.

**"The secret access key is wrong, or your storage server's clock is out of sync"**
Usually a mistyped secret — retype rather than paste, in case of a stray space. If the
secret is definitely right and you are behind a tunnel, you almost certainly skipped **B3**
(`MINIO_SERVER_URL`). If neither, check your machine's clock; signatures are time-based and
a few minutes of drift breaks them.

**"That bucket does not exist on your storage"**
The name must match exactly, lowercase. Check it in the Silo console under Buckets.

**"The access key exists but is not allowed to do this on that bucket"**
The key's policy is too narrow. For a laptop test, make a new key with the policy left
blank. For a real setup it needs `GetObject`, `PutObject`, `DeleteObject` and `ListBucket`.

**"This bucket is publicly readable"**
Someone set the bucket's access policy to public. We refuse to connect it, because a public
bucket would make every permission rule in Knowledge Vault decorative. In the console set
the bucket's Access Policy back to **Private**.

**Connection test passes, but uploading a document fails**
Check the file size first. Through a Cloudflare Tunnel on the free plan, anything over 100 MB
is refused with a 413, and because that response carries no CORS headers the browser reports
it as a network error rather than a size one. The test cannot catch this — nor CORS itself,
because it runs from our server, not a browser.

Otherwise it is almost always CORS — the browser is being blocked from talking to Silo
directly. Silo allows all browser origins by default, so this usually means someone
set `MINIO_API_CORS_ALLOW_ORIGIN`. Either unset it, or set it to your web app's address:
```bash
export MINIO_API_CORS_ALLOW_ORIGIN="http://localhost:3000"
```
Bucket-level rules are the other route: the setup guide's step 8 writes them as XML — the
format `mcli cors set` reads — and the storage form's **Show the browser rules** shows the same
rules as JSON.

**The document opens, then says it failed its integrity check**
The copy in storage no longer matches what was uploaded. We refuse to display it rather
than show a possibly-altered document. On a laptop test this usually means the file was
edited or replaced directly in the folder.

**Everything works, then stops after a restart**
Quick tunnel URLs change every time cloudflared restarts. Reconfigure with the new address,
and remember to update `MINIO_SERVER_URL` too.

**The deployed web app cannot reach `http://localhost:9000`**
It never will, and this is the browser refusing rather than anything being misconfigured: a
page served over HTTPS is not allowed to fetch over plain HTTP. So you cannot point the
Vercel-hosted app at Silo on your laptop. Either run the web app locally too (Track A), or
put Silo behind a tunnel so it has an HTTPS address (Part 2). The two halves have to match.

---

## Cleaning up after the test

```bash
# stop cloudflared and Silo with Ctrl-C in their windows
```

Then remove the container (`docker rm -f kv-silo`) or the binary, and delete the `kv-storage`
folder. Nothing was installed into your system, and nothing was left running.

In Knowledge Vault, delete the test documents **before** removing the storage, so the
delete queue can clean the objects out of the bucket properly.


---

## Appendix A — The owner's path, in ten steps

What the guide and the PDF contain, in the order they present it. Parts 1–3 above are how
*we* test; this is the sequence a customer walks once, on real hardware.

**Before they start.** The guide opens with what a NAS, Docker, Silo and a bucket actually
are — four sentences, because a reader who does not have those does not have anything — and
with the one warning that is a prerequisite rather than a footnote: their storage becomes
the only copy of their documents.

1. **What you are about to build, in plain words.** The vocabulary, the datacentre/office
   problem in one paragraph, the
   backup warning — with the line that RAID is not a backup — and the choice of machine.
   Choosing "I do not have one yet" replaces the step with three costed options and sizing
   advice.
2. **Install Docker.** Named and located per machine: Package Center → Container Manager on
   a Synology, App Center → Container Station on a QNAP, Apps on TrueNAS, the Docker tab on
   Unraid, `get.docker.com` on Linux, Docker Desktop on Windows and macOS — each with the
   manufacturer's own documentation linked. Ends by asking clicking-or-typing, and tells the
   reader how to open a terminal on their specific machine if they chose typing.
3. **Install Silo.** Collects the folder, the Silo user name and a generated password.
   Then either the container-manager walkthrough (the `pgsty/silo` image, the container named
   `silo` because step 7's commands use that name, ports, volume, the two environment
   variables, the command, the restart policy) or the single `docker run` of
   `docker.io/pgsty/silo:latest`, followed by a table explaining every flag in it. Ends with
   the local address and a check that signs in to the console.
4. **Create the bucket.** Collects the bucket name. Console route or `mcli` route, with a
   note that switching to the typing route is the answer when a screen has moved — the thing
   that makes people think they are stuck.
5. **Create the access key.** Why it is not the master password; both routes; the warning
   that the secret is shown once; and an optional scoped policy for the security-minded,
   applied with `mcli admin accesskey edit … --policy`.
6. **Give the storage an address.** Why port forwarding is the wrong answer and a tunnel is
   not. Branches on the domain question, and both tunnel branches carry the free plan's
   100 MB upload ceiling. The own-domain branch explains DNS in a sentence, checks who runs it
   with `nslookup -type=ns`, and lays out the two ways onto Cloudflare — buy a separate domain
   there, or move the existing one (records checked, MX above all; DNSSEC off; nameservers
   swapped) — before walking the Cloudflare Zero Trust dashboard click by click and explaining
   why the public hostname is `HTTP` to `localhost:9000` when the address is HTTPS. The
   no-domain branch gives the quick tunnel, how to read the URL out of the logs, and an
   honest account of what it costs them.
7. **Tell Silo its public address.** `MINIO_SERVER_URL`, with the whole recreate command
   already carrying their values. Marked skippable when their storage was already public.
8. **The browser rules.** `corsXmlFor(webOrigin)` — the XML form `mcli cors set` reads — for the
   deployment they are on, and the commands to apply it, starting by reconnecting `mcli`, whose
   saved alias went with the container step 7 recreated.
9. **Connect.** A table of the four values with theirs already in it, the encryption choice
   and why it is permanent, what the connection test actually does, and the failures with
   what each really means — including an upload that fails after the test has passed.
10. **Finish well.** Reboot and re-test; back up the whole folder, `.minio.sys` included, with
    the tool the machine's profile names (Hyper Backup, Hybrid Backup Sync 3, …) and restore
    it to a spare folder; write down who holds what. Plus the migration button, if documents
    predate the storage.

On a Windows PC every command is written for PowerShell — backtick continuations, here-strings
for the files it writes, `Select-String` where the others use `grep` — because step 2 tells
that reader to open PowerShell.

### Where this appears in the product

- **Creating an organization** — `/orgs/new`, in the NAS branch of "Where your documents
  will live".
- **Connecting or reconfiguring storage** — the storage panel on the root branch's Group
  configuration.

Both render `StorageSetupFields`, so the entry card is written once and appears in both.
The guide opens in a new tab on a desktop and navigates in place on a phone
(`openStorageGuide()` in `lib/reader-window.ts`, the rule documents already follow),
because a pop-up on a device with no tab strip is a window the reader cannot get out of.

### The PDF

`lib/nas-guide-pdf.ts`, built with jsPDF, which is imported dynamically so a reader who
never presses the button never downloads the library. It renders the same block types the
screen does — prose, numbered steps, monospace commands, tinted panels for notes, warnings
and checks, tables, and the reader's choices with what they chose — onto A4 with a cover
that lists every decision made so far. Skipped steps are collected at the end rather than
silently dropped, so the recipient can see what was deliberately left out.

jsPDF's built-in fonts are WinAnsi, so `ascii()` maps the handful of characters the guide
uses that fall outside it. Em dashes and middle dots survive; ticks and arrows are
substituted.


---

*Last updated: 2026-09-30*
