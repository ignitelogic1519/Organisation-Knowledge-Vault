"use client";

// The inspector's form primitives. Both creation modes share one inspector language — a
// labelled row, a toggle with an explanation, an allowance meter — so the document editor
// and the exam editor never drift apart visually.

export function Row({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="insp-row">
      <span className="insp-label">{label}</span>
      {children}
      {hint && <small className="insp-hint">{hint}</small>}
    </label>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
  hint,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <label className="insp-toggle" data-disabled={disabled || undefined}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        {label}
        {hint && <small>{hint}</small>}
      </span>
    </label>
  );
}

export function Meter({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return (
    <div className="insp-meter" data-full={limit != null && used >= limit}>
      <div className="insp-meter-head">
        <span>{label}</span>
        <span>{limit == null ? `${used} · unlimited` : `${used} / ${limit}`}</span>
      </div>
      {limit != null && (
        <div className="insp-meter-track">
          <span style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}
