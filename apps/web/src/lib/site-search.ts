// What the navbar search can find without asking the server anything: every page you can
// navigate to, and every topic on the Help page. Organizations (and, inside one, its
// Library and My Learning) are added by the search component at run time, because only
// it knows who is signed in and where they are standing.
//
// Each entry carries the words a customer might TYPE, not just the words on the page —
// "price", "plan", "coins" and "billing" should all find Pricing.

export type SearchGroup = "Pages" | "Help" | "Your organizations" | "This organization";

export interface SearchEntry {
  id: string;
  group: SearchGroup;
  title: string;
  /** One line under the title, saying where this goes. */
  hint: string;
  href: string;
  icon: string;
  /** Extra words that should find this entry. */
  keywords?: string;
  /** Show only when signed in (true), only when signed out (false), or always (undefined). */
  signedIn?: boolean;
}

/** The anchor a Help topic carries on /help — shared, so a result lands on its card. */
export function helpTopicId(title: string): string {
  return (
    "help-" +
    title
      .toLowerCase()
      .replace(/&/g, "and")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
  );
}

export const PAGE_ENTRIES: SearchEntry[] = [
  { id: "p-home", group: "Pages", title: "Home", hint: "The front page", href: "/", icon: "✦", keywords: "start landing welcome" },
  { id: "p-features", group: "Pages", title: "Features", hint: "Everything the platform does", href: "/features", icon: "✨", keywords: "what can it do overview capabilities tour" },
  { id: "p-storage", group: "Pages", title: "Storage", hint: "Where your documents live — NAS or Google Drive", href: "/storage", icon: "🗄", keywords: "nas google drive files documents upload silo backup encryption" },
  { id: "p-pricing", group: "Pages", title: "Pricing", hint: "Plans and Knowledge Coins", href: "/pricing", icon: "🪙", keywords: "price prices plan plans cost billing pay payment coins knowledge coins subscription upgrade buy" },
  { id: "p-help", group: "Pages", title: "Help & guide", hint: "Every part of the platform explained, plus the guide book", href: "/help", icon: "❓", keywords: "help guide manual how support faq documentation docs" },
  { id: "p-guide-pdf", group: "Pages", title: "Download the guide book (PDF)", hint: "The complete manual, all chapters", href: "/guide/Knowledge-Vault-Main-Guide-Book.pdf", icon: "📘", keywords: "pdf manual book download handbook" },
  { id: "p-orgs", group: "Pages", title: "Organizations", hint: "Every organization you belong to", href: "/orgs", icon: "🏛", keywords: "orgs dashboard my organizations workspace company team", signedIn: true },
  { id: "p-new-org", group: "Pages", title: "Found an organization", hint: "Create a new organization", href: "/orgs/new", icon: "➕", keywords: "create new organization add start company found", signedIn: true },
  { id: "p-account", group: "Pages", title: "Account", hint: "Your profile, coins and sign-in", href: "/account", icon: "👤", keywords: "profile settings me my account username password delete coins balance", signedIn: true },
  { id: "p-login", group: "Pages", title: "Sign in", hint: "Open your account", href: "/login", icon: "🔑", keywords: "login log in signin account", signedIn: false },
  { id: "p-register", group: "Pages", title: "Create your profile", hint: "Register — free", href: "/register", icon: "🙋", keywords: "register sign up signup create account join new profile get started", signedIn: false },
  { id: "p-privacy-google", group: "Pages", title: "Google privacy", hint: "Exactly what we reach in a Google account", href: "/privacy/google", icon: "🔒", keywords: "privacy google data policy drive" },
];

/**
 * The Help page's topic cards, by title. These titles MUST match the `title`s in
 * app/help/page.tsx — the anchor is derived from the title on both sides.
 */
const HELP_TOPICS: { title: string; icon: string; keywords: string }[] = [
  { title: "Profile & signing in", icon: "👤", keywords: "register username password login sign in profile account" },
  { title: "Organizations & the Supreme", icon: "🏛", keywords: "supreme password root owner organization" },
  { title: "Your organizations", icon: "🗂", keywords: "organizations list dashboard join leave" },
  { title: "Roles, owners & members", icon: "🌳", keywords: "roles owners members people add person permissions branch" },
  { title: "The Constellation tab", icon: "✦", keywords: "constellation graph tree structure stars chart org chart" },
  { title: "Courses & My Learning", icon: "📚", keywords: "courses learning training assigned complete progress" },
  { title: "The Document Studio", icon: "✍", keywords: "studio editor write author document blocks publish" },
  { title: "Editions & the review channel", icon: "🔁", keywords: "editions versions review revise republish changes" },
  { title: "Library & Requests", icon: "📖", keywords: "library catalogue request access borrow" },
  { title: "Compliance — and honest deadlines", icon: "📊", keywords: "compliance deadlines overdue report audit" },
  { title: "Exams, attempts & resets", icon: "🧪", keywords: "exam test quiz attempts score reset assessment" },
  { title: "The Mailbox", icon: "📥", keywords: "mail mailbox messages inbox notifications" },
  { title: "Staying signed in", icon: "⏳", keywords: "session timeout sign out idle hour logged out" },
  { title: ".main & .bkp files", icon: "💾", keywords: "main bkp backup recovery custody key file restore" },
  { title: "Where your documents live", icon: "🗄", keywords: "storage nas google drive files documents encryption" },
  { title: "Themes & appearance", icon: "🎨", keywords: "theme dark light mode colour color accent animation cursor appearance" },
];

export const HELP_ENTRIES: SearchEntry[] = HELP_TOPICS.map((t) => ({
  id: `h-${helpTopicId(t.title)}`,
  group: "Help",
  title: t.title,
  hint: "Help topic",
  href: `/help#${helpTopicId(t.title)}`,
  icon: t.icon,
  keywords: t.keywords,
}));

/** Lower-case, accents stripped — so "Organisation" and "organisation" are one word. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    // British and American spellings of the words this product uses most.
    .replace(/organis/g, "organiz")
    .replace(/colour/g, "color");
}

/**
 * How well an entry answers a query; 0 means it does not. Every word typed has to appear
 * somewhere (title, hint or keywords); the title starting with what you typed ranks first,
 * a word in the title next, and a keyword-only match last.
 */
export function score(entry: SearchEntry, query: string): number {
  const q = normalize(query.trim());
  if (!q) return 0;
  const title = normalize(entry.title);
  const hay = `${title} ${normalize(entry.hint)} ${normalize(entry.keywords ?? "")}`;
  const words = q.split(/\s+/);
  if (!words.every((w) => hay.includes(w))) return 0;
  if (title.startsWith(q)) return 100;
  if (title.includes(q)) return 80;
  if (words.every((w) => title.includes(w))) return 60;
  if (words.some((w) => title.split(/[^a-z0-9.]+/).some((t) => t.startsWith(w)))) return 40;
  return 20;
}
