"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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

// Authenticated app chrome: glass sidebar on desktop, floating tab bar on mobile,
// glass top row with title + notifications + theme + sign-out controls.
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
              {item.badge ? <span className="nav-badge">{item.badge}</span> : null}
            </Link>
          ))}
        </nav>
        <div className="side-foot">
          <NotificationsBell />
          <ThemeMenu />
          <SignOutButton />
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
            {/* bell + theme + sign-out live in the sidebar on desktop; surface them here on mobile */}
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
            <span className="tab-icon-wrap">
              {item.icon}
              {item.badge ? <span className="nav-badge nav-badge-tab">{item.badge}</span> : null}
            </span>
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

function MobileExtras() {
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
      <SignOutButton />
    </span>
  );
}
