# design.md — Design Language & UI Contract (v2)

> The visual/interaction rules every screen must follow. **v2 (owner decision 2026-07-19):**
> the language moved from "normal, not glossy" to an expressive, colorful system —
> **glassmorphism surfaces + neumorphic controls + dynamic aurora backgrounds + multi-theme
> accents** — while keeping the original discipline: tokens only, motion with restraint,
> reduced-motion always honored. The signature "wow" remains the constellation org graph,
> now a first-class interactive tab.

---

## 1. Principles

1. **Expressive but systematic.** Color and depth are welcome — but only through the token
   system. Glass for containers, neumorphism for controls, gradients for emphasis
   (primary buttons, display type, active nav). Never raw colors in components.
2. **Motion is felt, not seen.** Everything eases; springs are allowed for micro-feedback
   (`--spring`), never for layout. 150–450 ms. `prefers-reduced-motion` is always
   respected — animations collapse to instant states.
3. **Multi-theme, first-class.** Two base themes (light/dark, system default, switchable
   anywhere via the skeuomorphic day/night switch) × four accent palettes (Aurora, Ocean,
   Sunset, Forest — persisted per device, applied pre-paint via `data-accent`).
4. **Separation of audiences.** Members get a calm learning Overview; owners get a
   dedicated **Admin console** route; exploration/structural action happens in the
   **Constellation** tab. One surface never mixes all three.
5. **The graph is the jewel.** Roles are stars, branches constellations, the org a night
   sky — pan/zoom/parallax depth, and every star is clickable with permission-gated
   actions in a glass drawer.
6. **Scales to the pocket.** Desktop: glass sidebar rail. ≤900 px: floating bottom tab
   bar, stacked grids, drawer becomes a bottom sheet. Hit targets ≥ 44 px on touch.

## 2. Theme Tokens

Defined as CSS custom properties on `:root` (light) and `[data-theme="dark"]`; switched via
`next-themes` (`data-theme`, no flash, persisted, system default). Accent palettes override
`--accent` / `--accent-2` via `[data-accent="aurora|ocean|sunset|forest"]`, persisted in
`localStorage("kv.accent")` and applied pre-paint by an inline script in the root layout.

Key token groups (see `apps/web/src/app/globals.css` for values):

| Group | Tokens |
|-------|--------|
| Base | `--bg`, `--bg-2`, `--surface-solid`, `--surface-2`, `--text`, `--text-secondary`, `--border`, `--star` |
| State | `--success`, `--warning`, `--danger` |
| Glass | `--glass`, `--glass-strong`, `--glass-border` |
| Neumorphism | `--neu-hi`, `--neu-lo` (paired soft shadows; inset variant for inputs/pressed) |
| Accent | `--accent`, `--accent-2`, `--accent-contrast`, `--accent-soft`, `--grad-accent` |
| Motion | `--ease`, `--spring`, `--dur-micro` (150), `--dur-standard` (250), `--dur-large` (450) |

Rule: **no component may hardcode a color** — tokens only. New colors enter this table first.

## 3. Surfaces & Controls

- **`.glass`** — translucent blurred container (cards, panels, nav pill, sidebar, drawers).
- **`.neu` / `.neu-inset`** — raised / pressed soft-shadow controls; inputs are inset,
  icon buttons raised and press inward (skeuomorphic feedback).
- **Buttons:** pill-shaped; primary = accent gradient with glow shadow; quiet = glass +
  neu shadow; danger = outlined, fills on hover.
- **Type design:** system font stack; display headlines clamp 2.6–5 rem, -0.03 em
  tracking, with `.gradient-text` accents; `.eyebrow` uppercase labels introduce sections.
- **Dynamic background:** fixed `.aurora` layer — three blurred accent-tinted blobs
  drifting (26–38 s loops) behind every page, plus the constellation canvas on the hero.

## 4. Application Structure

- **Public (marketing) pages:** `/` (hero + features + steps + CTA), `/login`,
  `/register`, `/help` — floating glass pill nav.
- **App pages:** wrapped in the `AppShell` (sidebar / tab bar + top row with
  notifications, appearance controls and **sign-out**): `/orgs`, `/orgs/new`, `/account`.
  Popovers anchored in the sidebar footer open **upward** so they never clip off-screen.
- **Org tabs** (shared org layout fetches once): `/orgs/[id]` is the **Constellation —
  the org's main page**; `/orgs/[id]/learning` **My Learning** (pending / completed
  courses with stat tiles); `/orgs/[id]/admin` **Admin console** (structure tree, owner
  management behind the Supreme gate, Supreme zone). The Admin tab renders only for
  profiles holding an OWNER placement. Old `/orgs/[id]/graph` links redirect to the
  main page.
- **`/help`** explains every component in plain language (profile, Supreme, roles,
  constellation, courses, admin console, `.main`/`.bkp`, themes, notifications).

## 5. Motion Rules

- Durations: micro (hover/press) 150 ms · standard (reveal, theme cross-fade) 250 ms ·
  large (page/drawer/graph transitions) 400–450 ms. Easing `--ease`; `--spring` only for
  micro-feedback (knob slide, card lift, drawer entrance).
- Content reveals with a single fade-up (10 px), staggered ≤ 60 ms via `.stagger`.
- Skeleton shimmer (`.skeleton`) stands in for loading content — never spinners.
- Theme switch cross-fades tokens (250 ms) — no white flash in dark mode.

## 6. The Constellation Org Graph (signature feature)

- **Metaphor:** the first role is the pole star at the center; each depth ring is a
  constellation shell; star size grows with subtree.
- **Your chain is highlighted** (with an on-canvas legend): roles you OWN render as
  gold-rimmed **diamonds**, roles you are MEMBER of as filled accent stars, every
  ancestor on your reporting path gets an accent ring, and the links along that chain
  glow brighter — "CEO → HR → Hiring HR → you" reads at a glance.
- **Interaction:** drag to pan, wheel/pinch to zoom (0.3–3×), pointer parallax over
  depth-layered stars + background dust (the "3D object" feel), gentle per-star float and
  twinkle (the 4th dimension).
- **Click behavior:** clicking a star you govern opens the glass **node drawer** —
  quick structure actions (+ sub-role, terminal flag, delete) plus three owner action
  panels: **People** (add form on top with the co-owner choice; owners marked ★;
  delegation + remove), **Courses** (publish with full properties, toggle
  mandatory/inheritance, unplace, delete), **Backup** (.bkp export & restore in place).
  Clicking a star you do NOT govern routes a plain member to `/orgs/[id]/learning` —
  their pending/completed courses.
- **Tech:** hand-rolled canvas 2D (no heavy deps), radial tidy-tree layout, theme-token
  colors re-read on `data-theme`/`data-accent` changes; static sky under reduced motion.
- Zoom controls and a hint chip are always visible; the drawer becomes a bottom sheet on
  small screens.

## 7. Accessibility

- WCAG AA contrast in both themes (verify when adding tokens).
- Full keyboard navigation; visible focus rings (`:focus-visible`); the admin tree remains
  the list-view fallback for the graph (also serves screen readers).
- Hit targets ≥ 44 px on touch surfaces; `prefers-reduced-motion` collapses all animation.
