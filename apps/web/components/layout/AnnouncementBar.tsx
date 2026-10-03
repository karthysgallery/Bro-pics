'use client';

import Link from 'next/link';
import { TextLoop } from '../ui/TextLoop/TextLoop';

interface AnnouncementBarProps {
  text?: string;
  link?: string;
  speed?: number;
}

const DEFAULT_ANNOUNCEMENT =
  'Made for your memories  ✦  Free shipping on orders above ₹1,999  ✦  Use code FIRST15 for 15% OFF';

export function AnnouncementBar({
  text,
  link,
  speed = 75,
}: AnnouncementBarProps) {
  const displayText = text && text.trim().length > 0 ? text : DEFAULT_ANNOUNCEMENT;

  const content = (
    <div className="w-full h-8 flex items-center overflow-hidden">
      <TextLoop
        text={displayText}
        shape="line"
        speed={speed}
        direction="forward"
        separator="✦"
        curviness={0}
        fontSize={9}
        fontWeight={600}
        letterSpacing={2.2}
        uppercase
        color="#F8FAFC"
        ribbon
        ribbonColor="#0B1428"
        ribbonWidth={35}
        pauseOnHover={true}
        className="w-full flex items-center cursor-pointer"
      />
    </div>
  );

  return (
    <aside
      aria-label="Announcements"
      className="sticky top-0 z-50 bg-[#0B1428] text-white overflow-hidden select-none border-b border-white/5"
    >
      {link ? (
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
