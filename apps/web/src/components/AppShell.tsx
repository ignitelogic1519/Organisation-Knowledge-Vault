"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { auth } from "@/lib/auth-client";
import { NotificationsBell } from "./NotificationsBell";
import { ThemeMenu } from "./ThemeMenu";
import { IconLogout } from "./icons";

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

// Authenticated app chrome, rebuilt on Bootstrap: a responsive top navbar that
// collapses into a hamburger menu on mobile (no bottom tab bar, no sidebar),
// with the brand identity layered on via bootstrap-theme.css.
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
      <nav className="navbar navbar-expand-lg fixed-top kv-navbar" aria-label="Main">
        <div className="container-xxl">
          <Link href="/orgs" className="navbar-brand kv-brand">
            <span className="brand-mark" aria-hidden>
              ✦
            </span>
            Knowledge Vault
          </Link>

          {/* Controls + toggler stay to the right and visible at every size. */}
          <div className="d-flex align-items-center order-lg-last kv-navbar-controls">
            {actions}
            <NotificationsBell />
            <ThemeMenu />
            <SignOutButton />
            <button
              className="navbar-toggler kv-toggler d-lg-none p-0 border-0"
              type="button"
              aria-controls="kv-navbar-nav"
              aria-expanded={open}
              aria-label="Toggle navigation"
              onClick={() => setOpen((v) => !v)}
            >
              <MenuIcon open={open} />
            </button>
          </div>

          <div
            id="kv-navbar-nav"
            className={`collapse navbar-collapse${open ? " show" : ""}`}
          >
            <ul className="navbar-nav me-auto kv-nav">
              {nav.map((item) => (
                <li key={item.href} className="nav-item">
                  <Link
                    href={item.href}
                    className="nav-link"
                    data-active={isActive(item)}
                    onClick={() => setOpen(false)}
                  >
                    {item.icon}
                    {item.label}
                    {item.badge ? <span className="kv-nav-badge">{item.badge}</span> : null}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </nav>

      <main className="kv-main">
        <div className="container-xxl">
          <header className="kv-page-head">
            <div>
              <h1>{title}</h1>
              {subtitle && <p>{subtitle}</p>}
            </div>
          </header>
          {children}
        </div>
      </main>
    </div>
  );
}
