import Link from "next/link";
import { NotificationsBell } from "./NotificationsBell";
import { ThemeMenu } from "./ThemeMenu";

// Public-page navigation — a Bootstrap top navbar, branded via bootstrap-theme.css.
export function SiteNav({ right }: { right?: React.ReactNode }) {
  return (
    <nav className="navbar fixed-top kv-navbar" aria-label="Site">
      <div className="container-xxl">
        <Link href="/" className="navbar-brand kv-brand">
          <span className="brand-mark" aria-hidden>
            ✦
          </span>
          Knowledge Vault
        </Link>
        <div className="d-flex align-items-center kv-navbar-controls">
          <Link href="/help" className="nav-link d-none d-sm-inline-flex">
            Help
          </Link>
          {right}
          <NotificationsBell />
          <ThemeMenu />
        </div>
      </div>
    </nav>
  );
}
