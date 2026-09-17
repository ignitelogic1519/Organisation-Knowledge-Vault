// Password policy tests — the rules, the meter, and the line the policy must not cross.
//
// Run with `pnpm --filter @vault/api test` (builds first).
//
// Two things are being protected here. The first is the policy itself: the checklist, the
// sentence it produces when something is missing, and a strength meter that can never say
// "Strong" over a password the form would refuse. The second matters more — every
// password that ALREADY EXISTS has to keep working. Profiles, Supreme passwords and admin
// accounts created before this policy were made under looser rules, and a strength check
// on a sign-in form would lock every one of them out. That is what the second half of
// this file stands guard over.

import assert from "node:assert/strict";
import test from "node:test";

const {
  PASSWORD_POLICY,
  adminLoginSchema,
  addAdminSchema,
  changeAdminPasswordSchema,
  createOrgSchema,
  loginSchema,
  passwordMeetsPolicy,
  passwordPolicyMessage,
  passwordRules,
  passwordStrength,
  registerSchema,
  supremeVerifySchema,
} = await import("@vault/shared");

/** A password that satisfies every rule, for the "is it the policy or this field?" cases. */
const GOOD = "Harbour-Lantern-42!";

// ── The checklist ────────────────────────────────────────────────────────────

test("every requirement is reported, met or not", () => {
  const rules = passwordRules("abc");
  assert.equal(rules.length, 5, "length, upper, lower, digit, symbol");
  const byId = Object.fromEntries(rules.map((r) => [r.id, r.met]));
  assert.deepEqual(byId, {
    length: false,
    upper: false,
    lower: true,
    digit: false,
    symbol: false,
  });
});

test("each class is recognised, including a space as a symbol", () => {
  const met = (value, id) => passwordRules(value).find((r) => r.id === id).met;
  assert.equal(met("A", "upper"), true);
  assert.equal(met("a", "lower"), true);
  assert.equal(met("7", "digit"), true);
  assert.equal(met("!", "symbol"), true);
  assert.equal(met("two words", "symbol"), true, "a passphrase's space counts");
  assert.equal(met("é", "symbol"), true, "and so does anything else non-alphanumeric");
});

test("the length rule is the policy's own number, inclusive", () => {
  const min = PASSWORD_POLICY.minLength;
  const at = (n) => passwordRules("a".repeat(n)).find((r) => r.id === "length").met;
  assert.equal(at(min - 1), false);
  assert.equal(at(min), true, "the minimum itself passes");
});

test("a password that satisfies everything passes, and a long one-class one does not", () => {
  assert.equal(passwordMeetsPolicy(GOOD), true);
  assert.equal(passwordMeetsPolicy("aaaaaaaaaaaaaaaaaaaaaaaa"), false, "length is not enough");
});

// ── What it says when something is missing ───────────────────────────────────

test("the message names what is missing, and nothing else", () => {
  assert.equal(passwordPolicyMessage(GOOD), null, "nothing to say when it passes");
  assert.match(passwordPolicyMessage("harbour-lantern-x"), /needs an uppercase letter and a number/);
  assert.match(passwordPolicyMessage("Short1!"), /at least 12 characters/);
  assert.match(
    passwordPolicyMessage("Shorty1"),
    /at least 12 characters and include a symbol/,
    "a short password still names its missing classes",
  );
});

test("the subject is the field's own name", () => {
  assert.match(passwordPolicyMessage("weak", "Supreme password"), /^Supreme password must/);
  assert.match(passwordPolicyMessage("a".repeat(500), "Backup password"), /^Backup password is too long/);
});

// ── The meter ────────────────────────────────────────────────────────────────

test("an empty box reads as nothing, not as weak", () => {
  const s = passwordStrength("");
  assert.equal(s.level, "empty");
  assert.equal(s.percent, 0);
});

test("the meter never says Good while a requirement is unmet", () => {
  // The whole point of the cap: a bar reading Strong over a form that refuses to submit
  // is the kind of thing people file bugs about.
  const long = "abcdefghijklmnopqrstuvwxyz".repeat(2); // 52 chars, one class
  const s = passwordStrength(long);
  assert.equal(passwordMeetsPolicy(long), false);
  assert.ok(s.percent <= 55, `capped, got ${s.percent}`);
  assert.ok(s.level === "weak" || s.level === "fair", `got ${s.level}`);
});

test("meeting every rule reads at least Good, and a long one reads Strong", () => {
  assert.ok(["good", "strong"].includes(passwordStrength(GOOD).level));
  assert.equal(passwordStrength("Harbour-Lantern-Quietly-42!").level, "strong");
});

test("padding and keyboard walks are not strength", () => {
  const padded = passwordStrength("Aa1!aaaaaaaaaaaaaaaa").percent;
  const varied = passwordStrength("Aa1!qnvXbrT7%kLp").percent;
  assert.ok(varied > padded, `variety ${varied} should beat repetition ${padded}`);
  assert.ok(
    passwordStrength("Abcdefgh1234!xyz").percent < varied,
    "a straight run through the alphabet is not a strong password",
  );
  assert.ok(
    passwordStrength("Password12345!").percent < varied,
    "and neither is the first word everyone reaches for",
  );
});

test("the meter reports the checklist alongside the score", () => {
  const s = passwordStrength("Aa1!");
  assert.equal(s.total, 5);
  assert.equal(s.met, 4, "everything but the length");
});

// ── Where the policy applies: a password being CHOSEN ────────────────────────

test("a new profile must meet the policy", () => {
  assert.equal(registerSchema.shape.password.safeParse("shortish1").success, false);
  assert.equal(registerSchema.shape.password.safeParse("alllowercase!1x").success, false);
  assert.equal(registerSchema.shape.password.safeParse(GOOD).success, true);
});

test("a new organization's Supreme password must meet the policy", () => {
  const field = createOrgSchema.shape.supremePassword;
  const weak = field.safeParse("twelvechars!");
  assert.equal(weak.success, false, "twelve characters is no longer enough on its own");
  assert.match(weak.error.issues[0].message, /^Supreme password/);
  assert.equal(field.safeParse(GOOD).success, true);
});

test("a new super-admin's temporary password must meet the policy", () => {
  assert.equal(addAdminSchema.shape.password.safeParse("temporary1").success, false);
  assert.equal(addAdminSchema.shape.password.safeParse(GOOD).success, true);
});

test("an admin choosing a new password must meet the policy", () => {
  const weak = changeAdminPasswordSchema.safeParse({
    currentPassword: "whatever-they-have-today",
    newPassword: "newpassword1",
    confirm: "newpassword1",
  });
  assert.equal(weak.success, false);
  assert.equal(
    changeAdminPasswordSchema.safeParse({
      currentPassword: "whatever-they-have-today",
      newPassword: GOOD,
      confirm: GOOD,
    }).success,
    true,
  );
});

// ── Where it must NOT apply: a password being TYPED BACK ─────────────────────

test("signing in accepts a password made under the old rules", () => {
  // The regression this file exists for. Every one of these is a real password someone
  // could be holding right now; refusing any of them at the door is an outage.
  for (const old of ["password", "letmein", "hunter2", "a", "CJP@2000", "10charlong"]) {
    assert.equal(loginSchema.shape.password.safeParse(old).success, true, old);
    assert.equal(adminLoginSchema.shape.password.safeParse(old).success, true, old);
    assert.equal(supremeVerifySchema.shape.password.safeParse(old).success, true, old);
  }
});

test("an empty box is still refused where a password is required", () => {
  assert.equal(loginSchema.shape.password.safeParse("").success, false);
  assert.equal(supremeVerifySchema.shape.password.safeParse("").success, false);
});

test("proving the CURRENT password is never a strength check", () => {
  // Their existing console password may well be weak — that is exactly why they are on
  // this form. Only the new one is held to the policy.
  assert.equal(
    changeAdminPasswordSchema.safeParse({
      currentPassword: "weak",
      newPassword: GOOD,
      confirm: GOOD,
    }).success,
    true,
  );
});

test("a KVEP creator re-entering their own admin password is not held to the policy", () => {
  const field = createOrgSchema.shape.kvepAdmin;
  const parsed = field.safeParse({ username: "adminbase", password: "CJP@2000" });
  assert.equal(parsed.success, true, "an existing staff credential, typed back");
});
