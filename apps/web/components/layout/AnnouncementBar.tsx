'use client';

import Link from 'next/link';
import { isSafeHref } from '@bro-pics/shared';

interface AnnouncementBarProps {
  text?: string;
  link?: string;
  speed?: number;
}

// Only the always-true line. Pages normally pass real text (admin setting or
// LayoutChrome's shipping-aware default); this is just the last-resort fallback.
const DEFAULT_ANNOUNCEMENT = 'Made for your memories';

function parseAnnouncementSegments(rawText: string): string[] {
  const parts = rawText
    .split(/\s+[•✦|·*]\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [rawText.trim()];
}

export function AnnouncementBar({
  text,
  link,
}: AnnouncementBarProps) {
  const displayText = text && text.trim().length > 0 ? text : DEFAULT_ANNOUNCEMENT;
  const segments = parseAnnouncementSegments(displayText);
  const repeatCount = Math.max(2, Math.ceil(8 / segments.length));
  const items = Array.from({ length: repeatCount }, () => segments).flat();

  const content = (
    <div
      role="img"
      aria-label={displayText}
      className="w-full h-8 sm:h-8.5 flex items-center overflow-hidden bg-accent-dark"
    >
      <div className="flex w-max animate-announcement-marquee" aria-hidden="true">
        {/* Track Group 1 */}
        <div className="flex items-center shrink-0">
          {items.map((item, idx) => (
            <span key={`g1-${idx}`} className="inline-flex items-center">
              <span className="px-3.5 sm:px-4 text-[12.5px] sm:text-[13px] font-bold tracking-wide uppercase text-white whitespace-nowrap">
                {item}
              </span>
              <span
                className="text-gold text-xs select-none font-bold"
                aria-hidden="true"
              >
                ✦
              </span>
            </span>
          ))}
        </div>

        {/* Track Group 2 (seamless loop clone) */}
        <div className="flex items-center shrink-0">
          {items.map((item, idx) => (
            <span key={`g2-${idx}`} className="inline-flex items-center">
              <span className="px-3.5 sm:px-4 text-[12.5px] sm:text-[13px] font-bold tracking-wide uppercase text-white whitespace-nowrap">
                {item}
              </span>
              <span
                className="text-gold text-xs select-none font-bold"
                aria-hidden="true"
              >
                ✦
              </span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <aside
      aria-label="Announcements"
      className="relative w-full bg-accent-dark text-white overflow-hidden select-none border-b border-white/10 z-30"
    >
      {link && isSafeHref(link) ? (
        <Link
          href={link}
          className="block hover:opacity-95 transition-opacity"
          aria-label="Announcement Link"
        >
          {content}
        </Link>
      ) : (
        content
      )}
    </aside>
  );
}

export default AnnouncementBar;

