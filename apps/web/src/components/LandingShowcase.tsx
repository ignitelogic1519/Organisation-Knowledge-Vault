"use client";

import { useState } from "react";

// Interactive tabbed product showcase for the landing page. Each tab pairs a benefit
// narrative with a lightweight SVG "screenshot" so the value reads instantly — no
// external image assets, fully theme-aware, crisp at any size.

/** Gradient shared by every illustration — rendered once, always present. */
function ArtDefs() {
  return (
    <svg width="0" height="0" aria-hidden style={{ position: "absolute" }}>
      <defs>
        <linearGradient id="g1" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--accent)" />
          <stop offset="1" stopColor="var(--accent-2)" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function ConstellationArt() {
  return (
    <svg viewBox="0 0 400 260" className="art" role="img" aria-label="Constellation org chart">
      <g stroke="url(#g1)" strokeWidth="1.6" opacity="0.7" fill="none">
        <path d="M200 46 L120 110 M200 46 L280 110 M120 110 L80 180 M120 110 L160 180 M280 110 L240 180 M280 110 L320 180" />
      </g>
      {[
        [200, 46, 11],
        [120, 110, 8],
        [280, 110, 8],
        [80, 180, 6],
        [160, 180, 6],
        [240, 180, 6],
        [320, 180, 6],
      ].map(([x, y, r], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r={(r as number) + 6} fill="url(#g1)" opacity="0.16" />
          <circle cx={x} cy={y} r={r} fill="url(#g1)" />
        </g>
      ))}
      <circle cx="200" cy="46" r="19" fill="none" stroke="var(--warning)" strokeWidth="1.4" opacity="0.8" />
    </svg>
  );
}

function LibraryArt() {
  return (
    <svg viewBox="0 0 400 260" className="art" role="img" aria-label="Library shelves">
      {[30, 150, 270].map((y, s) => (
        <g key={s}>
          <rect x="24" y={y + 54} width="352" height="4" rx="2" fill="var(--border)" />
          {[0, 1, 2, 3].map((c) => (
            <g key={c}>
              <rect
                x={30 + c * 90}
                y={y}
                width="78"
                height="54"
                rx="8"
                fill="var(--surface-2)"
                stroke="var(--border)"
              />
              <rect x={38 + c * 90} y={y + 10} width="40" height="6" rx="3" fill="url(#g1)" />
              <rect x={38 + c * 90} y={y + 24} width="58" height="4" rx="2" fill="var(--border)" />
              <rect x={38 + c * 90} y={y + 33} width="48" height="4" rx="2" fill="var(--border)" />
              <circle cx={94 + c * 90} cy={y + 12} r="3" fill="var(--warning)" />
            </g>
          ))}
        </g>
      ))}
    </svg>
  );
}

function StudioArt() {
  return (
    <svg viewBox="0 0 400 260" className="art" role="img" aria-label="Document studio">
      <rect x="24" y="24" width="70" height="212" rx="10" fill="var(--surface-2)" stroke="var(--border)" />
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={i} x="34" y={40 + i * 34} width="50" height="22" rx="6" fill="var(--accent-soft)" />
      ))}
      <rect x="108" y="24" width="268" height="212" rx="10" fill="var(--surface-solid)" stroke="var(--border)" />
      <rect x="128" y="44" width="150" height="12" rx="6" fill="url(#g1)" />
      <rect x="128" y="70" width="228" height="6" rx="3" fill="var(--border)" />
      <rect x="128" y="84" width="210" height="6" rx="3" fill="var(--border)" />
      <rect x="128" y="106" width="228" height="46" rx="8" fill="var(--accent-soft)" stroke="var(--accent)" strokeDasharray="4 4" />
      <rect x="128" y="166" width="110" height="52" rx="8" fill="var(--surface-2)" stroke="var(--border)" />
      <rect x="246" y="166" width="110" height="52" rx="8" fill="var(--surface-2)" stroke="var(--border)" />
    </svg>
  );
}

function ComplianceArt() {
  return (
    <svg viewBox="0 0 400 260" className="art" role="img" aria-label="Compliance dashboard">
      {[
        [88, "84%"],
        [148, "61%"],
        [208, "97%"],
      ].map(([y, pct], i) => {
        const w = (parseInt(pct as string) / 100) * 250;
        return (
          <g key={i}>
            <rect x="24" y={y as number} width="120" height="12" rx="6" fill="var(--border)" opacity="0.5" />
            <rect x="24" y={(y as number) + 22} width="330" height="14" rx="7" fill="var(--surface-2)" />
            <rect x="24" y={(y as number) + 22} width={w} height="14" rx="7" fill={i === 1 ? "var(--warning)" : "var(--success)"} />
            <text x="360" y={(y as number) + 33} fontSize="12" fill="var(--text-secondary)" textAnchor="end">
              {pct}
            </text>
          </g>
        );
      })}
      <rect x="24" y="24" width="90" height="34" rx="8" fill="url(#g1)" opacity="0.9" />
      <text x="69" y="46" fontSize="13" fill="#fff" textAnchor="middle" fontWeight="600">
        94% ✓
      </text>
    </svg>
  );
}

const TABS = [
  {
    key: "constellation",
    label: "Constellation",
    title: "See your whole organization as a living map",
    text: "The role tree renders as a top-down star map. Pan, zoom, and click any star you govern to manage people, courses, visibility and backups — right where they live. Public branches are discoverable; hidden ones cascade privacy down the tree.",
    points: ["Top-down tree layout", "Click-to-act on any role", "Public / private per branch", "Live updates for everyone"],
    art: <ConstellationArt />,
  },
  {
    key: "library",
    label: "Library",
    title: "A real library, shelved and searchable",
    text: "Every document is shelved by dynamic category tags, filterable by type, classification and rating. Members rate and review after completing — so the best knowledge rises to the top and stays discoverable across the organization.",
    points: ["Category shelves with smart suggestions", "Filter by type / class / rating", "Member ratings & comments", "Request a course for your branch"],
    art: <LibraryArt />,
  },
  {
    key: "studio",
    label: "Studio",
    title: "Author documents & books, visually",
    text: "A drag-and-drop builder with a block palette, live preview and multi-page books. Everything publishes with a standard cover, classification and versioning. Members can propose content that publishes only after a manager's review.",
    points: ["Drag-and-drop blocks", "Multi-page books", "Standard cover & classification", "Author-with-review workflow"],
    art: <StudioArt />,
  },
  {
    key: "compliance",
    label: "Compliance",
    title: "Know exactly who's covered",
    text: "Per-course compliance for any branch you govern, across its whole subtree. See the non-compliant at a glance and remind them with one click — a default or custom message straight to their inbox.",
    points: ["Per-course completion bars", "Non-compliant lists", "One-click reminders", "Works across ownership levels"],
    art: <ComplianceArt />,
  },
];

export function LandingShowcase() {
  const [active, setActive] = useState(0);
  const tab = TABS[active];
  return (
    <div className="showcase">
      <ArtDefs />
      <div className="showcase-tabs" role="tablist">
        {TABS.map((t, i) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={i === active}
            className="showcase-tab"
            data-active={i === active}
            onClick={() => setActive(i)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="showcase-body glass" key={tab.key}>
        <div className="showcase-copy">
          <h3>{tab.title}</h3>
          <p>{tab.text}</p>
          <ul className="showcase-points">
            {tab.points.map((p) => (
              <li key={p}>
                <span className="showcase-tick" aria-hidden>
                  ✓
                </span>
                {p}
              </li>
            ))}
          </ul>
        </div>
        <div className="showcase-art neu">{tab.art}</div>
      </div>
    </div>
  );
}
