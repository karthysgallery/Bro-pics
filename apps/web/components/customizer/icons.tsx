/** Line icons for the template editor (24×24, currentColor). */
const paths = {
  undo: <path d="M9 14L4 9l5-5M4 9h11a5 5 0 010 10h-3" />,
  redo: <path d="M15 14l5-5-5-5M20 9H9a5 5 0 000 10h3" />,
  zoomIn: <path d="M11 4a7 7 0 100 14 7 7 0 000-14zM21 21l-4.35-4.35M11 8v6M8 11h6" />,
  zoomOut: <path d="M11 4a7 7 0 100 14 7 7 0 000-14zM21 21l-4.35-4.35M8 11h6" />,
  rotate: <path d="M20 11a8 8 0 10-2.3 5.7M20 4v7h-7" />,
  fit: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  replace: <path d="M4 7h11l-3-3M20 17H9l3 3M4 7v4M20 17v-4" />,
  remove: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  plus: <path d="M12 5v14M5 12h14" />,
  photos: <path d="M3 7h3l2-3h8l2 3h3v13H3zM12 10a4 4 0 100 8 4 4 0 000-8z" />,
  alert: <path d="M12 3l9.5 17h-19L12 3zM12 10v4M12 17.5v.5" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, className = 'h-[18px] w-[18px]' }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {paths[name]}
    </svg>
  );
}
