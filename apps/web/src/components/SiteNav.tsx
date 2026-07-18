import Link from "next/link";
import { NotificationsBell } from "./NotificationsBell";
import { ThemeToggle } from "./ThemeToggle";

export function SiteNav({ right }: { right?: React.ReactNode }) {
  return (
    <nav className="nav">
      <Link href="/" className="nav-brand">
        Knowledge Vault
      </Link>
      <div className="nav-actions">
        {right}
        <NotificationsBell />
        <ThemeToggle />
      </div>
    </nav>
  );
}
