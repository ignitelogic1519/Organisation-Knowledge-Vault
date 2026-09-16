// Minimal inline icon set — stroke icons inherit currentColor so they follow theme tokens.

type IconProps = { size?: number };

function Svg({ size = 18, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

export const IconHome = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V21h14V9.5" />
    <path d="M9.5 21v-6h5v6" />
  </Svg>
);

export const IconGrid = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="3" width="7.5" height="7.5" rx="2" />
    <rect x="13.5" y="3" width="7.5" height="7.5" rx="2" />
    <rect x="3" y="13.5" width="7.5" height="7.5" rx="2" />
    <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2" />
  </Svg>
);

export const IconStars = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="6" cy="6" r="2" />
    <circle cx="18" cy="8" r="2" />
    <circle cx="12" cy="18" r="2" />
    <path d="M7.8 7.2 16.2 8m-3.2 8.2L7 7.9m10 1.9-4.2 6.4" />
  </Svg>
);

export const IconShield = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3 4.5 6v5.5c0 4.5 3 7.8 7.5 9.5 4.5-1.7 7.5-5 7.5-9.5V6L12 3Z" />
    <path d="m9 11.5 2.2 2.2L15.5 9.5" />
  </Svg>
);

export const IconBook = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 19V5a2 2 0 0 1 2-2h13.5v16H6a2 2 0 0 0-2 2Z" />
    <path d="M4 19a2 2 0 0 0 2 2h13.5" />
    <path d="M8 7h7" />
  </Svg>
);

export const IconUser = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="8" r="3.5" />
    <path d="M4.5 20.5c1.2-3.5 4-5 7.5-5s6.3 1.5 7.5 5" />
  </Svg>
);

export const IconHelp = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9.2a2.6 2.6 0 0 1 5.1.8c0 1.7-2.6 2.1-2.6 3.7" />
    <circle cx="12" cy="17" r="0.4" fill="currentColor" />
  </Svg>
);

export const IconBell = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 9.5a6 6 0 0 1 12 0c0 4 1.5 5.5 1.5 5.5h-15S6 13.5 6 9.5Z" />
    <path d="M10 18.5a2 2 0 0 0 4 0" />
  </Svg>
);

export const IconPalette = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 1.5-2s-.5-2 1-2H17a4 4 0 0 0 4-4c0-5.5-4-10-9-10Z" />
    <circle cx="7.5" cy="11" r="1" fill="currentColor" />
    <circle cx="10.5" cy="7.5" r="1" fill="currentColor" />
    <circle cx="15" cy="7.5" r="1" fill="currentColor" />
  </Svg>
);

export const IconPlus = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const IconBack = (p: IconProps) => (
  <Svg {...p}>
    <path d="M15 5l-7 7 7 7" />
  </Svg>
);

export const IconSettings = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.09a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.09a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1Z" />
  </Svg>
);

export const IconUsers = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M2.5 20c1-3.2 3.5-4.5 6.5-4.5s5.5 1.3 6.5 4.5" />
    <path d="M16 5.2a3.2 3.2 0 0 1 0 5.9M18.5 15.9c1.6.7 2.7 2 3.2 4.1" />
  </Svg>
);

export const IconArchive = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="4.5" rx="1.2" />
    <path d="M5 8.5V19a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19V8.5" />
    <path d="M9.5 12.5h5" />
  </Svg>
);

export const IconLibrary = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 4.5h3.5v15H4zM9.5 4.5H13v15H9.5z" />
    <path d="m15 5.5 4.5 1.2-3.6 13-4.4-1.2z" />
  </Svg>
);

export const IconInbox = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 13.5 6 5.5h12l2.5 8" />
    <path d="M3.5 13.5V18a1.5 1.5 0 0 0 1.5 1.5h14a1.5 1.5 0 0 0 1.5-1.5v-4.5h-5.2a2.8 2.8 0 0 1-5.6 0Z" />
  </Svg>
);

export const IconLogout = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8" />
    <path d="M17 8.5 20.5 12 17 15.5M9.5 12h11" />
  </Svg>
);

// Recovery — a counter-clockwise arrow around a shield. Deleting an organization is a
// recoverable act here, not a disposal, so this deliberately isn't a wastebasket.
export const IconRecovery = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 9.5A8.5 8.5 0 1 1 3 13.4" />
    <path d="M3 4.5v5h5" />
    <path d="M12 8.8l3.4 1.3v3.1c0 2-1.4 3.5-3.4 4.3-2-.8-3.4-2.3-3.4-4.3v-3.1z" />
  </Svg>
);

/* ── Catalogue & action-menu icons ──────────────────────────────────────────
   The set the searchable lists and the action menu draw from: one glyph per kind
   of document, one per action. They are stroke icons like the rest, so a menu row
   and a sidebar link are lit by the same currentColor. */

export const IconSearch = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4.5 4.5" />
  </Svg>
);

export const IconEye = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12Z" />
    <circle cx="12" cy="12" r="2.8" />
  </Svg>
);

export const IconDoc = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 3h7.5L19 8.5V21H6z" />
    <path d="M13.5 3v5.5H19" />
    <path d="M9 13h6M9 16.5h4.5" />
  </Svg>
);

export const IconExam = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="4" width="16" height="16" rx="3" />
    <path d="m8.5 12 2.4 2.4 4.6-4.8" />
  </Svg>
);

export const IconLink = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 13.5a3.6 3.6 0 0 0 5.1 0l2.9-2.9a3.6 3.6 0 0 0-5.1-5.1l-1.3 1.3" />
    <path d="M14 10.5a3.6 3.6 0 0 0-5.1 0L6 13.4a3.6 3.6 0 0 0 5.1 5.1l1.3-1.3" />
  </Svg>
);

export const IconAudio = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 17V6.5l9-2V15" />
    <circle cx="6.5" cy="17" r="2.5" />
    <circle cx="15.5" cy="15" r="2.5" />
  </Svg>
);

export const IconVideo = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="5.5" width="13" height="13" rx="3" />
    <path d="m16 12 5-3v9l-5-3z" />
  </Svg>
);

export const IconFlag = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 21V4" />
    <path d="M6 4.5h11l-2 3.5 2 3.5H6z" />
  </Svg>
);

export const IconBranchDown = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3v11" />
    <path d="m8 10.5 4 4 4-4" />
    <path d="M5 20h14" />
  </Svg>
);

export const IconSliders = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 6h14M5 12h14M5 18h14" />
    <circle cx="9" cy="6" r="2" />
    <circle cx="15" cy="12" r="2" />
    <circle cx="8" cy="18" r="2" />
  </Svg>
);

export const IconPause = (p: IconProps) => (
  <Svg {...p}>
    <rect x="7" y="5" width="3.6" height="14" rx="1.4" />
    <rect x="13.4" y="5" width="3.6" height="14" rx="1.4" />
  </Svg>
);

export const IconPlay = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 5.5 18 12 8 18.5z" />
  </Svg>
);

export const IconPencil = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 20h4L19.2 8.8a2.4 2.4 0 0 0-3.4-3.4L4.6 16.6z" />
    <path d="m14.8 6.6 3.4 3.4" />
  </Svg>
);

export const IconUpload = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 16V4.5" />
    <path d="m7.5 9 4.5-4.5L16.5 9" />
    <path d="M4.5 16v2.5A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5V16" />
  </Svg>
);

export const IconUnlink = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10.5 13.5a3.6 3.6 0 0 0 4.6.4l2.4-2.4a3.6 3.6 0 0 0-5.1-5.1l-.8.8" />
    <path d="M13.5 10.5a3.6 3.6 0 0 0-4.6-.4L6.5 12.5a3.6 3.6 0 0 0 5.1 5.1l.8-.8" />
    <path d="m4 4 16 16" />
  </Svg>
);

export const IconTrash = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.5 6.5h15" />
    <path d="M9.5 6.5V4.8A1.3 1.3 0 0 1 10.8 3.5h2.4a1.3 1.3 0 0 1 1.3 1.3v1.7" />
    <path d="M6.5 6.5 7.4 20a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4l.9-13.5" />
    <path d="M10.5 10.5v7M13.5 10.5v7" />
  </Svg>
);

export const IconMinusUser = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="10" cy="8" r="3.6" />
    <path d="M3.5 20c0-3.3 2.9-5.6 6.5-5.6 1.2 0 2.3.2 3.2.7" />
    <path d="M15.5 17.5h5" />
  </Svg>
);

export const IconKey = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="8" cy="13" r="4.2" />
    <path d="M11.8 11.4 20 6.5" />
    <path d="m17 8.3 1.8 2.6M19.4 6.9l1.6 2.4" />
  </Svg>
);
