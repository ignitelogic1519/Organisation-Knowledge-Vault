import Link from "next/link";
import { ApiStatus } from "@/components/ApiStatus";
import { Constellation } from "@/components/Constellation";
import { SiteNav } from "@/components/SiteNav";

export default function Home() {
  return (
    <main>
      <SiteNav right={<Link href="/login">Sign in</Link>} />

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
            <Link className="btn btn-primary" href="/register">
              Get started
            </Link>
            <Link className="btn btn-quiet" href="/login">
              Sign in
            </Link>
          </div>
          <ApiStatus />
        </div>
      </section>
    </main>
  );
}
