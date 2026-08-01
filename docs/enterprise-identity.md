# enterprise-identity.md — Active Directory / Entra ID / Intune integration

> **Status: feasibility study, not a commitment.** Nothing here is built. This document answers
> "can Knowledge Vault plug into a company's Microsoft directory so users appear, move and
> disappear automatically?" — the verdict, the design, the requirements, and the honest caveats.
>
> Written to be readable by someone who has never touched Active Directory.

---

## 0. The short answer

**Yes — and it is the single highest-value enterprise feature this platform could add.**

It is a real project, not a switch. Roughly **8–14 engineer-weeks** to a credible enterprise
offering, split into phases that each ship value on their own. The first phase ("Sign in with
Microsoft") is small and mostly reuses machinery already written for Google.

Three things must be understood before promising anything to a customer:

1. **We integrate with Entra ID in the cloud, never with on-premises Active Directory
   directly.** Customers who still run classic AD already mirror it into Entra ID with a
   Microsoft tool. That mirroring is *their* job, not ours.
2. **Intune is not the thing that manages users.** Intune manages *devices*. It is a valuable
   fourth pillar (see §5) but it will not create, move or delete a single person. If the pitch
   says "Intune syncs our users", the pitch is wrong and a customer's IT admin will notice.
3. **Standard directory sync is near-live, not live.** Microsoft's own provisioning service
   runs on roughly a **40-minute cycle**. Genuine seconds-level sync is possible (§6, Option B)
   but is a different, heavier design. Do not sell "instant" without building Option B.

---

## 1. Plain-English primer

| Thing | What it actually is | What it gives us |
|-------|--------------------|------------------|
| **Active Directory (AD DS)** | The classic *on-premises* directory: physical/virtual "domain controller" servers inside the company's own network holding users, groups and OUs (folders). Speaks LDAP and Kerberos. Born ~2000, still everywhere. | Nothing directly — it is behind their firewall and our API on Render cannot reach it. |
| **Microsoft Entra ID** (was "Azure AD", renamed 2023) | The *cloud* directory. Same users, but reachable over the internet and built for SaaS apps. Speaks OpenID Connect, OAuth 2.0, SAML 2.0 and SCIM 2.0 — open standards. | **Everything.** Sign-in, user lifecycle, groups. This is our integration point. |
| **Entra Connect / Entra Cloud Sync** | Microsoft's agent that copies on-prem AD into Entra ID continuously ("hybrid identity"). Installed by the customer's IT team. | The bridge that makes on-prem AD customers integrable — *without us writing a line of code for it*. |
| **Microsoft Intune** | Device management (MDM/MAM). Enrols laptops and phones, enforces encryption/PIN/patch level, pushes apps, wipes a lost device. | Device *trust* signals and app distribution (§5). **Not** user lifecycle. |

**The key insight for the sales conversation:** whether the customer runs pure-cloud Entra ID or
20-year-old on-prem AD, *our side of the integration is identical*. Entra ID is the only surface
we talk to. If they have Intune, they certainly have Entra ID, because Intune is built on it.

```
  Customer's building                     Microsoft cloud                    Us
 ┌────────────────────┐              ┌──────────────────────┐        ┌────────────────┐
 │ Active Directory   │  Entra       │                      │  SCIM  │ Knowledge      │
 │ (domain controller)│ ──Connect──► │     Entra ID         │ ─────► │ Vault API      │
 │ users, groups, OUs │  (their job) │  users, groups       │  OIDC  │ (Render)       │
 └────────────────────┘              │                      │ ◄────► │                │
                                     │     Intune           │        │ Constellation  │
 ┌────────────────────┐              │  device compliance   │        │ tree, courses  │
 │ Laptops & phones   │ ──enrolled──►│                      │        └────────────────┘
 └────────────────────┘              └──────────────────────┘
```

---

## 2. What "connected to the organization" actually means

It decomposes into four independent capabilities. They can be sold and built separately, and
each is worth money on its own.

### Pillar 1 — Single Sign-On (sign-in)
The member clicks **"Sign in with Microsoft"** instead of typing a Knowledge Vault password.
No new password to forget, no password reset problem (which today is *unsolvable* — see
`future.md` §10), and the customer's own MFA / phishing-resistant login applies automatically.

Protocol: **OpenID Connect** (an OAuth 2.0 layer). SAML 2.0 is the older alternative some
enterprises still demand; support it later if a deal needs it.

### Pillar 2 — Automatic user lifecycle (joiners / movers / leavers)
This is the "live connectivity" the request is really about. HR hires someone → they appear in
AD → **they appear in the Vault, in the right branch, with the right mandatory courses, with no
admin lifting a finger.** Someone leaves → their Vault access dies the same day.

Protocol: **SCIM 2.0** — the industry standard for exactly this. Entra ID has a built-in
provisioning engine that pushes changes to any app exposing a SCIM endpoint. We build that
endpoint; Microsoft does the scheduling, retries, attribute mapping and reporting.

### Pillar 3 — Groups drive the Constellation
Entra groups (`HR-Team`, `Plant-2-Operators`, `Quality-Managers`) map onto our **RoleNode**
tree. Add someone to `Quality-Managers` in AD → they become an OWNER of the Quality branch here.
Remove them → the placement disappears. The org chart maintains itself.

This is where our product gets genuinely differentiated: most training platforms sync a flat
user list. We sync into a *governed hierarchy* that already drives mandatory-course inheritance.

### Pillar 4 — Intune device trust (§5)
"Documents classified **Secret** open only on a company-managed, compliant device."

---

## 3. Where this lands in *our* code

The good news: the data model is already shaped for it. The blockers are known and small.

### 3.1 Blocker — identity is username-only, with no email
`Profile` has `username @unique` and no email at all (owner decision 2026-07-19, `future.md`
§10). Entra thinks in `userPrincipalName` / `mail` — e.g. `jane.doe@contoso.com`.

**Do not reuse `username` as the join key, and do not key on email either.** People marry,
change surname, change UPN; email is *not* a stable identifier. Entra's object ID (an immutable
GUID) is. Add a dedicated table:

```prisma
model ExternalIdentity {
  id          String   @id @default(uuid())
  profileId   String
  profile     Profile  @relation(fields: [profileId], references: [id], onDelete: Cascade)
  provider    String   // "ENTRA"
  tenantId    String   // the customer's Entra tenant GUID
  externalId  String   // Entra object ID — immutable, THE key
  upn         String?  // current UPN, for display/debug only, never for matching
  createdAt   DateTime @default(now())

  @@unique([provider, tenantId, externalId])
  @@index([profileId])
}
```

`Profile.passwordHash` is already `String?` — SSO-only profiles with no local password work
today with no schema change. That is a lucky break.

### 3.2 New — the per-organization directory connection

```prisma
model OrgDirectory {
  id             String   @id @default(uuid())
  orgId          String   @unique
  tenantId       String   // Entra tenant GUID; one tenant may serve several orgs
  scimTokenHash  String   // hashed bearer token we issue TO Entra (never stored in clear)
  scimTokenLast4 String   // so the admin can recognise it in the UI
  mode           String   // "SCIM_PUSH" | "GRAPH_PULL"
  enabled        Boolean  @default(true)
  lastSyncAt     DateTime?
  createdAt      DateTime @default(now())
}

model GroupMapping {          // Pillar 3 — the heart of the feature
  id            String        @id @default(uuid())
  orgId         String
  externalGroupId String      // Entra group object ID
  externalGroupName String    // display only; refreshed on sync
  roleNodeId    String
  kind          PlacementKind // OWNER | MEMBER
  canCreateSubgroups Boolean  @default(false)
  canAddCoOwners     Boolean  @default(false)
  canCreateContent   Boolean  @default(false)

  @@unique([orgId, externalGroupId, roleNodeId, kind])
}
```

A sync then reduces to: *for each mapping, make the Placements match the Entra group's
membership.* Every write still goes through `placePerson()` in `apps/api/src/roles/helpers.ts`,
so the tree invariants and the `can()` policy stay the single source of truth. **No parallel
permission path** — that rule is not negotiable (`architecture.md` §3).

### 3.3 Deprovisioning must not destroy training records
Today, removing someone's last placement deletes their `Membership`
(`roles/routes.ts:325–330`). That is correct and should stay. But `CompletionRecord` is
explicitly *the user's* data (`structure.md` §3.7) and **must survive**. When a leaver is
deprovisioned we want to still be able to prove they completed their fire-safety training in
March — that is exactly what an auditor asks for.

Rule: **deprovision removes access, never evidence.** Map Entra's disable signal to placement
removal + membership archival, and keep completion history keyed by the (retained) `Profile`.

This is a selling point, not a compromise. Say it out loud in the pitch.

### 3.4 Invariants the sync engine must respect
- **I2 — a role always keeps at least one owner.** If a group sync would remove the last owner
  of a branch, it must *refuse that removal*, keep the placement, and raise a notification to
  the layer above. A directory change must never be able to orphan a branch.
- **Supreme is never bypassed.** SSO authenticates *members*. It does not and must not unlock
  the Supreme gate, `.main` download, or org deletion. Supreme stays a password-only,
  human-held secret — that custody model is the product's spine (`structure.md` §5).
- **Always keep one local break-glass owner.** If the customer's tenant is deleted, their
  Entra Connect breaks, or the contract lapses, the organization must remain reachable. Refuse
  to enable SSO-only mode unless at least one owner has a local password.
- **Role numbers are never reused.** A sync that creates role nodes (see §4) still consumes
  from `Organization.nextRoleNumber` and never recycles.
- **`.main` must carry the mapping.** Add `ExternalIdentity` + `GroupMapping` to the `.main`
  payload so a revived org reattaches its SSO users instead of stranding them
  (`architecture.md` §5).

### 3.5 Plan limits will be hit immediately
`assertMemberLimit()` caps members per plan. A first SCIM sync of a 600-person tenant against a
50-seat plan will fail 550 times and Microsoft will quarantine the provisioning job. Required:
- SCIM must return a proper SCIM-shaped error, not our normal JSON error body.
- Directory sync belongs to an **Enterprise plan tier** with a seat count matched to the
  tenant. This is a pricing decision (`pricing.md`) as much as an engineering one — and a good
  one: SSO/SCIM is the classic feature that justifies the top tier.

### 3.6 Rate limiting and cold starts
- `rateLimiter("auth", 10, 5*60_000)` in `security.ts` would throttle Microsoft's provisioning
  service on sight. SCIM routes need their own generous bucket keyed on the tenant, not the IP.
- **Render's free tier sleeps** (`architecture.md` §7: 30–60 s cold start). Microsoft's
  provisioning service times out and, after repeated failures, quarantines the connection.
  **Enterprise identity requires a paid always-on API instance.** Non-negotiable
  infrastructure cost — put it in the deal price.
- The SSE registry is in-memory single-instance (`architecture.md` §9). Fine at one instance;
  the moment enterprise load forces a second, this needs Postgres `LISTEN/NOTIFY` or Redis.

---

## 4. The org-structure question — mirror or map?

The tempting idea is "build our Constellation automatically from their AD OU tree." Resist it
for v1.

| | **Mapping** (recommended) | **Mirroring** |
|---|---|---|
| How | Admin draws the tree once, then links each Entra group to a branch | Tree is generated from OU paths / `department` attributes |
| Control | Customer's Vault structure is theirs to design | Structure is hostage to how IT happened to organise AD |
| Risk | Low — a bad mapping is one row to fix | High — fights role-number invariants, deletes/recreates branches, mass-reassigns mandatory courses |
| Reality | AD OU trees are usually organised by *IT administration convenience* (sites, device policies), not by training responsibility | Same |

**Recommendation: map, don't mirror.** Ship a one-shot, human-reviewed **"import structure
suggestion"** wizard later — read the OU tree or the `manager` attribute chain via Graph,
*propose* a Constellation, let an owner edit and confirm it. Suggestion is safe; continuous
mirroring is not.

Also settle, in writing, with each customer: **who is authoritative?** If the directory owns
membership, then adding a person by hand in the Vault must be blocked (or auto-reverted on next
sync) for synced branches — otherwise the two systems fight and the customer blames us. The UI
must visibly mark a branch as *directory-managed* with a lock icon.

---

## 5. Intune — what it genuinely adds

Intune is a *device* system, so it answers "is this laptop trustworthy?" — never "who works
here?". Three real uses, in value order:

**5.1 Classification-aware device gating (the strong one).**
Our schema already has `Classification` — `PUBLIC | CONFIDENTIAL | PRIVATE | SECRET` — on every
course. Intune reports device compliance into Entra ID; an Entra **Conditional Access** policy
then refuses to issue a sign-in token unless the device is managed and compliant. Pitch:

> "Confidential and Secret documents open only on a company-managed, encrypted, patched device.
> Not on a personal phone in a café."

Mostly *configuration on the customer's side*, plus a modest amount of code on ours to read the
device claim and enforce a per-classification rule. Extremely high perceived value for regulated
industries (pharma, aviation, defence, finance) — exactly the buyers who need mandatory training
platforms in the first place. Requires Entra ID P1 (see §7).

**5.2 Mobile app distribution and containment.**
`apps/mobile` exists in the monorepo. Intune can push it to managed devices silently, and app
protection policies can block copy/paste and screenshots out of it and remotely wipe org data
without touching the employee's personal phone. This is the standard expectation for any app
displaying confidential documents on a phone.

**5.3 Device inventory in compliance reports.** Marginal. Skip.

---

## 6. Two sync architectures — pick both, in order

### Option A — SCIM 2.0 (Entra pushes to us) — **build first**

We expose a SCIM server and Entra's provisioning engine calls it.

```
POST   /scim/v2/Users              create
GET    /scim/v2/Users?filter=userName eq "jane@contoso.com"
GET    /scim/v2/Users/:id
PATCH  /scim/v2/Users/:id          most updates arrive as PATCH, incl. active:false
PUT    /scim/v2/Users/:id
DELETE /scim/v2/Users/:id          hard delete (rare — arrives late, see below)
GET/POST/PATCH/DELETE /scim/v2/Groups
GET    /scim/v2/ServiceProviderConfig | /Schemas | /ResourceTypes   (discovery)
```

Auth: a long-lived bearer token we generate per organization and the customer pastes into the
Entra provisioning page. Store only its hash.

Behaviour to get right:
- **Disable ≠ delete.** When a user leaves scope or is disabled, Entra sends `active: false`.
  Treat it as *suspend access, retain records*. A real `DELETE` only arrives once the user is
  permanently purged from the directory (after Entra's own ~30-day recycle bin), so never wait
  for `DELETE` to cut off access.
- **Cadence: incremental cycles roughly every 40 minutes.** The first full cycle on a large
  tenant can take hours. On-demand provisioning exists for a single user (useful for demos and
  urgent leavers) — worth showing in a sales demo, because "watch this appear now" lands better
  than "wait 40 minutes".
- Return proper SCIM error envelopes (`urn:ietf:params:scim:api:messages:2.0:Error`), correct
  `ListResponse` shapes, and honour `externalId`. Sloppiness here is the #1 cause of failed
  enterprise integrations.

**Why first:** it is the standard every enterprise IT admin already knows and asks for by name.
Microsoft's engine does the retries, scoping filters, attribute mapping and audit reporting for
us. Answering "yes, we support SCIM" unblocks procurement conversations by itself.

### Option B — Microsoft Graph (we pull, plus webhooks) — **the "live" upgrade**

We register a multi-tenant app; the customer's admin grants consent once; we call Microsoft
Graph with application permissions (`User.Read.All`, `GroupMember.Read.All`, and
`Directory.Read.All` if we want OU/manager data).

- **Delta queries** (`/users/delta`, `/groups/delta`) return only what changed since a token —
  cheap enough to poll every few minutes.
- **Change notifications** (webhook subscriptions) push changes to us within seconds. Note the
  operational cost: directory subscriptions expire in about **3 days** and must be renewed on a
  schedule, and the notification only says "something changed" — we still call Graph to read it.
- Only Graph can read the things SCIM never sends: OU/`department`, `manager` chains, job
  titles, device state. That is what powers the structure-suggestion wizard (§4) and richer
  branch mapping.

**Trade-off to state plainly:** Option B means the customer grants a tenant-wide read
permission to our app and we hold the resulting tokens. That triggers a security review at any
serious buyer. Option A holds no customer credentials at all — Entra calls *us*. Lead with A,
offer B for customers who explicitly want real-time.

**Recommended end state:** SCIM as the backbone; Graph delta as an optional accelerator and as
the read path for structure suggestions.

---

## 7. Requirements checklist

### 7.1 On the customer's side
| Requirement | Notes |
|---|---|
| A Microsoft Entra ID tenant | Every Microsoft 365 customer has one. |
| **Entra ID P1** licence (for provisioning + Conditional Access) | SSO alone works on the free tier. **Automatic (SCIM) provisioning for a non-gallery app, group-based assignment, and Conditional Access all need P1 or above.** |
| An admin who can consent | Global Administrator, or Application Administrator + Cloud Application Administrator. |
| If they still run on-prem AD: Entra Connect or Cloud Sync already running | Their IT does this; it is standard practice. We never touch a domain controller. |
| Groups that reflect *training responsibility* | If their groups are only `All-Staff` and `IT`, the mapping has nothing to bite on. Check this early — it is the most common reason these projects disappoint. |
| Intune licence (only for Pillar 4) | Sold standalone or bundled. |
| A named IT contact + a test/sandbox tenant | Integration always needs 2–3 working sessions with their admin. |

**Sales-critical fact, worth verifying against current Microsoft licensing at contract time:**
Microsoft 365 **Business Premium**, **E3** and **E5** bundle both Entra ID P1 (E5: P2) *and*
Intune. So if a prospect says "we use Intune", they almost certainly already hold every licence
this integration needs. Nothing extra to buy. That removes the usual objection before it forms.

### 7.2 On our side
| Requirement | Why |
|---|---|
| **Paid, always-on API instance** | Render free-tier sleep breaks Microsoft's provisioning service (§3.6). |
| Stable public HTTPS URL with a valid certificate | Entra will not call a flaky or self-signed endpoint. |
| A multi-tenant Entra app registration owned by us | One registration serves all customers; each customer consents to it. |
| Per-tenant secret storage, hashed | SCIM bearer tokens, and Graph refresh tokens if Option B ships. |
| Audit logging of every sync action | `AuditLog` already exists — reuse it. Enterprise buyers ask "who added this person?" and "the directory did" must be an answerable, timestamped answer. |
| A test tenant of our own | A Microsoft 365 Business Premium trial (25 users, time-limited) is the pragmatic route; a developer-program sandbox works if eligible. Budget for this — you cannot build SCIM blind. |
| Documentation for their IT admin | A step-by-step setup guide with screenshots, in the style of `setup-guide.md`. Enterprise IT will not guess. |

### 7.3 Engineering skills needed
OAuth 2.0 / OIDC token validation (including JWKS key rotation and correct `iss`/`aud`/`nonce`
checks), the SCIM 2.0 specification, Microsoft Graph, and Entra tenant administration. If the
engineer who suggested this has done a SCIM integration before, that is worth a lot — it is a
specification with many small ways to be subtly non-compliant.

---

## 8. Suggested phasing

| Phase | Scope | Rough effort | Sellable as |
|---|---|---|---|
| **A** | "Sign in with Microsoft" (OIDC), `ExternalIdentity` table, account linking | ~1–2 weeks | "SSO — no extra passwords" |
| **B** | SCIM 2.0 server: Users lifecycle, enable/disable, org connection UI, token issuing | ~4–6 weeks | "Automatic joiners & leavers" |
| **C** | SCIM Groups + `GroupMapping` engine, reconciliation report, directory-managed branch locks | ~2–3 weeks | "Your org chart maintains itself" |
| **D** | Intune / Conditional Access + per-classification device gating | ~1–2 weeks | "Secret documents only on managed devices" |
| **E** | Graph delta + change notifications (real-time), OU structure-suggestion wizard | ~3–4 weeks | "Real-time sync" |
| **F** | Microsoft Entra Application Gallery listing | separate, mostly process | "Available in the Microsoft app gallery" |

Phase A is worth shipping alone: it quietly solves the unrecoverable-lost-password problem
noted in `future.md` §10, without reintroducing an email system.

Phase F deserves attention as a *marketing* asset — being listed in Microsoft's gallery makes a
small vendor look established, and every customer's IT admin browses that catalogue. It requires
a working, tested SSO + SCIM implementation first, so it naturally follows B/C.

Effort figures are engineer-weeks of focused work, not calendar time, and exclude the customer's
own IT scheduling — which is usually the real critical path.

---

## 9. Honest risks

1. **"Live" overpromise.** SCIM is ~40 minutes. If a contract says "real-time", Phase E is
   mandatory, not optional. Write the cadence into the proposal.
2. **Garbage groups in, garbage structure out.** If the customer's Entra groups do not model
   training responsibility, no integration fixes that. Audit their groups *before* signing.
3. **Two systems fighting over membership.** Solved only by declaring one authoritative and
   showing it in the UI (§4). Skipping this generates support tickets forever.
4. **Tenant loss / contract end.** Break-glass local owner is mandatory (§3.4), or a customer
   can lock themselves out of their own vault.
5. **Their security review will be thorough.** Expect questions on data residency, token
   storage, breach notification, sub-processors and pen-test results. Being able to answer
   "Entra calls us, we hold no directory credentials" (Option A) is a genuinely strong position.
6. **Scale.** A tenant with thousands of users makes the free-tier assumptions in
   `architecture.md` §7 obsolete — Neon storage, connection limits, single-instance SSE. This
   integration effectively promotes the platform into a paid infrastructure tier.
7. **Support burden.** Every synced customer is a customer whose IT admin will email us when
   *their* directory misbehaves. Budget for a diagnostics screen (last sync, what changed, what
   was refused and why) — it pays for itself.

---

## 10. How to pitch it

Four sentences, in this order:

> **Your people already exist in your Microsoft directory. Knowledge Vault reads it directly, so
> a new hire lands in the right branch with the right mandatory training automatically, and the
> day someone leaves, their access ends — while their training record stays intact for your
> auditor.** Nobody maintains a second list of employees. Nobody remembers a second password.
> And with Intune, your Confidential and Secret documents open only on company-managed devices.

Then the closer that removes the cost objection:

> If you already use Intune, you already have every Microsoft licence this needs.

Two things not to say: that we connect to on-premises Active Directory (we connect to Entra ID,
which mirrors it), and that Intune manages users (it manages devices). Both are the kind of small
inaccuracy that costs credibility in front of an IT director — and both are easy to get right.
