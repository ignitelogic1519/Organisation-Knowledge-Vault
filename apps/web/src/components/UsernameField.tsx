"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { people, type PersonSuggestion } from "@/lib/courses-client";

// Username input with live suggestions, GitLab-style: type two characters and the people
// who match appear underneath, so you can see whether the person you mean actually exists
// before you commit. It stays a plain text input underneath — an unknown username is still
// accepted (it becomes a reservation that attaches when that person registers), unless the
// caller says otherwise with `mustExist`.
//
// One component serves every form that asks for a person, because the three that did it
// their own way — the org's add-person drawer, the super-admin console, the compliance
// look-up — each answered "who exists?" differently, and two of them did not answer at
// all. A caller that reaches a different directory (the super-admin console searches every
// account through the admin API) passes its own `source`; everything else about the field
// is identical.
//
// The lookup is debounced and every in-flight response is stamped, so a slow answer for
// "an" can never overwrite the answer for "anna".

export type Suggestion = PersonSuggestion;

export function UsernameField({
  name = "username",
  orgId,
  memberOfOrgId,
  label = "Username",
  hint,
  required,
  autoFocus,
  defaultValue = "",
  value: controlled,
  placeholder = "their-username",
  source,
  labelClassName = "field",
  emptyNote,
  onPick,
  onChange,
}: {
  name?: string;
  /** Marks people who already belong to this organization. */
  orgId?: string;
  /** Offers ONLY that organization's own people — a member directory, not the platform. */
  memberOfOrgId?: string;
  label?: string;
  hint?: React.ReactNode;
  required?: boolean;
  autoFocus?: boolean;
  defaultValue?: string;
  /** Controlled mode — pair it with `onChange`. */
  value?: string;
  placeholder?: string;
  /** Where the suggestions come from, when it is not the ordinary member directory. */
  source?: (q: string) => Promise<Suggestion[]>;
  /** The label's class — forms outside the app shell (the console) style their own. */
  labelClassName?: string;
  /** What to say when nobody matches. The default assumes an unknown name is allowed. */
  emptyNote?: React.ReactNode;
  onPick?: (username: string) => void;
  onChange?: (username: string) => void;
}) {
  const listId = useId();
  const [inner, setInner] = useState(defaultValue);
  const value = controlled ?? inner;
  const setValue = (next: string) => {
    if (controlled === undefined) setInner(next);
    onChange?.(next);
  };
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [state, setState] = useState<"idle" | "searching" | "none">("idle");
  const seq = useRef(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const search = useCallback(
    (q: string) => {
      const term = q.trim();
      if (term.length < 2) {
        setItems([]);
        setState("idle");
        return;
      }
      const mine = ++seq.current;
      setState("searching");
      const lookup = source
        ? source(term)
        : people.search(term, { orgId, memberOfOrgId }).then((r) => r.profiles);
      lookup
        .then((profiles) => {
          if (mine !== seq.current) return; // a newer keystroke already won
          setItems(profiles);
          setState(profiles.length ? "idle" : "none");
          setActive(-1);
        })
        .catch(() => {
          if (mine === seq.current) setState("idle");
        });
    },
    [orgId, memberOfOrgId, source],
  );

  useEffect(() => {
    const t = setTimeout(() => search(value), 220);
    return () => clearTimeout(t);
  }, [value, search]);

  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, []);

  const choose = (s: Suggestion) => {
    setValue(s.username);
    setOpen(false);
    onPick?.(s.username);
  };

  return (
    <div className="username-field" ref={wrapRef}>
      <label className={labelClassName}>
        <span>{label}</span>
        <input
          name={name}
          value={value}
          required={required}
          autoFocus={autoFocus}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          role="combobox"
          aria-expanded={open && items.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          onChange={(e) => {
            setValue(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (!open || items.length === 0) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => (i + 1) % items.length);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => (i <= 0 ? items.length - 1 : i - 1));
            } else if (e.key === "Enter" && active >= 0) {
              e.preventDefault();
              choose(items[active]);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
        />
        {hint && <small>{hint}</small>}
      </label>

      {open && value.trim().length >= 2 && (
        <ul className="username-suggest" id={listId} role="listbox">
          {state === "searching" && items.length === 0 && (
            <li className="username-suggest-note auth-sub">Looking…</li>
          )}
          {state === "none" && (
            <li className="username-suggest-note auth-sub">
              {emptyNote ?? (
                <>
                  Nobody registered under that name yet — you can still add it, and the place
                  is reserved until they sign up.
                </>
              )}
            </li>
          )}
          {items.map((s, i) => (
            <li key={s.username}>
              <button
                type="button"
                role="option"
                aria-selected={i === active}
                className="username-suggest-item"
                data-active={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(s)}
              >
                {s.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="username-suggest-avatar" src={s.avatar} alt="" />
                ) : (
                  <span className="username-suggest-avatar" aria-hidden>
                    {s.displayName.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <span className="username-suggest-text">
                  <strong>@{s.username}</strong>
                  <span className="auth-sub">{s.displayName}</span>
                </span>
                {s.alreadyMember && <span className="badge">already here</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
