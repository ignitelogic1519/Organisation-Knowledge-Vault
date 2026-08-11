"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  buildGuide,
  decisionsSoFar,
  EMPTY_ANSWERS,
  suggestPassword,
  type Answers,
  type Block,
  type Depth,
  type Step,
} from "@/lib/nas-guide";
import { downloadGuidePdf } from "@/lib/nas-guide-pdf";

// The storage setup guide.
//
// A window of its own, opened beside the storage form, that asks the reader questions and
// rewrites itself around the answers. Which machine they have decides where they click.
// Whether they own a domain decides which kind of tunnel they build, and the choice is
// presented with its costs rather than as a fork they have to guess at. The folder, the
// bucket, the user name and the address they type are substituted into every command that
// follows, so nothing is left to fill in by hand and nothing is mistyped.
//
// Two depths, switched in the header: everything, or just the doing. They are the same
// steps — one explains what a bucket is and why a datacentre cannot see an office, the
// other assumes you know.
//
// Answers survive a reload. Somebody who gets halfway, goes off to buy a domain and comes
// back tomorrow should not have to start again.

const STORAGE_KEY = "kv.storage-guide";

export default function StorageGuidePage() {
  return (
    <Suspense fallback={<div className="guide-layer" />}>
      <StorageGuide />
    </Suspense>
  );
}

function StorageGuide() {
  const router = useRouter();
  const params = useSearchParams();
  const [origin, setOrigin] = useState("");
  const [answers, setAnswers] = useState<Answers>(EMPTY_ANSWERS);
  const [depth, setDepth] = useState<Depth>("basic");
  const [index, setIndex] = useState(0);
  const [copied, setCopied] = useState<string | null>(null);
  const [done, setDone] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { answers?: Answers; depth?: Depth; done?: string[] };
        if (saved.answers) setAnswers({ ...EMPTY_ANSWERS, ...saved.answers });
        if (saved.depth) setDepth(saved.depth);
        if (saved.done) setDone(saved.done);
      }
    } catch {
      /* a browser with storage switched off simply starts fresh every time */
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ answers, depth, done }));
    } catch {
      /* nothing to do — the guide works without remembering */
    }
  }, [answers, depth, done, loaded]);

  useEffect(() => {
    document.title = "Setting up your storage · Knowledge Vault";
  }, []);

  const steps = useMemo(() => buildGuide(answers, origin), [answers, origin]);
  const step: Step | undefined = steps[Math.min(index, steps.length - 1)];
  const totalMinutes = useMemo(
    () => steps.filter((s) => !s.skipped).reduce((sum, s) => sum + s.minutes, 0),
    [steps],
  );
  const decisions = useMemo(() => decisionsSoFar(answers), [answers]);

  const from = params.get("from");
  const back = from && from.startsWith("/") && !from.startsWith("//") ? from : null;

  const go = useCallback(
    (next: number) => {
      setIndex(Math.max(0, Math.min(steps.length - 1, next)));
      document.querySelector(".guide-body")?.scrollTo({ top: 0, behavior: "smooth" });
    },
    [steps.length],
  );

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

  const set = <K extends keyof Answers>(field: K, value: Answers[K]) =>
    setAnswers((prev) => ({ ...prev, [field]: value }));

  const copy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      window.setTimeout(() => setCopied((c) => (c === id ? null : c)), 1600);
    } catch {
      /* a browser that refuses the clipboard still shows the text to select by hand */
    }
  };

  const download = async () => {
    setBusy(true);
    try {
      await downloadGuidePdf(steps, answers, origin);
    } finally {
      setBusy(false);
    }
  };

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

  if (!step) return <div className="guide-layer" />;

  const visible = step.blocks.filter((b) => depth === "basic" || b.depth !== "basic");
  const first = index === 0;
  const last = index === steps.length - 1;
  const isDone = done.includes(step.id);

  return (
    <div className="guide-layer">
      <header className="guide-head">
        <div className="guide-head-main">
          <span className="guide-kicker">Storage setup</span>
          <h1>Connecting your own storage</h1>
        </div>
        <div className="guide-head-actions">
          {/* Not "beginner" and "expert" — nobody wants to press a button that calls them
              a beginner. It is a question about how much explanation is wanted. */}
          <div className="guide-depth" role="group" aria-label="How much detail">
            <button type="button" data-active={depth === "basic"} onClick={() => setDepth("basic")}>
              Explain everything
            </button>
            <button type="button" data-active={depth === "full"} onClick={() => setDepth("full")}>
              Just the steps
            </button>
          </div>
          <button type="button" className="btn btn-quiet btn-small" disabled={busy} onClick={download}>
            {busy ? "Building…" : "⬇ PDF"}
          </button>
          <button type="button" className="icon-btn" aria-label="Close the guide" onClick={leave}>
            ✕
          </button>
        </div>
      </header>

      <nav className="guide-rail" aria-label="Setup steps">
        {steps.map((s, i) => (
          <button
            key={s.id}
            type="button"
            className="guide-rail-step"
            data-active={i === index}
            data-done={done.includes(s.id)}
            data-skipped={!!s.skipped}
            aria-current={i === index ? "step" : undefined}
            onClick={() => go(i)}
          >
            <span className="guide-rail-n" aria-hidden>
              {done.includes(s.id) ? "✓" : s.skipped ? "–" : i + 1}
            </span>
            <span className="guide-rail-label">{s.short}</span>
          </button>
        ))}
      </nav>

      <div className="guide-progress" aria-hidden>
        <span style={{ width: `${((index + 1) / steps.length) * 100}%` }} />
      </div>

      <main className="guide-body">
        {first && (
          <section className="guide-prereq">
            <p className="guide-lede">
              Roughly {totalMinutes} minutes of work, spread over as long as you like — this
              guide remembers where you got to. Answer the questions as you go, and every
              command below will be written with your own folder names and addresses already
              in it.
            </p>
            {decisions.length > 0 && (
              <dl className="guide-decisions">
                {decisions.map((d) => (
                  <div key={d.label}>
                    <dt>{d.label}</dt>
                    <dd>{d.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </section>
        )}

        <article className="guide-card" key={`${step.id}-${index}`}>
          <div className="guide-card-head">
            <span className="guide-step-of">
              Step {index + 1} of {steps.length}
            </span>
            <span className="guide-mins">~{step.minutes} min</span>
          </div>
          <h2 className="guide-title">{step.title}</h2>

          {step.skipped && (
            <p className="guide-skipped">
              <strong>You can skip this.</strong> {step.skipped.reason}
            </p>
          )}

          {visible.map((block, i) => (
            <BlockView
              key={`${step.id}-${i}`}
              block={block}
              answers={answers}
              onSet={set}
              copied={copied}
              onCopy={copy}
              id={`${step.id}-${i}`}
            />
          ))}

          <label className="guide-doneline">
            <input
              type="checkbox"
              checked={isDone}
              onChange={() =>
                setDone((prev) =>
                  prev.includes(step.id) ? prev.filter((x) => x !== step.id) : [...prev, step.id],
                )
              }
            />
            <span>I have done this step</span>
          </label>
        </article>
      </main>

      <footer className="guide-foot">
        <button type="button" className="btn btn-quiet" disabled={first} onClick={() => go(index - 1)}>
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

/** Inline code, from the backticks the step text is written with. */
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

function BlockView({
  block,
  answers,
  onSet,
  copied,
  onCopy,
  id,
}: {
  block: Block;
  answers: Answers;
  onSet: <K extends keyof Answers>(field: K, value: Answers[K]) => void;
  copied: string | null;
  onCopy: (id: string, text: string) => void;
  id: string;
}) {
  switch (block.kind) {
    case "prose":
      return <p className="guide-why">{richText(block.text)}</p>;

    case "steps":
      return (
        <ol className="guide-todo">
          {block.items.map((item, i) => (
            <li key={i}>{richText(item)}</li>
          ))}
        </ol>
      );

    case "command":
      return (
        <div className="guide-cmd">
          <div className="guide-cmd-head">
            <span>{block.label}</span>
            <button
              type="button"
              className="btn btn-quiet btn-tiny"
              onClick={() => onCopy(id, block.code)}
            >
              {copied === id ? "Copied" : "Copy"}
            </button>
          </div>
          <pre>{block.code}</pre>
          {block.note && <p className="guide-cmd-note">{richText(block.note)}</p>}
        </div>
      );

    case "note":
      return <p className="guide-note">{richText(block.text)}</p>;

    case "warn":
      return (
        <p className="guide-warn">
          <strong>Watch out.</strong> {richText(block.text)}
        </p>
      );

    case "check":
      return (
        <p className="guide-check">
          <strong>You should see</strong> {richText(block.text)}
        </p>
      );

    case "link":
      return (
        <p className="guide-linkline">
          {block.text && <span>{block.text} </span>}
          <a href={block.href} target="_blank" rel="noreferrer noopener">
            {block.label} ↗
          </a>
        </p>
      );

    case "table":
      return (
        <div className="guide-tablewrap">
          <table className="guide-table">
            {block.head.some(Boolean) && (
              <thead>
                <tr>
                  {block.head.map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {block.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j}>{richText(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case "choice": {
      const current = String(answers[block.field] ?? "");
      return (
        <div className="guide-choice">
          <h3>{block.question}</h3>
          {block.help && <p className="guide-choice-help">{richText(block.help)}</p>}
          <div className="guide-options" data-compact={block.options.length > 4}>
            {block.options.map((o) => (
              <button
                key={o.value}
                type="button"
                className="guide-option"
                data-active={current === o.value}
                onClick={() => onSet(block.field, o.value as Answers[typeof block.field])}
              >
                <span className="guide-option-tick" aria-hidden>
                  {current === o.value ? "✓" : ""}
                </span>
                <span className="guide-option-main">
                  <strong>{o.label}</strong>
                  <small>{o.blurb}</small>
                  {/* The trade-off, not just the label. A reader choosing between a free
                      temporary address and a permanent one deserves to know what each
                      costs them at the moment of choosing, not afterwards. */}
                  {(o.pros || o.cons) && current === o.value && (
                    <span className="guide-option-tradeoff">
                      {o.pros?.map((pro) => (
                        <span key={pro} className="guide-pro">
                          + {pro}
                        </span>
                      ))}
                      {o.cons?.map((con) => (
                        <span key={con} className="guide-con">
                          − {con}
                        </span>
                      ))}
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>
        </div>
      );
    }

    case "input": {
      const value = String(answers[block.field] ?? "");
      return (
        <label className="guide-input">
          <span className="guide-input-label">{block.label}</span>
          <span className="guide-input-row">
            <input
              value={value}
              placeholder={block.placeholder}
              spellCheck={false}
              autoComplete="off"
              onChange={(e) => onSet(block.field, e.target.value as Answers[typeof block.field])}
            />
            {block.generate && (
              <button
                type="button"
                className="btn btn-quiet btn-small"
                onClick={() => onSet(block.field, suggestPassword() as Answers[typeof block.field])}
              >
                Generate
              </button>
            )}
          </span>
          {block.help && <small>{richText(block.help)}</small>}
        </label>
      );
    }
  }
}
