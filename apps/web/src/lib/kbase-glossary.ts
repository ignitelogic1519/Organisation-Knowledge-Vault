import type { Definition } from "@/components/Define";

/**
 * The console's dictionary.
 *
 * Every property a super-admin can read or change is defined here once, and the console
 * points at these entries wherever the property appears — the card grid, the drawer, the
 * property editor and the Glossary tab all read the same sentence. Nothing in the console
 * should be a number whose meaning you have to already know.
 *
 * Keys match the API's property keys (`AdminOrgProperty.key`) wherever one exists, so the
 * property editor can look a definition up directly from the server's payload.
 */
export const KBASE_GLOSSARY: Record<string, Definition> = {
  // ── Identity ─────────────────────────────────────────────────────────────
  name: {
    term: "Name",
    short: "The organization's display name, as its members see it.",
    detail:
      "Free text, and not unique — two customers may legitimately pick the same name. Identify an organization by its number before you act on it.",
  },
  orgNumber: {
    term: "Organization number",
    short: "The permanent identifier this organization was issued on creation.",
    detail:
      "Never reused, never editable, and the only safe way to name an organization in a ticket or an audit note.",
    example: "#1042",
  },
  id: {
    term: "Organization ID",
    short: "The database UUID behind the organization.",
    detail:
      "What API calls, logs and support escalations key on. Click it to select the whole value.",
  },
  logo: {
    term: "Logo",
    short: "The square badge shown on the organization's card and on every document it publishes.",
    detail: "Optional — without one the badge falls back to the first letter of the name.",
  },
  isKvep: {
    term: "KVEP",
    short: "Knowledge Vault Employee Perk — an internal organization held on our own storage.",
    detail:
      "Created by a member of staff who proved their super-admin credentials. It has no storage of its own to configure, and the plan's allowance applies as usual.",
  },
  ownerUsernames: {
    term: "Owners",
    short: "The profiles placed on the organization's root role.",
    detail:
      "Only an owner can govern the whole structure. An organization must always keep at least one, which is why a profile that owns one cannot be deleted.",
  },

  // ── Plan ─────────────────────────────────────────────────────────────────
  planKey: {
    term: "Plan",
    short: "Which row of the pricing table this organization is on.",
    detail:
      "The plan supplies every limit that has not been overridden here — people, documents, uploads and storage.",
  },
  planStatus: {
    term: "Plan status",
    short: "Whether the plan is live, and how it got there.",
    detail:
      "NONE — never had one. DEMO — the free structure, metered. ACTIVE — a paid plan inside its term. EXPIRED — the term ran out; the organization still exists but routes its owners to Pricing.",
  },
  planExpiresAt: {
    term: "Expires on",
    short: "The day the plan lapses and the status flips to EXPIRED.",
    detail: "Blank means no expiry at all — the plan runs until someone changes it.",
  },
  planIsCustom: {
    term: "Custom plan",
    short: "The terms were negotiated rather than taken from the pricing table.",
    detail:
      "Set when an admin approved a custom proposal with hand-entered days, price or limits.",
  },

  // ── Metered counts ───────────────────────────────────────────────────────
  memberCount: {
    term: "People",
    short: "How many profiles hold a membership in this organization right now.",
    detail: "Live — it counts memberships, not placements, so one person in four roles counts once.",
  },
  memberLimit: {
    term: "People limit",
    short: "The ceiling on memberships for this organization.",
    detail:
      "Blank inherits the plan's limit. A number here always beats the plan. Set 0 to forbid new members entirely — it never removes anyone already inside.",
  },
  documentCount: {
    term: "Custom documents",
    short: "Documents authored in the Studio and published so far.",
    detail: "Counted against the plan's document allowance. Uploads are metered separately.",
  },
  documentLimit: {
    term: "Custom-document limit",
    short: "The ceiling on Studio-authored documents.",
    detail: "Blank inherits the plan's limit — unlimited on every paid plan, 20 on the free demo.",
  },
  uploadCount: {
    term: "Uploads",
    short: "Files and links added to the library without going through the Studio.",
    detail: "Counted against the plan's upload allowance — 30 on the free demo.",
  },
  uploadLimit: {
    term: "Upload limit",
    short: "The ceiling on uploaded or linked documents.",
    detail: "Blank inherits the plan's limit.",
  },
  storageUsedMb: {
    term: "Storage used",
    short: "Bytes this organization holds in our database, in megabytes.",
    detail:
      "Only counts inline files we hold. Content that lives on the organization's own storage is theirs, costs us nothing, and is reported under Storage instead.",
  },
  storageLimitMb: {
    term: "Storage limit (MB)",
    short: "The ceiling on the bytes we will hold for this organization.",
    detail: "Blank inherits the plan's limit.",
  },
  roleCount: {
    term: "Roles",
    short: "How many nodes the organization's role tree contains.",
    detail: "A rough measure of how built-out a structure is — a trial that never grew sits at 1.",
  },
  treeDepth: {
    term: "Tree depth",
    short: "How many levels the role tree runs, counting the root as 1.",
    detail: "Depth tells you about governance: deep trees delegate, flat trees do not.",
  },

  // ── Dates ────────────────────────────────────────────────────────────────
  createdAt: {
    term: "Created",
    short: "When the organization was founded.",
  },
  lastActivityAt: {
    term: "Last activity",
    short: "The most recent thing anyone did inside this organization.",
    detail:
      "The single best signal of an abandoned trial. Sort by it to find organizations worth messaging — or purging, after you have.",
  },
  deletedAt: {
    term: "Deleted",
    short: "The organization is in its owners' Recycle Bin, waiting out its 30-day retention.",
    detail:
      "It still exists and can be restored by its owners. Purging from this console skips the retention and is permanent.",
  },

  // ── Storage ──────────────────────────────────────────────────────────────
  storageStatus: {
    term: "Storage status",
    short: "Whether we could reach the organization's own storage on the last health check.",
    detail:
      "Unreachable does not mean data is lost — it means new uploads have nowhere to go until it comes back. Test connection re-runs the check now.",
  },
  storageEndpoint: {
    term: "Address",
    short: "The S3-compatible endpoint their storage answers on.",
    detail: "A NAS on the customer's own network, a MinIO instance, or any S3-compatible service.",
  },
  storageBucket: {
    term: "Bucket",
    short: "The bucket, and the optional prefix inside it, that holds this organization's objects.",
  },
  storageRegion: {
    term: "Region",
    short: "The region string their endpoint expects.",
    detail: "Many self-hosted deployments ignore it entirely; blank is normal.",
  },
  storageAccessKey: {
    term: "Access key",
    short: "The key ID we authenticate with, masked.",
    detail: "The secret is never shown, never logged, and never leaves the API.",
  },
  storageEncryption: {
    term: "Encryption",
    short: "Whether objects are written encrypted (.kvblob) or as readable files.",
    detail:
      "Encrypted is the safe default: the customer holds the bytes but cannot read them out of band. Readable is for customers who deliberately want their files browsable on their own NAS.",
  },
  storageObjects: {
    term: "Objects",
    short: "How many objects we have written to their storage, and how much they weigh.",
  },
  storagePending: {
    term: "Not migrated",
    short: "Documents still sitting in our database that belong on their storage.",
    detail: "Usually means storage was connected after content already existed, or a migration stalled.",
  },
  storageLastCheck: {
    term: "Last checked",
    short: "When the health check last ran against this storage.",
  },

  // ── Requests ─────────────────────────────────────────────────────────────
  requestKind: {
    term: "Request kind",
    short: "What the user is asking for.",
    detail:
      "Create an organization · Employee perk organization (KVEP) · Custom plan proposal · Restore an expired organization.",
  },
  requestStatus: {
    term: "Request status",
    short: "Where the request stands.",
    detail:
      "PENDING — waiting on you. APPROVED — decided, code issued. USED — the code has been redeemed. DENIED — refused.",
  },
  requesterCoins: {
    term: "Requester's coins",
    short: "The Knowledge Coin balance of the person asking.",
    detail:
      "Approving a paid plan charges this balance. If it will not cover the price, gift them the difference first or adjust the terms.",
  },
  willGrant: {
    term: "What approving grants",
    short: "The exact terms that will be applied if you approve as-is.",
    detail:
      "Resolved server-side from the plan the user picked, so an ordinary approval needs no data entry from you. Adjust terms overrides any of them.",
  },
  accessCode: {
    term: "Access code",
    short: "The one-time code that lets the requester actually create their organization.",
    detail: "Valid 24 hours, single use, and delivered to their mailbox as well as shown here.",
  },
  adminMessage: {
    term: "Note to the requester",
    short: "A line of your own that travels with the decision into their mailbox.",
    detail: "Optional. Worth writing on a denial — a refusal with no reason generates a support ticket.",
  },

  // ── Users ────────────────────────────────────────────────────────────────
  profileId: {
    term: "Profile ID",
    short: "The platform-wide UUID for this person.",
    detail: "One profile spans every organization they belong to. Support tickets key on this.",
  },
  username: {
    term: "Username",
    short: "The global handle this profile signs in with.",
    detail: "Unique across the platform, and there is no email — the username is the identity.",
  },
  coins: {
    term: "Knowledge Coins",
    short: "The profile's spendable balance.",
    detail:
      "Plans are priced in coins. A grant is positive, a revoke negative; the balance never goes below zero, and either way it lands in their wallet history and their mailbox.",
  },
  defaultCoins: {
    term: "Default coins",
    short: "How many coins a newly-registered profile starts with.",
    detail: "Changing it affects future registrations only — nobody's balance moves.",
  },
  banned: {
    term: "Suspended",
    short: "The profile is signed out everywhere and refused at the next sign-in.",
    detail:
      "Reversible, and it keeps their completion records and audit trail intact. It is the reversible answer; deletion is not.",
  },
  ownsAny: {
    term: "Owns an organization",
    short: "This profile sits on at least one organization's root role.",
    detail:
      "Deletion is refused while this is true — removing the last owner would leave an organization nobody can govern.",
  },

  // ── Administrators ───────────────────────────────────────────────────────
  adminActive: {
    term: "Active administrator",
    short: "Whether this account can sign in to the portal.",
    detail:
      "Deactivating is the safe way to remove someone: their audit entries stay attributable, and it can be undone the day they come back.",
  },
  adminLastLogin: {
    term: "Last signed in",
    short: "When this administrator last authenticated to the portal.",
    detail: "An account nobody has used for months is an account worth deactivating.",
  },
  mustChangePassword: {
    term: "Must change password",
    short: "The account is still on the password it was created with.",
    detail: "The portal refuses to show anything until it is replaced.",
  },

  // ── Console mechanics ────────────────────────────────────────────────────
  liveRefresh: {
    term: "Live",
    short: "This panel re-reads the server every few seconds.",
    detail: "Counts, plan states and new requests appear without you touching Refresh.",
  },
  selection: {
    term: "Selection",
    short: "Tick several organizations to act on all of them at once.",
    detail: "Two actions work in bulk: messaging every owner, and purging.",
  },
  purge: {
    term: "Purge",
    short: "Permanent, immediate deletion from this console.",
    detail:
      "It bypasses the customer's 30-day Recycle Bin entirely and there is no undo on our side — only their own .main revival file can bring it back.",
  },
  broadcast: {
    term: "Message owners",
    short: "One message delivered to every owner of every selected organization.",
    detail:
      "Lands in their mailbox under Knowledge Base, expires after 30 days like all Knowledge Base mail, and is audited with its subject and recipient count.",
  },
  priority: {
    term: "Priority",
    short: "High pins the message to the top of every recipient's mailbox and reddens their bell.",
    detail: "Reserve it for things that block someone. Offers are not blocking.",
  },
};

/** Look a definition up, falling back to whatever hint the API sent with the property. */
export function defineProperty(key: string, label: string, hint?: string): Definition {
  return (
    KBASE_GLOSSARY[key] ?? {
      term: label,
      short: hint ?? "No definition recorded for this property yet.",
    }
  );
}
