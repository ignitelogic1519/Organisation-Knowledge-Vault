import { ApiStatus } from "@/components/ApiStatus";
import { Constellation } from "@/components/Constellation";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function Home() {
  return (
    <main>
      <nav className="nav">
        <span className="nav-brand">Knowledge Vault</span>
        <div className="nav-actions">
          <ThemeToggle />
        </div>
      </nav>

      <section className="hero">
        <Constellation />
        <div className="hero-content">
          <h1>Your organization&apos;s knowledge, in your custody.</h1>
          <p>
            Mandatory and role-based training, structured like your organization — a
            constellation of roles, courses, and people. The platform holds nothing crucial;
            you hold everything.
          </p>
          <div className="hero-cta">
            <a className="btn btn-primary" href="#">
              Get started
            </a>
            <a className="btn btn-quiet" href="#">
              Learn more
            </a>
          </div>
          <ApiStatus />
        </div>
      </section>
    </main>
  );
}
