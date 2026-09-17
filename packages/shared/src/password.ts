import { z } from "zod";

// The strength policy for a NEW password — docs/structure.md §8.9.
//
// One module, because the rule has to be the same sentence in three places: the checklist
// the person watches while typing, the client-side parse that stops the form, and the API
// that refuses the request. Anything computed twice eventually disagrees.
//
// Scope is deliberate: this governs passwords being CHOSEN (a new profile, a new
// organization's Supreme, a new super-admin, a backup file). It is never applied to a
// password being TYPED BACK — sign-in, the Supreme gate, a `.main` revival, a `.bkp`
// restore — because every one of those is an existing credential that was created under
// the old rules and must keep working exactly as it did.

export const PASSWORD_POLICY = {
  minLength: 12,
  maxLength: 200,
  /** How many characters of each class a password must carry. */
  upper: 1,
  lower: 1,
  digit: 1,
  symbol: 1,
} as const;

export type PasswordRuleId = "length" | "upper" | "lower" | "digit" | "symbol";

export interface PasswordRule {
  id: PasswordRuleId;
  /** How the checklist names it: "At least 12 characters". */
  label: string;
  /** How a sentence names it: "…needs a number and a symbol". */
  noun: string;
  met: boolean;
}

const UPPER = /[A-Z]/g;
const LOWER = /[a-z]/g;
const DIGIT = /[0-9]/g;
/** Anything that is not a letter or a number counts — including a space. */
const SYMBOL = /[^A-Za-z0-9]/g;

function count(value: string, pattern: RegExp): number {
  return value.match(pattern)?.length ?? 0;
}

/** Plural-aware phrasing, so a policy of 2 reads "Two uppercase letters" by itself. */
function times(n: number, one: string, many: string): string {
  return n <= 1 ? one : `${n} ${many}`;
}

/**
 * Every requirement, in checklist order, each marked met or not for the current value.
 * Always returns the full list — the UI shows what is still missing, not only what passed.
 */
export function passwordRules(value: string): PasswordRule[] {
  const p = PASSWORD_POLICY;
  return [
    {
      id: "length",
      label: `At least ${p.minLength} characters`,
      noun: `${p.minLength} characters`,
      met: value.length >= p.minLength,
    },
    {
      id: "upper",
      label: times(p.upper, "An uppercase letter (A–Z)", "uppercase letters (A–Z)"),
      noun: times(p.upper, "an uppercase letter", "uppercase letters"),
      met: count(value, UPPER) >= p.upper,
    },
    {
      id: "lower",
      label: times(p.lower, "A lowercase letter (a–z)", "lowercase letters (a–z)"),
      noun: times(p.lower, "a lowercase letter", "lowercase letters"),
      met: count(value, LOWER) >= p.lower,
    },
    {
      id: "digit",
      label: times(p.digit, "A number (0–9)", "numbers (0–9)"),
      noun: times(p.digit, "a number", "numbers"),
      met: count(value, DIGIT) >= p.digit,
    },
    {
      id: "symbol",
      label: times(p.symbol, "A symbol (!@#$…)", "symbols (!@#$…)"),
      noun: times(p.symbol, "a symbol", "symbols"),
      met: count(value, SYMBOL) >= p.symbol,
    },
  ];
}

export function passwordMeetsPolicy(value: string): boolean {
  return value.length <= PASSWORD_POLICY.maxLength && passwordRules(value).every((r) => r.met);
}

/** "a, b and c" — an English list, because this goes in front of a person. */
function joinWords(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/**
 * One sentence naming what is still missing, or null when the value passes. Named subject
 * ("Password", "Supreme password") so the same function speaks for every field.
 */
export function passwordPolicyMessage(value: string, subject = "Password"): string | null {
  if (value.length > PASSWORD_POLICY.maxLength) return `${subject} is too long`;
  const missing = passwordRules(value).filter((r) => !r.met);
  if (missing.length === 0) return null;

  const short = missing.find((r) => r.id === "length");
  const classes = missing.filter((r) => r.id !== "length").map((r) => r.noun);
  if (short && classes.length === 0) return `${subject} must be at least ${PASSWORD_POLICY.minLength} characters`;
  if (short) {
    return `${subject} must be at least ${PASSWORD_POLICY.minLength} characters and include ${joinWords(classes)}`;
  }
  return `${subject} needs ${joinWords(classes)}`;
}

// ── Strength ────────────────────────────────────────────────────────────────

export type PasswordStrengthLevel = "empty" | "weak" | "fair" | "good" | "strong";

export interface PasswordStrength {
  level: PasswordStrengthLevel;
  /** What the meter says out loud: "Fair", "Strong"… */
  label: string;
  /** 0–100, for the width of the bar. Moves on every keystroke, so it animates. */
  percent: number;
  /** Requirements satisfied, for "3 of 5 met". */
  met: number;
  total: number;
}

/** Keyboard walks and the runs people reach for when a rule demands a digit. */
const SEQUENCES = "abcdefghijklmnopqrstuvwxyz0123456789qwertyuiopasdfghjklzxcvbnm";

/**
 * Passwords that are common enough that length and variety say nothing about them.
 * A short list on purpose: it catches the reflex answers, and the rest of the score
 * does the real work. Compared case-insensitively, with digits/symbols stripped.
 */
const TIRED = [
  "password",
  "passw0rd",
  "welcome",
  "qwerty",
  "letmein",
  "admin",
  "administrator",
  "iloveyou",
  "monkey",
  "dragon",
  "sunshine",
  "princess",
  "football",
  "knowledgevault",
  "vault",
  "changeme",
  "secret",
];

/** Rough pool size for the classes actually used — the usual entropy back-of-envelope. */
function poolSize(value: string): number {
  let pool = 0;
  if (LOWER.test(value)) pool += 26;
  if (UPPER.test(value)) pool += 26;
  if (DIGIT.test(value)) pool += 10;
  if (SYMBOL.test(value)) pool += 33;
  // The literals above are /g, and a /g regex carries lastIndex between .test() calls.
  LOWER.lastIndex = UPPER.lastIndex = DIGIT.lastIndex = SYMBOL.lastIndex = 0;
  return Math.max(pool, 1);
}

function estimateBits(value: string): number {
  return value.length * Math.log2(poolSize(value));
}

/** 0–1: how much of the value is runs of the same character, or a straight sequence. */
function patternPenalty(value: string): number {
  if (value.length < 3) return 0;
  const lower = value.toLowerCase();
  let penalty = 0;

  // "aaa" — one long run can carry a password over the length rule while adding nothing.
  let run = 1;
  let longest = 1;
  for (let i = 1; i < lower.length; i++) {
    run = lower[i] === lower[i - 1] ? run + 1 : 1;
    longest = Math.max(longest, run);
  }
  if (longest >= 3) penalty += Math.min(0.2, (longest - 2) * 0.07);

  // "abcd", "1234", "qwer" — forwards or backwards. Four is enough to detect a walk;
  // a longer one is just more four-windows, and this runs on every keystroke.
  for (let i = 0; i + 4 <= lower.length; i++) {
    const slice = lower.slice(i, i + 4);
    const back = [...slice].reverse().join("");
    if (SEQUENCES.includes(slice) || SEQUENCES.includes(back)) penalty += 0.1;
  }

  const letters = lower.replace(/[^a-z]/g, "");
  if (letters.length >= 5 && TIRED.some((word) => letters.includes(word))) penalty += 0.3;

  return Math.min(penalty, 0.6);
}

const LEVEL_LABEL: Record<PasswordStrengthLevel, string> = {
  empty: "Not started",
  weak: "Weak",
  fair: "Fair",
  good: "Good",
  strong: "Strong",
};

/**
 * How strong the password looks, as a number the bar can animate to.
 *
 * Blended rather than pure entropy: the requirements carry weight of their own, so the
 * bar visibly rewards the checklist the person is working through, while length and
 * variety decide whether "met every rule" reads as Good or Strong. And the meter is
 * capped below "Good" until every requirement is met — a bar saying Strong over a form
 * that refuses to submit is the kind of thing people file bugs about.
 */
export function passwordStrength(value: string): PasswordStrength {
  const rules = passwordRules(value);
  const total = rules.length;
  const met = rules.filter((r) => r.met).length;
  if (!value) return { level: "empty", label: LEVEL_LABEL.empty, percent: 0, met, total };

  const ruleScore = met / total;
  const bitScore = Math.min(estimateBits(value) / 90, 1);
  const lengthScore = Math.min(value.length / (PASSWORD_POLICY.minLength + 8), 1);
  const raw = 0.42 * ruleScore + 0.36 * bitScore + 0.22 * lengthScore;

  let percent = Math.round(Math.max(0, raw - patternPenalty(value)) * 100);
  percent = Math.max(percent, 4); // a typed character always shows something
  if (met < total) percent = Math.min(percent, 55);
  percent = Math.min(percent, 100);

  const level: PasswordStrengthLevel =
    percent >= 85 ? "strong" : percent >= 60 ? "good" : percent >= 35 ? "fair" : "weak";
  return { level, label: LEVEL_LABEL[level], percent, met, total };
}

// ── The zod piece ───────────────────────────────────────────────────────────

/**
 * A field that must satisfy the policy. `subject` names the field in the error, so the
 * Supreme password says "Supreme password must be…" rather than a generic "Password".
 *
 * Use this ONLY where a new password is chosen. A field that receives an existing
 * password stays `z.string().min(1)` — see the note at the top of this file.
 */
export function strongPassword(subject = "Password") {
  return z.string().superRefine((value, ctx) => {
    const message = passwordPolicyMessage(value, subject);
    if (message) ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  });
}
