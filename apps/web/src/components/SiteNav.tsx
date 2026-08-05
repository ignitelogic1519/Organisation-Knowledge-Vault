"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Mailbox } from "./Mailbox";
import { ThemeMenu } from "./ThemeMenu";
import { Breadcrumbs } from "./Breadcrumbs";

// Public-page navigation. The same icon-first rail the app shell uses, so moving from the
// marketing pages into the product doesn't change how navigation behaves: an icon that
// widens on hover or focus to show its real label.
//
// Below 992px the rail leaves the bar and becomes a sheet under the hamburger — exactly as
// it does in the app shell. It used to be rendered without a toggler, which meant every
// public link simply disappeared on a phone with no way to reach it.

const LINKS = [
  { href: "/", label: "Home", icon: "✦" },
  { href: "/features", label: "Features", icon: "✨" },
  { href: "/storage", label: "Storage", icon: "🗄" },
  { href: "/pricing", label: "Pricing", icon: "🪙" },
  { href: "/help", label: "Help & guide", icon: "❓" },
];

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d={open ? "M6 6l12 12M18 6L6 18" : "M4 7h16M4 12h16M4 17h16"}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function SiteNav({ right }: { right?: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Collapse the sheet whenever the route changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      <nav className="navbar fixed-top kv-navbar" aria-label="Site">
        <div className="container-xxl kv-navbar-inner">
          <Link href="/" className="navbar-brand kv-brand">
            <span className="brand-mark" aria-hidden>
              ✦
            </span>
            <span className="kv-brand-word">Knowledge Vault</span>
          </Link>

          <ul className="kv-rail" data-open={open}>
            {LINKS.map((l) => (
              <li key={l.href} className="kv-rail-item">
                <Link
                  href={l.href}
                  className="kv-rail-link"
                  data-active={l.href === "/" ? pathname === "/" : pathname.startsWith(l.href)}
                  aria-current={pathname === l.href ? "page" : undefined}
                  onClick={() => setOpen(false)}
                >
                  <span className="kv-rail-icon" aria-hidden>
                    {l.icon}
                  </span>
                  <span className="kv-rail-label">{l.label}</span>
                </Link>
              </li>
            ))}
          </ul>

          <div className="kv-navbar-controls">
            {right}
            <Mailbox />
            <ThemeMenu />
            <button
              className="kv-toggler"
              type="button"
              aria-expanded={open}
              aria-label={open ? "Close navigation" : "Open navigation"}
              onClick={() => setOpen((v) => !v)}
            >
              <MenuIcon open={open} />
            </button>
          </div>
        </div>
      </nav>
      {/* Same trail as the app shell, so moving between the marketing pages and the
          product does not change how you get back. */}
      <div className="container-xxl breadcrumbs-public">
        <Breadcrumbs />
      </div>
    </>
  );
}
