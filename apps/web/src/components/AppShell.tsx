"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { auth } from "@/lib/auth-client";
import { Mailbox } from "./Mailbox";
import { ThemeMenu } from "./ThemeMenu";
import { IconLogout } from "./icons";
import { Breadcrumbs } from "./Breadcrumbs";
import { NavSearch } from "./NavSearch";

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

// Authenticated app chrome: the navigation bar. Every destination shows its icon and its
// name at all times — nothing has to be hovered to be read — and the search box beside it
// finds pages, help topics and your organizations.
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

          {/* Desktop: the labelled rail sits in the middle of the bar.
              Below 992px the wrapper turns into the sheet under the hamburger. */}
          <div className="kv-sheet" id="kv-navbar-nav" data-open={open}>
            <ul className="kv-rail">
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
          </div>

          <NavSearch />

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
