# Client proposal mail — Shish

The organizational proposal for **Shish**, written to the structure Nitesh circulated:
solution features, implementation roadmap, commercial break-up, and future add-ons, with
the Paywell HRMS question answered at the end.

> **This file is section 3A only — the client-facing commercial view.**
> The internal cost structure, margin and negotiation floor Nitesh asked for as section 3B
> live in **[internal-commercial-breakup.md](internal-commercial-breakup.md)**, which is
> marked internal and must not be sent to Shish or pasted into this thread.

**Timeline:** the whole roadmap is four calendar weeks — 20 working days, kickoff Monday
21 September 2026, handover Friday 16 October 2026.

**Figures:** indicative minimum–expected–maximum brackets, as requested, pending confirmation
of the NAS specification. They are modelled from the delivery plan below, not quoted from a
published rate card — see [README.md](README.md).

---

## The mail

> Paste `proposal-shish.html` for the branded version. The logo lockup is
> `assets/knowledge-vault-logo-email.png`.

---

**To:** [Shish contact], [Designation], Shish
**Cc:** Nitesh, Sumit, Kinshuk
**Subject:** Knowledge Vault — solution overview, implementation roadmap and commercial proposal

Dear [Shish contact],

Further to our discussions and the NAS configuration details currently being confirmed,
please find below the consolidated overview of the **Knowledge Vault** solution, the
implementation roadmap through to production, and the commercial proposition.

Knowledge Vault is a multi-tenant knowledge, training and compliance platform in which an
organization is modelled as a **tree of roles** rather than a list of names, and in which
**document bytes reside on storage the organization owns** — for Shish, your own NAS — while
the platform holds the structure, the entitlements, the records and the reading experience.

---

### 1. Solution features and capabilities

**Core knowledge management.** An organization-wide Library, shelved by dynamic category
tags and filterable by type, shelf, classification and rating. Knowledge is attached to
**roles, not people**: material published to a branch reaches everyone holding that position,
including anyone who joins it later, with mandatory status, deadlines, recurrence,
prerequisites and escalation configured per branch and inherited down the subtree. Content
opens in an in-app viewer with related documents, rating and review — never a second tab.

**User and access management.** Global profiles with password-based sign-in (Argon2id
hashing), JWT access and refresh tokens, and sessions that end after sixty minutes of
inactivity, enforced by the API on every request. Positions are owner, sub-owner and member,
and one person may hold several positions at different levels. Governance is structural: an
owner holds only the rights granted to them and **can never grant a right they do not hold**;
branch deletion requires the level above; branches are public by default with hidden
cascading down the subtree. Every authorization decision in both the web application and the
API goes through a **single policy function**, so entitlements are audited in one place.

**Search and knowledge discovery.** Catalogue search across title, code and description, with
combined filters on document type, shelf, classification, rating, scope and archive state,
and sort in either direction. Related documents surface inside the viewer. *Full-text search
within document bodies and semantic/AI-assisted retrieval are not in the base solution — they
are covered under section 4.*

**AI / GenAI capabilities.** **Not part of the base solution today.** An AI library assistant
and AI-assisted conversion of uploaded documents into standardised documentation are on the
product roadmap, and we would rather position them as a priced add-on with a real delivery
plan than imply they ship today. See section 4.

**Document and content ingestion and management.** Two paths. Existing files and external
links are **uploaded**; new material is **authored in the Document Studio** — a three-pane
editor with a formatting ribbon, drag-and-drop blocks, a spreadsheet-style table editor,
audio and video with speed, quality ladder and non-skippable playback, live preview and a
present mode. Every document carries an auto-generated cover page, scope page and versioned
header and footer. Editions may be revised and republished, with completions reset where the
change is material. Members with content rights **propose**; publication requires a manager's
document review.

**Knowledge categorization and tagging.** Dynamic category tags (shelves) assigned at
publication, a compulsory four-level **classification** on every document — Public,
Confidential, Private, Secret — structured course codes, branch placement and scope, and
prerequisite chains between items.

**Admin capabilities and reporting.** A compliance view answering both questions that matter:
*who is behind on this course* and *where does this person stand*, with the reason stated on
every row and reminders issued in one click, default or custom. Deadline arithmetic is
computed in one place and shared by the branch report, the per-person card, the learner's own
view and the nightly sweep, so no two can disagree. Examination attempts are recorded per
sitting with score and timestamp. A labelled request centre covers course, join, deletion and
visibility approvals with live counts, and notifications deep-link to the exact item awaiting
a decision.

**Security and compliance.** Documents are held on your NAS, addressed through a storage
adapter, with a manifest written alongside them describing structure and permissions.
Classification is compulsory and enforced at the point of publication. Each organization holds
an encrypted, **server-signed custody file** with which it can restore its own existence,
alongside 30-day soft-delete retention and per-branch backups. Examination answer keys are
never transmitted to the candidate's browser; marking is server-side. Administrative actions
are written to an append-only audit log.

**Integration capabilities and APIs.** The platform is API-first by construction: a Fastify
REST service deployed independently of the web application, with request and response
contracts validated by schemas shared between client and server, and live updates pushed over
server-sent events. **To be explicit:** a documented partner API surface and the Paywell HRMS
connector are **delivery items within this engagement**, scoped in section 2 and priced in
section 3 — they are not features already shipped.

**Also worth highlighting.** Unlimited users on every paid plan; a complete guide book
delivered with the product and served from in-app Help; live updating across every screen;
and appearance controls including your own organization logo.

---

### 2. Implementation and production roadmap

**Four calendar weeks — 20 working days.** Indicative dates assume a kickoff on Monday 21
September 2026.

| # | Activity | Days | Indicative dates | Milestone output |
|---|----------|------|------------------|------------------|
| 1 | Initial environment and setup | D1–D2 | 21–22 Sep | Tenant provisioned, plan activated, access codes issued, SPOCs confirmed |
| 2 | NAS integration and configuration | D2–D4 | 22–24 Sep | Endpoint, bucket and credentials configured; connectivity and write tests passed; manifest written; encryption verified |
| 3 | Knowledge Vault onboarding | D5 | 25 Sep | Owner accounts created, Supreme password custody handed over, custody file issued and revival drill completed |
| 4 | Shish organization setup | D6–D8 | 28–30 Sep | Role tree built — branches, positions, visibility and governance rights |
| 5 | Configuration and customization | D8–D9 | 30 Sep–1 Oct | Logo and appearance, classification policy, library shelves and tags, request routing, compliance rules |
| 6 | Content ingestion and migration | D9–D10 | 1–2 Oct | Existing material uploaded, classified and shelved; authoring workshop delivered |
| 7 | User onboarding | D11–D12 | 5–6 Oct | Profiles created and placed on roles; joining communications issued |
| 8 | Integration activities | D12–D13 | 6–7 Oct | Paywell HRMS discovery and user-synchronisation harness; SSO and MFA discovery |
| 9 | Testing and UAT — cycle 1 | D14–D15 | 8–9 Oct | Functional pass, permission matrix, storage failover, examination sitting, compliance report validation |
| 10 | UAT cycle 2 and defect closure | D16–D17 | 12–13 Oct | Defects closed, UAT sign-off |
| 11 | Production deployment | D18 | 14 Oct | Go-live on the production tenant |
| 12 | Knowledge transfer and documentation | D18–D19 | 14–15 Oct | Two administrator sessions, guide book, operations runbook, administrator SOP |
| 13 | Handover, BAU and support readiness | D20 | 16 Oct | Support channel, SLA, escalation matrix and first compliance review scheduled |

**Assumptions that hold this timeline.** NAS specification — endpoint, credentials, capacity
and reachability — confirmed before Day 1; a Shish single point of contact available
approximately two hours daily; source documents and the role list supplied by Day 6; UAT
sign-off within two working days of cycle 2. NAS reachability is the single dependency
capable of moving the plan, which is why it sits in week one.

---

### 3. Commercial break-up

All figures are in INR and **exclusive of GST**. Brackets are given as
minimum–expected–maximum, to be firmed once the NAS specification is confirmed.

**One-time — implementation**

| Component | Minimum | Expected | Maximum |
|-----------|--------:|---------:|--------:|
| Implementation and setup — environment, organization structure, configuration | 95,000 | **1,25,000** | 1,60,000 |
| NAS integration and storage configuration | 30,000 | **45,000** | 70,000 |
| Content migration and classification — up to 200 documents | 40,000 | **60,000** | 95,000 |
| HRMS / user-provisioning integration (Paywell) | 55,000 | **75,000** | 1,20,000 |
| Training, knowledge transfer and documentation | 25,000 | **35,000** | 50,000 |
| UAT support and production cutover | 20,000 | **30,000** | 45,000 |
| **Total one-time** | **2,65,000** | **3,70,000** | **5,40,000** |

**Recurring — annual**

| Component | Minimum | Expected | Maximum |
|-----------|--------:|---------:|--------:|
| Knowledge Vault platform licence — unlimited users | 88,000 | **1,10,000** | 1,45,000 |
| Application hosting and infrastructure | 14,000 | **18,000** | 26,000 |
| Document storage | Nil | **Nil** | Nil |
| Third-party licensing and components | Nil | **Nil** | Nil |
| Support and maintenance — standard, next business day | Included | **Included** | Included |
| **Total recurring, per annum** | **1,02,000** | **1,28,000** | **1,71,000** |

Document storage carries no charge from us because the bytes reside on your NAS. There are
no third-party licences embedded in the base solution.

**Optional, priced separately**

| Option | Minimum | Expected | Maximum |
|--------|--------:|---------:|--------:|
| Premium support SLA — four-hour response, named engineer (per annum) | 1,10,000 | **1,44,000** | 1,95,000 |
| Dedicated isolated environment (per annum) | 60,000 | **72,000** | 95,000 |

**Summary**

| | Expected |
|---|---|
| Year one — one-time plus recurring | **₹4,98,000** |
| Year two onward — recurring only | **₹1,28,000** |

At an indicative 250 users that is approximately **₹166 per user per month in year one** and
**₹43 per user per month thereafter**, against a published Indian market band of ₹80–250 per
user per month for organizations of this size — and, unlike a per-seat licence, the figure
does not rise as Shish grows.

---

### 4. Potential add-ons and future scope

Not part of the base solution, available as scoped engagements.

| Add-on | Status today | One-time | Recurring, per annum |
|--------|--------------|---------:|---------------------:|
| Advanced AI / GenAI — library assistant, semantic retrieval, AI document conversion | Roadmap | 2,00,000–4,50,000 | 60,000–1,50,000 |
| SSO (SAML / OIDC) and MFA | Scaffolding present, inactive | 85,000–1,75,000 | 24,000–48,000 |
| HRMS-driven user lifecycle — automated joiner, mover, leaver | Subject to Paywell APIs | 1,10,000–2,25,000 | 36,000–72,000 |
| Advanced analytics and reporting — item analysis, score distribution, board pack | Partly roadmap | 90,000–1,80,000 | 30,000–60,000 |
| Additional integrations — ticketing, directory, intranet | Per connector | 65,000–1,50,000 each | — |
| Enhanced security and compliance — audit export, retention policy, signed acknowledgement | Partly present | 75,000–1,60,000 | 24,000–60,000 |
| Additional automation — auto-enrolment, escalation workflows | Partly present | 55,000–1,20,000 | — |
| Migration beyond 200 documents | Available | ₹250–400 per document | — |
| Premium support and SLA options | Available | — | 1,10,000–1,95,000 |
| **Additional user or device capacity** | **Unlimited users already included** | **Nil** | **Nil** |

---

### 5. Paywell HRMS integration

We would welcome a joint session with the Paywell team to establish how employee data can be
fetched in real time — the available APIs, authentication mechanism, data fields,
synchronisation approach and any limitations. Our interest is in using that integration as
the foundation for **automated user lifecycle management** and, subsequently, **MFA**. Please
advise a convenient date and we will coordinate.

---

We are ready to begin on confirmation of the NAS specification, and can hold the kickoff date
of 21 September against this proposal. I am glad to walk through any section in detail.

Yours sincerely,

[Your name]
[Designation], Knowledge Vault
[Phone] · [Email] · [Website]

---

## Notes before sending

- **Never attach or paste the internal break-up.** Section 3B lives in
  [internal-commercial-breakup.md](internal-commercial-breakup.md). Check the thread before
  forwarding — Nitesh's original mail contains both requests in one message.
- **AI/GenAI is stated as absent.** That is deliberate and should not be softened. The
  product's own future register carries the AI library assistant as deferred; a proposal that
  implies it ships today creates a delivery obligation nobody has scoped.
- **The API and the HRMS connector are delivery items, not features.** Section 1 says so
  plainly. Keep it that way.
- **Full-text search inside documents is not claimed.** Catalogue search is. If Shish asks
  for in-document search, it belongs in section 4, not section 1.
- **The timeline depends on NAS confirmation.** If NAS details slip, every date slips with
  them. Say so when the date is challenged rather than compressing UAT.
- **Figures are modelled brackets.** Firm them once the NAS specification lands, and
  regenerate the ₹166 and ₹43 per-user figures if the user count moves from 250.
