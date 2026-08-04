"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Mailbox } from "./Mailbox";
import { ThemeMenu } from "./ThemeMenu";

// Public-page navigation. The same icon-first rail the app shell uses, so moving from the
// marketing pages into the product doesn't change how navigation behaves: an icon that
// widens on hover or focus to show its real label.

const LINKS = [
  { href: "/", label: "Home", icon: "✦" },
  { href: "/features", label: "Features", icon: "✨" },
  { href: "/pricing", label: "Pricing", icon: "🪙" },
  { href: "/help", label: "Help & guide", icon: "❓" },
];

export function SiteNav({ right }: { right?: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <nav className="navbar fixed-top kv-navbar" aria-label="Site">
      <div className="container-xxl kv-navbar-inner">
        <Link href="/" className="navbar-brand kv-brand">
          <span className="brand-mark" aria-hidden>
            ✦
          </span>
          <span className="kv-brand-word">Knowledge Vault</span>
        </Link>

        <ul className="kv-rail">
          {LINKS.map((l) => (
            <li key={l.href} className="kv-rail-item">
              <Link
                href={l.href}
                className="kv-rail-link"
                data-active={l.href === "/" ? pathname === "/" : pathname.startsWith(l.href)}
                aria-current={pathname === l.href ? "page" : undefined}
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
        </div>
      </div>
    </nav>
  );
}
