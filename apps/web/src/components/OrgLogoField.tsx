"use client";

import { useRef, useState } from "react";
import { orgBadgeHue, orgInitial } from "@vault/shared";

// Organization logo picker (docs/structure.md §9.14). Optional: without one the badge
// falls back to the first letter of the name on a hue derived from the organization
// number, which is recognisable enough that most organizations never need to upload.
//
// The image is downscaled in the browser to a small square data URL before it ever
// leaves — the same shape as a profile picture — so a 6 MB photo does not become a
// 6 MB row.

const MAX_EDGE = 256;
const MAX_BYTES = 300_000;

/** The badge itself, reused wherever an organization is shown. */
export function OrgBadge({
  name,
  logo,
  orgNumber = 0,
  size = 44,
}: {
  name: string;
  logo?: string | null;
  orgNumber?: number;
  size?: number;
}) {
  if (logo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a data URL, already sized
      <img
        className="org-badge org-badge-img"
        src={logo}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size }}
      />
    );
  }
  const hue = orgBadgeHue(orgNumber);
  return (
    <span
      className="org-badge"
      aria-hidden
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        background: `linear-gradient(135deg, hsl(${hue} 62% 52%), hsl(${(hue + 34) % 360} 62% 44%))`,
      }}
    >
      {orgInitial(name)}
    </span>
  );
}

async function downscale(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const edge = Math.min(MAX_EDGE, Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = edge;
  canvas.height = edge;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot process images");

  // Cover-fit into a square: crop the long edge rather than squashing the logo.
  const scale = edge / Math.min(bitmap.width, bitmap.height);
  const w = bitmap.width * scale;
  const h = bitmap.height * scale;
  ctx.drawImage(bitmap, (edge - w) / 2, (edge - h) / 2, w, h);
  bitmap.close();

  // PNG keeps a transparent background, which most logos have; JPEG would flatten it
  // onto black. Fall back to JPEG only if PNG comes out too big.
  const png = canvas.toDataURL("image/png");
  if (png.length <= MAX_BYTES) return png;
  return canvas.toDataURL("image/jpeg", 0.85);
}

export function OrgLogoField({
  name,
  value,
  onChange,
  label = "Organization logo (optional)",
  hint = "Shown on the organization card and on every document it publishes. Without one we use the first letter of the name.",
  busy = false,
}: {
  /** The organization name, for the fallback preview. */
  name: string;
  value: string | null;
  onChange: (next: string | null) => void;
  /** Hidden with null where the surrounding panel already provides the heading. */
  label?: React.ReactNode | null;
  hint?: React.ReactNode | null;
  /** A save is in flight — the buttons wait rather than queueing a second one. */
  busy?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  async function pick(file: File | null) {
    setError(null);
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Pick an image file — PNG, JPG or SVG.");
      return;
    }
    try {
      const dataUrl = await downscale(file);
      if (dataUrl.length > MAX_BYTES) {
        setError("That image is still too large after resizing — try a simpler logo.");
        return;
      }
      onChange(dataUrl);
    } catch {
      setError("That image could not be read. Try a different file.");
    }
  }

  return (
    <div className="field org-logo-field">
      {label && <span>{label}</span>}
      <div className="org-logo-row">
        <OrgBadge name={name || "?"} logo={value} size={64} />
        <div className="org-logo-actions">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => void pick(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            className="btn btn-small"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? "Saving…" : value ? "Replace" : "Upload a logo"}
          </button>
          {value && (
            <button
              type="button"
              className="btn btn-quiet btn-small"
              disabled={busy}
              onClick={() => {
                onChange(null);
                setError(null);
              }}
            >
              Remove
            </button>
          )}
        </div>
      </div>
      {hint && <small>{hint}</small>}
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}
