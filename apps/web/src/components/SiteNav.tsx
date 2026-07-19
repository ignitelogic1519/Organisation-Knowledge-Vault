import Link from "next/link";
import { NotificationsBell } from "./NotificationsBell";
import { ThemeMenu } from "./ThemeMenu";

// Public-page navigation — a floating glass pill.
export function SiteNav({ right }: { right?: React.ReactNode }) {
  return (
    <nav className="nav glass">
      <Link href="/" className="nav-brand">
        <span className="brand-mark" aria-hidden>
          ✦
        </span>
        Knowledge Vault
      </Link>
      <div className="nav-actions">
        <Link href="/help" className="nav-link nav-link-optional">
          Help
        </Link>
        {right}
        <NotificationsBell />
        <ThemeMenu />
      </div>
    </nav>
  );
}
