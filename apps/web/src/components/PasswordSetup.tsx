"use client";

import { useId, useState } from "react";
import { PASSWORD_POLICY, passwordRules, passwordStrength } from "@vault/shared";

/**
 * The block every "choose a password" form uses — docs/design.md §Password setup.
 *
 * Three things at once, because a password rule the person discovers only when the form
 * refuses them is a rule that wastes their time twice:
 *   · the fields themselves, with a reveal toggle (a 12-character password with a symbol
 *     in it is not something anyone types blind twice);
 *   · a live checklist beside them — every requirement, ticked as it is satisfied, so
 *     "what is left" is always on screen;
 *   · a strength meter along the bottom that animates as they type.
 *
 * It is NEVER used on a sign-in form. Sign-in takes an existing password, created under
 * whatever rules applied at the time, and telling someone their working password is
 * "Weak" as they sign in is noise they cannot act on.
 *
 * The layout adapts to whatever column it lands in (container query, not viewport): wide
 * enough and the checklist sits beside the fields, narrow and it drops underneath.
 */

/** Which host's form idiom to wear — the three the app actually has. */
type Variant = "bootstrap" | "field" | "kb";

interface Props {
  value: string;
  onValueChange: (value: string) => void;
  /** Provide both to render the retype field; omit for a single-field form. */
  confirm?: string;
  onConfirmChange?: (value: string) => void;
  variant?: Variant;
  passwordName?: string;
  confirmName?: string;
  passwordLabel?: React.ReactNode;
  confirmLabel?: React.ReactNode;
  /** Extra sentence under the password field — what this password unlocks, say. */
  note?: React.ReactNode;
  autoFocus?: boolean;
  required?: boolean;
  /** Title over the checklist. Named per surface ("Supreme password must have…"). */
  rulesHeading?: string;
}

function RevealButton({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className="pw-reveal"
      onClick={onToggle}
      aria-pressed={shown}
      aria-label={shown ? "Hide password" : "Show password"}
      title={shown ? "Hide password" : "Show password"}
    >
      <span aria-hidden>{shown ? "🙈" : "👁"}</span>
    </button>
  );
}

export function PasswordSetup({
  value,
  onValueChange,
  confirm,
  onConfirmChange,
  variant = "field",
  passwordName = "password",
  confirmName = "password2",
  passwordLabel = "Password",
  confirmLabel = "Retype to confirm",
  note,
  autoFocus,
  required = true,
  rulesHeading = "Your password needs",
}: Props) {
  const uid = useId();
  const [shown, setShown] = useState(false);
  const rules = passwordRules(value);
  const strength = passwordStrength(value);
  const withConfirm = confirm !== undefined && onConfirmChange !== undefined;
  const matches = withConfirm && confirm.length > 0 && confirm === value;
  const mismatch = withConfirm && confirm.length > 0 && confirm !== value;

  const field = (
    id: string,
    label: React.ReactNode,
    name: string,
    fieldValue: string,
    onChange: (v: string) => void,
    opts: { autoFocus?: boolean; reveal?: boolean; help?: React.ReactNode } = {},
  ) => {
    const input = (
      <div className="pw-input-wrap">
        <input
          id={id}
          name={name}
          type={shown ? "text" : "password"}
          className={variant === "bootstrap" ? "form-control" : undefined}
          autoComplete="new-password"
          autoFocus={opts.autoFocus}
          required={required}
          minLength={PASSWORD_POLICY.minLength}
          maxLength={PASSWORD_POLICY.maxLength}
          value={fieldValue}
          onChange={(e) => onChange(e.target.value)}
        />
        {opts.reveal && <RevealButton shown={shown} onToggle={() => setShown((s) => !s)} />}
      </div>
    );

    if (variant === "bootstrap") {
      return (
        <div className="pw-field text-start">
          <label className="form-label" htmlFor={id}>
            {label}
          </label>
          {input}
          {opts.help && <div className="form-text">{opts.help}</div>}
        </div>
      );
    }
    if (variant === "kb") {
      return (
        <label className="kb-label pw-field" htmlFor={id}>
          {label}
          {input}
          {opts.help && <small className="pw-field-help">{opts.help}</small>}
        </label>
      );
    }
    return (
      <label className="field pw-field" htmlFor={id}>
        <span>{label}</span>
        {input}
        {opts.help && <small>{opts.help}</small>}
      </label>
    );
  };

  return (
    <div className="pw-setup" data-variant={variant}>
      <div className="pw-setup-grid">
        <div className="pw-setup-fields">
          {field(`${uid}-pw`, passwordLabel, passwordName, value, onValueChange, {
            autoFocus,
            reveal: true,
            help: note,
          })}
          {withConfirm &&
            field(`${uid}-pw2`, confirmLabel, confirmName, confirm, onConfirmChange, {
              help: mismatch ? (
                <span className="pw-match" data-state="off">
                  The two entries don&apos;t match yet
                </span>
              ) : matches ? (
                <span className="pw-match" data-state="on">
                  ✓ Both entries match
                </span>
              ) : (
                "Type it again to confirm you got it right"
              ),
            })}
        </div>

        <div className="pw-rules glass">
          <p className="pw-rules-head">{rulesHeading}</p>
          <ul className="pw-rules-list">
            {rules.map((rule) => (
              <li key={rule.id} className="pw-rule" data-met={rule.met}>
                <span className="pw-rule-mark" aria-hidden>
                  {rule.met ? "✓" : ""}
                </span>
                <span className="pw-rule-text">{rule.label}</span>
                <span className="sr-only">{rule.met ? " — done" : " — still needed"}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* The meter: one track along the bottom, filling and changing colour as the
          password grows. Held below "Good" until every requirement is ticked, so it can
          never read Strong over a form that would refuse to submit. */}
      <div className="pw-meter" data-level={strength.level}>
        <div
          className="pw-meter-track"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={strength.percent}
          aria-valuetext={`${strength.label} — ${strength.met} of ${strength.total} requirements met`}
          aria-label="Password strength"
        >
          <span className="pw-meter-fill" style={{ width: `${strength.percent}%` }} />
        </div>
        <div className="pw-meter-head">
          <span>Password strength</span>
          <strong key={strength.level} className="pw-meter-label">
            {value ? strength.label : "—"}
          </strong>
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        {value
          ? `${strength.met} of ${strength.total} requirements met. Strength: ${strength.label}.`
          : ""}
      </p>
    </div>
  );
}
