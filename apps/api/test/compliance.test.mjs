// Compliance arithmetic — deadlines, lapses and what "overdue" is allowed to mean
// (docs/structure.md §3.4).
//
// Run with `pnpm --filter @vault/api test` (builds first).
//
// These cover the reported failure directly: somebody who HAD completed the course was
// being reported as overdue. Every one of these cases used to answer the other way, and
// each of them is a person the report would accuse of being late for days they never
// had — so they are worth pinning down in a test that needs no database.

import assert from "node:assert/strict";
import test from "node:test";

process.env.JWT_SECRET ??= "test-secret-for-compliance-tests";

const {
  deadlineStartsAt,
  effectiveStatus,
  hasLapsed,
  isCompliant,
  isPastDeadline,
  laterOf,
} = await import("../dist/courses/helpers.js");

const DAY = 86400_000;
const NOW = new Date("2026-08-19T12:00:00.000Z");
const ago = (days) => new Date(NOW.getTime() - days * DAY);
const ahead = (days) => new Date(NOW.getTime() + days * DAY);

/** The shape the views hand the arithmetic. */
const record = (patch) => ({
  status: "COMPLETED",
  completedAt: ago(30),
  validUntil: null,
  ...patch,
});

// ── What counts as compliant ─────────────────────────────────────────────────

test("a completion counts until the day it stops counting", () => {
  assert.equal(isCompliant(null, NOW), false, "nothing done is not compliance");
  assert.equal(isCompliant(record(), NOW), true, "completed, never expires");
  assert.equal(isCompliant(record({ validUntil: ahead(30) }), NOW), true, "still valid");
  assert.equal(isCompliant(record({ validUntil: ago(1) }), NOW), false, "lapsed yesterday");
  assert.equal(isCompliant(record({ status: "IN_PROGRESS" }), NOW), false, "started is not done");
});

test("a lapsed completion reads EXPIRED without waiting for the nightly sweep", () => {
  // The job that rewrites lapsed rows runs once a night, from an external scheduler. In
  // the hours before it does, the row still says COMPLETED — and the report used to
  // repeat that word next to a red "overdue" badge, which is the contradiction the bug
  // report was describing.
  const lapsed = record({ validUntil: ago(1) });
  assert.equal(hasLapsed(lapsed, NOW), true);
  assert.equal(effectiveStatus(lapsed, true, NOW), "EXPIRED");
  assert.equal(effectiveStatus(record({ validUntil: ahead(1) }), true, NOW), "COMPLETED");
  assert.equal(effectiveStatus(null, true, NOW), "ASSIGNED", "mandatory and untouched");
  assert.equal(effectiveStatus(null, false, NOW), "AVAILABLE", "opt-in and untouched");
});

// ── When the clock starts ────────────────────────────────────────────────────

test("the deadline runs from when the course reached the person", () => {
  // "How long someone has to finish it after it reaches them" — the Studio's own words
  // for the field. A course placed on the branch two years ago reaches somebody the day
  // they arrive, not the day it was placed.
  const placedAt = ago(730);
  const joinedToday = laterOf(placedAt, NOW);
  assert.equal(joinedToday.getTime(), NOW.getTime());
  assert.equal(
    isPastDeadline(deadlineStartsAt({ reachedAt: joinedToday, now: NOW }), 30, NOW),
    false,
    "a new joiner has the whole window, not none of it",
  );
  assert.equal(
    isPastDeadline(deadlineStartsAt({ reachedAt: placedAt, now: NOW }), 30, NOW),
    true,
    "somebody who was there all along really is late",
  );
});

test("a lapsed recurrence opens the next cycle instead of arriving late", () => {
  // The reported bug. An annual course, completed on time a year ago, lapsed last night:
  // the person is due to do it again — they are not a year late for it.
  const lapsedLastNight = record({ completedAt: ago(366), validUntil: ago(1) });
  const startsAt = deadlineStartsAt({
    reachedAt: ago(730),
    record: lapsedLastNight,
    now: NOW,
  });
  assert.equal(startsAt.getTime(), ago(1).getTime(), "the clock restarts when it lapsed");
  assert.equal(isPastDeadline(startsAt, 30, NOW), false, "one day into a 30-day window");

  // And the window does close — this is a deadline, not an amnesty.
  const long = new Date(NOW.getTime() + 40 * DAY);
  assert.equal(isPastDeadline(startsAt, 30, long), true, "40 days later it is genuinely late");
});

test("an edition published with reset-on-update restarts the window too", () => {
  // Same promise from the other direction: the author republished the document and chose
  // to expire what everyone had done. That is a new obligation, dated to the republish.
  const done = record({ completedAt: ago(180), validUntil: null, status: "EXPIRED" });
  const startsAt = deadlineStartsAt({
    reachedAt: ago(400),
    record: done,
    resetEditions: [{ publishedAt: ago(1) }],
    now: NOW,
  });
  assert.equal(startsAt.getTime(), ago(1).getTime());
  assert.equal(isPastDeadline(startsAt, 14, NOW), false);
});

test("an edition older than the completion changes nothing", () => {
  // They completed the course AFTER that edition landed — it cannot re-open anything,
  // and a future-dated row must not either.
  const startsAt = deadlineStartsAt({
    reachedAt: ago(400),
    record: record({ completedAt: ago(180), validUntil: ago(2) }),
    resetEditions: [{ publishedAt: ago(200) }, { publishedAt: ahead(5) }],
    now: NOW,
  });
  assert.equal(startsAt.getTime(), ago(2).getTime(), "only the lapse counts here");
});

test("the latest re-opening wins when both happened", () => {
  const startsAt = deadlineStartsAt({
    reachedAt: ago(400),
    record: record({ completedAt: ago(180), validUntil: ago(10) }),
    resetEditions: [{ publishedAt: ago(3) }],
    now: NOW,
  });
  assert.equal(startsAt.getTime(), ago(3).getTime());
});

test("somebody who never completed it is still overdue", () => {
  // The whole point of the report: fixing the false accusations must not silence the
  // true ones.
  const startsAt = deadlineStartsAt({ reachedAt: ago(60), record: null, now: NOW });
  assert.equal(startsAt.getTime(), ago(60).getTime(), "nothing re-opens for them");
  assert.equal(isPastDeadline(startsAt, 7, NOW), true);
  assert.equal(isPastDeadline(startsAt, 90, NOW), false, "inside a longer window");
});

test("a course with no deadline is never late", () => {
  assert.equal(isPastDeadline(ago(3650), null, NOW), false);
});
