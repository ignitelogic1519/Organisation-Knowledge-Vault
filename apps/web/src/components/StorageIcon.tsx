import { IconCloud, IconFolder, IconPlug, IconServer, IconStars } from "./icons";

// One stroke icon per storage backend (lib/storage-backends.ts), so the front page and the
// storage page draw them in the same family as every other icon on the public pages.
const ICONS: Record<string, (p: { size?: number }) => React.ReactElement> = {
  nas: IconServer,
  kvep: IconStars,
  "cloud-object": IconCloud,
  "google-drive": IconFolder,
  onedrive: IconFolder,
  "private-nas": IconPlug,
};

export function StorageIcon({ backend, size = 22 }: { backend: string; size?: number }) {
  const Icon = ICONS[backend] ?? IconServer;
  return <Icon size={size} />;
}
