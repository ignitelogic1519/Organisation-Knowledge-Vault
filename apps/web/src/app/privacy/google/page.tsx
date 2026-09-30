import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
import { SessionNavLinks } from "@/components/SessionNavLinks";

export const metadata = {
  title: "Your Google account and Knowledge Vault",
  description:
    "Exactly what Knowledge Vault can reach in a connected Google account, what it keeps, and how to take the access back.",
};

/**
 * What we do with Google user data (docs/structure.md §9.16).
 *
 * The page Google's consent screen links to as the app's privacy policy. Every sentence
 * here describes what the code does; when the Google Drive adapter changes what it asks
 * for or keeps, this page changes with it.
 */
export default function GooglePrivacyPage() {
  return (
    <main className="landing">
      <SiteNav right={<SessionNavLinks />} />

      <section className="section legal-page" style={{ paddingTop: "6rem" }}>
        <div className="section-head">
          <span className="eyebrow">Privacy</span>
          <h2>Your Google account and Knowledge Vault</h2>
          <p>
            An organization can keep its documents in a folder in its own Google Drive. This page
            says exactly what that lets Knowledge Vault reach, what it keeps, and how to take the
            access back.
          </p>
        </div>

        <article className="glass legal-body">
          <h3>What we ask Google for</h3>
          <ul>
            <li>
              <strong>Your email address</strong> (<code>openid</code>, <code>email</code>) — to show
              which account is connected, and to make sure a reconnection uses the same one.
            </li>
            <li>
              <strong>Only the Drive files Knowledge Vault creates</strong> (<code>drive.file</code>)
              — the folder called &ldquo;Knowledge Vault&rdquo; and what we put in it. We cannot see,
              list, open or change anything else in your Drive.
            </li>
          </ul>

          <h3>What we do with it</h3>
          <ul>
            <li>
              We store your organization&rsquo;s documents in that folder, read them back when a
              member with permission opens one, and delete them when your organization deletes
              them.
            </li>
            <li>
              Documents pass through our streaming service on the way to and from your Drive,
              because Google offers no private link for a single file. Nothing is kept on the
              way. Encrypted documents pass through locked, and are only unlocked in the reader&rsquo;s
              own browser.
            </li>
            <li>
              We do not read your documents for any other purpose, use them to train any model,
              sell them, show advertising, or share them with anyone.
            </li>
          </ul>

          <h3>What we keep</h3>
          <ul>
            <li>
              One long-lived Google sign-in token per organization, encrypted with a key held
              outside our database. Short-lived access tokens are held in memory only. No Google
              token is ever sent to a browser.
            </li>
            <li>
              The connected account&rsquo;s email address and, for Google Workspace, its domain.
            </li>
            <li>The IDs of the folder and files we created, so we can find them again.</li>
          </ul>

          <h3>Taking the access back</h3>
          <ul>
            <li>
              Remove Knowledge Vault at{" "}
              <a href="https://myaccount.google.com/connections" rel="noreferrer" target="_blank">
                myaccount.google.com/connections
              </a>
              . Your documents stay in your Drive; Knowledge Vault simply stops being able to reach
              them, and tells your organization&rsquo;s owners.
            </li>
            <li>
              When an organization is deleted, we tell Google to forget our access. The files stay
              in your Drive — they are yours.
            </li>
          </ul>

          <h3>Google&rsquo;s rules</h3>
          <p>
            Knowledge Vault&rsquo;s use and transfer to any other app of information received from
            Google APIs will adhere to the{" "}
            <a
              href="https://developers.google.com/terms/api-services-user-data-policy"
              rel="noreferrer"
              target="_blank"
            >
              Google API Services User Data Policy
            </a>
            , including the Limited Use requirements.
          </p>

          <p className="muted">
            How each way of storing documents works is on the <Link href="/storage">storage page</Link>.
          </p>
        </article>
      </section>
    </main>
  );
}
