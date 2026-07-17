"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Theme is unknown until mounted; render a placeholder to avoid hydration mismatch
  useEffect(() => setMounted(true), []);

  const dark = resolvedTheme === "dark";
  return (
    <button
      className="theme-toggle"
      aria-label={mounted ? `Switch to ${dark ? "light" : "dark"} theme` : "Toggle theme"}
      onClick={() => setTheme(dark ? "light" : "dark")}
    >
      {mounted ? (dark ? "☀️" : "🌙") : "•"}
    </button>
  );
}
