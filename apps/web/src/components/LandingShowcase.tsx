"use client";

import { useState } from "react";

// Interactive tabbed product showcase for the landing page. Each tab pairs a benefit
// narrative with a picture of the surface — the Constellation one is a working miniature
// (click a role, its panel opens), the others lightweight SVG sketches. No external image
// assets, fully theme-aware, crisp at any size.

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

/* ── The Constellation, as you actually use it ─────────────────────────────
   A labelled role tree; click a role and its panel opens beside it, with the same
   contents as the real one (components in app/orgs/[id]/page.tsx: NodeDrawer) — the role,
   its permanent number, who is in it, and the four things you can do there. The example
   organization is invented; the shape of the panel is not. */

type PreviewRole = {
  id: string;
  name: string;
  number: number;
  /** Position in the map, as a percentage of its box. */
  x: number;
  y: number;
  parent?: string;
  owners: number;
  members: number;
  hidden?: boolean;
  /** The visitor's own place in it, as the real panel shows it ("you: owner"). */
  you?: "owner" | "member";
};

/* You own HR, so you govern HR and everything under it — Payroll included, though it is
   hidden — and you are a member of Quality. Everything else you can see, not govern. */
const PREVIEW_ROLES: PreviewRole[] = [
  { id: "ceo", name: "CEO", number: 100, x: 50, y: 14, owners: 1, members: 2 },
  { id: "hr", name: "HR", number: 101, x: 26, y: 47, parent: "ceo", owners: 2, members: 6, you: "owner" },
  { id: "ops", name: "Operations", number: 102, x: 74, y: 47, parent: "ceo", owners: 1, members: 9 },
  { id: "rec", name: "Recruiting", number: 103, x: 12, y: 80, parent: "hr", owners: 1, members: 4 },
  { id: "pay", name: "Payroll", number: 104, x: 37, y: 80, parent: "hr", owners: 1, members: 3, hidden: true },
  { id: "log", name: "Logistics", number: 105, x: 63, y: 80, parent: "ops", owners: 1, members: 12 },
  { id: "qa", name: "Quality", number: 106, x: 88, y: 80, parent: "ops", owners: 2, members: 5, you: "member" },
];

/** Owning a branch governs its whole subtree, as in the product. */
function governs(role: PreviewRole): boolean {
  for (let r: PreviewRole | undefined = role; r; r = PREVIEW_ROLES.find((q) => q.id === r!.parent)) {
    if (r.you === "owner") return true;
  }
  return false;
}

const PREVIEW_SECTIONS = [
  { label: "Group configuration", desc: "Visibility, sub-groups, deletion" },
  { label: "People", desc: "Owners and members of this branch" },
  { label: "Courses", desc: "Publish knowledge for this branch" },
  { label: "Backup", desc: "Export this branch as an encrypted .bkp" },
];

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

function RolePreview() {
  const [selected, setSelected] = useState("hr");
  const role = PREVIEW_ROLES.find((r) => r.id === selected) ?? PREVIEW_ROLES[0];
  const subRoles = PREVIEW_ROLES.filter((r) => r.parent === role.id).length;

  return (
    <div className="rp" role="group" aria-label="Interactive preview of the Constellation">
      <div className="rp-map">
        <svg className="rp-links" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          {PREVIEW_ROLES.filter((r) => r.parent).map((r) => {
            const p = PREVIEW_ROLES.find((q) => q.id === r.parent)!;
            return (
              <line
                key={r.id}
                x1={p.x}
                y1={p.y}
                x2={r.x}
                y2={r.y}
                data-on={r.id === selected || r.parent === selected || undefined}
              />
            );
          })}
        </svg>
        {PREVIEW_ROLES.map((r) => (
          <button
            key={r.id}
            type="button"
            className="rp-node"
            style={{ left: `${r.x}%`, top: `${r.y}%` }}
            aria-pressed={r.id === selected}
            data-root={!r.parent || undefined}
            data-hidden={r.hidden || undefined}
            onClick={() => setSelected(r.id)}
          >
            <span className="rp-star" aria-hidden />
            <span className="rp-label">{r.name}</span>
          </button>
        ))}
        <span className="rp-hint" aria-hidden>
          Click a role
        </span>
      </div>

      <div className="rp-drawer" aria-live="polite">
        <div className="rp-head">
          <strong className="rp-name">{role.name}</strong>
          <span className="rp-num">role #{role.number}</span>
        </div>
        <div className="rp-badges">
          {role.hidden && <span className="badge">hidden</span>}
          {role.you && <span className="badge badge-ok">you: {role.you}</span>}
          <span className="badge">{plural(role.owners, "owner")}</span>
          <span className="badge">{plural(role.members, "member")}</span>
          <span className="badge">{plural(subRoles, "sub-role")}</span>
        </div>
        {governs(role) ? (
          <>
            <p className="rp-ask">What do you want to do here?</p>
            <ul className="rp-menu">
              {PREVIEW_SECTIONS.map((sec) => (
                <li key={sec.label}>
                  <span className="rp-menu-label">{sec.label}</span>
                  <span className="rp-menu-desc">{sec.desc}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="rp-ask">
            {role.you === "member"
              ? "One of your positions — its courses are waiting in My Learning."
              : "You don’t govern this branch: you can see who is in it, and ask to join."}
          </p>
        )}
      </div>
    </div>
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
    text: "Every role is a star on a top-down map. Click one you govern and its panel opens right there — people, courses, visibility and backups, without hunting through menus. Try it: click a role in the preview.",
    points: ["Top-down tree layout", "Click-to-act on any role", "Public / hidden per branch", "Live updates for everyone"],
    art: <RolePreview />,
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
