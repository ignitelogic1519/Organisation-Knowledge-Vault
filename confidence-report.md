# confidence-report.md — Pre-Coding Design Confidence Analysis

> Honest per-area confidence scoring of the design in `structure.md` / `architecture.md` /
> `plan.md`, done before any code is written. Low scores list the cause and the fix.
> Date: 2026-07-17

## Score Summary

| # | Area | Score | Status |
|---|------|-------|--------|
| 1 | Global profiles / memberships / placements | 9/10 | Solid — proven GitHub/GitLab pattern |
| 2 | Role tree & permission engine | 8/10 | Solid, needs an edge-case test matrix |
| 3 | Course code scheme | 8/10 | Solid, two small rules to fix now |
| 4 | Auth (JWT + Google + email/password) | 8/10 | Solid, one contradiction (→ #13) |
| 5 | In-app notifications | 8/10 | Solid |
| 6 | API-first for future mobile | 8/10 | Solid |
| 7 | Supreme concept & Supreme password | 7/10 | One irreversible-loss risk to accept explicitly |
| 8 | Course placements / inheritance / sharing | 7/10 | Needs 3 precedence rules defined |
| 9 | Compliance engine (recurrence, deadlines, escalation) | 7/10 | Escalation fallback + free-tier cron gap |
| 10 | Free-tier infrastructure | 7/10 | Known limits, all workable |
| 11 | `.main` file & revival | 6/10 | Fixable with 4 rules locked before coding |
| 12 | Google Drive adapter | 6/10 | OAuth scope choice decides success |
| 13 | **Exams in v1** | **5/10** | **Contradiction: upload-only v1 vs scored exams** |
| 14 | **`.bkp` restore** | **5/10** | **"Severely changed" is undefined; orphan edges** |

Overall design confidence: **7.5/10** — good enough to start Phase 0–2 immediately; items
#11–14 must be resolved before their phases (4, 6, 7), ideally now.

---

## Detailed Findings (low & medium scores)

### #14 — `.bkp` restore — 5/10 ⚠
**Why low.** "Restore everything like nothing happened, but only this node, not children, and
deny if the structure changed severely" hides four unsolved problems:
1. **"Severely" is not quantified.** The structureHash check needs an exact rule; without one,
   implementation becomes an arbitrary threshold nobody agreed to.
2. **Orphaned references.** The snapshot's completion records may point to courses deleted or
   re-versioned since; restored placements may reference people who left the org.
3. **Node/children consistency.** Children are not restored, but the restored node's structural
   fields (paths, flags) are what the untouched children hang from — a restore that changes the
   node's skeleton can strand its children.
4. **Cross-restore state.** Records restored in this node can disagree with live records for the
   same person+course elsewhere in the org.

**What to do (recommended v1 rule — needs owner sign-off):**
- Restore is allowed **only when the node's structural fingerprint is IDENTICAL** to the
  snapshot (same path, role number, child skeleton). Anything else → denied with the
  "structure changed severely" message. No tolerance percentage in v1 — strictest rule first,
  loosen later with the incident-management system.
- Orphan table decided in advance: record → course deleted ⇒ drop record; course version newer
  ⇒ keep record marked `courseVersion` (already in schema); person left org ⇒ skip placement,
  log it in the restore report shown to the restorer.
- Every restore produces a **restore report** (what was applied, what was skipped and why).

### #13 — Exams in v1 — 5/10 ⚠ (contradiction)
**Why low.** `structure.md` §5.8 says v1 is **upload-only** and the exam builder is in
`future.md`; but §5.6 and Phase 6 require **scored pass/fail exams with thresholds and
retakes**. A scored exam cannot be an uploaded file — the platform must know the questions and
answers to score it. These two decisions contradict each other.

**Options (one must be chosen before Phase 6):**
- (a) **Minimal MCQ exam builder in v1** — multiple-choice only, creator enters questions +
  correct answers + pass %, auto-scored. Small, contained scope. **Recommended.**
- (b) Defer exams entirely to the future authoring suite — Phase 6 shrinks to recurrence/
  deadlines only, compliance loses exams in v1.
- (c) "Honor-scored" exams — uploaded exam file + a role owner manually records pass/fail.
  Cheapest, but weakest compliance value.

### #11 — `.main` file & revival — 6/10
**Why lowered.** The concept is sound; the risk is in details that only hurt years later:
1. **Format drift** — a `.main` exported today must import into the app of 2028, whose DB schema
   will differ. If the bundle isn't versioned with import-migrations, old files become garbage.
2. **Org-number reuse** — if a purged org's number were ever reissued, a later revival collides.
3. **Storage refs go stale** — the org's Drive OAuth connection dies with the org; revival must
   include a "reconnect storage" step or media links dangle silently.
4. **Profile references** — exported records point to profile IDs that may be deleted by revival
   time.

**What to do (lock these 4 rules now — cheap today, impossible later):**
- Bundle header carries a **format version**; every future format change ships an import
  migration. (Already sketched in `architecture.md` — elevate to a hard rule.)
- **Org numbers are never reused**, even after purge. Global sequence only ever increments.
- Revival flow ends with a mandatory **storage reconnection step**; media stays listed but
  marked unreachable until reconnected.
- Exports store `profileId + email`; unmatched profiles on import become **pending members**
  re-attached when that email registers/joins.

### #12 — Google Drive adapter — 6/10
**Why low.** Two external risks we don't control:
1. **OAuth verification.** Broad Drive scopes are "restricted" — Google requires an expensive
   app-verification process; unverified apps are capped (~100 test users) with scary consent
   screens. **Mitigation that makes this a non-issue:** use only the **`drive.file`** scope
   (access solely to files our app created) — it is non-restricted, and it is all we need since
   we only touch files we upload.
2. **Streaming.** Drive is not a CDN; video playback relies on Drive's preview/stream URLs with
   quota and UX limits. Accepted v1 limitation — set expectations in the UI, and the adapter
   port means a proper backend can replace it later without redesign.

### #7 — Supreme password — 7/10
**Why not higher.** One secret now carries three powers: owner-level changes, `.main` download,
and `.main` decryption. **Losing it is unrecoverable by design** (the platform stores only a
hash). That's philosophically consistent with "the platform holds nothing crucial," but it must
be a *stated product decision*, not an accident.
**What to do:** creation flow shows an explicit warning + confirmation ("this password cannot be
recovered by anyone, including us"); product copy documents that a lost Supreme password means
owner-structure changes and revival are permanently impossible. Optional later: a one-time
recovery phrase shown at creation.

### #8 — Placements & inheritance — 7/10
**Why not higher.** Three precedence rules are still undefined; each is a one-line decision:
1. Same course reaches a user via two paths with conflicting flags → **mandatory wins over
   opt-in** (proposed).
2. A sub-role created *after* a placement with `inherit_to_descendants` → **inherits
   automatically** (proposed).
3. Removing a placement that has completion records → records are **kept** (history), the
   assignment disappears (proposed).

### #9 — Compliance engine — 7/10
**Why not higher.**
1. Escalation target = "person who added the user" — that person can leave the org. **Fallback
   chain needed:** adder → current owners of the node → up the branch (proposed).
2. **Free-tier cron gap:** recurrence/expiry needs a nightly job, but Render's free web service
   sleeps and free cron isn't guaranteed. **Fix:** expose the job as a protected API endpoint and
   trigger it with a free external scheduler (GitHub Actions `schedule` is enough).

### #10 — Free-tier infrastructure — 7/10
Known, accepted limits: Render cold starts (30–60 s after idle), Neon 0.5 GB (fine — media never
in DB), Gmail low send volume (only one transactional mail in v1; use an App Password, and note
Google can change personal-Gmail SMTP policy — swap to a free transactional provider if it
breaks). Nothing here blocks v1.

### #2 — Role tree & permissions — 8/10
The model is right; the residual risk is edge cases, not design. **Action:** before Phase 3,
write a test matrix of the tricky scenarios (same profile owner-in-branch-A + member-in-branch-B;
flag changes mid-session; branch restructure while invitations are pending; last-owner blocks)
and make them the Phase 3 acceptance tests.

### #3 — Course codes — 8/10
Two rules to fix now: **role numbers are never reused** after role deletion (same reasoning as
org numbers), and a course keeps its original code forever even if its uploader role is later
deleted (the code is historical identity, not current location).

### #4 — Auth — 8/10 (one contradiction)
Phase 1 includes **email verification**, but v1's only email is the deletion mail. Resolution:
the same platform Gmail sends verification mails too (tiny volume, fine), or verification is
soft (warn-but-allow) until the email system matures. **Proposed: use the platform Gmail.**

---

## Decisions Needed From the Owner (blocking their phases, not Phase 0)

| Decision | Blocks | Recommendation |
|----------|--------|----------------|
| D1: Exams in v1 — minimal MCQ builder / defer / honor-scored | Phase 6 | Minimal MCQ builder |
| D2: `.bkp` restore rule — identical-structure-only in v1? | Phase 7 | Yes, strictest first |
| D3: The 4 `.main` durability rules | Phase 7 | Adopt all four |
| D4: Placement precedence rules (3 proposals in #8) | Phase 4 | Adopt as proposed |
| D5: Escalation fallback chain | Phase 6 | Adopt as proposed |
| D6: Email verification via platform Gmail | Phase 1 | Yes |

Phase 0 (scaffold + deploys) is unblocked regardless — nothing above changes the skeleton.
