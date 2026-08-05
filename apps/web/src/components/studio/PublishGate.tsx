"use client";

import { useState } from "react";
import { publishChecks, type PublishCheck, type PublishSubject } from "@vault/shared";

// The publish gate.
//
// Publishing used to fail behind a four-second toast naming one problem at a time, from a
// button on the far side of the screen from the field at fault. An author who had not
// chosen a classification was told "Classification is compulsory" — and not told where it
// lived, why it existed, or what else was also missing.
//
// This is the replacement: a standing panel that lists every outstanding item at once,
// says why each one is compulsory, and jumps to the field. It is rendered in two shapes
// from one set of checks — a compact strip beside the publish button, and the full list
// inside the properties panel — so the author sees the same truth wherever they look.

export function usePublishGate(subject: PublishSubject) {
  const checks = publishChecks(subject);
  const blockers = checks.filter((c) => c.required && !c.ok);
  const advisories = checks.filter((c) => !c.required && !c.ok);
  return { checks, blockers, advisories, ready: blockers.length === 0 };
}

/** Scroll the field a check refers to into view and put the cursor in it. */
export function focusCheck(id: PublishCheck["id"]) {
  const el = document.querySelector<HTMLElement>(`[data-check="${id}"]`);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.querySelector<HTMLElement>("input,textarea,select")?.focus({ preventScroll: true });
  el.dataset.flash = "true";
  window.setTimeout(() => delete el.dataset.flash, 1400);
}

/**
 * The compact strip in the top bar: how many items are outstanding, and a click opens the
 * list. Silent once everything is in order — a checklist that never goes away stops being
 * read.
 */
export function PublishReadiness({
  blockers,
  advisories,
  noun,
  onGo,
}: {
  blockers: PublishCheck[];
  advisories: PublishCheck[];
  noun: string;
  /** Called before focusing a field, so the caller can open the right tab first. */
  onGo?: (id: PublishCheck["id"]) => void;
}) {
  const [open, setOpen] = useState(false);
  const count = blockers.length;
  const ready = count === 0;

  return (
    <div className="pubgate" data-ready={ready} data-open={open}>
      <button
        type="button"
        className="pubgate-pill"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        data-hint={
          ready
            ? `Everything compulsory is filled in. This ${noun} can be published.`
            : `${count} compulsory ${count === 1 ? "item is" : "items are"} still missing. Click to see what, and why each one is needed.`
        }
        data-hint-title={ready ? "Ready to publish" : "Not ready yet"}
        data-hint-tone={ready ? "info" : "required"}
      >
        <span className="pubgate-mark" aria-hidden>
          {ready ? "✓" : count}
        </span>
        <span className="pubgate-text">
          {ready ? "Ready to publish" : `${count} to fill in`}
        </span>
        <span className="pubgate-caret" aria-hidden>
          ⌄
        </span>
      </button>

      {open && (
        <div className="pubgate-pop glass-strong" role="dialog" aria-label="Publish checklist">
          <h4 className="pubgate-h">
            {ready ? `This ${noun} is ready` : `Before this ${noun} can publish`}
          </h4>
          {ready && advisories.length === 0 && (
            <p className="pubgate-note">
              Everything compulsory is filled in, and nothing is left to advise on.
            </p>
          )}
          {blockers.length > 0 && (
            <ul className="pubgate-list">
              {blockers.map((c) => (
                <CheckRow key={c.id} check={c} onGo={onGo} onClose={() => setOpen(false)} />
              ))}
            </ul>
          )}
          {advisories.length > 0 && (
            <>
              <h5 className="pubgate-sub">Worth adding — not compulsory</h5>
              <ul className="pubgate-list pubgate-list-soft">
                {advisories.map((c) => (
                  <CheckRow key={c.id} check={c} onGo={onGo} onClose={() => setOpen(false)} />
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function CheckRow({
  check,
  onGo,
  onClose,
}: {
  check: PublishCheck;
  onGo?: (id: PublishCheck["id"]) => void;
  onClose: () => void;
}) {
  return (
    <li className="pubgate-item" data-required={check.required}>
      <button
        type="button"
        className="pubgate-item-btn"
        data-hint={check.why}
        data-hint-title={`Why ${check.label.toLowerCase()} is ${check.required ? "compulsory" : "worth adding"}`}
        data-hint-tone={check.required ? "required" : "info"}
        onClick={() => {
          onGo?.(check.id);
          onClose();
          // After the caller has switched tabs, the field exists to be scrolled to.
          window.setTimeout(() => focusCheck(check.id), 60);
        }}
      >
        <span className="pubgate-item-dot" aria-hidden />
        <span className="pubgate-item-main">
          <strong>{check.label}</strong>
          <small>{check.fix}</small>
        </span>
        <span className="pubgate-item-go" aria-hidden>
          Take me there →
        </span>
      </button>
    </li>
  );
}

/**
 * The same checklist, inline in the properties panel. This is the one an author reads
 * while they work, so it always shows — with a satisfied state rather than disappearing.
 */
export function PublishChecklist({
  checks,
  noun,
  onGo,
}: {
  checks: PublishCheck[];
  noun: string;
  onGo?: (id: PublishCheck["id"]) => void;
}) {
  const outstanding = checks.filter((c) => !c.ok);
  const blocking = outstanding.filter((c) => c.required).length;

  return (
    <div className="pubcheck" data-ready={blocking === 0}>
      <div className="pubcheck-head">
        <h4 className="insp-section" style={{ margin: 0 }}>
          Publish checklist
        </h4>
        <span className="pubcheck-count">
          {checks.filter((c) => c.ok).length}/{checks.length}
        </span>
      </div>
      <ul className="pubcheck-list">
        {checks.map((c) => (
          <li key={c.id} data-ok={c.ok} data-required={c.required}>
            <button
              type="button"
              className="pubcheck-row"
              data-hint={c.ok ? c.why : `${c.fix} — ${c.why}`}
              data-hint-title={`${c.label}${c.required ? " · compulsory" : " · optional"}`}
              data-hint-tone={c.required && !c.ok ? "required" : "info"}
              onClick={() => {
                onGo?.(c.id);
                window.setTimeout(() => focusCheck(c.id), 60);
              }}
            >
              <span className="pubcheck-tick" aria-hidden>
                {c.ok ? "✓" : c.required ? "✳" : "○"}
              </span>
              <span className="pubcheck-label">{c.label}</span>
              {!c.ok && (
                <span className="pubcheck-state">{c.required ? "required" : "optional"}</span>
              )}
            </button>
          </li>
        ))}
      </ul>
      <p className="pubcheck-foot">
        {blocking === 0
          ? `Nothing is blocking. This ${noun} can be published now.`
          : `${blocking} compulsory ${blocking === 1 ? "item" : "items"} outstanding — hover any line to read why it is needed.`}
      </p>
    </div>
  );
}
