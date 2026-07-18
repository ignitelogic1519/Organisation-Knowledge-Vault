import Link from "next/link";
import { ThemeToggle } from "./ThemeToggle";

export function SiteNav({ right }: { right?: React.ReactNode }) {
  return (
    <nav className="nav">
      <Link href="/" className="nav-brand">
        Knowledge Vault
      </Link>
      <div className="nav-actions">
        {right}
        <ThemeToggle />
      </div>
    </nav>
  );
}
