# 08 — Google Drive: every bad case, and how we protect ourselves

*The failure register for the design in `07-google-drive-architecture.md`. Written 2026-09-29;
nothing here is built. Each row names what goes wrong, how likely and how costly it is, how we
find out, and what prevents or contains it — tagged with the phase (§16 of document 07) in which
that protection lands.*

---

## How to read this

**Likelihood** is over the life of one organization's connection: **Low** (rare, or needs an
unusual setup) · **Medium** (will happen to some customers) · **High** (will happen to most,
eventually).

**Impact** is what the organization feels: **Low** (one document, or a slow moment) ·
**Medium** (a feature stops, nothing is lost) · **High** (nobody can open documents until someone
acts) · **Critical** (data exposed or lost).

**Three rules apply to every row**, so they are not repeated:

1. **A storage failure is never presented as data loss** (§9.8). The viewer names the problem and
   who can fix it.
2. **Compliance never accuses anyone of missing a deadline for a document they could not open.**
   A degraded organization's deadline, overdue and escalation processing pauses (§9.8).
3. **An exam sitting never loses an attempt to our storage.** The paper is cached for the
   sitting; if storage fails before it is dealt, no attempt is consumed (§9.9).

---

## The ten that matter most

Ranked by likelihood × impact, and by how expensive each would be to discover in production.

| Rank | # | The bad case | Why it ranks here |
|------|---|--------------|-------------------|
| 1 | A1 | The connected account's refresh token stops working | It *will* happen to most Mode A organizations eventually, and every document stops opening at once |
| 2 | I1 | Knowledge Vault disappears and an encrypted organization cannot recover | Total, permanent loss — and the recovery chain it depends on is not wired today |
| 3 | E1 | A PLAIN file is shared publicly from Drive | Confidential content exposed with no involvement from us at all |
| 4 | A2 | The person whose account holds the files leaves | Personal ownership is the default for My Drive, and people leave |
| 5 | B2 | Google's rate limits hit during the 9 a.m. induction | The busiest moment is exactly when the quota is exhausted |
| 6 | C1 | Someone uploads a new version of one of our files in Drive | Silent content substitution, if reads were not pinned |
| 7 | D1 | Someone trashes the folder | One drag in the Drive UI takes the whole organization offline |
| 8 | H3 | Our platform is breached | Every connected organization's Knowledge Vault files become reachable |
| 9 | F3 | The gateway runs out of memory or connections | One overloaded instance fails every organization's streams together |
| 10 | B1 | Their Drive fills up | Especially personal accounts, where 15 GB is shared with Gmail and Photos |

---

## A · Access and identity

| # | What goes wrong | L · I | How we find out | Prevention, and what happens when it does | Phase |
|---|-----------------|-------|-----------------|-------------------------------------------|-------|
| A1 | **The refresh token stops working.** The person removed our access in their Google account; their account was deleted or suspended; the token went six months unused; the account passed 100 live tokens for our client and Google silently dropped the oldest; or the OAuth app was left in *Testing*, where tokens die after seven days | High · High | Refresh returns `invalid_grant` — on the next read, or at the latest on the nightly health check | The app is **published to production before launch** (the seven-day case never occurs). The nightly health check uses the token, so it never idles for six months. Reconnecting **revokes the old token first**, so reconnection cannot drift towards the 100-token limit. On failure: `DEGRADED(AUTH_REVOKED)` immediately, high-priority message to owners, and a **Reconnect Google** button (Supreme-gated) that keeps the folder and every file ID — nothing is re-uploaded | G1 |
| A2 | **The person whose account holds the files leaves.** In My Drive, the files are owned by a person; when their Workspace account is deleted, the admin may transfer or drop them | Medium · High | The token fails (A1); then files go missing (D2) | **Prevention is placement.** Setup detects a Workspace account (`hd` claim) and steers it to a Shared Drive, where files belong to the drive. Choosing My Drive on Workspace requires ticking a sentence that says the files leave with the person. Recommended practice: connect a dedicated account such as `knowledge-vault@acme.com`. With a Shared Drive, any other member reconnects in a minute | G1 |
| A3 | **A Workspace admin blocks third-party apps**, or restricts which apps may use Drive, before or after connection | Medium · High | Consent returns `admin_policy_enforced` / `access_denied`; an existing token starts failing | The connection test names the policy, not "could not connect". The Workspace setup guide gives the admin our OAuth client ID to mark as trusted — before anyone tries to connect | G1 |
| A4 | **A service-account key is required and key creation is blocked** by organization policy | — | — | Does not arise. We never ask for service-account keys (document 07, §3.4) | — |
| A5 | **Mode B is misconfigured** — wrong audience, attribute condition, missing `workloadIdentityUser` binding, or the service account is not a member of the Shared Drive | Medium · Medium | The connection test runs each hop separately — token exchange, impersonation, drive access — and names the one that failed | Setup generates every command with the organization's number and our issuer filled in; the customer copies rather than composes | G3 |
| A6 | **The customer revokes Mode B** by deleting the binding or provider — deliberately or by an over-eager cleanup | Low · High | Token exchange or impersonation refused | As A1, with the message naming their GCP project as the place it changed | G3 |
| A7 | **Our federation signing key leaks** | Low · Critical | Our own incident response | The key lives in the environment, never the database; tokens it signs live five minutes and name one audience. An attacker would also need each customer's provider name and service-account email. Rotation publishes a new key beside the old and then withdraws the old; JWKS is **hosted** (static, on the web origin) rather than uploaded wherever the customer allows, so rotation needs nothing from them | G3 |
| A8 | **Confused deputy** — organization A points Knowledge Vault at organization B's folder or drive | Low · Critical | — | Mode A: impossible without B's Google sign-in. Mode B: B's provider accepts only `sub = kv-org:B`. Both: **one folder, one organization** — a unique constraint on the connected root folder, so a second organization claiming it is refused | G1 |
| A9 | **One Google account connects two organizations.** `drive.file` access is per account and app, not per organization, so one token can see both organizations' files | Low · High | Commit and reconciliation check each file's `kvOrg` property | Every write takes its parent from the organization's own stored folder IDs; every commit checks the file carries this organization's property; every ticket names a file ID from our database only. A mismatch is refused and audited | G1 |
| A10 | **Context-aware access or IP rules** in their Workspace refuse calls from our servers | Low · High | A policy `403` during the test | Named in the test. The Workspace guide publishes the gateway's and API's egress addresses for the admin to allow | G2 |
| A11 | **External members cannot be added to the Shared Drive**, so a Mode B service account (external to their domain) cannot join | Medium · Medium | Adding it fails on their side; our test sees no drive access | The guide explains both answers: a sharing exception or trust rule for that one account, or Mode A with an internal dedicated account — which needs no external sharing at all | G3 |
| A12 | **Our OAuth app is unverified** — users see a warning screen, and at most 100 users can connect | High · Medium (at launch) | Before launch | Brand verification is a launch gate for G2. `drive.file` needs only brand verification, not a security assessment | G2 |
| A13 | **An account in Google's Advanced Protection Program** cannot grant access to most third-party apps | Low · Low | Consent refused | The message says so and suggests a Shared Drive connected through a different account | G1 |
| A14 | **Our role is downgraded** — Content Manager to Contributor or Viewer — so writes or deletes fail while reads work | Low · Medium | The health check reads the root folder's capabilities (can add children, can trash) | `DEGRADED(PERMISSION)` naming the missing capability; reads continue, uploads pause | G1 |

## B · Quotas and limits

| # | What goes wrong | L · I | How we find out | Prevention, and what happens when it does | Phase |
|---|-----------------|-------|-----------------|-------------------------------------------|-------|
| B1 | **Their Drive is full.** Personal accounts share 15 GB across Gmail, Photos and Drive; Workspace pools storage across the organization | High · Medium | Drive's `about` call before each upload ticket (cached five minutes) and nightly; `storageQuotaExceeded` on upload | An upload that cannot fit is **refused before a byte is sent**, with the numbers. Owners are messaged at 80%, 90% and 95%. At 100%: `DEGRADED(QUOTA_FULL)` for uploads only — every document still opens | G1 |
| B2 | **Rate limits** — per identity and per project, in Google's quota units, where a download costs far more than a metadata read | Medium · Medium | `429`, `rateLimitExceeded`, `userRateLimitExceeded` | A per-organization token bucket with priorities (people reading → people uploading → migration → reconciliation); 8 MiB coalesced ranges; the ciphertext cache; Google's truncated exponential backoff with jitter. Limits are **configuration**, not constants. **Rate limiting never degrades an organization** — it makes it slower, and says so | G1, cache G2 |
| B3 | **The sustained-write ceiling** — about three writes a second per account — hit by a bulk upload, a migration or map rewrites | Medium · Low | `403` rate-limit responses on writes | A per-organization write queue at two a second; folder IDs cached; map rewrites debounced | G1 |
| B4 | **750 GB a day** uploaded per account — a large migration stops for the rest of the day | Medium · Low | Upload-limit errors | Migration runs to a daily budget below the cap, leaving headroom for people's own uploads; resumable; the storage panel shows progress and an honest finish date | G4 |
| B5 | **A popular file is locked by Google** for about a day (`downloadQuotaExceeded`) — the whole company opening one induction video | Medium · Medium | That error from Drive | ENCRYPTED: the cache means Drive sees about one read per slice per gateway, however many people watch. PLAIN: the gateway copies the file once to a fresh ID, verifies the hash, repoints the course and queues the old file for deletion; if even that fails, the viewer explains that Google has temporarily limited this one file | G2 |
| B6 | **The Shared Drive reaches 500,000 items**, trash included | Low · High | Our own object count | Warn owners at 80%. Each object is one item plus a handful of month folders, so this is roughly 400,000 documents away — but trash counts, so a Manager emptying trash is the first remedy | G1 |
| B7 | **Our own project's quota** is exhausted by many organizations at once — in Mode A they all share it | Medium · High | Project-level quota alerts at 70% | A global governor gives each organization a fair share; a quota increase is requested before general availability; Mode B organizations count against their own project | G2 |
| B8 | **Our bandwidth bill grows with streaming** — unlike NAS, we pay for every byte | High · Medium (to us) | Bytes served per organization | ENCRYPTED cache hits cost Drive nothing and us only the last leg; a per-plan gateway transfer allowance is question 16 | G2 |

## C · Integrity and tampering

| # | What goes wrong | L · I | How we find out | Prevention, and what happens when it does | Phase |
|---|-----------------|-------|-----------------|-------------------------------------------|-------|
| C1 | **A new version is uploaded over one of our files** in Drive ("Manage versions") | Medium · High | Nightly: the head revision is not our pinned revision | **Reads fetch the pinned revision**, marked keep-forever at commit, so the substitute is never served. Owners are told what changed and when, with a one-click restore of the pinned revision to head | G1 |
| C2 | **A sync client rewrites a file** — Drive for desktop on someone's laptop | Low · High | As C1 | As C1. The Shared Drive should have as few human members as possible — ideally one or two administrators — because nobody needs membership to *read* through Knowledge Vault | G1 |
| C3 | **Corruption** in transit or at rest | Low · Medium | Upload: Drive's SHA-256 against ours. Read: frame authentication (ENCRYPTED), size and whole-file hash (PLAIN) | A corrupted read is an integrity error naming the document — never a broken PDF (§9.4). An upload that does not match is never committed | G1 |
| C4 | **A tampered `.kvblob` header** — size, frame size, nonce, type | Low · High | The header disagrees with the database | The database is the authority: facts recorded at commit travel with the ticket, and a disagreeing object is refused | G0 |
| C5 | **Two of our objects are swapped** — renamed or moved into each other's place | Low · Medium | Decryption fails (keys are bound to their object key); sizes differ | We address files by ID and never by name or path, so a rename or move changes nothing; a swap fails loudly | G1 |
| C6 | **A retried upload creates a duplicate** | Medium · Low | — | File IDs are generated before the session opens, so the second create meets "already exists" and commit verifies the one file there | G1 |
| C7 | **An upload is abandoned** — tab closed, network gone, laptop asleep | High · Low | A pending record older than a day | The browser resumes from Google's confirmed offset while it can; afterwards reconciliation finds the file by its property and queues it for deletion; Google expires the session | G1 |
| C8 | **The map is edited or replaced** | Low · Low | Its Ed25519 signature | Unchanged from §9.7: a tampering message to owners, a rewrite from our database, and access unaffected either way. Drive's own revision history keeps the edited copy for 30 days, for the investigation | G1 |

## D · Deletion, retention and erasure

| # | What goes wrong | L · I | How we find out | Prevention, and what happens when it does | Phase |
|---|-----------------|-------|-----------------|-------------------------------------------|-------|
| D1 | **Someone trashes our files — or the whole Knowledge Vault folder** | Medium · High | The gateway meets a trashed file; the health check meets a trashed root; nightly reconciliation | We **untrash what we did not delete**, automatically, and tell the owners — with a pointer to Drive's activity log to see who. A trashed root is `DEGRADED(ROOT_MISSING)` only until the untrash succeeds, usually within one health check | G1 |
| D2 | **Files are permanently deleted** — trash emptied by a Manager, or the account deleted | Low · Critical | `404` on the file | The affected courses show *"this document was deleted from your Google Drive"*, never a generic error. On Workspace, owners are told the admin console can restore recently deleted data for a limited window, and how. The belt-and-braces export (document 06, risk 4) is the real protection | G1 |
| D3 | **Our deletion lands in trash**, not the shredder. In a Shared Drive, a Content Manager can only trash; Google purges trash after 30 days, and only a Manager can purge sooner | High · Low | — | Said honestly in the map, the setup screen and the deletion documentation: deleted documents leave the Shared Drive's trash within 30 days, or at once if a Manager empties it. We do not ask for the Manager role to shorten that — it would also let us change the drive's membership (question 14). In My Drive, the account owner's delete is permanent | G1 |
| D4 | **Google Vault retention or a legal hold** keeps copies after deletion | Medium · Low | — | Stated honestly: we delete our copy and issue the delete to their Drive; their retention policies are theirs to honour | G1 |
| D5 | **A course is deleted while someone is watching it** | Low · Low | The next range request fails | The ticket already issued stays valid to its expiry, and the delete is queued, so the worker says *"this document was removed"* rather than stalling | G1 |
| D6 | **The organization is purged** after its 30-day retention | Low · Low | — | Their files stay in their Drive, as §9.10 already promises; we **revoke our token at Google** and drop the sealed credential, so we keep no access to storage we no longer serve | G1 |

## E · Confidentiality and privacy

| # | What goes wrong | L · I | How we find out | Prevention, and what happens when it does | Phase |
|---|-----------------|-------|-----------------|-------------------------------------------|-------|
| E1 | **A PLAIN file is shared publicly from Drive** — *anyone with the link*, or the whole domain | Medium · Critical | Nightly permission check on our files | Prevented by the posture choice: ENCRYPTED makes a shared link useless. For PLAIN: `copyRequiresWriterPermission` on every file, minimal Shared Drive membership, the drift check messaging owners, and an optional setting that removes such permissions automatically | G1 |
| E2 | **PLAIN documents cross our gateway readable** — a change from NAS, where we never see bytes | Certain · Medium | — | Said before the choice is made (document 07, §4). Memory only; never cached, never logged; TLS on both legs | G1 |
| E3 | **Drive's search and AI features read PLAIN files** for anyone with folder access | Certain · Medium | — | Part of the PLAIN sentence at setup. ENCRYPTED files give them nothing to read | G1 |
| E4 | **Metadata of ENCRYPTED objects** — counts, sizes, dates, read frequency — is visible to their admins and to Google | Certain · Low | — | Accepted and documented. Names and properties are content-free; the only readable file is the map, which §9.7 makes readable on purpose, and the setup screen says so | G1 |
| E5 | **A Google token reaches a browser** | — | — | Never. The one exception is the Picker during setup, which receives a short-lived token for the signed-in owner's *own* account, never the stored refresh token | G1 |
| E6 | **A ticket leaks** — copied from developer tools, logged by a proxy, sent to a colleague | Medium · Low | — | One object each; ten minutes; in a header rather than a URL wherever a service worker is present; `no-referrer`; issuance rate-limited per profile; the per-organization epoch revokes every outstanding ticket at once | G1 |
| E7 | **Hostile PLAIN content** — an HTML or SVG file that would run script | Medium · High | — | The gateway serves from its own cookieless origin, with `nosniff` and a sandbox CSP; anything not on the safe inline list is served as an attachment | G1 |
| E8 | **Script injected into our app** reads a file key or plaintext from the page | Low · High | — | A file key opens one object and lives only in memory. Script injection is still total compromise of what *that reader* may see, as it is today — the defence is the app's content-security policy and input handling, not storage | — |
| E9 | **Residency** — bytes transit the gateway's region, which may differ from their Drive's data region | Medium · Medium | — | ENCRYPTED: only ciphertext transits. PLAIN: stated. Pinning an organization to a gateway region is an enterprise option once the gateway is its own service | G2 |
| E10 | **Logs leak titles** — a PLAIN file name in an access log | Medium · Medium | — | The gateway logs IDs, sizes and timings, never names. The API already audits storage actions without credentials; the same rule extends to names | G1 |

## F · Availability and performance

| # | What goes wrong | L · I | How we find out | Prevention, and what happens when it does | Phase |
|---|-----------------|-------|-----------------|-------------------------------------------|-------|
| F1 | **Google Drive has an outage** or a partial one | Low · High | `5xx`, timeouts | Idempotent reads retried with jitter; **hysteresis** — transient failures degrade an organization only after 15 minutes of consecutive failure, so a blip does not pause compliance; cached ENCRYPTED slices keep serving through short outages | G1, cache G2 |
| F2 | **Drive is slow** — 200–500 ms before its first byte | High · Low | Gateway timings | Warm connections and cached tokens; a prefetch of the first slice when the ticket is issued; small frames; the cache | G1–G2 |
| F3 | **The gateway is overwhelmed** — memory or connections on a 512 MB instance | Medium · High | Concurrency and memory metrics | Streams, never buffers (≈ 64 KiB per stream); global and per-organization caps answered with `503` and `Retry-After` rather than a collapse; its own service before general availability | G1, G2 |
| F4 | **The free API instance is asleep** when the first reader of the morning arrives | High · Low | — | Exists today for every request. The gateway becomes an always-on service in G2; ticket issuance stays on the API | G2 |
| F5 | **Token refresh stampede** — a hundred readers arrive as the access token expires | Medium · Low | — | One refresh in flight per organization; refreshed ten minutes before expiry | G1 |
| F6 | **An MP4 with its index at the end** plays only after its end is fetched | Medium · Low | Detected at upload | The browser moves the index to the front before encrypting; if it cannot, the author is told the video will start slowly | G1 |
| F7 | **Storage fails mid-exam** | Low · High | — | §9.9 unchanged: the paper is fetched when dealt and cached for the sitting; an attempt is never consumed by a storage failure | G4 |
| F8 | **Listing a large folder is slow** | — | — | Nothing on a hot path ever lists. Only reconciliation does, paginated and throttled at night | G1 |

## G · The browser streaming client

| # | What goes wrong | L · I | How we find out | Prevention, and what happens when it does | Phase |
|---|-----------------|-------|-----------------|-------------------------------------------|-------|
| G1 | **No service worker** — some private-browsing modes, a browser policy, or the first load before it activates | Medium · Medium | Registration fails | The fallbacks in document 07, §7.5: direct gateway URL for PLAIN; whole-object decrypt up to a size cap for ENCRYPTED; a plain explanation above it | G0 |
| G2 | **The service worker is stopped mid-playback** — browsers do this to idle workers | High · Low | A request arrives for a stream the worker no longer knows | Keys are never persisted; the worker asks the page again over a message channel, and the page asks the API if it must. Each range response is bounded, so no single worker event runs long | G0 |
| G3 | **Safari, iOS or the Android WebView** handle worker-served ranges differently | Medium · Medium | Spike S5, then the fallback-rate metric by browser | The fallbacks; per-browser fixes found in S5 before G1 | G0 |
| G4 | **A phone runs out of memory** | Low · High | — | Never more than one window in memory, on upload and on read; the whole-file fallback is capped at 64 MB on phones | G0 |
| G5 | **The device clock is wrong** | Medium · Low | — | Nothing in the browser evaluates expiry; tickets are checked by the gateway's clock against the API's | G1 |
| G6 | **Existing NAS buckets do not expose `Content-Range`** to browsers, so range streaming on NAS cannot see the range it received | High · Low | The worker cannot read the header | The worker falls back to whole-object reads for that bucket. The CORS rule we generate adds `Content-Range` and `Accept-Ranges`, and NAS owners are asked to re-apply it when streaming reaches NAS | G0 |

## H · Our own platform and operations

| # | What goes wrong | L · I | How we find out | Prevention, and what happens when it does | Phase |
|---|-----------------|-------|-----------------|-------------------------------------------|-------|
| H1 | **`STORAGE_KEK` is lost** | Low · High | Unsealing fails | Refresh tokens become unusable — owners reconnect Google, nothing is re-uploaded. Data keys become unwrappable — recovered through `.main` once the chain in document 07, §11 exists. Back it up outside the host, as `render.yaml` already says | G0 |
| H2 | **Our database is breached** | Low · High | Our own incident response | Refresh tokens are sealed with a key that is not in the database; tickets are never stored; Mode B stores nothing secret. A database dump alone reaches no customer's Drive | G1 |
| H3 | **Our database *and* environment are breached** | Low · Critical | Our own incident response | Blast radius is bounded by design: Mode A tokens reach **only Knowledge Vault's own files** (`drive.file`), never the rest of anyone's Drive; ENCRYPTED contents also need the data keys. Then the revocation drill below, and every ticket epoch bumped | G1 |
| H4 | **A bug writes into another organization's folder** | Low · Critical | Commit and reconciliation property checks | Parents always come from the organization's own stored folder IDs; the `kvOrg` property is verified on commit; contract tests cover cross-organization isolation explicitly | G1 |
| H5 | **Google changes the Drive API** or its quota model | Medium · Medium | The nightly canary; Google's release notes | Pinned to v3; limits in configuration; the canary runs every night against real accounts | G1 |
| H6 | **Tests pass and production fails** — the classic storage bug | Medium · High | — | A fake Drive with injectable failures, contract tests, the nightly canary, and chaos drills before each phase ships (document 07, §16) | G1 |
| H7 | **We cannot see it going wrong** | Medium · High | — | The metrics in document 07, §15, per organization and global, with alerts on error rate, quota consumption, fallback rate and degraded organizations | G2 |

## I · Lifecycle, custody and exit

| # | What goes wrong | L · I | How we find out | Prevention, and what happens when it does | Phase |
|---|-----------------|-------|-----------------|-------------------------------------------|-------|
| I1 | **Knowledge Vault disappears** | Low · Critical | — | PLAIN: the files are in their Drive and the map says what each one is. ENCRYPTED: **needs the recovery chain** — wrapped keys in each header, the data key escrowed in `.main`, the standalone decrypt tool. Not wired today (verified); question 12 recommends it before ENCRYPTED ships on Drive | G0 |
| I2 | **They want to move from Drive to NAS**, or the other way | Medium · Low | — | Storage-to-storage migration copies ciphertext **verbatim**: object keys are preserved, so file keys stay valid and nothing is re-encrypted. Resumable, verify-then-repoint, the old copy deleted last | G4 |
| I3 | **They want to change posture** | Low · Medium | — | Unchanged from §9.5: a migration with a progress bar, not a setting | G4 |
| I4 | **Their Workspace subscription lapses** | Low · High | Token or drive access fails | Degraded with that reason; owners told that Google holds the data for a limited period after suspension and that renewing restores access unchanged | G1 |
| I5 | **The holder of a personal account loses it** — lost second factor, death, a hijack | Low · Critical | Token fails | Beyond our reach, which is why setup says plainly that a personal account is a person's, and recommends Workspace and a Shared Drive for anything that matters | G1 |

## J · Terms, obligations and cost

| # | What goes wrong | L · I | How we find out | Prevention, and what happens when it does | Phase |
|---|-----------------|-------|-----------------|-------------------------------------------|-------|
| J1 | **Google's API user-data policy** — obligations on any app using OAuth with Google user data | Certain · High (if ignored) | Brand verification review | Privacy policy disclosure; Drive data used only to provide the feature; part of the G2 launch gate | G2 |
| J2 | **Cloudflare's terms** restrict serving video hosted outside Cloudflare through its CDN | Certain · High (if ignored) | — | The gateway is not placed behind Cloudflare's CDN for media; its cache is its own | G2 |
| J3 | **Automated downloads look like abuse** to Google | Low · Medium | Unusual errors | Stay inside documented quotas; cache and coalesce; one identity per organization so traffic is attributable | G2 |
| J4 | **Drive organizations cost us money NAS organizations do not** | Certain · Medium | Bytes served per organization | Question 16 — a per-plan gateway transfer allowance | G2 |

---

## Drills, written before they are needed

### If we are breached — what each customer does, in order

**Mode A — a connected account:**

1. The account holder opens their Google account's *third-party connections* page
   (myaccount.google.com/permissions) and removes Knowledge Vault. Effective at once.
2. A Workspace admin may instead block the app for the whole domain from the admin console's
   API controls, which also revokes every token already issued to it.
3. Nothing else: we never held their password, and the token could reach only Knowledge Vault's
   own files.

**Mode B — a service identity:**

1. Delete the `workloadIdentityUser` binding for our subject, or the whole provider. Effective at
   once.
2. Optionally remove the service account from the Shared Drive.
3. Nothing else: we never held a key.

**Both:** reconnecting afterwards keeps every file ID, so nothing is re-uploaded.

### What we do

1. Bump every organization's ticket epoch — outstanding tickets die within 30 seconds.
2. Rotate the ticket-signing key, `STORAGE_OIDC_KEY`, and the gateway's internal secret.
3. Re-seal every stored refresh token under a new `STORAGE_KEK`, or — if it is the key that
   leaked — revoke every refresh token at Google and ask owners to reconnect.
4. Message every owner with the steps above for their mode.

### Leaving, or losing us

1. **PLAIN:** download the folder from Drive. The map says what each file is and who could read
   it.
2. **ENCRYPTED:** download the folder, then run the standalone decrypt tool with the `.main` file
   and the Supreme password. *(Once the recovery chain exists — document 07, §11.)*

---

*Last updated: 2026-09-29*
