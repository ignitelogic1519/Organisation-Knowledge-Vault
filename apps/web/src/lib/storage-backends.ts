/**
 * Where an organization's documents can live.
 *
 * This is the single register of storage backends, and it is deliberately a data
 * structure rather than a page full of prose. Adding a backend — a cloud bucket, a
 * connector agent for a NAS with no public address, anything that comes after — is one
 * entry in `STORAGE_BACKENDS`. The public storage page, the comparison table and the
 * "what's coming" section all render themselves from it, so a new backend arrives
 * everywhere at once and nothing is left describing the old set.
 *
 * The normative rules these summaries paraphrase live in `docs/structure.md` §9; the
 * working record of how they were reached is in `Data Storage Architecture/`.
 */

export type BackendStatus = "live" | "planned" | "exploring";

export const STATUS_LABEL: Record<BackendStatus, string> = {
  live: "Available now",
  planned: "Planned — the adapter already exists",
  exploring: "Being explored",
};

export interface StorageBackend {
  key: string;
  /** What the organization sees it called in the creation form. */
  name: string;
  icon: string;
  status: BackendStatus;
  /** One line: what this is. */
  tagline: string;
  /** Who should pick it, in one sentence. */
  whoFor: string;
  /** The process, in the order it actually happens. */
  steps: { title: string; text: string }[];
  /** The four facts that decide the economics of a backend. */
  facts: {
    reach: string;
    bytes: string;
    encryption: string;
    cost: string;
  };
  strengths: string[];
  tradeoffs: string[];
}

export const STORAGE_BACKENDS: StorageBackend[] = [
  {
    key: "nas",
    name: "NAS — your own storage",
    icon: "🗄",
    status: "live",
    tagline:
      "An S3-compatible server on hardware you own. Silo — an open-source storage server that speaks the S3 API — on a NAS in your own building is the recommended shape.",
    whoFor:
      "Any organization that wants its documents to sit on its own hardware, under its own physical control, and to be able to walk away with everything.",
    steps: [
      {
        title: "1 · Stand up the storage",
        text: "Run Silo (or any S3-compatible server) on your NAS and create one bucket for Knowledge Vault. We never create buckets — the one you name has to exist already.",
      },
      {
        title: "2 · Make a key that can do exactly one thing",
        text: "A dedicated access key scoped to that bucket and prefix: read, write, delete, list, and nothing else. No bucket creation, no policy editing, no reach into your other buckets.",
      },
      {
        title: "3 · Let browsers talk to it",
        text: "Add the CORS rules we generate for you, scoped to our web origin. Silo accepts every origin out of the box, and these rules narrow that to Knowledge Vault alone — and because the connection test runs from our servers, only a real upload from a browser proves this step.",
      },
      {
        title: "4 · Choose the encryption posture",
        text: "Encrypted (recommended) writes opaque .kvblob objects nobody can read out of band — not even your own IT administrator. Readable keeps ordinary browsable files. The choice is fixed once storage is active, because changing it re-encrypts everything.",
      },
      {
        title: "5 · Pass the connection test",
        text: "We reach, write, read back, compare and delete a probe object before the organization is created. A failure names the exact stage that broke, aborts creation, and does not consume your access code.",
      },
      {
        title: "6 · Work normally",
        text: "Uploads go from the browser straight to your storage through a short-lived signed link, and downloads come back the same way. We keep the catalogue — who may see what, and what has been done — and you keep the contents.",
      },
    ],
    facts: {
      reach: "Must be reachable at an HTTPS address we can call",
      bytes: "Never pass through our servers",
      encryption: "Your choice: encrypted (.kvblob) or readable files",
      cost: "Your hardware, your electricity — no storage bill from us",
    },
    strengths: [
      "The documents are physically yours, on a machine you can point at.",
      "Zero bandwidth through us means the storage ceiling stops applying to you.",
      "The signed Knowledge_vault_map manifest sits in the bucket, so the folder explains itself.",
      "Objects are content-addressed and date-sharded — a filename never leaks what a document is about.",
    ],
    tradeoffs: [
      "Your storage has to have a public HTTPS address. A NAS reachable only on your office LAN cannot be used this way.",
      "An organization cannot be created until its storage is reachable and working.",
      "Files up to 200 MB, encrypted in 4 MB frames so a large file never has to fit in a phone's memory twice. Behind a Cloudflare Tunnel on Cloudflare's free plan, the ceiling is 100 MB per file.",
    ],
  },
  {
    key: "kvep",
    name: "KVEP — Knowledge Vault Employee Perk",
    icon: "✦",
    status: "live",
    tagline:
      "An organization created by Knowledge Vault staff, for staff use, whose documents stay on our own storage.",
    whoFor:
      "Our own team. It is the one shape that does not bring its own storage, and it is gated on super-admin credentials at two separate points.",
    steps: [
      {
        title: "1 · Raise the request as an employee perk",
        text: "The plan request goes in as KVEP rather than an ordinary organization request. Plans and access codes work exactly as usual — the kind of the request is what marks it.",
      },
      {
        title: "2 · Get it approved like any other",
        text: "A super-admin approves it in the console and the one-time access code arrives in the requester's mailbox. Nothing about the approval is special.",
      },
      {
        title: "3 · Prove it at creation time as well",
        text: "The creation form asks for a super-admin username and password and checks them against the administrator table. A KVEP code with no credentials is refused; so are credentials against an ordinary code, and so are storage fields on a KVEP creation.",
      },
      {
        title: "4 · Skip storage setup entirely",
        text: "There is nothing to configure. Content stays in our database exactly as every organization worked before organization-provided storage existed, and the plan's storage allowance applies normally.",
      },
    ],
    facts: {
      reach: "Nothing to reach — the content is already with us",
      bytes: "Held in our database, at the 10 MB inline cap per file",
      encryption: "Ours, at rest, on our infrastructure",
      cost: "On our bill, which is the point of the perk",
    },
    strengths: [
      "No setup at all — no bucket, no key, no CORS, no connection test.",
      "It can never enter the degraded state, because there is no third-party storage to go unreachable.",
      "The organization carries a KVEP marker, so every later screen can tell the two apart.",
    ],
    tradeoffs: [
      "Reserved for staff. The credential check is deliberately generic on failure and never reveals whether a username exists.",
      "It is metered normally against the plan's storage allowance, because the bytes are on our disks.",
      "Files are capped at 10 MB each, not the 200 MB organization-provided storage allows.",
    ],
  },
  {
    key: "cloud-object",
    name: "Cloud object storage",
    icon: "☁",
    status: "planned",
    tagline:
      "Amazon S3, Cloudflare R2, Google Cloud Storage, Wasabi, Backblaze B2, DigitalOcean Spaces — the same adapter, a different endpoint.",
    whoFor:
      "Organizations that would rather rent storage than run it, and are happy for the bytes to live with a cloud provider they already pay.",
    steps: [
      {
        title: "1 · Pick the provider",
        text: "Choosing one fills in the endpoint template and shows the exact policy and CORS rules for that provider, instead of leaving you to translate ours into theirs.",
      },
      {
        title: "2 · Give us a scoped key",
        text: "The same shape as NAS: one bucket, one prefix, five permissions. We show the IAM policy to paste.",
      },
      {
        title: "3 · Everything else is identical",
        text: "Same connection test, same encryption postures, same signed-URL upload and download path, same manifest in the bucket. This is configuration rather than new code, which is exactly why S3 was chosen as the first protocol.",
      },
    ],
    facts: {
      reach: "Public endpoints — always reachable",
      bytes: "Never pass through our servers",
      encryption: "Your choice, the same two postures as NAS",
      cost: "Your provider's bill — R2 and B2 charge nothing for egress",
    },
    strengths: [
      "No hardware to own, no server to keep patched, no address to expose.",
      "Durability and geographic redundancy are the provider's problem.",
      "The adapter is already written and shipping for NAS; this is a provider list and its documentation.",
    ],
    tradeoffs: [
      "The documents live with a third party rather than in your building.",
      "Egress is metered by some providers, so a read-heavy library can carry a real bill.",
    ],
  },
  {
    key: "google-drive",
    name: "Google Drive",
    icon: "📁",
    status: "live",
    tagline:
      "A folder in your Google Drive — a personal Google account or Google Workspace. Knowledge Vault can only see the files it creates there, never the rest of your Drive.",
    whoFor:
      "Organizations that already keep their work in Google Drive and would rather not run a server. On Google Workspace, a dedicated account keeps the files with the organization rather than with one person.",
    steps: [
      {
        title: "1 · Sign in with Google",
        text: "In the creation form, or later in storage settings, connect the Google account the documents should live in. Google asks you to allow access to the files Knowledge Vault creates — and nothing else in your Drive.",
      },
      {
        title: "2 · Confirm who owns the files",
        text: "Files in a Google account's Drive belong to that account and count against its storage. You confirm that before connecting. On Google Workspace we suggest a dedicated account, such as knowledge-vault@your-company.com, rather than a person's own.",
      },
      {
        title: "3 · Choose the encryption posture",
        text: "Encrypted (recommended) stores locked .kvblob files nobody can read in Drive — not your administrators, not Drive's search. Readable keeps ordinary files under their own names. The choice is fixed once storage is active.",
      },
      {
        title: "4 · Pass the connection test",
        text: "We create a Knowledge Vault folder, write a test file, read it back, compare it, and check the folder is not shared publicly and has room. A failure names the exact step, and costs you nothing.",
      },
      {
        title: "5 · Work normally",
        text: "Uploads and viewing pass through Knowledge Vault's streaming service, which keeps nothing and carries encrypted documents locked. Videos start in a moment and seek without downloading the whole file.",
      },
    ],
    facts: {
      reach: "Google's public API — always reachable",
      bytes: "Through our streaming service — locked when encrypted, never stored",
      encryption: "Your choice: encrypted (.kvblob) or readable files",
      cost: "Your Drive's storage; streaming has a free monthly allowance on our side",
    },
    strengths: [
      "No server to run, and nothing new to buy.",
      "Knowledge Vault's access covers only the files it creates — never the rest of your Drive.",
      "Readers always get the exact version that was uploaded, even if someone replaces the file in Drive.",
      "Encrypted documents are unreadable in Drive — to its administrators, to its search, and to anyone the folder is shared with.",
    ],
    tradeoffs: [
      "Every byte crosses our streaming service on the way — unlike a NAS, where the browser talks to your storage directly.",
      "Streaming has a monthly allowance. When it is used up, opening Drive documents pauses until the 1st; nothing is billed.",
      "The files belong to the connected Google account and count against its storage.",
      "Readable documents pass through the streaming service readable. They are never kept.",
    ],
  },
  {
    key: "onedrive",
    name: "OneDrive and SharePoint",
    icon: "🗂",
    status: "exploring",
    tagline:
      "Microsoft's drives, through the same design as Google Drive: least-privilege access, the same postures, the same streaming service.",
    whoFor:
      "Organizations on Microsoft 365 that would rather keep documents in SharePoint than add a second place.",
    steps: [
      {
        title: "1 · Connect Microsoft 365",
        text: "An app registration the organization approves, reaching one SharePoint document library and nothing else.",
      },
      {
        title: "2 · The rest as Google Drive",
        text: "The same connection test, encryption postures, streaming service and recovery route. The unsolved part is only the Microsoft side: consent, certificate-based credentials and their expiry.",
      },
    ],
    facts: {
      reach: "Microsoft Graph — always reachable",
      bytes: "Through our streaming service, as with Google Drive",
      encryption: "Your choice: encrypted (.kvblob) or readable files",
      cost: "Your Microsoft 365 storage; streaming as for Google Drive",
    },
    strengths: [
      "Nothing new to buy for organizations already on Microsoft 365.",
      "SharePoint libraries belong to the organization, not to a person.",
    ],
    tradeoffs: [
      "App credentials expire, typically within two years, and must be renewed before they do.",
      "Listed because it is asked for, not because it is next.",
    ],
  },
  {
    key: "private-nas",
    name: "NAS with no public address",
    icon: "🔌",
    status: "exploring",
    tagline:
      "A file server that only exists on your own network, reached through a small connector you run beside it.",
    whoFor:
      "Organizations whose security policy will not put storage on the public internet at all, and who accept running one more piece of software to bridge the gap.",
    steps: [
      {
        title: "1 · Run a connector on your network",
        text: "A small agent beside the storage that opens an outbound connection to us. Nothing is exposed inbound, and no firewall rule is needed for us to reach in — because we never do.",
      },
      {
        title: "2 · The browser still does the carrying",
        text: "The design only earns its place if the reader's browser can still fetch directly over the local network when it is on it. Anything that ends in us carrying every byte loses what makes a NAS worth running.",
      },
    ],
    facts: {
      reach: "Not reachable by us at all — the connector reaches out instead",
      bytes: "Direct on the local network; the fallback path is the open question",
      encryption: "Encrypted objects, as with any storage we cannot see",
      cost: "Your hardware, plus running the connector",
    },
    strengths: [
      "The storage never appears on the public internet in any form.",
      "It is the honest answer for organizations that today have to say no to the whole product.",
    ],
    tradeoffs: [
      "Software you have to install, keep running and keep updated.",
      "Someone off the network still has to be able to read a document, and that route is exactly the unsolved part.",
      "Listed here because it is a real requirement, not because it is close.",
    ],
  },
];

/** The comparison table's rows, in the order they answer the questions people ask. */
export const COMPARISON_ROWS: {
  label: string;
  key: keyof StorageBackend["facts"];
  hint: string;
}[] = [
  {
    label: "Can we reach it?",
    key: "reach",
    hint: "Storage with no address we can call needs a different approach entirely — it is not a permissions problem.",
  },
  {
    label: "Do the bytes cross our servers?",
    key: "bytes",
    hint: "Signed links let the browser talk to the storage directly. That is the difference between paying for bandwidth on every read and paying for none.",
  },
  {
    label: "How is it encrypted?",
    key: "encryption",
    hint: "Encrypted storage holds opaque objects nobody can read out of band. Readable storage stays browsable by anyone who can open the folder.",
  },
  {
    label: "Who pays for it?",
    key: "cost",
    hint: "Storage you provide is storage we do not meter — the document and upload counts still apply, but the storage ceiling stops.",
  },
];
