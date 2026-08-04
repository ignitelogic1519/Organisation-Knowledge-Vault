"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { auth } from "@/lib/auth-client";
import { Mailbox } from "./Mailbox";
import { ThemeMenu } from "./ThemeMenu";
import { IconLogout } from "./icons";
import { Breadcrumbs } from "./Breadcrumbs";

export interface ShellNavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  /** Match sub-paths too (e.g. /orgs matches /orgs/new). Defaults to exact. */
  prefix?: boolean;
  /** Count bubble (e.g. pending requests) — hidden when 0/undefined. */
  badge?: number;
}

function SignOutButton() {
  const router = useRouter();
  return (
    <button
      className="icon-btn"
      aria-label="Sign out"
      title="Sign out"
      onClick={async () => {
        await auth.logout();
        router.replace("/login");
      }}
    >
      <IconLogout />
    </button>
  );
}

function MenuIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ) : (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 7h16M4 12h16M4 17h16"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

// Authenticated app chrome: a compact, icon-first navigation bar. Each destination is an
// icon that widens on hover/focus to reveal its real label — the label is part of the
// link's markup (so it is read by assistive technology and found by in-page search), not
// a tooltip attribute the browser draws on its own schedule. The active page always keeps
// its label open, so you can see where you are without touching anything.
export function AppShell({
  nav,
  title,
  subtitle,
  actions,
  children,
}: {
  nav: ShellNavItem[];
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Collapse the mobile menu whenever the route changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const isActive = (item: ShellNavItem) =>
    item.prefix ? pathname.startsWith(item.href) : pathname === item.href;

  return (
    <div className="kv-app">
      <nav className="navbar sticky-top kv-navbar" aria-label="Main">
        <div className="container-xxl kv-navbar-inner">
          <Link href="/orgs" className="navbar-brand kv-brand">
            <span className="brand-mark" aria-hidden>
              ✦
            </span>
            <span className="kv-brand-word">Knowledge Vault</span>
          </Link>

          {/* Desktop: the icon rail sits in the middle of the bar and expands on hover. */}
          <ul className="kv-rail" data-open={open}>
            {nav.map((item) => (
              <li key={item.href} className="kv-rail-item">
                <Link
                  href={item.href}
                  className="kv-rail-link"
                  data-active={isActive(item)}
                  aria-current={isActive(item) ? "page" : undefined}
                  onClick={() => setOpen(false)}
                >
                  <span className="kv-rail-icon" aria-hidden>
                    {item.icon}
                  </span>
                  <span className="kv-rail-label">{item.label}</span>
                  {item.badge ? <span className="kv-nav-badge">{item.badge}</span> : null}
                </Link>
              </li>
            ))}
          </ul>

          <div className="kv-navbar-controls">
            <Mailbox />
            <ThemeMenu />
            <SignOutButton />
            <button
              className="kv-toggler"
              type="button"
              aria-controls="kv-navbar-nav"
              aria-expanded={open}
              aria-label={open ? "Close navigation" : "Open navigation"}
              onClick={() => setOpen((v) => !v)}
            >
              <MenuIcon open={open} />
            </button>
          </div>
        </div>
      </nav>

      <main className="kv-main">
        <div className="container-xxl">
          {/* The trail sits directly under the bar, above the page title — derived from
              the URL, so it is never out of step with where you actually are. */}
          <Breadcrumbs />
          <header className="kv-page-head">
            <div>
              <h1>{title}</h1>
              {subtitle && <p>{subtitle}</p>}
            </div>
            {actions && <div className="kv-page-head-actions">{actions}</div>}
          </header>
          {children}
        </div>
      </main>
    </div>
  );
}
