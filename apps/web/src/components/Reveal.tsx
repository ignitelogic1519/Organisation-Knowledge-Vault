"use client";

import { useEffect, useRef, useState } from "react";

// Scroll-reveal wrapper: elements fade/slide in as they enter the viewport and reverse
// out as they leave — so scrolling back up re-animates them. Honors reduced-motion by
// staying visible. Uses one IntersectionObserver per element (cheap at this page's scale).

export function Reveal({
  children,
  className = "",
  variant = "up",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  /** direction the element travels in from */
  variant?: "up" | "down" | "left" | "right" | "scale";
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => setShown(entry.isIntersecting),
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`reveal ${className}`}
      data-variant={variant}
      data-shown={shown}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
