"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { IconPalette } from "./icons";

// Multi-theme control: a skeuomorphic day/night switch plus accent-palette swatches.
// Both choices are written to a COOKIE (and mirrored into localStorage), so the next
// visit — on this browser or after a fresh sign-in — paints in the same colours before
// the first frame. The default is Peach, the warm day theme.

const ACCENTS = [
  { id: "peach", label: "Peach", from: "#ff9472", to: "#f2709c" },
  { id: "aurora", label: "Aurora", from: "#7c7cff", to: "#c06bff" },
  { id: "ocean", label: "Ocean", from: "#0ea5e9", to: "#22d3ee" },
  { id: "sunset", label: "Sunset", from: "#f97316", to: "#ec4899" },
  { id: "forest", label: "Forest", from: "#10b981", to: "#a3e635" },
];

/** One year, path-wide, lax — an appearance preference, not a tracking cookie. */
function remember(key: string, value: string) {
  try {
    document.cookie = `${key}=${encodeURIComponent(value)}; path=/; max-age=31536000; samesite=lax`;
    localStorage.setItem(key, value);
  } catch {
    /* private mode — the choice still applies for this session */
  }
}

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
      onClick={() => {
        const next = dark ? "light" : "dark";
        setTheme(next);
        remember("kv.theme", next);
      }}
    >
      <span className="theme-knob" aria-hidden>
        {mounted ? (dark ? "🌙" : "☀️") : ""}
      </span>
    </button>
  );
}

export function ThemeMenu() {
  const [open, setOpen] = useState(false);
  const [accent, setAccent] = useState("peach");
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setAccent(document.documentElement.getAttribute("data-accent") ?? "peach");
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
    remember("kv.accent", id);
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
          <p className="auth-sub theme-pop-note">
            Your choice is remembered on this device and restored the next time you sign in.
          </p>
        </div>
      )}
    </div>
  );
}
