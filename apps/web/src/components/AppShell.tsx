"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NotificationsBell } from "./NotificationsBell";
import { ThemeMenu } from "./ThemeMenu";

export interface ShellNavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  /** Match sub-paths too (e.g. /orgs matches /orgs/new). Defaults to exact. */
  prefix?: boolean;
}

// Authenticated app chrome: glass sidebar on desktop, floating tab bar on mobile,
// glass top row with title + notifications + theme controls.
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
  const isActive = (item: ShellNavItem) =>
    item.prefix ? pathname.startsWith(item.href) : pathname === item.href;

  return (
    <div className="shell">
      <aside className="shell-side glass">
        <Link href="/orgs" className="side-brand">
          <span className="brand-mark" aria-hidden>
            ✦
          </span>
          Knowledge Vault
        </Link>
        <nav className="side-nav" aria-label="Main">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="side-link"
              data-active={isActive(item)}
            >
              {item.icon}
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="side-foot">
          <NotificationsBell />
          <ThemeMenu />
        </div>
      </aside>

      <main className="shell-main">
        <header className="shell-top">
          <div className="shell-title">
            <h1>{title}</h1>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <div className="shell-top-actions">
            {actions}
            {/* bell + theme live in the sidebar on desktop; surface them here on mobile */}
            <MobileExtras />
          </div>
        </header>
        {children}
      </main>

      <nav className="tabbar glass" aria-label="Main">
        {nav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="tab-link"
            data-active={isActive(item)}
          >
            {item.icon}
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

function MobileExtras() {
  // Rendered inline in the top row; hidden on desktop (sidebar already has them)
  return (
    <span className="mobile-extras">
      <style>{`
        .mobile-extras { display: none; }
        @media (max-width: 900px) {
          .mobile-extras { display: inline-flex; align-items: center; gap: 0.6rem; }
        }
      `}</style>
      <NotificationsBell />
      <ThemeMenu />
    </span>
  );
}
