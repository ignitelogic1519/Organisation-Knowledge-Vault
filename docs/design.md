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
| Navigation motion | `--ease-nav`, `--dur-nav` (420), `--nav-open-delay` (90), `--nav-close-delay` (200) — see §5 |

Rule: **no component may hardcode a color** — tokens only. New colors enter this table first.

## 3. Surfaces & Controls

- **`.glass`** — translucent blurred container (cards, panels, nav pill, sidebar, drawers).
- **`.neu` / `.neu-inset`** — raised / pressed soft-shadow controls; inputs are inset,
  icon buttons raised and press inward (skeuomorphic feedback).
- **Type design:** system font stack; display headlines clamp 2.6–5 rem, -0.03 em
  tracking, with `.gradient-text` accents; `.eyebrow` uppercase labels introduce sections.
- **Dynamic background:** fixed `.aurora` layer — three blurred accent-tinted blobs
  drifting (26–38 s loops) behind every page, plus the constellation canvas on the hero.

### 3.1 Buttons — a button always looks like a button

Pill-shaped, and **the base `.btn` is a complete control on its own**: glass fill, a visible
`--border` edge, and the neumorphic shadow pair. Variants change a button's *voice*, never
whether it reads as pressable.

| Class | Voice | Look |
|-------|-------|------|
| `.btn` | Secondary / neutral | Glass + edge + raised neu shadow |
| `.btn-primary` | The one thing to do | Accent gradient, glow shadow, inset highlight |
| `.btn-quiet` | Beside a primary | Glass, edge turns accent on hover |
| `.btn-danger` | Destructive | Tinted danger fill + danger edge; commits to solid on hover |
| `.btn-ghost` | Dense toolbars | No fill at rest; still gains an edge on hover |

Three rules the base class enforces for every variant:

1. **Hover lifts** (`translateY(-1px)`) and deepens the shadow.
2. **Press sinks** — the lift goes and the shadow turns *inward*. One gesture, felt.
3. **Disabled is flat** — no shadow, no lift, no hover response. A control that cannot be
   used must not advertise that it can.

Touch (`hover: none`) gets a 44 px minimum height and no sticky hover state.

> **Historical note.** Before this contract, `.btn` alone was a transparent rectangle with a
> transparent border, so the dozen places in the codebase that use `<button class="btn">` for
> a secondary action rendered as bare text — "Upload a logo", "Check credentials", "Test
> connection". That is what a variant-less button must never do again.

### 3.2 Definitions on hover (`components/Define.tsx`)

Any term whose meaning is not obvious from its label wraps in `<Define>`. The term keeps a
dotted underline and a small `?` mark; pointing at it, focusing it with the keyboard, or
tapping it on a touch screen opens a card with **what it is**, **what changing it does**, and
optionally a worked example.

- The card is **rendered into a portal at `<body>`** and positioned in viewport coordinates.
  This is load-bearing: the console is full of scrolling panels and drawers, and a popover
  living inside one would be clipped by its `overflow`.
- The card is **opaque**, not glass. Glass is right for a panel that sits over the page and
  wrong for a card that has to be legible *on top of the words it is explaining*.
- Definitions live in one register per surface (`lib/kbase-glossary.ts` for the console), so
  the same sentence appears at the label, in the drawer, and in the Glossary tab.

### 3.3 Overlays and `backdrop-filter`

`backdrop-filter` makes an element a **containing block for `position: fixed` descendants**.
Since nearly every panel on the platform is glass, any full-window overlay — drawer, scrim,
modal — **must be portalled to `<body>`**, or it will anchor itself to its panel and hang off
the bottom of the window. The console's `Overlay` component does this and also locks body
scroll while an overlay is open.

## 4. Application Structure

- **Public (marketing) pages:** `/` (hero + features + storage + steps + CTA), `/features`,
  `/storage`, `/pricing`, `/login`, `/register`, `/help` — the icon rail in a glass bar.
  Below 992 px the rail becomes a sheet under a hamburger; the sheet is **solid, not glass**,
  because a translucent navigation panel leaves body copy showing through its own links.
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

### 5.1 Navigation has its own, slower budget

The icon rail changes its own width on hover, which moves every link after it. At the
standard 250 ms with the springy `--spring` easing, the target slid out from under the
pointer and the click landed on the wrong link — a real, reported defect, not a taste
question. Navigation therefore runs on its own tokens:

| Token | Value | Why |
|-------|-------|-----|
| `--dur-nav` | 420 ms | Slow enough that the geometry is still moving when you arrive, so you track it instead of chasing it |
| `--ease-nav` | `cubic-bezier(0.22, 0.61, 0.36, 1)` | Ease-out with **no overshoot** — a spring makes the pill bounce past its resting place and back |
| `--nav-open-delay` | 90 ms | Brushing past a link on the way somewhere else does not disturb the bar at all |
| `--nav-close-delay` | 200 ms | A pointer that slips off the pill for a frame does not snap it shut |

The delays are expressed as the **closing** delays in the base rule's `transition` shorthand;
the `:hover` / `:focus-within` rule replaces them with the opening ones. The delay list must
stay aligned with the property list — that ordering is why the shorthand is written out in
full rather than split into separate declarations.

Colour still answers on `--dur-micro`. Feedback that you have *reached* a link must never lag,
even when the geometry deliberately does.

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

## 7. The Knowledge Base console (`/kbase`)

The super-admin portal is a **working tool**, not a reading page, and it is designed against
the width it is actually used at: a quarter-screen window beside a support ticket.

**Layout contract** (`apps/web/src/app/kbase/kbase.css`):

| Width | Shape |
|-------|-------|
| ≥ 1200 px | Rail (15.5 rem) + content |
| ≥ 992 px | Narrower rail (14 rem) + content |
| < 992 px | Rail leaves the layout and returns as a slide-over sheet behind a hamburger |
| < 768 px | Every table stops being a table: each row becomes a card, each cell carries its column name in `data-label` |
| < 576 px | Every grid is one column; the drawer is the full window |

Bootstrap carries the structure — `row` / `col-*` for the toolbars, `d-flex`, `gap-*`,
`visually-hidden`, `h-100` — and `kbase.css` carries the material. **No content in the console
has a fixed width**; every grid is `auto-fit` with a `min()` floor so it collapses instead of
overflowing.

**Three commitments the console is built on:**

1. **It works in a small window.** The complaint that started this rebuild was information on
   the left-hand side breaking in a narrow window. Nothing in the console may reintroduce a
   fixed-width column, a `white-space: nowrap` table, or a grid whose minimum exceeds the
   viewport.
2. **Nothing is a number you have to already understand.** Every property is a `Define`
   (§3.2). The Glossary tab is the same register rendered as a page — 50+ terms, searchable.
3. **What can be changed, is changed here.** Limits, plans, dates, coins and access are edited
   in place; changed fields are outlined until saved, and the save button counts the pending
   changes and sits pinned in the drawer footer.

**Material.** `.kb-raised` (stands off the surface, so it can be pressed) and `.kb-sunken` (a
well, so something goes in it) are the only two neumorphic shapes; everything above the page
is `.kb-glass`. Panels are glass, tiles and cards are raised, inputs and wells are sunken.

**Verbose / Compact** is a first-class control in the top bar, persisted per device. Verbose
is the default: an administration console that assumes prior knowledge is a console only its
author can use. Compact hides the explanatory prose (`.kb-verbose`) and nothing else — no
data, no controls.

## 8. Accessibility

- WCAG AA contrast in both themes (verify when adding tokens).
- Full keyboard navigation; visible focus rings (`:focus-visible`); the admin tree remains
  the list-view fallback for the graph (also serves screen readers).
- Hit targets ≥ 44 px on touch surfaces; `prefers-reduced-motion` collapses all animation.
