import { corsRulesFor } from "@vault/shared";

/**
 * The NAS setup guide — one source, two surfaces.
 *
 * The storage form used to explain itself in a five-line `<details>` that assumed the
 * reader already knew what MinIO was, what a bucket was for, and why a NAS on an office
 * network is invisible to a datacentre. An owner who did not know those things had no way
 * to find out, and the person who actually does the work — whoever administers the NAS —
 * never sees our screen at all.
 *
 * So the steps live here as data. The guide window walks through them one card at a time,
 * and the download serialises the same array to a Markdown file the owner can hand to
 * their IT. Neither can drift from the other, because there is only one of them.
 *
 * `docs/storage-setup-guide.md` is the long-form companion: it covers testing against a
 * folder on a laptop, and the failure modes in detail. This is the shorter path a real
 * organization walks once.
 */

export interface GuideCommand {
  /** Which machine or shell this line is for — "" when it is universal. */
  platform?: string;
  code: string;
}

export interface GuideStep {
  id: string;
  /** Short label for the rail — three words at most, it has to fit on a phone. */
  short: string;
  title: string;
  /** Why this step exists. Skipping the reason is what made the old panel useless. */
  why: string;
  /** The instructions, in order. Plain sentences; the UI numbers them. */
  todo: string[];
  commands?: GuideCommand[];
  /** How the reader knows it worked before moving on. */
  check?: string;
  /** The trap this step is famous for, when it has one. */
  warning?: string;
  /** Roughly how long, for the reader deciding whether to start now. */
  minutes: number;
}

/** Everything the organization needs to have decided or in hand before it starts. */
export const GUIDE_PREREQUISITES = [
  "A NAS, server or spare computer that stays switched on — this is where the documents will live.",
  "Docker on that machine. Synology, QNAP, TrueNAS and Unraid all provide it; on a plain PC, Docker Desktop.",
  "Administrator access to that machine — and whoever has it, since most of the work happens there rather than here.",
  "A free Cloudflare account and a domain name, for step 5. Skip only if your NAS already has a public HTTPS address.",
  "A backup of that NAS. Knowledge Vault keeps the records; the documents themselves will live only here.",
];

export function nasGuideSteps(webOrigin: string): GuideStep[] {
  const origin = webOrigin || "https://your-knowledge-vault-address";
  return [
    {
      id: "idea",
      short: "The idea",
      title: "What you are actually building",
      why:
        "Three facts make the rest of this obvious. A NAS is just a computer with disks. " +
        "MinIO is a small program that lets other software read and write a folder on it " +
        "over the network, in the language Amazon S3 speaks. And Knowledge Vault runs in a " +
        "datacentre, so it cannot see a machine sitting on your office network unless you " +
        "give that machine an address on the internet.",
      todo: [
        "Decide which machine will hold the documents, and which folder on it.",
        "Check you can run Docker on that machine, and that you can sign in to it as an administrator.",
        "Read the warning below before going further — it is the part people regret skipping.",
      ],
      warning:
        "Your storage becomes the only copy of your documents. Knowledge Vault keeps the " +
        "catalogue — who may read what, who has completed what — but never the files. A NAS " +
        "with one disk and no backup is a single point of failure for your training records.",
      minutes: 5,
    },
    {
      id: "minio",
      short: "Install MinIO",
      title: "Run MinIO on the machine",
      why:
        "MinIO is the piece that turns an ordinary folder into storage Knowledge Vault can " +
        "talk to. Files written through it appear as ordinary files in that folder — nothing " +
        "is locked inside a database, and you can walk away with everything at any time.",
      todo: [
        "Sign in to the NAS and open a terminal (Synology: Control Panel → Terminal & SNMP → enable SSH).",
        "Choose a strong user name and password for MinIO and keep them somewhere safe. These are the master credentials for the storage; Knowledge Vault will never be given them.",
        "Replace the folder path with the shared folder you chose, then run the command.",
        "Confirm the container restarts by itself after a power cut — that is what `--restart unless-stopped` is for.",
      ],
      commands: [
        {
          platform: "Synology / TrueNAS / any Linux with Docker",
          code: `docker run -d --name minio --restart unless-stopped \\
  -p 9000:9000 -p 9001:9001 \\
  -e MINIO_ROOT_USER=<choose-a-user> \\
  -e MINIO_ROOT_PASSWORD=<choose-a-long-password> \\
  -v /volume1/knowledge-vault:/data \\
  quay.io/minio/minio:latest server /data --console-address ":9001"`,
        },
        {
          platform: "QNAP (the share path differs)",
          code: `-v /share/knowledge-vault:/data`,
        },
      ],
      check:
        "`docker ps` lists a running `minio` container, and http://<nas-address>:9001 opens a login page on your own network.",
      warning:
        "The password must be at least eight characters or MinIO refuses to start. Port 9000 is the one Knowledge Vault talks to; 9001 is only the console for you.",
      minutes: 10,
    },
    {
      id: "bucket",
      short: "Make a bucket",
      title: "Create the bucket the documents go in",
      why:
        "A bucket is a named top-level container — it becomes a sub-folder inside the folder " +
        "you chose. Knowledge Vault writes everything into one bucket, and refuses to connect " +
        "one that the whole internet can read.",
      todo: [
        "Install the MinIO client, `mc`, on the same machine (or use the one inside the container, as below).",
        "Point it at your MinIO using the credentials from the previous step.",
        "Create a bucket. `knowledge-vault` is a good name; lowercase, no spaces.",
        "Leave its access policy PRIVATE. That is the default — do not make it public.",
      ],
      commands: [
        {
          platform: "Using the client inside the container",
          code: `docker exec minio mc alias set local http://localhost:9000 <user> <password>
docker exec minio mc mb local/knowledge-vault
docker exec minio mc ls local`,
        },
      ],
      check: "`mc ls local` lists `knowledge-vault`, and the folder now exists on the NAS's disk.",
      minutes: 3,
    },
    {
      id: "key",
      short: "Access key",
      title: "Create an access key for Knowledge Vault",
      why:
        "Knowledge Vault should never hold the master password. An access key is a separate " +
        "credential you can scope to this one bucket and revoke on its own, without touching " +
        "anything else on the NAS.",
      todo: [
        "Create a service account. The command prints an access key and a secret key.",
        "Copy both immediately — the secret is shown once and cannot be read back.",
        "Scope it to this bucket only, with GetObject, PutObject, DeleteObject and ListBucket. Nothing else is needed.",
      ],
      commands: [
        {
          platform: "Create the key",
          code: `docker exec minio mc admin user svcacct add local <user>`,
        },
        {
          platform: "Scope it (save as policy.json, then apply)",
          code: `{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["s3:GetObject","s3:PutObject","s3:DeleteObject","s3:ListBucket"],
    "Resource": ["arn:aws:s3:::knowledge-vault","arn:aws:s3:::knowledge-vault/*"]
  }]
}`,
        },
      ],
      warning:
        "Write the secret down before you close the terminal. If you lose it, delete the service account and make another — there is no way to display it again.",
      minutes: 4,
    },
    {
      id: "address",
      short: "HTTPS address",
      title: "Give the storage an address on the internet",
      why:
        "Knowledge Vault runs in a datacentre. It cannot see 192.168.x.x on your office " +
        "network, and neither can your people when they work from home. A Cloudflare Tunnel " +
        "solves this without opening a single port: a small program on the NAS makes an " +
        "OUTBOUND connection to Cloudflare, and traffic comes back down it. There is nothing " +
        "for anyone on the internet to scan or knock on, which is why security teams accept " +
        "it where they refuse port forwarding.",
      todo: [
        "Create a free Cloudflare account and add your domain to it.",
        "In Zero Trust → Networks → Tunnels, create a tunnel and copy the token it gives you.",
        "Run the connector on the NAS with that token.",
        "Add a public hostname for the tunnel — for example storage.your-company.com — pointing at http://localhost:9000.",
      ],
      commands: [
        {
          platform: "Run the connector on the NAS",
          code: `docker run -d --name cloudflared --restart unless-stopped \\
  --network host \\
  cloudflare/cloudflared:latest tunnel --no-autoupdate run --token <your-tunnel-token>`,
        },
      ],
      check:
        "Opening https://storage.your-company.com/knowledge-vault in a browser returns an XML 'access denied' error. That is the RIGHT answer — the tunnel reached MinIO, and MinIO refused an anonymous visitor exactly as it should.",
      warning:
        "Do not forward a port on your router instead. That puts your storage on the public internet where anyone can reach it, and the bucket's own credentials become the only thing standing between a stranger and your documents.",
      minutes: 10,
    },
    {
      id: "server-url",
      short: "Tell MinIO",
      title: "Tell MinIO its public address",
      why:
        "MinIO checks that the address a request was signed for matches the address it is " +
        "serving on. Behind a tunnel those two differ, so it must be told its public name. " +
        "Skipping this is the single most common reason a setup fails, and the error it " +
        "produces — SignatureDoesNotMatch — points at the password, which is not the problem.",
      todo: [
        "Stop and remove the MinIO container. Nothing is lost: your data is in the folder, not the container.",
        "Start it again with MINIO_SERVER_URL added, set to the tunnel hostname.",
      ],
      commands: [
        {
          platform: "Recreate with the public address",
          code: `docker rm -f minio
docker run -d --name minio --restart unless-stopped \\
  -p 9000:9000 -p 9001:9001 \\
  -e MINIO_ROOT_USER=<user> \\
  -e MINIO_ROOT_PASSWORD=<password> \\
  -e MINIO_SERVER_URL=https://storage.your-company.com \\
  -v /volume1/knowledge-vault:/data \\
  quay.io/minio/minio:latest server /data --console-address ":9001"`,
        },
      ],
      check: "The bucket and the access key are still there — they live in the folder, not in the container.",
      minutes: 3,
    },
    {
      id: "cors",
      short: "Browser rules",
      title: "Let your people's browsers talk to the storage",
      why:
        "Documents go straight from a member's browser to your storage and back — that is " +
        "what keeps uploads fast and your bandwidth bill ours rather than yours. A browser " +
        "will only do that if the storage says the request is welcome. These are the rules " +
        "that say so, and they name only this Knowledge Vault.",
      todo: [
        "Save the rules below on the NAS as cors.json.",
        "Apply them to the bucket.",
      ],
      commands: [
        { platform: "cors.json", code: corsRulesFor(origin) },
        {
          platform: "Apply",
          code: `docker exec -i minio mc cors set local/knowledge-vault - < cors.json`,
        },
      ],
      warning:
        "Recent MinIO builds allow every browser origin by default, in which case this step changes nothing and can be skipped. Apply it anyway if uploads fail once everything else passes.",
      minutes: 3,
    },
    {
      id: "connect",
      short: "Connect",
      title: "Enter the four values in Knowledge Vault",
      why:
        "This is the only part that happens on our side. The secret key is encrypted before " +
        "it is stored, with a key that is not kept in our database, and it is never shown " +
        "again after saving.",
      todo: [
        "Go back to the storage form in Knowledge Vault.",
        "Storage address: your tunnel hostname, with https:// and no trailing slash.",
        "Bucket: knowledge-vault (or whatever you named it).",
        "Access key ID and Secret access key: the pair from step 4.",
        "Choose Encrypted unless you have a specific reason not to. Encrypted means documents land on your NAS as unreadable blobs — nobody can open them from the NAS itself, including your own IT.",
        "Press Test connection and wait for it to go green.",
      ],
      check:
        "“Connected — your storage is ready.” The test writes a small file, reads it back, compares the bytes, confirms the bucket is not publicly readable, and removes it again. If a stage fails it names which one.",
      warning:
        "The encryption choice is fixed once storage is connected — changing it later means re-encrypting every document you have stored.",
      minutes: 3,
    },
    {
      id: "after",
      short: "Afterwards",
      title: "Before you call it done",
      why:
        "Three things decide whether this setup survives its first year, and none of them " +
        "are visible on the day you build it.",
      todo: [
        "Confirm both containers restart on their own: reboot the NAS and check the connection again from Knowledge Vault.",
        "Set up a backup of the storage folder, and test restoring one file from it.",
        "Write down where MinIO runs, who holds the master password, and which tunnel hostname is in use. The person who set this up is not always the person who has to fix it.",
        "If you already had documents in Knowledge Vault before connecting storage, use “Move them to my storage” in the storage panel to bring them across.",
      ],
      check:
        "The storage panel shows Connected, the object count rises as your people upload, and a reboot of the NAS changes neither.",
      minutes: 5,
    },
  ];
}

/** The whole guide as a Markdown handout — what the owner sends to whoever runs the NAS. */
export function nasGuideMarkdown(webOrigin: string): string {
  const steps = nasGuideSteps(webOrigin);
  const total = steps.reduce((sum, s) => sum + s.minutes, 0);
  const lines: string[] = [
    "# Connecting your organization's storage to Knowledge Vault",
    "",
    "Hand this to whoever administers your NAS. It is the same sequence the setup guide in",
    "Knowledge Vault walks through on screen, written out so it can be followed away from",
    "the app.",
    "",
    `Roughly ${total} minutes end to end, most of it waiting for downloads.`,
    "",
    "## Before you start",
    "",
    ...GUIDE_PREREQUISITES.map((p) => `- ${p}`),
    "",
    "---",
    "",
  ];

  steps.forEach((step, i) => {
    lines.push(`## Step ${i + 1} · ${step.title}`, "");
    lines.push(`_About ${step.minutes} minutes._`, "");
    lines.push(step.why, "");
    step.todo.forEach((t, n) => lines.push(`${n + 1}. ${t}`));
    lines.push("");
    (step.commands ?? []).forEach((c) => {
      if (c.platform) lines.push(`**${c.platform}**`, "");
      lines.push("```", c.code, "```", "");
    });
    if (step.check) lines.push(`**You should see:** ${step.check}`, "");
    if (step.warning) lines.push(`> **Watch out.** ${step.warning}`, "");
    lines.push("---", "");
  });

  lines.push(
    "## The four values Knowledge Vault needs",
    "",
    "Fill these in as you go, and give them to whoever is completing the form:",
    "",
    "| Field | Value |",
    "|---|---|",
    "| Storage address | `https://` |",
    "| Bucket | |",
    "| Access key ID | |",
    "| Secret access key | (write it down once — it is never shown again) |",
    "| Encryption | Encrypted / Readable files |",
    "",
    "## If something fails",
    "",
    "The connection test names the stage that failed, and the message says what to do. The",
    "three that catch nearly everyone:",
    "",
    "- **Could not reach your storage** — the tunnel is down, the address has a trailing slash, or the port is 9001 (the console) instead of 9000 (the API).",
    "- **The secret access key is wrong, or the clock is out of sync** — usually `MINIO_SERVER_URL` was not set to the tunnel hostname. See step 6.",
    "- **This bucket is publicly readable** — set the bucket's access policy back to private. Knowledge Vault refuses a public bucket, because it would make every permission rule inside the app decorative.",
    "",
    `_Generated from ${webOrigin || "Knowledge Vault"}._`,
    "",
  );

  return lines.join("\n");
}
