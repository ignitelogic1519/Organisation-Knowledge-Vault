"use client";

import { useEffect, useRef } from "react";

// Ambient constellation sky (docs/design.md §5): drifting stars, proximity linking, gentle
// pointer parallax. Theme-aware via the --star token; renders a static sky when the user
// prefers reduced motion.

const STAR_COUNT = 110;
const LINK_DISTANCE = 130;
const DRIFT = 0.08;
const PARALLAX = 14;

interface Star {
  x: number;
  y: number;
  z: number; // 0..1 depth — drives size, brightness, parallax
  vx: number;
  vy: number;
}

export function Constellation() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let stars: Star[] = [];
    let starColor = "";
    let raf = 0;
    let width = 0;
    let height = 0;
    const pointer = { x: 0.5, y: 0.5 };

    const readStarColor = () => {
      starColor = getComputedStyle(document.documentElement).getPropertyValue("--star").trim();
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const seed = () => {
      stars = Array.from({ length: STAR_COUNT }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        z: Math.random(),
        vx: (Math.random() - 0.5) * DRIFT,
        vy: (Math.random() - 0.5) * DRIFT,
      }));
    };

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      const px = (pointer.x - 0.5) * PARALLAX;
      const py = (pointer.y - 0.5) * PARALLAX;

      for (const s of stars) {
        if (!reducedMotion) {
          s.x += s.vx;
          s.y += s.vy;
          if (s.x < -10) s.x = width + 10;
          if (s.x > width + 10) s.x = -10;
          if (s.y < -10) s.y = height + 10;
          if (s.y > height + 10) s.y = -10;
        }
      }

      ctx.strokeStyle = starColor;
      for (let i = 0; i < stars.length; i++) {
        const a = stars[i];
        const ax = a.x + px * a.z;
        const ay = a.y + py * a.z;
        for (let j = i + 1; j < stars.length; j++) {
          const b = stars[j];
          const bx = b.x + px * b.z;
          const by = b.y + py * b.z;
          const dx = ax - bx;
          const dy = ay - by;
          const dist = Math.hypot(dx, dy);
          if (dist < LINK_DISTANCE) {
            ctx.globalAlpha = (1 - dist / LINK_DISTANCE) * 0.28;
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(bx, by);
            ctx.stroke();
          }
        }
      }

      ctx.fillStyle = starColor;
      for (const s of stars) {
        ctx.globalAlpha = 0.35 + s.z * 0.65;
        ctx.beginPath();
        ctx.arc(s.x + px * s.z, s.y + py * s.z, 0.8 + s.z * 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      if (!reducedMotion) raf = requestAnimationFrame(draw);
    };

    const onPointer = (e: PointerEvent) => {
      pointer.x = e.clientX / window.innerWidth;
      pointer.y = e.clientY / window.innerHeight;
      if (reducedMotion) draw(); // static sky still parallaxes softly on demand
    };

    // Re-read the star token when the theme attribute flips
    const themeObserver = new MutationObserver(() => {
      readStarColor();
      if (reducedMotion) draw();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    readStarColor();
    resize();
    seed();
    draw();

    window.addEventListener("resize", () => {
      resize();
      seed();
      if (reducedMotion) draw();
    });
    window.addEventListener("pointermove", onPointer);

    return () => {
      cancelAnimationFrame(raf);
      themeObserver.disconnect();
      window.removeEventListener("pointermove", onPointer);
    };
  }, []);

  return <canvas ref={canvasRef} className="hero-sky" style={{ width: "100%", height: "100%" }} aria-hidden />;
}
