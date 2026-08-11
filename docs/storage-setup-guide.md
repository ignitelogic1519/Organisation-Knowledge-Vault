# storage-setup-guide.md — Connecting storage, from a laptop folder to a real NAS

> Practical companion to `docs/structure.md` §9. Part 1 turns a folder on your own laptop
> into a NAS you can test against today. Part 2 puts it on the internet with Cloudflare
> Tunnel. Part 3 is the version you hand to a customer with a real NAS.
>
> **Start with Part 1 and Track A.** It needs no Cloudflare account, no domain, no NAS, and
> nothing exposed to the internet. Get that working before adding anything else.

---

## Who this file is for, and where the customer-facing version lives

This document is written for **us** — the people building and testing Knowledge Vault. It
starts from a folder on a laptop because that is the fastest way to have something to test
against, and it spends most of its length on failure modes.

An **organization owner** connecting a real NAS does not want any of that. They get a
different artefact, and it is not this file:

| Surface | Where | What it is |
|---|---|---|
| **The guide window** | `/storage/guide`, opened from the storage form | Nine cards, one step at a time, with Next. Its own tab beside the form, full-screen on a phone. |
| **The handout** | "Download for your IT" on the same form and in the guide | The same nine steps as Markdown, for the owner to send to whoever administers the NAS. |
| **This file** | `docs/storage-setup-guide.md` | The long version: laptop testing, the tunnel, and every error message explained. |

**All three come from one place for the steps themselves.** The guide window and the
handout are both rendered from `apps/web/src/lib/nas-guide.ts` — the steps are data, so
the screen and the file cannot drift apart. Appendix A below is that same sequence in
prose, and **it is the thing to keep in step with the code when either changes.**

The division of labour that matters: an owner reads the guide, but the person who does the
work is usually somebody else — the IT contractor, the person who looks after the NAS —
and that person never signs in to Knowledge Vault at all. That is why the handout exists,
and why the guide's first card is about what a NAS *is* rather than about our form.

---

## What you are actually building

Three ideas, and the whole thing makes sense once these land.

**1 · "NAS" is not a magic box.** A NAS is a computer with disks that speaks a protocol
over the network. Your laptop is also a computer with a disk. The only thing your laptop is
missing is the software that speaks the protocol.

**2 · MinIO is that software.** You point MinIO at an ordinary folder and it serves that
folder over the **S3 API** — the same language Amazon S3 speaks. Files you put in through
MinIO appear as ordinary files in that folder. Nothing is locked away in a database.

```
   Knowledge Vault  ──speaks S3──►  MinIO  ──writes files──►  C:\kv-storage\
                                  (software)                 (an ordinary folder)
```

So **"turn a folder into a NAS" = "run MinIO pointed at that folder"**. That is the whole
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

### Step 2 · Install MinIO

Pick whichever line matches your machine. MinIO is a **single file** — there is no
installer and nothing to uninstall later; you delete the file when you are done.

**Windows (PowerShell):**
```powershell
mkdir C:\minio
Invoke-WebRequest -Uri "https://dl.min.io/server/minio/release/windows-amd64/minio.exe" `
                  -OutFile "C:\minio\minio.exe"
```

**Check the download before running it.** The file is around 100 MB. If it is a few KB, the
download failed and saved an error page instead — running that gives *"not a valid
application for this OS platform"*, which looks like an architecture problem but is not.

```powershell
(Get-Item C:\minio\minio.exe).Length / 1MB    # expect ~100, not ~0.01
```

If you prefer `curl.exe`, it **must** have `-L` or it will not follow redirects:
```powershell
curl.exe -L -o C:\minio\minio.exe https://dl.min.io/server/minio/release/windows-amd64/minio.exe
```

**macOS:**
```bash
brew install minio/stable/minio
```
or, without Homebrew:
```bash
curl -LO https://dl.min.io/server/minio/release/darwin-arm64/minio   # Apple Silicon
# curl -LO https://dl.min.io/server/minio/release/darwin-amd64/minio # Intel Mac
chmod +x minio
```

**Linux:**
```bash
curl -LO https://dl.min.io/server/minio/release/linux-amd64/minio
chmod +x minio
ls -lh minio     # expect ~100M — a tiny file means the download failed
```

**Docker (any OS, if you already have Docker running):**
```bash
docker run -d --name kv-minio -p 9000:9000 -p 9001:9001 \
  -e MINIO_ROOT_USER=kvadmin -e MINIO_ROOT_PASSWORD=kvadmin12345 \
  -v ~/kv-storage:/data \
  quay.io/minio/minio:latest server /data --console-address ":9001"
```

### Step 3 · Start it

Leave this window open — MinIO runs until you close it.

**Windows:**
```powershell
$env:MINIO_ROOT_USER="kvadmin"
$env:MINIO_ROOT_PASSWORD="kvadmin12345"
C:\minio\minio.exe server C:\kv-storage --console-address ":9001"
```

**macOS / Linux:**
```bash
export MINIO_ROOT_USER=kvadmin
export MINIO_ROOT_PASSWORD=kvadmin12345
minio server ~/kv-storage --console-address ":9001"
```

> The password must be at least 8 characters or MinIO refuses to start. `kvadmin12345` is
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

> **Use the command line for this, not the web console.** MinIO removed most management
> features from the open-source console during 2025 and moved them to the `mc` command.
> Depending on which build you downloaded, `localhost:9001` may have no *Create Bucket* or
> *Access Keys* buttons at all. Nothing is broken — the commands below work on every
> version, so they are the reliable path.

Open a **second** terminal (leave MinIO running in the first).

**Windows:**
```powershell
Invoke-WebRequest -Uri "https://dl.min.io/client/mc/release/windows-amd64/mc.exe" `
                  -OutFile "C:\minio\mc.exe"

C:\minio\mc.exe alias set local http://localhost:9000 kvadmin kvadmin12345
C:\minio\mc.exe mb local/knowledge-vault
C:\minio\mc.exe admin user svcacct add local kvadmin
```

**macOS / Linux:**
```bash
brew install minio/stable/mc        # or: curl -LO https://dl.min.io/client/mc/release/linux-amd64/mc && chmod +x mc

mc alias set local http://localhost:9000 kvadmin kvadmin12345
mc mb local/knowledge-vault
mc admin user svcacct add local kvadmin
```

The last command prints the two values you need. **Copy them now** — the secret is shown
only once:

```
Access Key: J8N2K4P6R8T0V2X4
Secret Key: aB3dE5fG7hJ9kL1mN3pQ5rS7tU9vW1xY3zA5bC7d
```

Check it worked:

```powershell
C:\minio\mc.exe ls local          # should list: knowledge-vault
```

Look in `C:\kv-storage` (or `~/kv-storage`) — there is now a `knowledge-vault` folder.
That is your bucket, sitting on your own disk.

A new MinIO bucket is **private** by default, which is what Knowledge Vault requires — it
refuses to connect a bucket the whole internet can read.

**You now have a working NAS on your laptop.** Everything from here is about connecting to
it.

---

## Track A — Test entirely on your laptop *(do this first)*

No Cloudflare, no tunnel, nothing on the internet. You run Knowledge Vault locally, and it
talks to MinIO across `localhost`.

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

Terminal 3 is MinIO from Step 3. Three windows, all running.

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

Now open `C:\kv-storage\knowledge-vault\objects\2026\08\` on disk.

There is a file ending in **`.kvblob`**. Try to open it — you cannot. It is not a PDF any
more; it is ciphertext. **That is the whole security promise, visible on your own disk:**
even standing on the storage itself, with full access to the machine, the document is
unreadable.

Now open the document inside Knowledge Vault. It renders perfectly — because your browser
fetched that `.kvblob` straight from MinIO and decrypted it locally, with a key our API
handed over your logged-in session.

### A5 · Prove the bytes bypass the server

This is worth seeing, because it is the entire economic argument.

1. Open your browser's **DevTools → Network** tab.
2. Open the document.
3. Look at the requests.

You will see a request to `localhost:9000` (MinIO) carrying the file, and a small JSON
request to `localhost:4000` (our API) carrying only the link and the key. **The file never
passes through the API.** On a real deployment that is bandwidth we never pay for.

### A6 · Try the failure case

Stop MinIO (Ctrl-C in its window), then reload the document in Knowledge Vault.

You should get a **"This document is waiting on your storage"** panel — not a red error,
not anything that looks like data loss. Because it is not: the file is still sitting in
your folder, we just cannot reach it.

Start MinIO again, press **Check connection** in the storage panel, and it recovers.

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
   Render API  ──►  Cloudflare  ◄──outbound connection──  cloudflared  ──►  MinIO
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

With MinIO still running, in a new window:

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
reaches MinIO and MinIO is refusing anonymous access, exactly as it should.

> **Quick tunnels are for testing only.** The URL is random and changes every time you
> restart cloudflared, and Cloudflare rate-limits them. For anything lasting, use a named
> tunnel on your own domain (Part 3).

### B3 · Tell MinIO its public address

MinIO checks that the address a request was signed for matches the address it is serving
on. Behind a tunnel those differ, so tell MinIO its public name. **Stop MinIO and restart
it** with the extra line:

**Windows:**
```powershell
$env:MINIO_ROOT_USER="kvadmin"
$env:MINIO_ROOT_PASSWORD="kvadmin12345"
$env:MINIO_SERVER_URL="https://random-words-here.trycloudflare.com"
C:\minio\minio.exe server C:\kv-storage --console-address ":9001"
```

**macOS / Linux:**
```bash
export MINIO_SERVER_URL="https://random-words-here.trycloudflare.com"
minio server ~/kv-storage --console-address ":9001"
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
docker run -d --name minio --restart unless-stopped \
  -p 9000:9000 -p 9001:9001 \
  -e MINIO_ROOT_USER=<strong-user> \
  -e MINIO_ROOT_PASSWORD=<strong-password> \
  -e MINIO_SERVER_URL=https://vault.their-company.com \
  -v /volume1/knowledge-vault:/data \
  quay.io/minio/minio:latest server /data --console-address ":9001"
```

`/volume1/knowledge-vault` is the shared folder on the NAS. On QNAP it is usually
`/share/...`; on TrueNAS, a dataset path.

**The differences from your laptop test:**

1. **A named tunnel, not a quick one.** They create a free Cloudflare account, add their
   domain, and run `cloudflared tunnel create` so the hostname is stable and theirs.
   Tailscale Funnel is an equally good alternative.
2. **A scoped access key**, not one with full access. In the MinIO console, create a policy
   limited to `GetObject`, `PutObject`, `DeleteObject` and `ListBucket` on that one bucket,
   and attach it to the key.
3. **Both containers set to restart automatically**, so a power cut does not silently take
   their documents offline.
4. **The NAS backed up.** Say this out loud to them: their NAS is now the only copy of
   their documents. Knowledge Vault keeps the catalogue — who may read what, who has
   completed what — but not the files. A NAS with one disk and no backup is a single point
   of failure for their training records.

Everything else — bucket, access key, connection test, encryption choice — is identical to
what you just did on your laptop.

---

## Troubleshooting

The connection test names the stage that failed. Match it here.

**PowerShell: "The specified executable is not a valid application for this OS platform"**
The downloaded file is not a real program — almost always a failed download that saved an
error page under the name `minio.exe`. Check its size:
```powershell
(Get-Item C:\minio\minio.exe).Length / 1MB     # ~100 = good, ~0.01 = failed download
```
Re-download with `Invoke-WebRequest` (Step 2), or with `curl.exe -L` — plain `curl.exe -o`
does **not** follow redirects and silently saves the redirect page instead of the binary.
If the file really is ~100 MB and you still get this, check whether you are on an ARM
Windows laptop: `$env:PROCESSOR_ARCHITECTURE`. `AMD64` is fine; `ARM64` needs Windows 11's
x64 emulation, and Docker is the easier route there.

**"Could not reach your storage at … "**
Nothing answered. Check MinIO is still running; check the address has no trailing slash;
check the port is `:9000` and not `:9001` (`9001` is the console, not the API). Behind a
tunnel, confirm the tunnel window is still open — quick tunnels die when you close the
terminal.

**"The secret access key is wrong, or your storage server's clock is out of sync"**
Usually a mistyped secret — retype rather than paste, in case of a stray space. If the
secret is definitely right and you are behind a tunnel, you almost certainly skipped **B3**
(`MINIO_SERVER_URL`). If neither, check your machine's clock; signatures are time-based and
a few minutes of drift breaks them.

**"That bucket does not exist on your storage"**
The name must match exactly, lowercase. Check it in the MinIO console under Buckets.

**"The access key exists but is not allowed to do this on that bucket"**
The key's policy is too narrow. For a laptop test, make a new key with the policy left
blank. For a real setup it needs `GetObject`, `PutObject`, `DeleteObject` and `ListBucket`.

**"This bucket is publicly readable"**
Someone set the bucket's access policy to public. We refuse to connect it, because a public
bucket would make every permission rule in Knowledge Vault decorative. In the console set
the bucket's Access Policy back to **Private**.

**Connection test passes, but uploading a document fails**
Almost always CORS — the browser is being blocked from talking to MinIO directly. MinIO
allows all browser origins by default, so this usually means someone set
`MINIO_API_CORS_ALLOW_ORIGIN`. Either unset it, or set it to your web app's address:
```bash
export MINIO_API_CORS_ALLOW_ORIGIN="http://localhost:3000"
```
The storage setup screen has a **Show setup steps** section with the exact rules if your
storage needs them written out.

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
Vercel-hosted app at MinIO on your laptop. Either run the web app locally too (Track A), or
put MinIO behind a tunnel so it has an HTTPS address (Part 2). The two halves have to match.

---

## Cleaning up after the test

```bash
# stop cloudflared and MinIO with Ctrl-C in their windows
```

Then delete the `kv-storage` folder and the MinIO binary. Nothing was installed into your
system, and nothing was left running.

In Knowledge Vault, delete the test documents **before** removing the storage, so the
delete queue can clean the objects out of the bucket properly.


---

## Appendix A — The owner's path, in nine steps

This is what the guide window (`/storage/guide`) and the downloaded handout contain, in
the same order. Parts 1–3 above are how *we* test and what *we* explain; this is the
sequence a customer actually walks, once, on real hardware.

Keep this appendix and `apps/web/src/lib/nas-guide.ts` in step. The file is the source the
UI renders; this is the reviewable prose version.

**Before they start.** A machine that stays on, Docker on it, administrator access to it,
a free Cloudflare account with a domain, and a backup of the NAS. The last one is stated
as a prerequisite rather than a footnote on purpose: their storage becomes the only copy
of their documents, and a NAS with one disk is a single point of failure for their
training records.

1. **What you are actually building.** A NAS is a computer with disks; MinIO is the
   program that lets other software read and write a folder on it over the network; and
   our API runs in a datacentre, so it cannot see anything on their office LAN. Everything
   else follows from those three sentences.
2. **Run MinIO on the machine.** One Docker container, `--restart unless-stopped`, mounted
   on the shared folder they chose. The master credentials they set here are never given
   to Knowledge Vault.
3. **Create the bucket.** One bucket, lowercase, left private. We refuse to connect a
   public one, because a public bucket makes every permission rule in the app decorative.
4. **Create an access key.** A service account scoped to that one bucket with
   `GetObject`, `PutObject`, `DeleteObject`, `ListBucket`. The secret is displayed once.
5. **Give the storage an HTTPS address.** A Cloudflare Tunnel, because the connector makes
   an *outbound* connection and nothing needs opening on their firewall. The guide is
   explicit that port forwarding is the wrong answer, and why.
6. **Tell MinIO its public address.** `MINIO_SERVER_URL`, set to the tunnel hostname. This
   is the single most common failure, and the error it produces — `SignatureDoesNotMatch`
   — points at the password, which is never the problem.
7. **Apply the CORS rules.** Generated by `corsRulesFor(webOrigin)` so the rules name that
   deployment and nothing else. Recent MinIO builds allow all origins by default, so this
   is a no-op as often as not; the guide says so rather than presenting it as mandatory.
8. **Enter the four values and test.** Address, bucket, key, secret, and the encryption
   choice — which is fixed at activation and says so.
9. **Before calling it done.** Reboot the NAS and re-test (do both containers really come
   back?), set up and *test* a backup, write down who holds the master password, and run
   the migration if documents were uploaded before storage was connected.

### Where this appears in the product

- **Creating an organization** — `/orgs/new`, in the NAS branch of "Where your documents
  will live".
- **Connecting or reconfiguring storage** — the storage panel on the root branch's Group
  configuration.

Both render `StorageSetupFields`, so the entry card lives there once and shows up in both
places automatically. The guide opens in a new tab on a desktop and navigates in place on
a phone (`openStorageGuide()` in `lib/reader-window.ts`, the same rule documents follow),
because a pop-up on a device with no tab strip is a window the reader cannot get out of.


---

*Last updated: 2026-08-11*
