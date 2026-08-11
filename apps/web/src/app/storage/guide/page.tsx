"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { GUIDE_PREREQUISITES, nasGuideMarkdown, nasGuideSteps } from "@/lib/nas-guide";

// The storage setup guide — a window of its own, one step at a time.
//
// The storage form asks for four values and used to explain where they come from in a
// collapsed five-line summary. That is fine for somebody who has done this before and
// useless to everybody else, and the person who actually does the work — whoever runs the
// NAS — never sees our form at all.
//
// So this is a separate surface, opened in its own tab beside the form (the same way a
// document opens), which matters for two reasons: the reader can keep the form open and
// work between the two, and on a phone the guide gets the whole screen instead of being a
// panel squeezed inside a drawer. It carries `?from=` so a device with no tabs still has
// a way back.

/**
 * `useSearchParams` opts a route out of static prerendering unless it sits behind a
 * boundary, and the guide is otherwise a perfectly static page — so the boundary is here
 * rather than making the whole route dynamic for the sake of one optional `?from=`.
 */
export default function StorageGuidePage() {
  return (
    <Suspense fallback={<div className="guide-layer" />}>
      <StorageGuide />
    </Suspense>
  );
}

/**
 * Inline code, from the backticks the step text is written with. The same strings are
 * serialised to Markdown for the download, where backticks are exactly right — so rather
 * than stripping them for the screen, the screen learns to read them.
 */
function richText(text: string): React.ReactNode[] {
  return text.split(/`([^`]+)`/g).map((part, i) =>
    i % 2 === 1 ? (
      <code key={i} className="guide-inline-code">
        {part}
      </code>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

function StorageGuide() {
  const router = useRouter();
  const params = useSearchParams();
  const [origin, setOrigin] = useState("");
  const [index, setIndex] = useState(0);
  const [copied, setCopied] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());

  useEffect(() => setOrigin(window.location.origin), []);

  const steps = useMemo(() => nasGuideSteps(origin), [origin]);
  const step = steps[index];
  const totalMinutes = useMemo(() => steps.reduce((s, x) => s + x.minutes, 0), [steps]);

  useEffect(() => {
    document.title = "Setting up your storage · Knowledge Vault";
  }, []);

  // Only a path within this app is ever followed — a `from` from anywhere else is ignored.
  const from = params.get("from");
  const back = from && from.startsWith("/") && !from.startsWith("//") ? from : null;

  const go = useCallback(
    (next: number) => {
      setIndex(Math.max(0, Math.min(steps.length - 1, next)));
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [steps.length],
  );

  // ← and → walk the steps, as they do in the document reader.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (e.key === "ArrowRight") go(index + 1);
      if (e.key === "ArrowLeft") go(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, index]);

  const copy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      window.setTimeout(() => setCopied((c) => (c === id ? null : c)), 1600);
    } catch {
      /* a browser that refuses the clipboard still shows the text to select by hand */
    }
  };

  const download = () => {
    const blob = new Blob([nasGuideMarkdown(origin)], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "knowledge-vault-storage-setup.md";
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleDone = (id: string) =>
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /** Closing: back to the window that opened this, or to the page named in `?from=`. */
  const leave = () => {
    if (window.opener && !window.opener.closed) {
      window.close();
      window.setTimeout(() => {
        if (!window.closed && back) router.replace(back);
      }, 200);
      return;
    }
    router.replace(back ?? "/orgs");
  };

  if (!step) return null;
  const first = index === 0;
  const last = index === steps.length - 1;

  return (
    <div className="guide-layer">
      <header className="guide-head">
        <div className="guide-head-main">
          <span className="guide-kicker">Storage setup</span>
          <h1>Connecting your own storage</h1>
        </div>
        <div className="guide-head-actions">
          <button type="button" className="btn btn-quiet btn-small" onClick={download}>
            ⬇ Download for your IT
          </button>
          <button type="button" className="icon-btn" aria-label="Close the guide" onClick={leave}>
            ✕
          </button>
        </div>
      </header>

      {/* The rail is the map: how many steps there are, which one this is, and what is
          already behind you. It scrolls sideways on a phone rather than wrapping into
          four lines of chips. */}
      <nav className="guide-rail" aria-label="Setup steps">
        {steps.map((s, i) => (
          <button
            key={s.id}
            type="button"
            className="guide-rail-step"
            data-active={i === index}
            data-done={done.has(s.id) || i < index}
            aria-current={i === index ? "step" : undefined}
            onClick={() => go(i)}
          >
            <span className="guide-rail-n" aria-hidden>
              {done.has(s.id) || i < index ? "✓" : i + 1}
            </span>
            <span className="guide-rail-label">{s.short}</span>
          </button>
        ))}
      </nav>

      <div className="guide-progress" aria-hidden>
        <span style={{ width: `${((index + 1) / steps.length) * 100}%` }} />
      </div>

      <main className="guide-body">
        {/* Step one earns an extra panel: what to have ready before starting at all. */}
        {first && (
          <section className="guide-prereq">
            <h2>Before you start</h2>
            <p className="guide-lede">
              About {totalMinutes} minutes end to end, most of it waiting for downloads. You
              can leave this open and come back to it — nothing here has to be done in one
              sitting.
            </p>
            <ul>
              {GUIDE_PREREQUISITES.map((p) => (
                <li key={p}>{richText(p)}</li>
              ))}
            </ul>
          </section>
        )}

        <article className="guide-card" key={step.id}>
          <div className="guide-card-head">
            <span className="guide-step-of">
              Step {index + 1} of {steps.length}
            </span>
            <span className="guide-mins">~{step.minutes} min</span>
          </div>
          <h2 className="guide-title">{step.title}</h2>
          <p className="guide-why">{richText(step.why)}</p>

          <ol className="guide-todo">
            {step.todo.map((t) => (
              <li key={t}>{richText(t)}</li>
            ))}
          </ol>

          {step.commands?.map((c, i) => (
            <div className="guide-cmd" key={`${step.id}-${i}`}>
              <div className="guide-cmd-head">
                <span>{c.platform ?? "Run this"}</span>
                <button
                  type="button"
                  className="btn btn-quiet btn-tiny"
                  onClick={() => copy(`${step.id}-${i}`, c.code)}
                >
                  {copied === `${step.id}-${i}` ? "Copied" : "Copy"}
                </button>
              </div>
              <pre>{c.code}</pre>
            </div>
          ))}

          {step.check && (
            <p className="guide-check">
              <strong>You should see</strong> {richText(step.check)}
            </p>
          )}
          {step.warning && (
            <p className="guide-warn">
              <strong>Watch out.</strong> {richText(step.warning)}
            </p>
          )}

          <label className="guide-doneline">
            <input
              type="checkbox"
              checked={done.has(step.id)}
              onChange={() => toggleDone(step.id)}
            />
            <span>I have done this step</span>
          </label>
        </article>
      </main>

      <footer className="guide-foot">
        <button
          type="button"
          className="btn btn-quiet"
          disabled={first}
          onClick={() => go(index - 1)}
        >
          ← Back
        </button>
        <span className="guide-foot-mid" aria-hidden>
          {index + 1} / {steps.length}
        </span>
        {last ? (
          <button type="button" className="btn btn-primary" onClick={leave}>
            Back to the form
          </button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={() => go(index + 1)}>
            Next: {steps[index + 1].short} →
          </button>
        )}
      </footer>
    </div>
  );
}
