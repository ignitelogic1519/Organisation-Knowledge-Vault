"use client";

import { useEffect, useRef } from "react";
import type { TreeNode } from "@vault/shared";

// The constellation org graph (docs/design.md §6): the role tree rendered as a night sky.
// Radial tidy-tree layout — Supreme is the pole star at the center, each depth ring is a
// constellation shell. Depth-layered parallax + drift give the "3D object" feel; pan, zoom
// and click-to-select make every star an actionable role node.
//
// The signed-in user's chain is highlighted: roles they OWN draw as diamonds, roles they
// are MEMBER of as filled accent stars, and every ancestor on the way down from the pole
// star gets a ring — so "Owner > HR > Hiring HR > you" reads at a glance (see the legend).

interface Star {
  node: TreeNode;
  x: number; // layout position (graph space)
  y: number;
  r: number; // star radius
  z: number; // 0..1 depth layer for parallax
  phase: number; // per-star float phase
  parent?: Star;
  mark: "owner" | "member" | "path" | "none";
}

interface Cam {
  x: number;
  y: number;
  zoom: number;
}

/** owner/member marks for the user's own placements; "path" for their ancestor chain. */
function markOf(node: TreeNode, pathIds: Set<string>): Star["mark"] {
  if (node.my.kinds.includes("OWNER")) return "owner";
  if (node.my.kinds.includes("MEMBER")) return "member";
  if (pathIds.has(node.id)) return "path";
  return "none";
}

/** Every ancestor (by materialized path) of any node the user is placed on. */
function ancestorIds(nodes: TreeNode[]): Set<string> {
  const byPath = new Map(nodes.map((n) => [n.path, n.id]));
  const ids = new Set<string>();
  for (const n of nodes) {
    if (n.my.kinds.length === 0) continue;
    const segs = n.path.split(".");
    for (let i = 1; i < segs.length; i++) {
      const id = byPath.get(segs.slice(0, i).join("."));
      if (id) ids.add(id);
    }
  }
  return ids;
}

function layoutRadial(nodes: TreeNode[]): Star[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const children = new Map<string | null, TreeNode[]>();
  for (const n of nodes) {
    const key = n.parentId && byId.has(n.parentId) ? n.parentId : null;
    const list = children.get(key) ?? [];
    list.push(n);
    children.set(key, list);
  }
  const roots = children.get(null) ?? [];
  const pathIds = ancestorIds(nodes);

  // Leaf count decides how much angular room a subtree gets
  const leafCount = (n: TreeNode): number => {
    const kids = children.get(n.id) ?? [];
    if (kids.length === 0) return 1;
    return kids.reduce((sum, k) => sum + leafCount(k), 0);
  };

  const RING = 130;
  const stars: Star[] = [];

  const place = (
    n: TreeNode,
    depth: number,
    a0: number,
    a1: number,
    parent: Star | undefined,
  ) => {
    const angle = (a0 + a1) / 2;
    const radius = depth * RING;
    const subtree = leafCount(n);
    const star: Star = {
      node: n,
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
      r: Math.min(16, 5 + Math.sqrt(subtree) * 2.4 + (depth === 0 ? 5 : 0)),
      z: Math.max(0.25, 1 - depth * 0.18),
      phase: Math.random() * Math.PI * 2,
      parent,
      mark: markOf(n, pathIds),
    };
    stars.push(star);
    const kids = children.get(n.id) ?? [];
    const total = kids.reduce((s, k) => s + leafCount(k), 0) || 1;
    let cursor = a0;
    for (const k of kids) {
      const span = ((a1 - a0) * leafCount(k)) / total;
      place(k, depth + 1, cursor, cursor + span, star);
      cursor += span;
    }
  };

  // Usually a single root (the owner role); if the visible slice has several, share the circle
  const totalRootLeaves = roots.reduce((s, r) => s + leafCount(r), 0) || 1;
  let cursor = -Math.PI / 2;
  for (const r of roots) {
    const span = (Math.PI * 2 * leafCount(r)) / totalRootLeaves;
    place(r, roots.length > 1 ? 1 : 0, cursor, cursor + span, undefined);
    cursor += span;
  }
  return stars;
}

function diamondPath(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r, y);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r, y);
  ctx.closePath();
}

export function OrgGraph({
  nodes,
  selectedId,
  onSelect,
}: {
  nodes: TreeNode[];
  selectedId: string | null;
  onSelect: (node: TreeNode | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const camRef = useRef<Cam>({ x: 0, y: 0, zoom: 1 });
  const selectedRef = useRef<string | null>(selectedId);
  selectedRef.current = selectedId;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const stars = layoutRadial(nodes);
    const cam = camRef.current;

    // ambient background dust
    const dust = Array.from({ length: 90 }, () => ({
      x: Math.random(),
      y: Math.random(),
      z: Math.random(),
      r: 0.5 + Math.random() * 1.2,
    }));

    let width = 0;
    let height = 0;
    let raf = 0;
    let hovered: Star | null = null;
    const pointer = { x: 0.5, y: 0.5 };
    let colors = { star: "", accent: "", accent2: "", text: "", muted: "", warning: "" };

    const readColors = () => {
      const cs = getComputedStyle(document.documentElement);
      colors = {
        star: cs.getPropertyValue("--star").trim(),
        accent: cs.getPropertyValue("--accent").trim(),
        accent2: cs.getPropertyValue("--accent-2").trim(),
        text: cs.getPropertyValue("--text").trim(),
        muted: cs.getPropertyValue("--text-secondary").trim(),
        warning: cs.getPropertyValue("--warning").trim(),
      };
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    // graph space → screen space, with per-star depth parallax
    const project = (s: { x: number; y: number; z?: number }, t: number) => {
      const z = s.z ?? 1;
      const floatY =
        !reducedMotion && "phase" in s
          ? Math.sin(t / 1400 + (s as Star).phase) * 3 * z
          : 0;
      const px = (pointer.x - 0.5) * 26 * (1 - z);
      const py = (pointer.y - 0.5) * 26 * (1 - z);
      return {
        x: width / 2 + (s.x - cam.x) * cam.zoom + px,
        y: height / 2 + (s.y - cam.y) * cam.zoom + py + floatY,
      };
    };

    const pick = (cx: number, cy: number, t: number): Star | null => {
      let best: Star | null = null;
      let bestDist = Infinity;
      for (const s of stars) {
        const p = project(s, t);
        const d = Math.hypot(p.x - cx, p.y - cy);
        const hit = Math.max(16, s.r * cam.zoom + 8);
        if (d < hit && d < bestDist) {
          best = s;
          bestDist = d;
        }
      }
      return best;
    };

    const draw = (t: number) => {
      ctx.clearRect(0, 0, width, height);

      // dust field (deep background, strongest parallax)
      ctx.fillStyle = colors.star;
      for (const d of dust) {
        const px = (pointer.x - 0.5) * 40 * d.z;
        const py = (pointer.y - 0.5) * 40 * d.z;
        const tw = reducedMotion ? 0.5 : 0.35 + 0.3 * Math.sin(t / 900 + d.x * 40);
        ctx.globalAlpha = 0.12 + d.z * 0.18 * tw;
        ctx.beginPath();
        ctx.arc(d.x * width + px, d.y * height + py, d.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // constellation links — the user's chain glows brighter
      for (const s of stars) {
        if (!s.parent) continue;
        const a = project(s, t);
        const b = project(s.parent, t);
        const onMyPath = s.mark !== "none" && s.parent.mark !== "none";
        const grad = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
        grad.addColorStop(0, colors.accent);
        grad.addColorStop(1, colors.accent2);
        ctx.strokeStyle = grad;
        ctx.globalAlpha = onMyPath ? 0.8 : 0.3;
        ctx.lineWidth = Math.max(0.6, (onMyPath ? 1.9 : 1.1) * cam.zoom);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }

      // stars
      for (const s of stars) {
        const p = project(s, t);
        const r = s.r * cam.zoom;
        const mine = s.mark === "owner" || s.mark === "member";
        const isSel = s.node.id === selectedRef.current;
        const isHov = s === hovered;

        // glow halo
        const glowR = r * (isSel ? 3.4 : isHov ? 2.9 : mine ? 2.6 : 2.2);
        const halo = ctx.createRadialGradient(p.x, p.y, r * 0.3, p.x, p.y, glowR);
        halo.addColorStop(0, mine || isSel ? colors.accent : colors.star);
        halo.addColorStop(1, "transparent");
        ctx.globalAlpha = isSel ? 0.5 : isHov ? 0.4 : mine ? 0.35 : 0.22;
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(p.x, p.y, glowR, 0, Math.PI * 2);
        ctx.fill();

        // core — owners draw as diamonds, everyone else as circles
        const core = ctx.createRadialGradient(
          p.x - r * 0.3,
          p.y - r * 0.3,
          r * 0.1,
          p.x,
          p.y,
          r * (s.mark === "owner" ? 1.25 : 1),
        );
        core.addColorStop(0, "#ffffff");
        core.addColorStop(1, mine || isSel ? colors.accent : colors.accent2);
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = core;
        if (s.mark === "owner") {
          diamondPath(ctx, p.x, p.y, r * 1.25);
          ctx.fill();
          ctx.strokeStyle = colors.warning;
          ctx.lineWidth = Math.max(1, 1.4 * cam.zoom);
          ctx.globalAlpha = 0.9;
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.fill();
        }

        // reporting-path ring (ancestors of your placements)
        if (s.mark === "path") {
          ctx.globalAlpha = 0.85;
          ctx.strokeStyle = colors.accent2;
          ctx.lineWidth = Math.max(1, 1.5 * cam.zoom);
          ctx.beginPath();
          ctx.arc(p.x, p.y, r + Math.max(3, 4 * cam.zoom), 0, Math.PI * 2);
          ctx.stroke();
        }

        // selected pulse ring
        if (isSel && !reducedMotion) {
          const pulse = (t / 1200) % 1;
          ctx.globalAlpha = (1 - pulse) * 0.6;
          ctx.strokeStyle = colors.accent;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r + pulse * r * 2.4, 0, Math.PI * 2);
          ctx.stroke();
        }

        // labels when zoomed in enough, hovered, selected, or on the user's chain
        if (cam.zoom > 0.55 || isHov || isSel || s.mark !== "none") {
          ctx.globalAlpha = isHov || isSel ? 1 : 0.85;
          ctx.fillStyle = colors.text;
          ctx.font = `500 ${Math.max(11, 12 * Math.min(cam.zoom, 1.4))}px -apple-system, "Segoe UI", sans-serif`;
          ctx.textAlign = "center";
          const label = mine ? `${s.node.name} · you` : s.node.name;
          ctx.fillText(label, p.x, p.y + r + 16);
          if (isHov || isSel) {
            ctx.globalAlpha = 0.7;
            ctx.fillStyle = colors.muted;
            ctx.font = `400 10px -apple-system, "Segoe UI", sans-serif`;
            ctx.fillText(
              `#${s.node.roleNumber} · ${s.node.ownerCount + s.node.memberCount} people`,
              p.x,
              p.y + r + 30,
            );
          }
        }
      }
      ctx.globalAlpha = 1;

      raf = requestAnimationFrame(draw);
    };

    // ── interactions: drag pan, wheel zoom, pinch, hover, click ──
    let dragging = false;
    let moved = 0;
    let last = { x: 0, y: 0 };
    const pinch = new Map<number, { x: number; y: number }>();
    let pinchDist = 0;

    const onDown = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      pinch.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      if (pinch.size === 2) {
        const [a, b] = [...pinch.values()];
        pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      }
      dragging = true;
      moved = 0;
      last = { x: e.clientX, y: e.clientY };
    };

    const onMove = (e: PointerEvent) => {
      pointer.x = e.offsetX / Math.max(1, width);
      pointer.y = e.offsetY / Math.max(1, height);

      if (pinch.has(e.pointerId)) pinch.set(e.pointerId, { x: e.offsetX, y: e.offsetY });

      if (pinch.size === 2) {
        const [a, b] = [...pinch.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchDist > 0) {
          cam.zoom = Math.min(3, Math.max(0.3, cam.zoom * (d / pinchDist)));
        }
        pinchDist = d;
        return;
      }

      if (dragging) {
        const dx = e.clientX - last.x;
        const dy = e.clientY - last.y;
        moved += Math.abs(dx) + Math.abs(dy);
        cam.x -= dx / cam.zoom;
        cam.y -= dy / cam.zoom;
        last = { x: e.clientX, y: e.clientY };
      } else {
        const h = pick(e.offsetX, e.offsetY, performance.now());
        if (h !== hovered) {
          hovered = h;
          canvas.style.cursor = h ? "pointer" : "grab";
        }
      }
    };

    const onUp = (e: PointerEvent) => {
      pinch.delete(e.pointerId);
      if (pinch.size < 2) pinchDist = 0;
      dragging = pinch.size > 0;
      if (moved < 6) {
        // click, not a drag → select the star under the pointer (or clear)
        onSelect(pick(e.offsetX, e.offsetY, performance.now())?.node ?? null);
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * 0.0012);
      cam.zoom = Math.min(3, Math.max(0.3, cam.zoom * factor));
    };

    const themeObserver = new MutationObserver(readColors);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "data-accent"],
    });

    readColors();
    resize();
    raf = requestAnimationFrame(draw);

    const onResize = () => resize();
    window.addEventListener("resize", onResize);
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      cancelAnimationFrame(raf);
      themeObserver.disconnect();
      window.removeEventListener("resize", onResize);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, [nodes, onSelect]);

  const zoomBy = (f: number) => {
    const cam = camRef.current;
    cam.zoom = Math.min(3, Math.max(0.3, cam.zoom * f));
  };

  return (
    <>
      <canvas ref={canvasRef} className="graph-canvas" aria-label="Organization constellation" />
      <div className="graph-zoom">
        <button className="icon-btn" aria-label="Zoom in" onClick={() => zoomBy(1.25)}>
          +
        </button>
        <button className="icon-btn" aria-label="Zoom out" onClick={() => zoomBy(0.8)}>
          −
        </button>
        <button
          className="icon-btn"
          aria-label="Reset view"
          title="Reset view"
          onClick={() => {
            camRef.current.x = 0;
            camRef.current.y = 0;
            camRef.current.zoom = 1;
          }}
        >
          ◎
        </button>
      </div>
    </>
  );
}

/** Legend for the constellation marks — rendered by the page next to the canvas. */
export function GraphLegend() {
  return (
    <div className="graph-legend glass" aria-hidden>
      <div className="legend-row">
        <svg width="14" height="14" viewBox="0 0 14 14">
          <path d="M7 0.5 13.5 7 7 13.5 0.5 7Z" fill="var(--accent)" stroke="var(--warning)" />
        </svg>
        Your role — owner
      </div>
      <div className="legend-row">
        <svg width="14" height="14" viewBox="0 0 14 14">
          <circle cx="7" cy="7" r="5" fill="var(--accent)" />
        </svg>
        Your role — member
      </div>
      <div className="legend-row">
        <svg width="14" height="14" viewBox="0 0 14 14">
          <circle cx="7" cy="7" r="4" fill="var(--accent-2)" />
          <circle cx="7" cy="7" r="6.2" fill="none" stroke="var(--accent-2)" />
        </svg>
        On your reporting path
      </div>
      <div className="legend-row">
        <svg width="14" height="14" viewBox="0 0 14 14">
          <circle cx="7" cy="7" r="3.5" fill="var(--accent-2)" opacity="0.55" />
        </svg>
        Other role
      </div>
    </div>
  );
}
