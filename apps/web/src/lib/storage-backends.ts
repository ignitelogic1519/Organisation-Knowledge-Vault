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
      "An S3-compatible server on hardware you own. MinIO on a NAS in your own building is the recommended shape.",
    whoFor:
      "Any organization that wants its documents to sit on its own hardware, under its own physical control, and to be able to walk away with everything.",
    steps: [
      {
        title: "1 · Stand up the storage",
        text: "Run MinIO (or any S3-compatible server) on your NAS and create one bucket for Knowledge Vault. We never create buckets — the one you name has to exist already.",
      },
      {
        title: "2 · Make a key that can do exactly one thing",
        text: "A dedicated access key scoped to that bucket and prefix: read, write, delete, list, and nothing else. No bucket creation, no policy editing, no reach into your other buckets.",
      },
      {
        title: "3 · Let browsers talk to it",
        text: "Add the CORS rules we generate for you, scoped to our web origin. This is the step people get wrong most often, which is why the setup screen tests it rather than trusting it.",
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
      "Files up to 200 MB, uploaded in framed 4 MB parts so a large file never has to fit in a phone's memory twice.",
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
    key: "cloud-drive",
    name: "Cloud drives",
    icon: "📁",
    status: "exploring",
    tagline:
      "Google Drive and OneDrive — familiar, universally available, and structurally the expensive option.",
    whoFor:
      "Organizations that already keep everything in a drive and would rather not add a second place. We would rather they used object storage, and we will say so.",
    steps: [
      {
        title: "1 · Connect the account",
        text: "OAuth against the drive, with tokens refreshed on our side and a folder we may write into. Substantially more moving parts than an access key.",
      },
      {
        title: "2 · Accept that we carry the bytes",
        text: "Neither drive issues signed URLs in the form we need, so every upload and every download would pass through our API. That is bandwidth we pay for on every read, and a large file held in the memory of a small instance.",
      },
    ],
    facts: {
      reach: "Public APIs — always reachable",
      bytes: "Through our servers on every upload and every download",
      encryption: "Encrypted objects only — a drive full of readable files defeats the point",
      cost: "Your drive quota, plus real bandwidth cost on our side",
    },
    strengths: [
      "Nothing new to buy, and nothing new to administer.",
      "The folder is one people already know how to find.",
    ],
    tradeoffs: [
      "No signed URLs means we proxy every byte — the one thing the storage design exists to avoid.",
      "Drive quotas and per-account rate limits become your users' problem at exactly the wrong moment.",
      "This is why it sits behind object storage in the queue rather than beside it.",
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
        text: "The design only earns its place if the reader's browser can still fetch directly over the local network when it is on it. Anything that ends in us proxying the bytes is the cloud-drive problem wearing different clothes.",
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
