"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { IconPalette } from "./icons";

// Multi-theme control: a skeuomorphic day/night switch plus accent-palette swatches.
// Accent persists in localStorage and is applied pre-paint by the layout init script.

const ACCENTS = [
  { id: "aurora", label: "Aurora", from: "#7c7cff", to: "#c06bff" },
  { id: "ocean", label: "Ocean", from: "#0ea5e9", to: "#22d3ee" },
  { id: "sunset", label: "Sunset", from: "#f97316", to: "#ec4899" },
  { id: "forest", label: "Forest", from: "#10b981", to: "#a3e635" },
];

export function ThemeSwitch() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const dark = resolvedTheme === "dark";
  return (
    <button
      className="theme-switch"
      role="switch"
      aria-checked={mounted ? dark : undefined}
      aria-label={mounted ? `Switch to ${dark ? "light" : "dark"} theme` : "Toggle theme"}
      onClick={() => setTheme(dark ? "light" : "dark")}
    >
      <span className="theme-knob" aria-hidden>
        {mounted ? (dark ? "🌙" : "☀️") : ""}
      </span>
    </button>
  );
}

export function ThemeMenu() {
  const [open, setOpen] = useState(false);
  const [accent, setAccent] = useState("aurora");
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setAccent(localStorage.getItem("kv.accent") ?? "aurora");
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);

  function pick(id: string) {
    setAccent(id);
    document.documentElement.setAttribute("data-accent", id);
    localStorage.setItem("kv.accent", id);
  }

  return (
    <div className="theme-pop-wrap" ref={wrapRef}>
      <button
        className="icon-btn"
        aria-label="Appearance settings"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <IconPalette />
      </button>
      {open && (
        <div className="theme-pop glass">
          <h4>Theme</h4>
          <div className="theme-row">
            <span className="auth-sub">Day / Night</span>
            <ThemeSwitch />
          </div>
          <h4>Accent</h4>
          <div className="swatch-row">
            {ACCENTS.map((a) => (
              <button
                key={a.id}
                className="swatch"
                data-active={accent === a.id}
                aria-label={`${a.label} accent`}
                title={a.label}
                style={{ background: `linear-gradient(135deg, ${a.from}, ${a.to})` }}
                onClick={() => pick(a.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
