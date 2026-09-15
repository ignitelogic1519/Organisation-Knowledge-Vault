# Client proposal mail — Shish

The organizational proposal for **Shish**, written to the structure Nitesh circulated:
solution capability, implementation roadmap, commercial break-up, optional scope, and the
Paywell integration.

> **This file is the client-facing commercial view only.** The internal cost structure,
> margin and negotiation position live in `internal-commercial-breakup.md`, which is kept
> out of this repository and must not be sent to Shish.

**Timeline:** one month and fifteen days — 45 calendar days, kickoff Monday 21 September
2026, handover Wednesday 4 November 2026.

**Commercials:** one-time setup and knowledge transfer ₹15,000; Paywell integration ₹5,000;
subscription monthly, quarterly or yearly. Single figures, not brackets — the detail is
settled in discussion.

---

## The mail

> Paste `proposal-shish.html` for the branded version.

---

**To:** [Shish contact], [Designation], Shish
**Cc:** Nitesh, Sumit, Kinshuk
**Subject:** Knowledge Vault — solution, implementation plan and commercial proposal

Dear [Shish contact],

Further to our discussions and the NAS configuration details being confirmed, this note sets
out the Knowledge Vault solution, the plan to take it into production at Shish, and the
commercial terms.

Knowledge Vault is a knowledge, training and compliance platform built around a principle
that matters for an organization of your kind: the structure of the business is the structure
of the system. Your organization is modelled as a tree of roles rather than a list of names,
knowledge is attached to positions rather than to individuals, and the documents themselves
remain on storage Shish owns and controls.

---

### 1. Solution capability

**1.1 Organization structure and governance**

The platform holds your organization as a hierarchy of roles — divisions, departments, sites,
shifts, functions — to whatever depth reflects how Shish actually runs. Every position in that
hierarchy carries its own people, its own knowledge and its own governance.

- A person may hold several positions at different levels of the hierarchy, which is how
  supervisory and functional reporting are represented without duplicating records.
- Rights are delegated downward and never sideways: a role owner holds only the rights granted
  to them, and cannot grant a right they do not themselves hold.
- Deletion or restructuring of a branch requires authority from the level above, so no single
  manager can remove a part of the organization unilaterally.
- Branches are visible by default, and a branch marked private conceals itself and everything
  beneath it, while remaining visible to the levels above.

**1.2 Knowledge and document management**

An organization-wide library holds every document, file, recording and external reference, and
presents it according to who is asking.

- Material is shelved by category tags defined by Shish, and filtered by document type, shelf,
  classification, rating and scope.
- Every document carries a mandatory classification — Public, Confidential, Private or Secret
  — applied at the point of publication and enforced by the platform thereafter.
- Each document is issued with a generated cover page, a scope page stating who it applies to,
  and a header and footer carrying version and date.
- Documents open inside the application, with related material alongside, so reading is
  recorded rather than merely permitted.
- Download is available or withheld per document, at the owner's discretion.

**1.3 Content authoring and publication control**

Material may be uploaded, linked, or written inside the platform.

- The authoring studio produces structured documents with headings, tables, images, audio and
  video, with playback controls that prevent skipping where completion must be genuine.
- Revisions are issued as editions; where a change is material, prior completions are reset so
  that the record reflects the current version.
- Staff granted authoring rights submit work for approval rather than publishing directly, and
  a nominated manager reviews before anything reaches an audience.
- Distribution is set per branch: whether the item is mandatory, its deadline, whether it
  recurs, what must be completed first, and how it inherits down the subtree.

**1.4 Assessment**

Where reading is not sufficient evidence, the platform sets and marks papers.

- Single-answer, multiple-answer and true/false questions, with pass marks, question weighting,
  randomised order, time limits and a cap on attempts.
- Marking is performed on the server; the answer key is never sent to the candidate's device.
- A pass writes the same completion record as any other item, so assessed and unassessed
  learning report through one channel.
- Each sitting is recorded separately with score and timestamp, which converts attendance into
  evidence.

**1.5 Compliance monitoring and reporting**

- Reporting answers both operational questions: which people are behind on a given item, and
  where a named individual stands across everything that reaches them.
- Every row states the reason for its status, so a report can be acted on without
  interpretation.
- The deadline clock starts when an item actually reaches a person — the later of the date it
  was placed on their branch and the date they joined it — so nobody is recorded as overdue for
  a period during which they could not have complied.
- Reminders are issued in one action, with a standard or custom message, to those behind.
- The same calculation serves the branch report, the individual record, the learner's own view
  and the overnight sweep, so no two views of the organization can disagree.

**1.6 Identity, access and session control**

- Sign-in is password-based, with credentials stored using Argon2id hashing.
- Sessions are held by short-lived access tokens with refresh, and end after sixty minutes of
  inactivity — enforced by the server on every request, not by the browser.
- The last minute of a session is announced, so work is not lost to a timeout.
- Every authorization decision, in the interface and in the API alike, passes through a single
  policy function, which means access rules are reviewed and audited in one place.

**1.7 Data custody and security**

- Document contents are held on storage that Shish provides and controls. The platform writes a
  manifest alongside them describing structure and permissions.
- The organization holds an encrypted custody file, signed by the server, with which Shish can
  restore its own organization independently.
- Deleted organizations are retained for thirty days before removal, and individual branches
  can be backed up separately.
- Administrative actions are written to an append-only log.
- Access to a position that a person does not hold is refused and reported as refused, rather
  than quietly hidden.

**1.8 Requests, approvals and notifications**

- Joining a branch, requesting a course, removing a branch and changing visibility all run
  through a labelled approvals centre, with the pending count visible to whoever must decide.
- Approvals and refusals carry a written reason, and the decision reaches the requester.
- Notifications are categorised and link directly to the item awaiting action rather than to a
  general inbox.
- Updates appear across every open screen as they happen.

**1.9 Architecture and integration**

- The interface and the application programming interface are deployed as separate services, so
  integrations are built against a stable contract rather than against screens.
- Request and response formats are validated against shared schemas on both sides.
- The Paywell integration delivered under this proposal reads employee records and keeps
  platform profiles aligned with them.

**1.10 Documentation and enablement**

- A complete user guide is delivered with the platform and served from within it.
- Administrators additionally receive an operations runbook and a standard operating procedure
  written against Shish's own configuration.

---

### 2. Implementation roadmap

**One month and fifteen days — 45 calendar days.** Dates assume a kickoff on Monday 21
September 2026. The plan is deliberately weighted towards two things: getting the organization
structure right before anything is built on it, and leaving Shish able to operate the platform
without us.

| Phase | Activity | Dates | Outcome |
|-------|----------|-------|---------|
| 1 | Organization study and structure design | 21–27 Sep | Shish's reporting structure mapped to the role hierarchy; positions, ownership and delegation agreed on paper before configuration begins |
| 1 | Classification and access policy workshop | 24–27 Sep | Four-level classification agreed against Shish's document types; who may see, publish and approve what, recorded as a policy |
| 2 | Environment provisioning | 28 Sep–1 Oct | Tenant created, administrators enrolled, custody file issued and held by Shish |
| 2 | NAS integration and storage security | 29 Sep–4 Oct | Storage connected, credentials restricted to least privilege, write and read verified, encryption confirmed, manifest established |
| 3 | Role hierarchy build | 5–11 Oct | The agreed structure built and reviewed branch by branch with the managers who own each one |
| 3 | Library, shelves and compliance rules | 8–11 Oct | Category tags, mandatory items, deadlines, recurrence and escalation configured to the policy agreed in phase 1 |
| 4 | Content loading | 12–18 Oct | Existing material loaded, classified and shelved; authoring workshop for the teams who will maintain it |
| 4 | Paywell integration | 15–18 Oct | Employee records read from Paywell and reconciled against platform profiles |
| 5 | Phased user onboarding | 19–25 Oct | People enrolled and placed on roles in waves, so that no group receives a backlog of overdue items on its first day |
| 5 | Security validation and custody drill | 22–25 Oct | Access rights tested against the policy, audit log reviewed, and a full restore rehearsed from the custody file |
| 6 | Testing and user acceptance | 26 Oct–1 Nov | Functional testing, permission matrix verification, assessment sittings, and compliance reports validated against known data, with defects closed |
| 6 | Knowledge transfer | 26 Oct–1 Nov | The programme set out below, delivered and recorded |
| 7 | Production release | 2–3 Nov | Live operation, with our team present throughout the first two working days |
| 7 | Handover and support readiness | 4 Nov | Runbook, standard operating procedure, escalation route and first compliance review scheduled |

**Knowledge transfer programme.** Knowledge transfer is treated as a deliverable rather than a
closing formality, and is delivered by audience:

| Audience | Sessions | Covered |
|----------|----------|---------|
| Executive sponsor and custodian | 2 | Custody file and its safekeeping, the recovery procedure, what only they can authorise |
| Branch and department managers | 2 | Placing material, setting deadlines and recurrence, reading compliance, issuing reminders |
| Content authors and reviewers | 2 | Authoring, classification, the review and approval route, issuing revisions |
| Platform administrators | 2 | Enrolment and departure, approvals, storage health, backups, routine checks |
| Help desk and BAU | 1 | Common queries, triage, escalation route |

Sessions are recorded and handed over. The final week is run as supervised operation: your
administrators perform the work and we observe, rather than the reverse.

**Welfare of your people.** Two aspects of the rollout are designed around the staff rather
than the administrator. Onboarding is phased so that no group is enrolled into a backlog of
items already past their date, and the deadline calculation begins when an item reaches a
person, so an employee who joins a department in November is not reported as delinquent
against a requirement issued in September.

**What holds the dates.** Confirmation of the NAS specification before kickoff; a Shish point
of contact available through the engagement; the organization chart and the list of existing
documents available in week one; and acceptance sign-off within two working days of testing
completion.

---

### 3. Commercial proposal

All figures are in Indian Rupees and exclusive of GST.

**One-time charges**

| Item | Amount |
|------|-------:|
| Setup, configuration and knowledge transfer | **₹15,000** |
| Paywell HRMS integration | **₹5,000** |
| **Total one-time** | **₹20,000** |

Setup covers the full implementation described above — structure design, environment,
storage integration, configuration, content loading, testing and the knowledge transfer
programme. Loading your existing documents is part of it; there is no charge per document and
no limit on how many you bring.

**Subscription**

| Term | Access period | Amount | Works out at |
|------|---------------|-------:|-------------:|
| **Monthly** | 30 days | **₹23,999** | ₹23,999 per month |
| **Quarterly** | **110 days** — 90 days plus 20 days added | **₹71,999** | ₹19,636 per month |
| **Yearly** | **425 days** — 365 days plus 2 months added | **₹2,75,999** | ₹19,482 per month |

The quarterly term is charged as three months and runs for 110 days. The yearly term runs for
425 days, and is extended by a further month — to 455 days — where platform usage over the year
supports it, which we assess and confirm at renewal. Against paying monthly for the same span,
the quarterly term saves ₹15,997 and the yearly term ₹63,987, rising to ₹87,986 with the
additional month.

The subscription is for the organization and is not counted per user. Adding people, branches
or documents does not change it.

Nothing else recurs. Document storage sits on your NAS and carries no charge from us. No
third-party licences are embedded in the solution.

**Year one, on the yearly term**

| | Amount |
|---|-------:|
| Setup, configuration and knowledge transfer | ₹15,000 |
| Paywell integration | ₹5,000 |
| Subscription, 425 days | ₹2,75,999 |
| **Total** | **₹2,95,999** |

For an organization of about 250 people that is approximately ₹78 per person per month, and it
does not rise as Shish grows.

**Price transparency.** The amount contracted is fixed to the subscription term you select and
will not change within it. If our pricing changes during your contract, in either direction, we
will tell you in writing at the time and the revision applies only from your next renewal —
and where the revision is a reduction, the reduced rate is the rate you renew at. We would
rather you heard it from us than discovered it at renewal.

---

### 4. Optional scope

Available as separately scoped engagements, at any point during or after implementation.

| Item | One-time | Recurring |
|------|---------:|----------:|
| Single sign-on and multi-factor authentication | ₹45,000 | ₹9,000 per year |
| Automated joiner, mover and leaver processing from Paywell | ₹35,000 | ₹6,000 per year |
| Additional system integrations, per system | ₹25,000 | — |
| Extended analytics — question-level assessment analysis and management reporting | ₹30,000 | ₹6,000 per year |
| Audit export, retention scheduling and signed acknowledgement of reading | ₹28,000 | ₹6,000 per year |
| Priority support — four-hour response with a named engineer | — | ₹48,000 per year |
| Dedicated isolated environment | — | ₹72,000 per year |
| Additional users, branches or documents | Nil | Nil |

---

### 5. Paywell HRMS integration

The integration quoted above reads employee records from Paywell and keeps platform profiles
aligned with them. We would welcome a joint session with the Paywell team to confirm the
available interfaces, the authentication method, the fields exposed, how often synchronisation
may run, and any limits that apply. Please suggest a date convenient to you and we will
coordinate.

---

We are ready to begin on confirmation of the NAS specification and can hold the kickoff date of
21 September. I am happy to take any part of this in more detail, in writing or in a call.

Yours sincerely,

[Your name]
[Designation], Knowledge Vault
[Phone] · [Email] · [Website]

---

## Notes before sending

- **Never attach the internal break-up.** It is kept outside this repository. Check the thread
  before forwarding — the original request asked for both views in one message.
- **One-time is ₹20,000 in total and covers everything.** Do not reintroduce per-document or
  per-milestone charges; the recovery sits in the subscription.
- **The subscription figures assume we clear about ₹12,000 a month.** If that assumption is
  wrong, every figure in section 3 moves; confirm it before quoting.
- **Do not describe anything as forthcoming.** The proposal states what the platform does.
  Items not yet built are absent from section 1 and appear in section 4 as scoped work with a
  price, which is what they are.
- **The transparency clause is a commitment.** It binds us to notify a price change in writing
  and to honour reductions at renewal. Confirm it is acceptable before it goes out.
- **The 45-day plan depends on the NAS confirmation.** If that slips, the dates slip with it.
  Say so rather than compressing testing or knowledge transfer.
