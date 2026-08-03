"use client";

import type { DocumentTheme, MediaOptions, OrgPlanLimitsView } from "@vault/shared";
import { DocumentProperties } from "./DocumentProperties";
import { Row, Toggle } from "./fields";
import { THEME_PRESETS } from "./presets";
import type { EditorBlock, StudioMeta } from "./model";

// The right-hand inspector: everything about the *selected block's* presentation on one
// tab, and everything about the *document* (its cover data, placement and the plan's
// allowances) on the other. Nothing here changes content — only how it is presented.
// The document half is the shared DocumentProperties panel, which the exam editor publishes
// through as well.

const ANIMATIONS = ["none", "fade", "rise", "slide", "zoom", "flip"] as const;

const FONT_OPTIONS = [
  { key: "sans", label: "Sans" },
  { key: "serif", label: "Serif" },
  { key: "mono", label: "Mono" },
  { key: "display", label: "Display" },
  { key: "hand", label: "Handwriting" },
];

function MediaSettings({
  media,
  onChange,
}: {
  media: MediaOptions;
  onChange: (next: MediaOptions) => void;
}) {
  const set = (patch: Partial<MediaOptions>) => onChange({ ...media, ...patch });
  const sources = media.sources ?? [];
  return (
    <>
      <h4 className="insp-section">Playback</h4>
      <Toggle
        label="Reader may skip ahead"
        checked={media.skippable !== false}
        onChange={(v) => set({ skippable: v })}
        hint="Off = the recording must be watched through; rewinding stays allowed."
      />
      <Toggle
        label="Speed control (0.5×–2×)"
        checked={media.speedControl !== false}
        onChange={(v) => set({ speedControl: v })}
      />
      <Row label="Default speed">
        <select
          value={media.defaultSpeed ?? 1}
          onChange={(e) => set({ defaultSpeed: Number(e.target.value) })}
        >
          {[0.5, 0.75, 1, 1.25, 1.5, 2].map((s) => (
            <option key={s} value={s}>
              {s}×
            </option>
          ))}
        </select>
      </Row>
      <Toggle label="Autoplay" checked={!!media.autoplay} onChange={(v) => set({ autoplay: v })} />
      <Toggle label="Loop" checked={!!media.loop} onChange={(v) => set({ loop: v })} />
      <Toggle label="Start muted" checked={!!media.muted} onChange={(v) => set({ muted: v })} />
      <Toggle
        label="Show a watched-in-full marker"
        checked={!!media.trackCompletion}
        onChange={(v) => set({ trackCompletion: v })}
      />
      <Toggle
        label="Allow the browser download control"
        checked={!!media.download}
        onChange={(v) => set({ download: v })}
      />

      <h4 className="insp-section">Quality ladder</h4>
      <p className="insp-note">
        Add a rendition per quality (1080p, 720p, low data). The reader picks one from the
        player without losing their place.
      </p>
      {sources.map((s, i) => (
        <div className="insp-source" key={i}>
          <input
            value={s.label}
            maxLength={24}
            placeholder="1080p"
            onChange={(e) =>
              set({ sources: sources.map((x, xi) => (xi === i ? { ...x, label: e.target.value } : x)) })
            }
          />
          <input
            value={s.url}
            type="url"
            placeholder="https://…"
            onChange={(e) =>
              set({ sources: sources.map((x, xi) => (xi === i ? { ...x, url: e.target.value } : x)) })
            }
          />
          <button
            type="button"
            className="icon-btn"
            aria-label="Remove rendition"
            onClick={() => set({ sources: sources.filter((_, xi) => xi !== i) })}
          >
            ✕
          </button>
        </div>
      ))}
      {sources.length < 6 && (
        <button
          type="button"
          className="btn btn-quiet btn-small"
          onClick={() => set({ sources: [...sources, { label: "", url: "" }] })}
        >
          + Add rendition
        </button>
      )}

      <h4 className="insp-section">Clip &amp; extras</h4>
      <div className="insp-grid-2">
        <Row label="Start (s)">
          <input
            type="number"
            min={0}
            value={media.startAt ?? ""}
            onChange={(e) => set({ startAt: e.target.value ? Number(e.target.value) : undefined })}
          />
        </Row>
        <Row label="End (s)">
          <input
            type="number"
            min={0}
            value={media.endAt ?? ""}
            onChange={(e) => set({ endAt: e.target.value ? Number(e.target.value) : undefined })}
          />
        </Row>
      </div>
      <Row label="Poster image">
        <input
          type="url"
          placeholder="https://…"
          value={media.poster ?? ""}
          onChange={(e) => set({ poster: e.target.value || undefined })}
        />
      </Row>
      <Row label="Captions (.vtt)">
        <input
          type="url"
          placeholder="https://…"
          value={media.captionsUrl ?? ""}
          onChange={(e) => set({ captionsUrl: e.target.value || undefined })}
        />
      </Row>
    </>
  );
}

export function Inspector({
  tab,
  onTab,
  block,
  onBlockChange,
  meta,
  onMeta,
  limits,
  categories,
  needsReview,
}: {
  tab: "format" | "document";
  onTab: (t: "format" | "document") => void;
  block: EditorBlock | null;
  onBlockChange: (next: EditorBlock) => void;
  meta: StudioMeta;
  onMeta: (next: StudioMeta) => void;
  limits: OrgPlanLimitsView | null;
  categories: string[];
  needsReview: boolean;
}) {
  const style = block?.style ?? {};
  const patchStyle = (patch: Record<string, unknown>) =>
    block && onBlockChange({ ...block, style: { ...style, ...patch } });
  const setTheme = (patch: Partial<DocumentTheme>) =>
    onMeta({ ...meta, theme: { ...meta.theme, ...patch, preset: "custom" } });

  return (
    <aside className="studio-inspector glass">
      <div className="studio-inspector-tabs">
        <button type="button" data-active={tab === "format"} onClick={() => onTab("format")}>
          Format
        </button>
        <button type="button" data-active={tab === "document"} onClick={() => onTab("document")}>
          Document
        </button>
      </div>

      {tab === "format" && (
        <div className="studio-inspector-body">
          {!block && <p className="insp-note">Select a block on the page to style it.</p>}
          {block && (
            <>
              <h4 className="insp-section">Layout</h4>
              <Row label="Alignment">
                <select
                  value={style.align ?? "left"}
                  onChange={(e) => patchStyle({ align: e.target.value })}
                >
                  <option value="left">Left</option>
                  <option value="center">Centre</option>
                  <option value="right">Right</option>
                  <option value="justify">Justified</option>
                </select>
              </Row>
              <Row label={`Width — ${style.width ?? 100}%`}>
                <input
                  type="range"
                  min={10}
                  max={100}
                  value={style.width ?? 100}
                  onChange={(e) => patchStyle({ width: Number(e.target.value) })}
                />
              </Row>
              <Row label="Position">
                <select
                  value={style.float ?? "center"}
                  onChange={(e) => patchStyle({ float: e.target.value })}
                >
                  <option value="left">Left</option>
                  <option value="center">Centre</option>
                  <option value="right">Right</option>
                </select>
              </Row>
              <div className="insp-grid-2">
                <Row label="Padding">
                  <input
                    type="number"
                    min={0}
                    max={80}
                    value={style.padding ?? ""}
                    onChange={(e) =>
                      patchStyle({ padding: e.target.value ? Number(e.target.value) : undefined })
                    }
                  />
                </Row>
                <Row label="Space after">
                  <input
                    type="number"
                    min={0}
                    max={160}
                    value={style.spaceAfter ?? ""}
                    onChange={(e) =>
                      patchStyle({ spaceAfter: e.target.value ? Number(e.target.value) : undefined })
                    }
                  />
                </Row>
              </div>

              <h4 className="insp-section">Appearance</h4>
              <div className="insp-grid-2">
                <Row label="Text colour">
                  <input
                    type="color"
                    value={style.color ?? "#1a1d26"}
                    onChange={(e) => patchStyle({ color: e.target.value })}
                  />
                </Row>
                <Row label="Fill">
                  <input
                    type="color"
                    value={style.background ?? "#ffffff"}
                    onChange={(e) => patchStyle({ background: e.target.value })}
                  />
                </Row>
              </div>
              <Row label="Accent">
                <input
                  type="color"
                  value={style.accent ?? "#5b5bf0"}
                  onChange={(e) => patchStyle({ accent: e.target.value })}
                />
              </Row>
              <div className="insp-grid-2">
                <Row label="Line height">
                  <input
                    type="number"
                    step={0.05}
                    min={1}
                    max={3}
                    value={style.lineHeight ?? ""}
                    onChange={(e) =>
                      patchStyle({ lineHeight: e.target.value ? Number(e.target.value) : undefined })
                    }
                  />
                </Row>
                <Row label="Letter spacing">
                  <input
                    type="number"
                    step={0.1}
                    min={-3}
                    max={20}
                    value={style.letterSpacing ?? ""}
                    onChange={(e) =>
                      patchStyle({ letterSpacing: e.target.value ? Number(e.target.value) : undefined })
                    }
                  />
                </Row>
              </div>
              <Toggle label="Border" checked={!!style.border} onChange={(v) => patchStyle({ border: v })} />
              <Toggle label="Shadow" checked={!!style.shadow} onChange={(v) => patchStyle({ shadow: v })} />
              <Toggle
                label="Uppercase"
                checked={!!style.uppercase}
                onChange={(v) => patchStyle({ uppercase: v })}
              />
              <Row label="Corner radius">
                <input
                  type="range"
                  min={0}
                  max={48}
                  value={style.radius ?? 0}
                  onChange={(e) => patchStyle({ radius: Number(e.target.value) })}
                />
              </Row>

              <h4 className="insp-section">Motion</h4>
              <Row label="Entrance" hint="Plays when the block scrolls into the reader's view.">
                <select
                  value={style.animation ?? "none"}
                  onChange={(e) => patchStyle({ animation: e.target.value })}
                >
                  {ANIMATIONS.map((a) => (
                    <option key={a} value={a}>
                      {a[0].toUpperCase() + a.slice(1)}
                    </option>
                  ))}
                </select>
              </Row>

              {block.type === "heading" && (
                <Row label="Heading level">
                  <select
                    value={block.level ?? 2}
                    onChange={(e) => onBlockChange({ ...block, level: Number(e.target.value) })}
                  >
                    {[1, 2, 3, 4, 5, 6].map((l) => (
                      <option key={l} value={l}>
                        Level {l}
                      </option>
                    ))}
                  </select>
                </Row>
              )}

              {block.type === "image" && (
                <>
                  <h4 className="insp-section">Image</h4>
                  <Row label="Alternative text" hint="Read aloud by screen readers.">
                    <input
                      value={block.title ?? ""}
                      maxLength={200}
                      onChange={(e) => onBlockChange({ ...block, title: e.target.value })}
                    />
                  </Row>
                </>
              )}

              {block.type === "embed" && (
                <>
                  <h4 className="insp-section">Embed</h4>
                  <Row label="Height (px)" hint="Used when the source has no fixed shape.">
                    <input
                      type="number"
                      min={120}
                      max={1600}
                      value={block.embed?.height ?? 480}
                      onChange={(e) =>
                        onBlockChange({
                          ...block,
                          embed: { ...block.embed, height: Number(e.target.value) },
                        })
                      }
                    />
                  </Row>
                  <Toggle
                    label="Show a link to the source"
                    checked={!!block.embed?.showSource}
                    onChange={(v) => onBlockChange({ ...block, embed: { ...block.embed, showSource: v } })}
                  />
                </>
              )}

              {block.type === "media" && (
                <MediaSettings
                  media={block.media ?? {}}
                  onChange={(media) => onBlockChange({ ...block, media })}
                />
              )}
            </>
          )}
        </div>
      )}

      {tab === "document" && (
        <div className="studio-inspector-body">
          <h4 className="insp-section">Theme</h4>
          <p className="insp-note">
            Sets the type, colour and spacing of the whole document — readers see exactly this.
          </p>
          <div className="insp-themes">
            {THEME_PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                className="insp-theme"
                data-active={(meta.theme?.preset ?? "vault") === p.key}
                title={p.blurb}
                onClick={() => onMeta({ ...meta, theme: { ...p.theme } })}
              >
                <span
                  className="insp-theme-swatch"
                  style={{
                    background: p.theme.paper ?? "var(--surface-solid)",
                    borderColor: p.theme.accent ?? "var(--accent)",
                    color: p.theme.accent ?? "var(--accent)",
                  }}
                >
                  Aa
                </span>
                <span className="insp-theme-name">{p.name}</span>
              </button>
            ))}
          </div>
          <div className="insp-grid-2">
            <Row label="Accent">
              <input
                type="color"
                value={meta.theme?.accent ?? "#5b5bf0"}
                onChange={(e) => setTheme({ accent: e.target.value })}
              />
            </Row>
            <Row label="Paper">
              <input
                type="color"
                value={meta.theme?.paper ?? "#ffffff"}
                onChange={(e) => setTheme({ paper: e.target.value })}
              />
            </Row>
          </div>
          <div className="insp-grid-2">
            <Row label="Body type">
              <select
                value={meta.theme?.bodyFont ?? "sans"}
                onChange={(e) => setTheme({ bodyFont: e.target.value as DocumentTheme["bodyFont"] })}
              >
                {FONT_OPTIONS.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </select>
            </Row>
            <Row label="Heading type">
              <select
                value={meta.theme?.headingFont ?? "sans"}
                onChange={(e) => setTheme({ headingFont: e.target.value as DocumentTheme["headingFont"] })}
              >
                {FONT_OPTIONS.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </select>
            </Row>
          </div>
          <div className="insp-grid-2">
            <Row label="Density">
              <select
                value={meta.theme?.density ?? "normal"}
                onChange={(e) => setTheme({ density: e.target.value as DocumentTheme["density"] })}
              >
                <option value="compact">Compact</option>
                <option value="normal">Normal</option>
                <option value="relaxed">Relaxed</option>
              </select>
            </Row>
            <Row label="Headings">
              <select
                value={meta.theme?.headingStyle ?? "plain"}
                onChange={(e) =>
                  setTheme({ headingStyle: e.target.value as DocumentTheme["headingStyle"] })
                }
              >
                <option value="plain">Plain</option>
                <option value="underlined">Ruled</option>
                <option value="accented">Accented</option>
                <option value="uppercase">Uppercase</option>
              </select>
            </Row>
          </div>
          <Row label={`Page width — ${meta.theme?.measure ?? 46}rem`}>
            <input
              type="range"
              min={32}
              max={72}
              value={meta.theme?.measure ?? 46}
              onChange={(e) => setTheme({ measure: Number(e.target.value) })}
            />
          </Row>

          <DocumentProperties
            meta={meta}
            onMeta={onMeta}
            limits={limits}
            categories={categories}
            needsReview={needsReview}
          />
        </div>
      )}
    </aside>
  );
}
