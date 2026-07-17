# design.md — Design Language & UI Contract

> The visual/interaction rules every screen must follow. Inspirations: **Apple's marketing
> pages** (public site) and **Microsoft Intune's admin dashboards** (in-app admin surfaces).
> Principle: *normal, not glossy* — calm surfaces, restrained color, generous whitespace —
> but with **smooth animation** and one signature "wow": the constellation org graph.

---

## 1. Principles

1. **Content-first, chrome-last.** No gradients-for-gradients'-sake, no glassmorphism noise.
   Type and spacing do the talking (Apple); density and clarity where work happens (Intune).
2. **Motion is felt, not seen.** Everything eases; nothing bounces. 150–300 ms, ease-out.
   `prefers-reduced-motion` is always respected — animations collapse to instant states.
3. **Two first-class themes.** Dark and light are equals; every component is built against
   **semantic tokens**, never raw colors. The user can switch theme anywhere, any time
   (toggle in the nav), with system-preference as the default.
4. **The graph is the jewel.** The org chart is a **constellation view**: roles are stars,
   branches are constellations, the org is a night sky. Interactive depth (pan/zoom/parallax
   into 3D space) + live state over time = the "4D" feel. Everything else stays quiet so this
   can shine.

## 2. Theme Tokens

Defined as CSS custom properties on `:root` (light) and `[data-theme="dark"]`; switched via
`next-themes` (`data-theme` attribute, no flash on load, persisted, system default).

| Token | Light | Dark |
|-------|-------|------|
| `--bg` | `#f5f5f7` | `#0a0a0c` |
| `--surface` | `#ffffff` | `#161618` |
| `--surface-2` | `#fafafa` | `#1e1e21` |
| `--text` | `#1d1d1f` | `#f5f5f7` |
| `--text-secondary` | `#6e6e73` | `#98989d` |
| `--accent` | `#0071e3` | `#2997ff` |
| `--border` | `rgba(0,0,0,.08)` | `rgba(255,255,255,.10)` |
| `--star` | `rgba(29,29,31,.45)` | `rgba(245,245,247,.75)` |
| `--danger` / `--success` / `--warning` | standard, muted | brightened for dark bg |

Rule: **no component may hardcode a color** — tokens only. New colors enter this table first.

## 3. Typography & Layout

- **Font:** system stack — `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
  (SF Pro on Apple devices, Segoe on Windows — Apple + Intune feel for free, zero font bytes).
- **Public pages (Apple mode):** oversized headlines (clamp 2.5–4.5 rem, -0.02 em tracking),
  short lines, centered heroes, sections that breathe (96 px+ vertical rhythm).
- **App pages (Intune mode):** left navigation rail, top bar with org switcher + theme toggle,
  card-based content grid, dense-but-legible tables, 8 px spacing grid, 12 px card radius.
- Buttons: pill-shaped primary (accent), quiet secondary (border only). Focus rings always
  visible for keyboard users.

## 4. Motion Rules

- Durations: micro (hover/press) 150 ms · standard (reveal, theme cross-fade) 250 ms ·
  large (page/graph transitions) 400 ms. Easing: `cubic-bezier(0.25, 0.1, 0.25, 1)`.
- Page content reveals with a single fade-up (8 px), staggered ≤ 60 ms — never per-letter,
  never parallax-scroll-jacking.
- Theme switch cross-fades tokens (250 ms) — no white flash in dark mode.

## 5. The Constellation Org Graph (signature feature)

- **Metaphor:** Supreme is the pole star; each branch is a constellation; roles are stars
  sized by subtree, linked by faint light-lines; the user's own placements glow accent.
- **"4D" interaction:** free pan/zoom into a depth-layered starfield (parallax = 3rd
  dimension), with live state — completions pulsing, overdue reddening, structure changes
  drifting in — as the 4th. Click a star → role people-list with search (never a full user
  dump on the sky, per `structure.md` §6).
- **Tech direction:** Canvas/WebGL (evaluate `react-force-graph` / `three.js` vs. hand-rolled
  canvas at Phase 3-time); must honor theme tokens and reduced-motion (static sky).
- **v0 taste:** the public landing hero ships a lightweight ambient constellation canvas —
  drifting stars, proximity linking, pointer parallax — as the brand's first impression.

## 6. Accessibility

- WCAG AA contrast in both themes (tokens are chosen for it — verify when adding any).
- Full keyboard navigation; graph offers a list-view fallback (also serves screen readers).
- Hit targets ≥ 44 px on touch surfaces (mobile app later inherits this system).
