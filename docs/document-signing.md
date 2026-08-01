# document-signing.md — Electronic signatures on Knowledge Vault documents

> **Status: design study, not built.** Specifies what a defensible signature on a Vault document
> must contain, how it binds to a verified corporate identity from Entra ID
> (`enterprise-identity.md`), and what the platform gains once it exists.
>
> Signing is the feature that turns a training platform into a *records* platform. The bar is
> set by regulators, not by us, so this document is deliberately exact.

---

## 1. Two different things called "signing"

Getting this distinction right prevents both over-building and over-promising.

| | **Electronic signature** | **Digital signature** |
|---|---|---|
| What it is | A recorded act: a verified person, at a recorded time, expressing a recorded intent about a specific record | A cryptographic operation: a document hash signed with a private key |
| Governed by | FDA 21 CFR Part 11, most corporate SOPs, ISO 9001 / 13485 document control | eIDAS Advanced & Qualified signatures, PKI policy |
| Needs | Strong identity, re-authentication, intent capture, tamper-evident audit trail | An X.509 certificate and key custody (HSM / Azure Key Vault) |
| Cryptography required? | **No** — Part 11 signatures may be identity-credential based | Yes, by definition |
| Verifiable by | The system that holds the audit trail | Anyone, offline, forever |

**Build the electronic signature first.** It covers 21 CFR Part 11, ISO document control and
essentially every corporate approval workflow — which is the entire realistic customer base for
this product. Then *store a content hash from day one* so a cryptographic seal (§8) can be
layered on later without redesigning the record.

Claiming eIDAS Qualified signatures without a qualified trust service provider would be false.
Do not put it on a website.

---

## 2. The seven components of a valid signature

Every one of these is a hard requirement. Missing any single one makes the signature
challengeable, which defeats the purpose of having it.

### 2.1 Verified identity
The signature must be attributable to exactly one human. This is where the Entra integration
pays for itself: the signer is a **verified corporate identity** backed by the customer's own
MFA, not a self-registered username someone typed at signup.

Snapshot the identity **into the signature record at signing time** — Entra object ID, UPN,
display name, and the job title / department as they were on that day. Never render a signature
by joining to the live profile: people change name, role and employer, and a signature must
show who they were *when they signed*, not who they are now.

### 2.2 Re-authentication at the moment of signing
21 CFR Part 11.200(a)(1): signings not executed in a single continuous session must use **all**
signature components each time; within a continuous session, at least one component each time.
In practice, and as the safe default: **force a fresh authentication for every signature.**

Entra provides two mechanisms, and the precise one matters:

- **Conditional Access authentication context** — the correct tool. It lets the application
  demand step-up (MFA, phishing-resistant credential, compliant device) for **one specific
  action** rather than for the whole session. Signing a document can require a fingerprint or
  security key even though normal reading did not.
- **OIDC `prompt=login` / `max_age=0`** — forces fresh credentials on the sign-in request.
  Simpler, coarser, and adequate on its own if the customer has no P2 licence.

Record which mechanism was satisfied, and the authentication timestamp Entra returned, inside
the signature record. "The user was authenticated at some point today" is not evidence.

### 2.3 Declared meaning
Part 11.50 requires the signed record to carry the **meaning associated with the signature**.
This is a discrete, recorded choice — never free text, never implied:

```
AUTHORED · REVIEWED · APPROVED · ACKNOWLEDGED (read-and-understood) · WITNESSED · REJECTED
```

The signer picks one, it is stored, and it is displayed on the document. Two people signing the
same document mean different things, and the record must say which.

### 2.4 Binding to exact content
A signature applies to the bytes that were on screen, not to a title. At signing:

- Render the document to its canonical form and take **SHA-256 of those bytes**.
- Store the hash with `Course.version` alongside the signature.
- On any content change, existing signatures become **superseded** — visibly, never silently,
  and never carried forward to the new version.

`Course.version` already increments and `resetsCompletionOnUpdate` already exists; those are the
seeds. What is missing is the hash and the supersede transition.

### 2.5 Tamper-evident audit trail
Part 11.10(e) requires computer-generated, time-stamped audit trails that record operator
entries and actions, do not obscure previously recorded information, and are retained for at
least as long as the record itself.

`AuditLog` (`apps/api/src/security.ts:113`) is already append-only and already carries
`orgId / actorProfileId / action / detail / ip / createdAt`. Two changes are required:

1. **The nightly job trims audit entries past retention.** Signature-related entries must be
   **exempt** — they are retained as long as the signed record exists. This is a concrete code
   change, not a policy note.
2. Add hash-chaining (each entry stores the hash of the previous entry for that org) so silent
   deletion or reordering is detectable rather than merely discouraged.

Every signature attempt is logged — including failures, refusals and expired step-ups. An audit
trail that only records successes tells an auditor nothing.

### 2.6 Signature manifestation on the document
Part 11.50 requires the printed name, the date and time, and the meaning to appear **on the
document itself**, in any human-readable rendering of it — screen or paper.

This fits the Studio unusually well: it already generates a standard cover page, a scope page,
and headers/footers. A **signature page** is the same machinery:

```
─────────────────────────────────────────────────────────────
  Approved by    Jane Doe
                 Quality Manager · Manufacturing
                 jane.doe@contoso.com  (verified · Contoso Ltd)
  Meaning        APPROVED
  Signed at      2026-08-01 14:32:07 UTC  (16:32 CEST)
  Document       456-989-0012  ·  version 3
  Content hash   sha256:4f2a…9c1b
  Step-up        MFA satisfied 2026-08-01 14:31:52 UTC
─────────────────────────────────────────────────────────────
```

Always store UTC; display local as a courtesy. A signature block whose timezone is ambiguous is
a finding waiting to happen.

### 2.7 Separation of duties
Author ≠ approver. The existing `CONTENT_REVIEW` flow already enforces that a member's proposal
needs a manager's approval — that is the seed. With directory data it gets stronger, because
the rule can be checked against verified attributes: *the approver must hold group X*, or *must
be the author's manager per the directory chain*. Rules checked against a directory the customer
controls are far harder to argue with than rules checked against a field someone typed.

---

## 3. Document lifecycle

Signatures attach to **state transitions**, not to documents in the abstract.

```
  DRAFT ──submit──► IN_REVIEW ──sign:APPROVED──► APPROVED ──publish──► EFFECTIVE
    ▲                   │                                                  │
    └───sign:REJECTED───┘                                       new version│
                                                                           ▼
                                                                     SUPERSEDED
                                                                           │
                                                                   retention│
                                                                           ▼
                                                                      ARCHIVED
```

- `Course.draft` is today's boolean. It becomes this enum.
- **EFFECTIVE** is the state that matters for training: only an effective document may be
  mandatory, and its effective date is what deadlines and recurrence anchor to.
- **SUPERSEDED** documents stay readable and stay attached to their historical completion
  records. Never delete a superseded version — someone's compliance evidence points at it.
- Multi-step approval (author → reviewer → quality → release) is a chain of required signatures
  on the same transition, each with its own meaning.

---

## 4. Data model sketch

```prisma
enum SignatureMeaning {
  AUTHORED
  REVIEWED
  APPROVED
  ACKNOWLEDGED   // read-and-understood — the training attestation
  WITNESSED
  REJECTED
}

model DocumentSignature {
  id             String           @id @default(uuid())
  orgId          String
  courseId       String
  courseCode     String           // denormalized — survives export, like CompletionRecord
  courseVersion  Int              // the exact version signed
  contentHash    String           // sha256 of the canonical rendering at signing time

  profileId      String           // who, in our terms
  meaning        SignatureMeaning

  // Identity SNAPSHOT — never joined live (§2.1)
  signerName     String
  signerTitle    String?
  signerUpn      String?
  externalId     String?          // Entra object ID, immutable
  tenantId       String?

  // Proof of the authentication behind the act (§2.2)
  authMethod     String           // "ENTRA_STEPUP" | "ENTRA_OIDC" | "LOCAL_PASSWORD"
  authAt         DateTime         // when credentials were actually presented
  mfaSatisfied   Boolean          @default(false)
  authContextId  String?          // Entra CA authentication context reference

  signedAt       DateTime         @default(now())   // always UTC
  ip             String?
  supersededAt   DateTime?        // set when the document moves to a new version
  reason         String?          // required on REJECTED

  cryptoSealId   String?          // reserved for §8 — null until PKI ships

  @@index([orgId, courseId, courseVersion])
  @@index([profileId])
  @@index([courseCode])
}
```

Design notes:
- Rows are **immutable**. A mistaken signature is corrected by a new, opposing signature with a
  reason — never by an `UPDATE`. `supersededAt` is the only field that is ever written after
  creation.
- `courseCode` + `contentHash` are denormalized deliberately, exactly as `CompletionRecord`
  does, so signatures survive `.main` export and revival intact.
- `cryptoSealId` reserved now means the PKI upgrade (§8) is additive rather than a migration.

---

## 5. Signed acknowledgement — the highest-value case

Approval signatures matter to a handful of managers. **Acknowledgement signatures matter to
every employee, every year** — and this platform already has the flow.

Today, "mark complete" writes a `CompletionRecord`. Upgrade it, per course, to a signed
attestation:

> *I confirm I have read and understood* **SOP-114 Handling of Solvents, version 3** *(hash
> 4f2a…9c1b), 1 August 2026, verified as jane.doe@contoso.com.*

The difference between a training platform and a compliance system is exactly this. A tick-box
proves someone clicked. A signed acknowledgement bound to a verified corporate identity, a
document version and a content hash proves **who** accepted **what**, **when** — which is the
question an auditor, an insurer or a court actually asks.

Make it a per-course setting (`requiresSignedAcknowledgement`) with the same per-branch override
machinery `CoursePlacement` already uses for `mandatory` and `deadlineDays`. Most courses will
not need it; the ones that do, need it absolutely.

---

## 6. What the platform gains

Ranked by value, and split honestly between what signing gives you and what the directory gives
you — they compound, but they are separate purchases.

### From signing alone
1. **Audit-grade training evidence.** Compliance output stops being a management report and
   becomes admissible evidence.
2. **Controlled document lifecycle.** Draft → Effective → Superseded with signed transitions is
   the ISO 9001 / 13485 document-control requirement, largely met.
3. **Regulated-industry access.** Pharma, medical devices, aviation, food, energy, finance —
   sectors that *cannot* buy a platform without this. It converts "nice tool" into "qualifies
   for the tender".
4. **Defensible dispute position.** "Nobody told me that was the procedure" is answered by a
   record, not by memory.
5. **Multi-step approval chains** with enforced separation of duties.
6. **Controlled copies.** A downloaded PDF stamped with the reader's verified identity, the
   timestamp and the document version — the Veeva pattern, and a strong deterrent to
   uncontrolled circulation. `allowDownload` already exists as the switch.

### From the directory, compounding with signing
7. **Signatures carry real corporate identity** — verified by the customer's own MFA, not by us.
   This is the single biggest strength gain, and it costs us no trust liability.
8. **The mover problem solves itself.** Someone changes department in the directory → their
   placements change → their mandatory set recalculates → the new SOPs appear for signature
   automatically. This is the largest *operational* win in the whole integration, and it is
   invisible until you have lived without it.
9. **Compliance percentages become trustworthy.** Today, "94% compliant" means 94% of the people
   somebody remembered to add. With the directory as the population source there are no ghost
   leavers inflating the number and no missing joiners hiding a gap. It is the difference between
   a number you show a manager and a number you show an auditor.
10. **Escalation to the real manager.** Overdue training currently escalates to
    `addedByProfileId` — whoever happened to add the person. The directory's `manager` attribute
    gives the actual reporting line, which is who should receive the nudge.
11. **Day-one onboarding.** The new hire's training queue exists before their first login.
12. **Offboarding evidence pack.** Access ends the same day; the signed record of everything
    they ever acknowledged is retained and exportable. Access dies, evidence does not.
13. **Device-bound confidentiality.** Intune compliance + the existing `Classification` levels:
    Secret documents open only on a managed device (`enterprise-identity.md` §5).
14. **Separation of duties on verified attributes** (§2.7).

---

## 7. Phasing

| Phase | Scope | Rough effort |
|---|---|---|
| **S1** | `DocumentSignature` model, signed acknowledgement (§5), signature page rendering, audit-retention exemption | ~3–4 weeks |
| **S2** | Lifecycle states (§3), approval signatures on transitions, supersede-on-new-version | ~3–4 weeks |
| **S3** | Entra step-up binding (§2.2) — Conditional Access authentication context | ~1–2 weeks, after `enterprise-identity.md` Phase A |
| **S4** | Multi-step chains, separation-of-duties rules, controlled-copy watermarking | ~2–3 weeks |
| **S5** | Cryptographic seal + trusted timestamps (§8) | ~3–4 weeks, only if a customer requires it |

**S1 delivers standalone value with no directory integration at all** — signed acknowledgement
works with today's username identity. It is simply much stronger once Entra is behind it. That
sequencing matters: signing does not have to wait for the Microsoft work to land.

---

## 8. The cryptographic upgrade (only when required)

For eIDAS Advanced/Qualified signatures, or customers whose policy demands offline verification:

- Sign the `contentHash` with a private key held in **Azure Key Vault** (or an HSM), producing a
  detached signature stored against `cryptoSealId`.
- Add an **RFC 3161 trusted timestamp** from an independent timestamp authority, so the signing
  time does not depend on our server clock — which is otherwise the weakest link in §2.6.
- Optionally embed the result as a **PAdES** signature in exported PDFs, so any PDF reader shows
  the signature as valid without contacting us.

Because §4 stores the content hash from day one, this is additive. Nothing about the existing
signature records needs to change.

**Do not build this speculatively.** It is meaningful cost and key-custody risk for a
requirement most customers will never raise. Build it when a signed contract asks for it.

---

## 9. Open questions for the owner

1. **Does a signature require the Supreme password for the highest classifications?** Signing a
   `SECRET` document could demand the org's Supreme gate on top of the personal step-up. Strong
   assurance, real friction — worth deciding deliberately rather than by default.
2. **Retention period.** How long are signatures kept after a document is superseded, and after
   a member leaves? Regulated customers will specify this per contract (often 5–10 years, or the
   product lifetime); the platform needs a configurable floor.
3. **Does a signature block org deletion?** A 30-day soft delete that purges signed records may
   conflict with a customer's legal retention duty. Suggested position: an org holding
   signatures cannot be hard-purged until its retention period expires, and the `.main` export
   carries the signature records regardless.
4. **Which plan tier?** Signed acknowledgement is arguably the strongest single reason to buy
   the Organizational plan — possibly stronger than the directory sync itself.
