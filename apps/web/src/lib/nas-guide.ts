import { corsRulesFor } from "@vault/shared";

/**
 * The storage setup guide — content model.
 *
 * The first version of this file was a flat list of nine steps that assumed a reader who
 * already knew what Docker was, told them to "install MinIO" without saying from where,
 * and asked them to make decisions (a domain? a permanent tunnel?) without explaining what
 * they were choosing between. That is a reference card, not a guide.
 *
 * This is the rebuild. Three ideas hold it together:
 *
 * **It branches.** The reader answers questions as they go — which machine they have,
 * whether they own a domain, whether they would rather click or type — and the steps that
 * follow are rewritten around the answers. A Synology owner never reads a QNAP screen, and
 * somebody without a domain is not told to add one to Cloudflare.
 *
 * **It remembers.** Answers include free text: the folder path, the bucket name, the
 * domain. Every later command and every value in the final table is written with what they
 * actually typed, so there is nothing left to substitute by hand and nothing to mistype.
 *
 * **It has two depths.** Every block is tagged `basic` or `extra`. A reader who has done
 * this before turns the detail down and gets commands and checks; a reader who has not
 * gets the whole thing, including what a bucket is and why a datacentre cannot see their
 * office. Neither is a different document — it is the same steps at two magnifications.
 *
 * The rendered page and the downloadable PDF are both built from what is here, so the
 * document somebody hands to their IT contractor is the same document, with the same
 * answers filled in, as the one on screen.
 */

// ── Answers ─────────────────────────────────────────────────────────────────

export type NasKind =
  | "synology"
  | "qnap"
  | "truenas"
  | "unraid"
  | "linux"
  | "windows"
  | "mac"
  | "undecided";

export type Route = "gui" | "cli";
export type DomainChoice = "none" | "own" | "already-public";
export type Depth = "basic" | "full";

export interface Answers {
  nas: NasKind | null;
  /** Click through a web console, or paste commands into a terminal. */
  route: Route | null;
  domain: DomainChoice | null;
  domainName: string;
  hostname: string;
  folder: string;
  bucket: string;
  minioUser: string;
  minioPassword: string;
  /** The address of the NAS on the local network, for the "is it running?" check. */
  nasAddress: string;
}

export const EMPTY_ANSWERS: Answers = {
  nas: null,
  route: null,
  domain: null,
  domainName: "",
  hostname: "",
  folder: "",
  bucket: "knowledge-vault",
  minioUser: "kvstorage",
  minioPassword: "",
  nasAddress: "",
};

/** Everything the guide knows about a kind of machine, in one place. */
interface NasProfile {
  /** How the chooser names it — an article is fine here. */
  label: string;
  /** How a sentence names it. "A Windows PC" is a good button and a bad noun. */
  noun: string;
  /** One line for the chooser. */
  blurb: string;
  /** Where Docker comes from on this machine, in the machine's own words. */
  dockerName: string;
  dockerHow: string[];
  dockerLink?: { label: string; href: string };
  /** The folder MinIO will keep documents in, prefilled. */
  defaultFolder: string;
  /** How you get a terminal on it, for the command-line route. */
  terminalHow: string;
  /** True when the machine has a graphical Docker manager worth using. */
  hasGui: boolean;
}

export const NAS_PROFILES: Record<Exclude<NasKind, "undecided">, NasProfile> = {
  synology: {
    label: "Synology",
    noun: "Synology",
    blurb: "The blue-and-white boxes. DSM 7 or newer.",
    dockerName: "Container Manager",
    dockerHow: [
      "Sign in to your Synology's web interface (DSM) as an administrator.",
      "Open Package Center from the main menu — the icon looks like a shopping bag.",
      "Search for Container Manager and press Install. On older DSM versions it is called Docker; either is fine.",
      "Wait for it to finish, then open it once so it starts up.",
    ],
    dockerLink: { label: "Synology's own guide to Container Manager", href: "https://kb.synology.com/en-global/DSM/help/ContainerManager/docker_desc" },
    defaultFolder: "/volume1/knowledge-vault",
    terminalHow:
      "In DSM go to Control Panel → Terminal & SNMP, tick “Enable SSH service”, and Apply. Then connect from your own computer with an SSH client (Terminal on a Mac, PowerShell on Windows): ssh admin@your-nas-address.",
    hasGui: true,
  },
  qnap: {
    label: "QNAP",
    noun: "QNAP",
    blurb: "QTS or QuTS hero.",
    dockerName: "Container Station",
    dockerHow: [
      "Sign in to your QNAP's web interface (QTS) as an administrator.",
      "Open the App Center.",
      "Search for Container Station and press Install.",
      "Open it once when it finishes so it initialises.",
    ],
    dockerLink: { label: "QNAP's Container Station page", href: "https://www.qnap.com/en/software/container-station" },
    defaultFolder: "/share/knowledge-vault",
    terminalHow:
      "In QTS go to Control Panel → Network & File Services → Telnet/SSH and enable SSH. Then connect with ssh admin@your-nas-address.",
    hasGui: true,
  },
  truenas: {
    label: "TrueNAS",
    noun: "TrueNAS",
    blurb: "TrueNAS SCALE. (CORE has no Docker — use a jail or SCALE.)",
    dockerName: "Apps",
    dockerHow: [
      "Sign in to the TrueNAS SCALE web interface.",
      "Open Apps in the left-hand menu.",
      "If it asks you to choose a pool for Apps, pick your main storage pool and let it set itself up.",
      "You now have Docker underneath — TrueNAS calls it Apps.",
    ],
    dockerLink: { label: "TrueNAS SCALE apps documentation", href: "https://www.truenas.com/docs/scale/scaletutorials/apps/" },
    defaultFolder: "/mnt/tank/knowledge-vault",
    terminalHow:
      "The TrueNAS web interface has a built-in shell: System Settings → Shell. Or enable SSH under System Settings → Services.",
    hasGui: true,
  },
  unraid: {
    label: "Unraid",
    noun: "Unraid",
    blurb: "With the Community Applications plugin.",
    dockerName: "Docker",
    dockerHow: [
      "Sign in to the Unraid web interface.",
      "Go to the Docker tab. If it is off, set “Enable Docker” to Yes and Apply.",
      "Install the Community Applications plugin if you have not already — it is what makes installing anything pleasant on Unraid.",
    ],
    dockerLink: { label: "Community Applications for Unraid", href: "https://unraid.net/community/apps" },
    defaultFolder: "/mnt/user/knowledge-vault",
    terminalHow: "Press the terminal icon (>_) in the top-right corner of the Unraid web interface.",
    hasGui: true,
  },
  linux: {
    label: "A Linux server",
    noun: "Linux server",
    blurb: "Ubuntu, Debian, Rocky — anything you can SSH into.",
    dockerName: "Docker Engine",
    dockerHow: [
      "Connect to the machine over SSH.",
      "Run the official install script (the command is on the next card).",
      "Add yourself to the docker group so you do not need sudo every time, then log out and back in.",
    ],
    dockerLink: { label: "Docker's official installation instructions", href: "https://docs.docker.com/engine/install/" },
    defaultFolder: "/srv/knowledge-vault",
    terminalHow: "You are already using it — the SSH session you installed Docker in.",
    hasGui: false,
  },
  windows: {
    label: "A Windows PC",
    noun: "Windows PC",
    blurb: "A spare desktop that stays switched on.",
    dockerName: "Docker Desktop",
    dockerHow: [
      "Download Docker Desktop for Windows and run the installer.",
      "Accept the WSL 2 option if it offers one — that is the modern engine and it is the right answer.",
      "Restart when it asks, then open Docker Desktop once and leave it running.",
      "In Settings → General, tick “Start Docker Desktop when you sign in to your computer”.",
    ],
    dockerLink: { label: "Download Docker Desktop for Windows", href: "https://www.docker.com/products/docker-desktop/" },
    defaultFolder: "C:\\knowledge-vault",
    terminalHow: "Press Start, type PowerShell, and open it.",
    hasGui: false,
  },
  mac: {
    label: "A Mac",
    noun: "Mac",
    blurb: "A Mac mini or similar that stays switched on.",
    dockerName: "Docker Desktop",
    dockerHow: [
      "Download Docker Desktop for Mac — pick the Apple Silicon build for an M-series Mac, Intel otherwise.",
      "Drag it to Applications and open it.",
      "In Settings → General, tick “Start Docker Desktop when you sign in”.",
    ],
    dockerLink: { label: "Download Docker Desktop for Mac", href: "https://www.docker.com/products/docker-desktop/" },
    defaultFolder: "/Users/Shared/knowledge-vault",
    terminalHow: "Open Terminal from Applications → Utilities.",
    hasGui: false,
  },
};

export function profileOf(a: Answers): NasProfile | null {
  if (!a.nas || a.nas === "undecided") return null;
  return NAS_PROFILES[a.nas];
}

/** The address Knowledge Vault will be given, as far as the answers so far allow. */
export function resolvedEndpoint(a: Answers): string {
  if (a.domain === "own" && a.hostname.trim()) return `https://${a.hostname.trim()}`;
  if (a.domain === "already-public") return a.hostname.trim() ? `https://${a.hostname.trim()}` : "https://your-storage-address";
  if (a.domain === "none") return "https://something-random.trycloudflare.com";
  return "https://your-storage-address";
}

export const folderOf = (a: Answers) => a.folder.trim() || profileOf(a)?.defaultFolder || "/volume1/knowledge-vault";
export const bucketOf = (a: Answers) => a.bucket.trim() || "knowledge-vault";
export const userOf = (a: Answers) => a.minioUser.trim() || "kvstorage";
export const passOf = (a: Answers) => a.minioPassword.trim() || "<the-password-you-chose>";

/** A password worth using, generated in the browser and never sent anywhere. */
export function suggestPassword(): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint32Array(20);
  crypto.getRandomValues(bytes);
  return [...bytes].map((n) => alphabet[n % alphabet.length]).join("");
}

// ── Blocks ──────────────────────────────────────────────────────────────────

export type Block =
  | { kind: "prose"; text: string; depth?: Depth }
  | { kind: "steps"; items: string[]; depth?: Depth }
  | { kind: "command"; label: string; code: string; depth?: Depth; note?: string }
  | { kind: "note"; text: string; depth?: Depth }
  | { kind: "warn"; text: string; depth?: Depth }
  | { kind: "check"; text: string; depth?: Depth }
  | { kind: "link"; label: string; href: string; text?: string; depth?: Depth }
  | { kind: "table"; head: string[]; rows: string[][]; depth?: Depth }
  | {
      kind: "choice";
      /** Which answer this sets. */
      field: keyof Answers;
      question: string;
      help?: string;
      options: { value: string; label: string; blurb: string; pros?: string[]; cons?: string[] }[];
      depth?: Depth;
    }
  | {
      kind: "input";
      field: keyof Answers;
      label: string;
      placeholder?: string;
      help?: string;
      /** Offers a "generate one" button (passwords). */
      generate?: boolean;
      depth?: Depth;
    };

export interface Step {
  id: string;
  short: string;
  title: string;
  minutes: number;
  blocks: Block[];
  /** False when the answers so far make this step unnecessary. */
  skipped?: { reason: string };
}

// ── The steps ───────────────────────────────────────────────────────────────

function stepIntro(a: Answers): Step {
  return {
    id: "intro",
    short: "Start here",
    title: "What you are about to build, in plain words",
    minutes: 4,
    blocks: [
      {
        kind: "prose",
        text:
          "Knowledge Vault keeps the records — who works where, who has read what, who is overdue. " +
          "It does not keep your documents. Those live on a machine you own, and this guide is how " +
          "you connect the two.",
      },
      {
        kind: "prose",
        depth: "basic",
        text:
          "If none of the words in this guide mean anything to you yet, that is fine and expected. " +
          "Three of them do most of the work, so here they are up front:",
      },
      {
        kind: "table",
        depth: "basic",
        head: ["Word", "What it actually means"],
        rows: [
          ["NAS", "A computer with disks in it that stays switched on. That is genuinely all it is. Yours might be a Synology box in a cupboard, or an old desktop under a desk."],
          ["Docker", "A way of installing a program so that it comes with everything it needs and cannot break anything else on the machine. You install Docker once; after that, installing things is one line long."],
          ["MinIO", "The program that lets Knowledge Vault read and write a folder on your NAS over the network. Without it, your NAS is a filing cabinet with no door."],
          ["Bucket", "A named folder inside that folder. MinIO puts everything in one, and you will call yours something like “knowledge-vault”."],
        ],
      },
      {
        kind: "prose",
        depth: "basic",
        text:
          "There is one more idea, and it is the reason half of this guide exists. Knowledge Vault " +
          "runs in a datacentre. Your NAS sits on your office network. Those two cannot see each " +
          "other any more than a stranger can see inside your house — which is a good thing, and " +
          "also a problem we have to solve. Step 7 solves it, safely, without opening your front door.",
      },
      {
        kind: "warn",
        text:
          "Read this one before you start. Once storage is connected, your NAS holds the only copy " +
          "of your documents. We keep the catalogue; we never keep the files. If that machine has " +
          "one disk and no backup, then your training records have one disk and no backup.",
      },
      {
        kind: "choice",
        field: "nas",
        question: "Which machine will hold your documents?",
        help:
          "Everything after this — where you click, what you type, which folder to use — changes " +
          "with your answer. Pick the one you have; you can change it later from this question.",
        options: [
          { value: "synology", label: "Synology", blurb: NAS_PROFILES.synology.blurb },
          { value: "qnap", label: "QNAP", blurb: NAS_PROFILES.qnap.blurb },
          { value: "truenas", label: "TrueNAS", blurb: NAS_PROFILES.truenas.blurb },
          { value: "unraid", label: "Unraid", blurb: NAS_PROFILES.unraid.blurb },
          { value: "linux", label: "A Linux server", blurb: NAS_PROFILES.linux.blurb },
          { value: "windows", label: "A Windows PC", blurb: NAS_PROFILES.windows.blurb },
          { value: "mac", label: "A Mac", blurb: NAS_PROFILES.mac.blurb },
          { value: "undecided", label: "I do not have one yet", blurb: "Show me what to buy." },
        ],
      },
      ...(a.nas === "undecided"
        ? ([
            {
              kind: "prose",
              text:
                "You do not need anything expensive. What matters is that it stays switched on, has " +
                "room for your documents, and can run Docker. Three honest options:",
            },
            {
              kind: "table",
              head: ["Option", "Roughly", "Worth knowing"],
              rows: [
                ["A two-bay Synology (DS224+ or similar) with two disks", "£350–500 / $400–600", "The easiest by a distance. Two disks mirror each other, so one dying does not lose anything. This is what most organizations should buy."],
                ["Any spare desktop with a spare disk", "Free", "Works fine. Needs to be left on, and you should still have a backup somewhere else."],
                ["A small cloud server (Hetzner, DigitalOcean)", "£5–20 / $6–25 a month", "No hardware to look after and it already has a public address, which skips step 7 entirely. But your documents live in somebody else's datacentre, which may be the thing you were avoiding."],
              ],
            },
            {
              kind: "note",
              text:
                "Storage size: allow roughly 1 GB per 200 documents with images. Almost nobody outgrows " +
                "a 2 TB disk. Buy two of whatever size and mirror them.",
            },
            {
              kind: "prose",
              text: "Come back to this question once you have the machine, and pick it from the list.",
            },
          ] as Block[])
        : []),
    ],
  };
}

function stepDocker(a: Answers): Step {
  const p = profileOf(a);
  if (!p) {
    return {
      id: "docker",
      short: "Install Docker",
      title: "Get Docker onto the machine",
      minutes: 10,
      blocks: [{ kind: "note", text: "Answer the machine question on the first card and this step will fill itself in." }],
    };
  }
  return {
    id: "docker",
    short: "Install Docker",
    title: `Install ${p.dockerName} on your ${p.noun}`,
    minutes: 10,
    blocks: [
      {
        kind: "prose",
        depth: "basic",
        text:
          `Docker is the thing that makes the rest of this short. Without it you would be installing ` +
          `MinIO by hand, keeping it updated by hand, and restarting it by hand after every power cut. ` +
          `With it, each of those is one line. On a ${p.noun} it is called ${p.dockerName}.`,
      },
      { kind: "steps", items: p.dockerHow },
      ...(p.dockerLink ? ([{ kind: "link", ...p.dockerLink, text: "If a screen looks different from the description above, this is the manufacturer's own version:" }] as Block[]) : []),
      ...(a.nas === "linux"
        ? ([
            {
              kind: "command",
              label: "Install Docker on Ubuntu or Debian",
              code: `curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
# log out and back in for that last line to take effect`,
            },
          ] as Block[])
        : []),
      {
        kind: "check",
        text:
          a.nas === "linux" || a.nas === "windows" || a.nas === "mac"
            ? "Running `docker --version` in a terminal prints a version number rather than “command not found”."
            : `${p.dockerName} opens and shows an empty list of containers. Empty is correct — you have not made one yet.`,
      },
      {
        kind: "choice",
        field: "route",
        question: "How would you rather do the next few steps?",
        help:
          "Both routes end in exactly the same place. Clicking is friendlier if you have never used a " +
          "terminal; typing is faster and much easier for somebody to help you with over a phone call, " +
          "because they can read the command out.",
        options: [
          {
            value: "gui",
            label: "By clicking",
            blurb: p.hasGui ? `Through ${p.dockerName}'s own screens.` : "Through Docker Desktop's screens.",
            pros: ["Nothing to type", "You can see what you are doing"],
            cons: ["More steps", "Screens change between versions, so what you see may not match exactly"],
          },
          {
            value: "cli",
            label: "By typing",
            blurb: "Paste one command into a terminal.",
            pros: ["One line instead of a dozen clicks", "Identical on every machine", "Easy to send to somebody for help"],
            cons: ["You need to open a terminal, which the next card explains"],
          },
        ],
      },
      ...(a.route === "cli"
        ? ([
            {
              kind: "note",
              text: `Opening a terminal on your ${p.noun}: ${p.terminalHow}`,
            },
          ] as Block[])
        : []),
    ],
  };
}

function stepMinio(a: Answers): Step {
  const p = profileOf(a);
  const folder = folderOf(a);
  const user = userOf(a);
  const pass = passOf(a);
  const guiRoute = a.route === "gui";

  return {
    id: "minio",
    short: "Install MinIO",
    title: "Install MinIO and point it at a folder",
    minutes: 12,
    blocks: [
      {
        kind: "prose",
        depth: "basic",
        text:
          "MinIO is a single small program. You give it a folder and it makes that folder readable and " +
          "writable over the network, in the same language Amazon S3 speaks — which is the language " +
          "Knowledge Vault knows. Files it writes are ordinary files in that folder. Nothing is trapped " +
          "in a database, and you can walk away with everything at any time.",
      },
      {
        kind: "input",
        field: "folder",
        label: "Which folder should hold the documents?",
        placeholder: p?.defaultFolder ?? "/volume1/knowledge-vault",
        help:
          p?.defaultFolder
            ? `The usual place on a ${p.noun} is ${p.defaultFolder}. Change it if your shared folder is called something else.`
            : "A folder on the machine that will hold the documents.",
      },
      {
        kind: "input",
        field: "minioUser",
        label: "A user name for MinIO",
        placeholder: "kvstorage",
        help:
          "This is the master account for the storage itself. It is NOT your Knowledge Vault login, " +
          "and Knowledge Vault will never be given it.",
      },
      {
        kind: "input",
        field: "minioPassword",
        label: "A password for that account",
        placeholder: "at least 8 characters",
        generate: true,
        help:
          "Press Generate unless you have a password manager you would rather use. Write it down " +
          "somewhere safe now — you will need it again in two steps' time, and there is no way to " +
          "recover it from the machine afterwards.",
      },
      { kind: "warn", text: "MinIO refuses to start with a password shorter than eight characters." },
      ...(guiRoute
        ? ([
            {
              kind: "steps",
              items: [
                a.nas === "synology"
                  ? "In Container Manager, open Registry, search for minio, choose minio/minio and press Download. Pick the latest tag."
                  : a.nas === "qnap"
                    ? "In Container Station, press Create, search for minio and pick minio/minio."
                    : a.nas === "unraid"
                      ? "On the Docker tab press Add Container, then search Community Applications for MinIO."
                      : a.nas === "truenas"
                        ? "In Apps press Discover Apps, search for MinIO, and press Install."
                        : "In Docker Desktop, search for minio/minio in the top search bar and press Run.",
                "When it asks for ports, map 9000 to 9000 and 9001 to 9001.",
                `When it asks for volumes or storage, map the folder ${folder} on the machine to /data inside the container.`,
                `When it asks for environment variables, add MINIO_ROOT_USER = ${user} and MINIO_ROOT_PASSWORD = the password you chose.`,
                'In the command or entrypoint field, enter: server /data --console-address ":9001"',
                "Set the restart policy to “Always” or “Unless stopped”, so a power cut does not leave your documents offline.",
                "Start it.",
              ],
            },
            {
              kind: "note",
              text:
                "Those screens differ between versions, and yours may put the fields in a different order. " +
                "You are looking for four things wherever they live: the two ports, the folder, the two " +
                "environment variables, and the command.",
            },
          ] as Block[])
        : ([
            {
              kind: "prose",
              text: "One command. It downloads MinIO, points it at your folder, and sets it to come back after a reboot.",
            },
            {
              kind: "command",
              label: `Run this on your ${p?.noun ?? "machine"}`,
              code:
                a.nas === "windows"
                  ? `docker run -d --name minio --restart unless-stopped ^
  -p 9000:9000 -p 9001:9001 ^
  -e MINIO_ROOT_USER=${user} ^
  -e MINIO_ROOT_PASSWORD=${pass} ^
  -v ${folder}:/data ^
  quay.io/minio/minio:latest server /data --console-address ":9001"`
                  : `docker run -d --name minio --restart unless-stopped \\
  -p 9000:9000 -p 9001:9001 \\
  -e MINIO_ROOT_USER=${user} \\
  -e MINIO_ROOT_PASSWORD=${pass} \\
  -v ${folder}:/data \\
  quay.io/minio/minio:latest server /data --console-address ":9001"`,
              note: "Copy the whole thing including the line breaks — it is one command spread over six lines.",
            },
            {
              kind: "prose",
              depth: "basic",
              text: "Line by line, so it is not magic:",
            },
            {
              kind: "table",
              depth: "basic",
              head: ["Part", "What it does"],
              rows: [
                ["docker run -d", "Start a container and leave it running in the background."],
                ["--name minio", "Call it “minio”, so later commands can refer to it by name."],
                ["--restart unless-stopped", "Start it again automatically after a reboot or a power cut. This is the line people forget."],
                ["-p 9000:9000 -p 9001:9001", "Open two doors: 9000 is the one Knowledge Vault talks to, 9001 is a web page for you."],
                [`-v ${folder}:/data`, "Give the container your folder. Everything it writes lands there as ordinary files."],
                ["-e MINIO_ROOT_USER / PASSWORD", "The master account you just chose."],
                ["quay.io/minio/minio:latest", "Which program to download, and from where."],
              ],
            },
          ] as Block[])),
      {
        kind: "input",
        field: "nasAddress",
        label: "What is this machine's address on your network?",
        placeholder: "192.168.1.50",
        help:
          a.nas === "windows" || a.nas === "mac"
            ? "If you are setting this up on the same computer, put localhost."
            : "The address you type to reach the machine's web interface. On a Synology it is shown in DSM under Control Panel → Network.",
      },
      {
        kind: "check",
        text: `Open http://${a.nasAddress.trim() || "your-nas-address"}:9001 in a browser on the same network. You should get a MinIO sign-in page. Sign in with the user name and password you just chose — that proves both are right before anything else depends on them.`,
      },
      {
        kind: "warn",
        depth: "basic",
        text:
          "If the page does not load: the container may not have started. Check it is listed as running, " +
          "and that you used port 9001 and not 9000 — 9000 answers in a language browsers do not speak, " +
          "so it looks broken when it is not.",
      },
    ],
  };
}

function stepBucket(a: Answers): Step {
  const bucket = bucketOf(a);
  const user = userOf(a);
  const pass = passOf(a);
  const guiRoute = a.route === "gui";
  return {
    id: "bucket",
    short: "Make a bucket",
    title: "Create the bucket your documents go in",
    minutes: 4,
    blocks: [
      {
        kind: "prose",
        depth: "basic",
        text:
          "A bucket is a named container inside the folder you chose — it will appear as a sub-folder on " +
          "the disk. Knowledge Vault puts everything in exactly one, and refuses to connect one that the " +
          "whole internet can read.",
      },
      {
        kind: "input",
        field: "bucket",
        label: "What should the bucket be called?",
        placeholder: "knowledge-vault",
        help: "Lowercase letters, numbers and hyphens only. No spaces, no capitals — those are MinIO's rules, not ours.",
      },
      ...(guiRoute
        ? ([
            {
              kind: "steps",
              items: [
                `Open http://${a.nasAddress.trim() || "your-nas-address"}:9001 and sign in.`,
                "Press Create Bucket (or Buckets → Create Bucket).",
                `Name it ${bucket} and press Create.`,
                "Leave every switch on that page alone. The defaults are private, which is what we need.",
              ],
            },
            {
              kind: "note",
              text:
                "Some recent MinIO builds have stripped these buttons out of the free console. If yours has " +
                "no Create Bucket button, nothing is broken — switch this card to the typing route, which " +
                "works on every version.",
            },
          ] as Block[])
        : ([
            {
              kind: "prose",
              text:
                "MinIO ships with its own command-line client, called mc, inside the container you just started — " +
                "so there is nothing extra to install. These three lines introduce it to your storage and make the bucket.",
            },
            {
              kind: "command",
              label: "Create the bucket",
              code: `docker exec minio mc alias set local http://localhost:9000 ${user} ${pass}
docker exec minio mc mb local/${bucket}
docker exec minio mc ls local`,
              note: "Run them one at a time. The last one lists what exists, so you can see it worked.",
            },
          ] as Block[])),
      { kind: "check", text: `The bucket ${bucket} is listed, and a folder of that name has appeared inside ${folderOf(a)} on the disk.` },
      {
        kind: "warn",
        text:
          "Do not make the bucket public. Knowledge Vault checks, and refuses to connect a public bucket — " +
          "because a bucket the internet can read makes every permission rule inside the app decorative.",
      },
    ],
  };
}

function stepKey(a: Answers): Step {
  const bucket = bucketOf(a);
  const user = userOf(a);
  const guiRoute = a.route === "gui";
  return {
    id: "key",
    short: "Access key",
    title: "Create a key for Knowledge Vault to use",
    minutes: 5,
    blocks: [
      {
        kind: "prose",
        depth: "basic",
        text:
          "Knowledge Vault should never hold the master password you set two steps ago. An access key is a " +
          "second, weaker credential: it can be limited to this one bucket, and you can revoke it on its own " +
          "if you ever need to, without changing anything else on the machine.",
      },
      {
        kind: "prose",
        depth: "basic",
        text:
          "It comes in two halves. The access key ID is a user name — not secret. The secret access key is " +
          "the password, and MinIO shows it to you exactly once.",
      },
      ...(guiRoute
        ? ([
            {
              kind: "steps",
              items: [
                `Open http://${a.nasAddress.trim() || "your-nas-address"}:9001 and sign in.`,
                "Go to Access Keys in the left-hand menu, then press Create access key.",
                "Leave the expiry blank so it does not stop working one morning without warning.",
                "Press Create, then COPY BOTH VALUES somewhere safe before closing the box.",
              ],
            },
          ] as Block[])
        : ([
            {
              kind: "command",
              label: "Create the key",
              code: `docker exec minio mc admin user svcacct add local ${user}`,
              note: "It prints two lines: Access Key and Secret Key. Copy both now.",
            },
          ] as Block[])),
      {
        kind: "warn",
        text:
          "Copy the secret before you close that window. There is no way to read it back afterwards — if you " +
          "lose it, delete the key and make another. That is a thirty-second job, so do not panic if it happens.",
      },
      {
        kind: "prose",
        depth: "basic",
        text:
          "Optional but worth five minutes: limit the key to this one bucket. Then a key that leaks can do " +
          "nothing except what Knowledge Vault already does.",
      },
      {
        kind: "command",
        depth: "basic",
        label: "Limit the key to this bucket (optional)",
        code: `cat > policy.json <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["s3:GetObject","s3:PutObject","s3:DeleteObject","s3:ListBucket"],
    "Resource": ["arn:aws:s3:::${bucket}","arn:aws:s3:::${bucket}/*"]
  }]
}
EOF
docker cp policy.json minio:/tmp/policy.json
docker exec minio mc admin policy create local kv-only /tmp/policy.json`,
        note: "Then attach the kv-only policy to the access key, in the console under Access Keys → Edit.",
      },
      { kind: "check", text: "You have two strings written down: an access key ID and a secret access key. Step 9 asks for both." },
    ],
  };
}

function stepReach(a: Answers): Step {
  const blocks: Block[] = [
    {
      kind: "prose",
      text:
        "Your storage works — but only from inside your own network. Knowledge Vault runs in a datacentre, " +
        "and your people work from home and from their phones. All of them need a way in.",
    },
    {
      kind: "prose",
      depth: "basic",
      text:
        "The obvious answer is to open a port on your router, and it is the wrong one. That puts your storage " +
        "on the public internet where anyone in the world can knock on it, with the access key as the only " +
        "thing in the way. A tunnel is better: a small program on your NAS makes an outgoing connection to " +
        "Cloudflare — the same kind of connection your browser makes when you load a web page — and traffic " +
        "comes back down it. Nothing is listening on your network. There is nothing for anyone to scan or " +
        "attack. That is why security teams accept tunnels where they refuse port forwarding.",
    },
    {
      kind: "choice",
      field: "domain",
      question: "Do you own a domain name?",
      help:
        "A domain is something like your-company.com. If your organization has a website or company email, " +
        "somebody owns one. This decides which kind of tunnel you should set up.",
      options: [
        {
          value: "own",
          label: "Yes, we own a domain",
          blurb: "A permanent address, on a name you control.",
          pros: [
            "The address never changes",
            "It is your name, not a random one",
            "Survives reboots and updates without anybody touching it",
          ],
          cons: ["Needs a free Cloudflare account", "About fifteen minutes the first time"],
        },
        {
          value: "none",
          label: "No, and I want to try this first",
          blurb: "A free temporary address from Cloudflare — no account, no domain.",
          pros: ["Working in two minutes", "No account, no payment, no domain"],
          cons: [
            "The address changes every time the tunnel restarts",
            "You must then update it here, or uploads stop",
            "Cloudflare limits how much traffic it will carry",
            "Not suitable for real use — fine for seeing it work today",
          ],
        },
        {
          value: "already-public",
          label: "My storage already has a public HTTPS address",
          blurb: "A cloud server, or a reverse proxy somebody already set up.",
          pros: ["Nothing to do here"],
          cons: ["It must be HTTPS — a plain http:// address will be refused"],
        },
      ],
    },
  ];

  if (a.domain === "none") {
    blocks.push(
      {
        kind: "prose",
        text:
          "Cloudflare will give you a working HTTPS address in about two minutes, with no account and no " +
          "domain. It is genuinely free and genuinely temporary — treat it as a test drive.",
      },
      {
        kind: "command",
        label: "Start a quick tunnel",
        code: `docker run -d --name cloudflared --restart unless-stopped --network host \\
  cloudflare/cloudflared:latest tunnel --no-autoupdate --url http://localhost:9000`,
      },
      {
        kind: "command",
        label: "Then read the address it gave you",
        code: `docker logs cloudflared 2>&1 | grep trycloudflare.com`,
        note: "You are looking for a line like https://random-words-here.trycloudflare.com — that is your address.",
      },
      {
        kind: "input",
        field: "hostname",
        label: "Paste the address it printed (without https://)",
        placeholder: "random-words-here.trycloudflare.com",
        help: "The rest of the guide will use it, so you do not have to remember it.",
      },
      {
        kind: "warn",
        text:
          "This address dies when the tunnel restarts, and it will restart eventually. When it does, uploads " +
          "stop working until you get the new address and update it in the storage settings. Move to a domain " +
          "before you put real documents in.",
      },
      {
        kind: "link",
        label: "Buy a domain (Cloudflare Registrar sells them at cost)",
        href: "https://www.cloudflare.com/products/registrar/",
        text: "A domain is usually £8–12 a year, and it turns this into a permanent setup:",
      },
    );
  }

  if (a.domain === "own") {
    blocks.push(
      {
        kind: "input",
        field: "domainName",
        label: "What is your domain?",
        placeholder: "your-company.com",
        help: "Just the domain itself — no https://, no www.",
      },
      {
        kind: "input",
        field: "hostname",
        label: "What should the storage be called on that domain?",
        placeholder: a.domainName.trim() ? `storage.${a.domainName.trim()}` : "storage.your-company.com",
        help:
          "A sub-domain you are not already using. “storage.” or “vault.” in front of your domain is the " +
          "usual choice. It does not have to exist yet — Cloudflare creates it for you.",
      },
      {
        kind: "steps",
        items: [
          "Create a free Cloudflare account if you do not have one, and add your domain to it. Cloudflare will ask you to change your domain's nameservers at whoever you bought it from; their wizard walks you through it and it takes a few minutes to take effect.",
          "In the Cloudflare dashboard open Zero Trust — it is in the left-hand menu, and it is free for what we are doing.",
          "Go to Networks → Tunnels, and press Create a tunnel.",
          "Choose Cloudflared as the type, give the tunnel a name (anything: “knowledge-vault-storage”), and press Save.",
          "It now shows you an install command with a long token in it. You only need the token — the part after --token.",
          "Run the command on the next card with that token, on your NAS.",
          "Back in Cloudflare, the tunnel should go green and say Connected within a minute.",
          `Press Next, then add a Public Hostname: subdomain "${a.hostname.trim().split(".")[0] || "storage"}", your domain, service type HTTP, and URL localhost:9000.`,
          "Save. The address is live immediately.",
        ],
      },
      {
        kind: "command",
        label: "Run the connector on your NAS",
        code: `docker run -d --name cloudflared --restart unless-stopped --network host \\
  cloudflare/cloudflared:latest tunnel --no-autoupdate run --token <paste-your-token-here>`,
        note: "Replace <paste-your-token-here> with the token from the Cloudflare page. It is long — paste it, do not type it.",
      },
      {
        kind: "link",
        label: "Cloudflare's own walkthrough, with screenshots",
        href: "https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/get-started/create-remote-tunnel/",
        text: "If a Cloudflare screen has moved since this was written:",
      },
      {
        kind: "note",
        text:
          "Service type HTTP and URL localhost:9000 confuses people, because the address you are creating is " +
          "HTTPS. Both are right: Cloudflare handles the HTTPS out on the internet, and speaks plain HTTP to " +
          "MinIO across your own machine, where there is nothing to intercept.",
      },
    );
  }

  if (a.domain === "already-public") {
    blocks.push(
      {
        kind: "input",
        field: "hostname",
        label: "What is that address?",
        placeholder: "storage.your-company.com",
        help: "Without https:// — just the host name.",
      },
      {
        kind: "warn",
        text:
          "It has to be HTTPS with a valid certificate. Knowledge Vault refuses a plain http:// address for " +
          "anything except localhost, because your people's credentials would cross the internet in the clear.",
      },
    );
  }

  if (a.domain) {
    blocks.push({
      kind: "check",
      text: `Open ${resolvedEndpoint(a)}/${bucketOf(a)} in a browser. An XML error saying access is denied is the RIGHT answer — it means the tunnel reached MinIO and MinIO refused an anonymous visitor, exactly as it should. A timeout or “cannot reach” means the tunnel is not up.`,
    });
  }

  return {
    id: "reach",
    short: "Reach it",
    title: "Give your storage an address on the internet",
    minutes: a.domain === "none" ? 4 : 18,
    blocks,
  };
}

function stepServerUrl(a: Answers): Step {
  const endpoint = resolvedEndpoint(a);
  const folder = folderOf(a);
  const user = userOf(a);
  const pass = passOf(a);
  return {
    id: "server-url",
    short: "Tell MinIO",
    title: "Tell MinIO what it is called from outside",
    minutes: 4,
    skipped:
      a.domain === "already-public"
        ? { reason: "Your storage was already reachable, so whoever set it up has done this. Skip unless the connection test later complains about a signature." }
        : undefined,
    blocks: [
      {
        kind: "prose",
        depth: "basic",
        text:
          "This is the step that catches almost everyone, so it gets a card of its own. Every request to " +
          "MinIO is signed, and the signature includes the address it was sent to. Behind a tunnel, the " +
          "address the world uses is not the address MinIO thinks it has — so the signatures do not match " +
          "and everything is rejected.",
      },
      {
        kind: "prose",
        depth: "basic",
        text:
          "The error it produces says the secret key is wrong. The secret key is not wrong. Telling MinIO its " +
          "public name fixes it.",
      },
      {
        kind: "prose",
        text:
          "Restart MinIO with one extra setting. Nothing is lost by removing the container — your documents " +
          "are in the folder, not in the container.",
      },
      {
        kind: "command",
        label: "Recreate MinIO with its public address",
        code:
          a.nas === "windows"
            ? `docker rm -f minio
docker run -d --name minio --restart unless-stopped ^
  -p 9000:9000 -p 9001:9001 ^
  -e MINIO_ROOT_USER=${user} ^
  -e MINIO_ROOT_PASSWORD=${pass} ^
  -e MINIO_SERVER_URL=${endpoint} ^
  -v ${folder}:/data ^
  quay.io/minio/minio:latest server /data --console-address ":9001"`
            : `docker rm -f minio
docker run -d --name minio --restart unless-stopped \\
  -p 9000:9000 -p 9001:9001 \\
  -e MINIO_ROOT_USER=${user} \\
  -e MINIO_ROOT_PASSWORD=${pass} \\
  -e MINIO_SERVER_URL=${endpoint} \\
  -v ${folder}:/data \\
  quay.io/minio/minio:latest server /data --console-address ":9001"`,
        note: "Identical to the command you ran before, with MINIO_SERVER_URL added.",
      },
      {
        kind: "check",
        text: `Your bucket and your access key are still there — they live in ${folder}, not in the container. Sign in to the console again if you want to see for yourself.`,
      },
      ...(a.domain === "none"
        ? ([
            {
              kind: "warn",
              text:
                "On a temporary address, you have to do this again every time the tunnel gives you a new one. " +
                "One more reason to move to a domain.",
            },
          ] as Block[])
        : []),
    ],
  };
}

function stepCors(a: Answers, origin: string): Step {
  const bucket = bucketOf(a);
  return {
    id: "cors",
    short: "Browser rules",
    title: "Let your people's browsers talk to the storage",
    minutes: 4,
    blocks: [
      {
        kind: "prose",
        depth: "basic",
        text:
          "Documents go straight from a member's browser to your storage and back. They never pass through " +
          "us — that is what makes uploads fast and keeps your bandwidth bill ours rather than yours. But a " +
          "browser will only send a file to a different address than the page it is on if that address says " +
          "the request is welcome. These rules say so, and they name this Knowledge Vault and nothing else.",
      },
      { kind: "command", label: "Save this on the machine as cors.json", code: corsRulesFor(origin) },
      {
        kind: "command",
        label: "Apply it to the bucket",
        code: `docker cp cors.json minio:/tmp/cors.json
docker exec minio mc cors set local/${bucket} /tmp/cors.json`,
      },
      {
        kind: "note",
        text:
          "Recent MinIO builds already allow every browser origin, in which case this changes nothing and can " +
          "be skipped. Come back and do it if the connection test passes but uploading a document fails.",
      },
    ],
  };
}

function stepConnect(a: Answers): Step {
  return {
    id: "connect",
    short: "Connect",
    title: "Type the four values into Knowledge Vault",
    minutes: 4,
    blocks: [
      {
        kind: "prose",
        text:
          "This is the only part that happens on our side, and it is the short part. Go back to the storage " +
          "form you opened this guide from.",
      },
      {
        kind: "table",
        head: ["Field", "What to enter"],
        rows: [
          ["Storage address", resolvedEndpoint(a)],
          ["Bucket", bucketOf(a)],
          ["Access key ID", "The access key ID from step 5"],
          ["Secret access key", "The secret from step 5 — the one shown only once"],
          ["Encryption", "Encrypted, unless you have a specific reason not to"],
        ],
      },
      {
        kind: "prose",
        depth: "basic",
        text:
          "Encrypted means documents land on your NAS as unreadable blobs. Anyone standing on the NAS — " +
          "including your own IT — sees files they cannot open. Readable files means exactly what it says: " +
          "ordinary PDFs on the disk, which is convenient and much weaker. Most organizations should choose " +
          "Encrypted.",
      },
      {
        kind: "warn",
        text:
          "That choice is fixed once storage is connected. Changing it afterwards would mean re-encrypting " +
          "every document you have stored, so we do not offer it.",
      },
      { kind: "prose", text: "Press Test connection." },
      {
        kind: "check",
        text:
          "“Connected — your storage is ready.” The test writes a small file into your bucket, reads it back, " +
          "compares the bytes, confirms the bucket is not publicly readable, and deletes it again. If a stage " +
          "fails it tells you which one and what to do about it.",
      },
      {
        kind: "prose",
        depth: "basic",
        text: "The three failures worth knowing in advance:",
      },
      {
        kind: "table",
        depth: "basic",
        head: ["What it says", "What it usually means"],
        rows: [
          ["Could not reach your storage", "The tunnel is down, the address has a trailing slash, or the port is 9001 instead of 9000."],
          ["The secret access key is wrong, or the clock is out of sync", "Nine times out of ten this is step 7 — MINIO_SERVER_URL was not set to your public address."],
          ["This bucket is publicly readable", "Somebody made the bucket public. Set it back to private in the console."],
        ],
      },
      {
        kind: "prose",
        text:
          "Saving needs your Supreme password, because where an organization's documents live is a governance " +
          "decision rather than a setting.",
      },
    ],
  };
}

function stepAfter(a: Answers): Step {
  return {
    id: "after",
    short: "Finish well",
    title: "Three things before you call it done",
    minutes: 10,
    blocks: [
      {
        kind: "prose",
        text:
          "It works today. These are the three things that decide whether it still works in a year, and none " +
          "of them are visible on the day you build it.",
      },
      {
        kind: "steps",
        items: [
          "Reboot the machine, wait for it to come back, and press Check connection in Knowledge Vault. Both containers should return by themselves. If they do not, the restart policy did not take — recreate them with --restart unless-stopped.",
          `Set up a backup of ${folderOf(a)} to somewhere else entirely — another disk, another building, a cloud backup service. Then restore one file from it, today, to prove the backup is real. An untested backup is a hope.`,
          "Write down, somewhere other than your own head: where MinIO runs, the master user name and password, the access key ID, which tunnel is in use and on whose Cloudflare account. The person who set this up is not always the person who has to fix it.",
        ],
      },
      {
        kind: "note",
        text:
          "If documents were uploaded to Knowledge Vault before you connected storage, the storage panel offers " +
          "“Move them to my storage”. It copies each one across, checks it arrived intact, and only then removes " +
          "our copy.",
      },
      {
        kind: "check",
        text:
          "The storage panel says Connected, the object count rises as your people upload, and a reboot of the " +
          "machine changes neither of those.",
      },
      ...(a.domain === "none"
        ? ([
            {
              kind: "warn",
              text:
                "You are on a temporary address. Before anyone puts a real document in, get a domain and redo " +
                "step 7 as a named tunnel. Otherwise this stops working the first time the tunnel restarts, and " +
                "it will be a confusing morning.",
            },
          ] as Block[])
        : []),
    ],
  };
}

/** The whole guide, rebuilt from the answers each time one changes. */
export function buildGuide(answers: Answers, webOrigin: string): Step[] {
  const origin = webOrigin || "https://your-knowledge-vault-address";
  return [
    stepIntro(answers),
    stepDocker(answers),
    stepMinio(answers),
    stepBucket(answers),
    stepKey(answers),
    stepReach(answers),
    stepServerUrl(answers),
    stepCors(answers, origin),
    stepConnect(answers),
    stepAfter(answers),
  ];
}

/** What the reader has decided so far — the running summary, and the PDF's cover. */
export function decisionsSoFar(a: Answers): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  const p = profileOf(a);
  if (p) rows.push({ label: "Machine", value: p.label });
  else if (a.nas === "undecided") rows.push({ label: "Machine", value: "Not chosen yet" });
  if (a.route) rows.push({ label: "Route", value: a.route === "gui" ? "Clicking through the screens" : "Typing commands" });
  if (a.folder.trim() || p) rows.push({ label: "Folder", value: folderOf(a) });
  rows.push({ label: "Bucket", value: bucketOf(a) });
  if (a.minioUser.trim()) rows.push({ label: "MinIO user", value: a.minioUser.trim() });
  if (a.domain)
    rows.push({
      label: "Reachable by",
      value:
        a.domain === "own"
          ? "A permanent Cloudflare tunnel on your own domain"
          : a.domain === "none"
            ? "A temporary Cloudflare quick tunnel"
            : "An address it already had",
    });
  if (a.hostname.trim()) rows.push({ label: "Address", value: resolvedEndpoint(a) });
  if (a.nasAddress.trim()) rows.push({ label: "On your network", value: `http://${a.nasAddress.trim()}:9001` });
  return rows;
}
