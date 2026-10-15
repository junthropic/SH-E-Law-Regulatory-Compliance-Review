// Simple line icons shown beside card and section titles (2026-10-15 user design: "제목 옆 아이콘").
// Hand-written inline SVG, decorative only (aria-hidden); no icon package or external file.
const PATHS = {
  history: "M3 12a9 9 0 1 0 3-6.7M3 4v4h4M12 7v5l3 2",
  key: "M15 3a6 6 0 1 1-5.6 8.1L3 17.5V21h3.5v-2h2v-2h2l1.4-1.4A6 6 0 0 1 15 3zM16.5 7.5h.01",
  sync: "M20 11a8 8 0 0 0-14.3-4.9L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16M20 20v-4h-4",
  archive: "M3 4h18v4H3zM5 8v12h14V8M10 12h4",
  chat: "M4 5h16v11H9l-5 4zM8 9h8M8 12h5",
  eye: "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 3",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  list: "M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01",
  scale: "M12 3v18M7 21h10M5 7h14M5 7l-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0z",
  edit: "M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4",
  check: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 12l3 3 5-6",
  download: "M12 3v12M7 10l5 5 5-5M4 19h16",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name }: { name: IconName }) {
  return (
    <svg className="beta-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={PATHS[name]} />
    </svg>
  );
}
