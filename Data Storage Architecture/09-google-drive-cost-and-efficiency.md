# 09 — Google Drive: what it costs, and how efficient it is

*Written 2026-09-29, in answer to the owner's question: how efficient is the design in
document 07, what will it cost, and can it be free? The owner's instruction was **free if
possible — and say so plainly if a cost is unavoidable.** Prices and allowances were checked on
2026-09-29 (sources at the end); hosting providers change them without much notice, and two of
the ones below changed in 2026.*

---

## The answer

**Yes, it can run at $0.**

Google charges nothing for the Drive API within its quotas, nothing for the sign-in client, and
nothing for keyless federation. The storage is the customer's own. Only one fact in the design
cannot be avoided: **Drive's bytes must pass through a server we run** (document 07, §1). So
that server has to live somewhere with free bandwidth — and **our current API host is not that
place.**

The free arrangement:

| Part | Where it runs | What it carries | Cost |
|------|---------------|-----------------|------|
| **Control plane** — the API | Render, free plan, **unchanged** | Tickets and keys: a few kilobytes per document opened | $0 |
| **Data plane** — the streaming gateway | **One Oracle Cloud Always Free VM** | Every byte uploaded to or streamed from Drive | $0 up to **10 TB a month** |
| **Stream client** — the service worker | The reader's browser, served by Vercel as today | A few kilobytes of script | $0 |
| **Google** — Drive API, sign-in client, federation | Google | API calls | $0 within quota |
| **The files themselves** | The customer's Google Drive | Their documents | **Theirs**, not ours: 15 GB free on a personal account, pooled storage on Workspace |

---

## The one trap: streaming through the API on Render's free plan

Render's free (Hobby) plan has included **5 GB of outbound bandwidth a month** since April 2026 —
down from 100 GB. When it runs out:

- **With no payment method on file, Render spins down every service in the workspace until the
  start of the next month.** Not the streaming — *the whole product*: sign-in, the
  Constellation, compliance, everything.
- With a card on file, each further GB costs $0.15.

Five gigabytes is fifty views of one 100 MB induction video. So:

- **The gateway never runs inside the API in production.** The in-process gateway in document
  07, §8.3 is for a developer's machine only. The first release uses the separate free VM.
- **This trap exists today, independent of Drive.** The API already sends every JSON response,
  and it serves the files of KVEP organizations and of organizations without their own storage
  — up to 10 MB each — straight out of Postgres. Five hundred opens of one 10 MB file is 5 GB.
  Either a card on file (turning a shutdown into a small bill) or a byte meter that warns at 60%
  of the month's allowance should be in place whether or not Drive ships. **That is a decision
  for the owner, and it is question 18.**

---

## When a cost *would* become unavoidable

Three situations, none of them near:

1. **More than 10 TB a month of Drive traffic, across all organizations together.** That is
   about 100,000 views of a 100 MB video. Beyond it, Oracle bills outbound traffic at its
   published rate — under a cent per GB in most regions at the time of writing. Until then, the
   gateway is built to **stop at the allowance, not bill past it** (below).
2. **If Oracle's free VM is not an option** — no capacity in the chosen region, no wish to put a
   card on an Oracle account, or a policy against it. The fallback is a small virtual server that
   bundles terabytes of traffic into its price: typically $4–7 a month.
3. **If Google starts billing for calls over quota** — it has said that is planned for later in
   2026. The quota governor (document 07, §9) keeps every organization under its limits, so this
   costs nothing unless we deliberately raise them.

**Optional, never required:** a custom domain (about $10–15 a year) lets Google show Knowledge
Vault's name and logo on its sign-in consent screen through brand verification. Without it,
connecting still works — `drive.file` is a non-sensitive scope, so Google requires no review
and imposes no user cap.

### The Oracle account, in two sentences

The Always Free tier gives **10 TB of outbound traffic a month**. Its Arm VM allowance was halved
in June 2026 to 2 cores and 12 GB of memory on free accounts — still far more than a gateway
needs, because a gateway's limit is its network, not its processor or memory.

Two things to know. Oracle may **reclaim a free VM it judges idle** (under 20% processor,
network and memory use over a week), and a quiet gateway can look idle. **Upgrading the account
to pay-as-you-go** stops that, keeps the same free allowances (4 cores and 24 GB for
pay-as-you-go accounts), and bills only usage beyond them. It needs a card on file, so it should
come with a **budget alert at $1** — a tripwire that tells us the day anything starts to cost
money.

---

## Staying free on purpose

A free allowance only stays free if something stops before it runs out. The design adds three
guards:

1. **A monthly byte budget** — global, and per organization — metered at the gateway, counting
   both directions that leave it (uploads going to Google and streams going to browsers).
   Owners and the Knowledge Base team are warned at 60%, 80% and 95%.
2. **At 100%, the gateway pauses instead of billing.** New streams and uploads are refused with
   a plain message until the 1st; documents already open finish; nothing else in the product is
   affected, because the API is on a different machine. A paused feature, never an invoice.
3. **Nothing spends bandwidth twice.** Encrypted documents are kept, still encrypted, in the
   reader's own browser cache for a week, so re-opening one costs no bandwidth at all. (The keys
   are never stored, so the cache is as safe as the encrypted file in Drive.)

---

## How efficient it is — in plain numbers

**Against NAS, honestly: NAS stays the most efficient backend.** On NAS the browser talks to
the storage directly and nothing passes through us. Drive adds one hop — browser, then our
gateway, then Google — and that is the price of using a drive.

**Against today's viewer, Drive's design is far faster**, because it streams instead of
downloading the whole file first:

| What happens | Today (whole file, 4 MB frames) | The Drive design |
|--------------|---------------------------------|------------------|
| Waiting to start a 100 MB video, 20 Mbps connection | The whole file downloads first: about **42 s** | **0.10 s** of transfer for the first 256 KB frame, plus Drive's own 0.15–0.5 s — **under 1.5 s** to play |
| The same on a 5 Mbps phone connection | About **2 min 48 s** | **0.42 s** for the first frame, plus Drive's own time |
| Jumping to minute 30 | Only after the whole file has downloaded | **Under a second** — only the frames needed are fetched |
| Memory in the reader's phone for a 200 MB video | 200 MB or more — can crash the tab | About **16 MB**, whatever the file size |
| Memory on our server per viewer | — | About **64 KB** |
| A thousand people watching the same encrypted video | — | Google is asked for each part **once**; our cache serves the rest |
| Someone re-opening an encrypted document | — | **Nothing downloaded** — it is already in their browser |

### What 10 TB a month buys

| What people open | Typical size | Opens per month inside 10 TB |
|------------------|--------------|------------------------------|
| A 10-minute HD induction video | 100 MB | about **100,000** |
| A 45-minute HD training video | 450 MB | about **23,000** |
| An audio briefing | 20 MB | about **500,000** |
| A PDF manual | 5 MB | about **2,000,000** |

Uploads count as well — each uploaded file leaves the gateway once, on its way to Google.

**A worked example.** An organization of 200 people, each opening about 150 MB a month (one
induction video and a handful of PDFs), with 2 GB of new uploads: about **31 GB a month**.

- On the Oracle gateway: **0.3%** of the free allowance. **$0.**
- Through the API on Render's free plan: the 5 GB would run out in the **first week**, and the
  whole product would go offline for the rest of the month — or, with a card on file, about
  **$4 a month** for this one organization, rising with every organization added.

---

## What this changes in the design

- **Question 11 — where the gateway runs:** on one Oracle Cloud Always Free VM, from the first
  release. Never inside the API in production.
- **Question 16 — who pays for bandwidth:** nobody, up to 10 TB a month; the per-plan allowance
  becomes each organization's share of that free budget, so one organization cannot spend
  everyone else's.
- **Question 18 (new) — the Render trap that exists today:** a card on file, a byte meter, or
  both.
- **Document 08** gains row H8: the API host's bandwidth runs out and the whole product goes
  offline.
- **Document 07** is corrected in two places: the gateway's hosting (§8.3), and Google's sign-in
  review — `drive.file` needs none (§3.2).

---

## Sources

Checked on 2026-09-29.

- Render's free bandwidth, the April 2026 cut, and what happens when it runs out —
  [Render: outbound bandwidth](https://render.com/docs/outbound-bandwidth),
  [Render: updated workspace plans](https://render.com/changelog/updated-plans-for-render-workspaces),
  [a report on the change](https://bex.co/blog/2026/07/09/render-april-2026-repricing-egress-cut-self-hosting-cost)
- Oracle Cloud Always Free — [Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm),
  [free tier FAQ](https://www.oracle.com/cloud/free/faq/),
  [the June 2026 halving of the Arm allowance](https://www.infoq.com/news/2026/07/oracle-cloud-free-tier-limits/)
- Drive API cost and quotas — [Workspace API usage limits](https://developers.google.com/workspace/docs/api/limits),
  [Drive API usage limits](https://developers.google.com/workspace/drive/api/guides/limits)
- Scope review — [Google's unverified-apps rules](https://support.google.com/cloud/answer/7454865),
  [sensitive-scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification)

---

*Last updated: 2026-09-29*
