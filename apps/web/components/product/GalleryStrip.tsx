'use client';

import { useState } from 'react';
import Image from 'next/image';
import type { ProductMedia } from '@bro-pics/shared';
import { Lightbox } from '../ui/Lightbox';

interface GalleryStripProps {
  media: ProductMedia[];
  productTitle: string;
}

// Compact, thumbnails-only companion to Gallery — shown above the live
// personalization canvas (see PersonalizationEditor, Task 6) so real
// product photography (lifestyle shots, close-ups) stays visible while a
// shopper is customizing, instead of disappearing entirely the way it did
// before this component existed. No large hero image: the canvas is
// already the page's visual focus, so this is deliberately smaller than
// Gallery's own thumbnail rail.
export function GalleryStrip({ media, productTitle }: GalleryStripProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (media.length === 0) return null;

  const openItem = openIndex !== null ? media[openIndex] : null;

  return (
    <>
      <div className="rail flex gap-2.5 overflow-x-auto pb-1">
        {media.map((item, index) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setOpenIndex(index)}
            aria-label={`View product photo ${index + 1}`}
            className={`relative w-14 h-14 md:w-16 md:h-16 flex-shrink-0 rounded-xl overflow-hidden bg-tint border transition-all ${
              index === 0
                ? 'border-amber-400 ring-2 ring-amber-400 shadow-xs'
                : 'border-line hover:border-ink/40'
            }`}
          >
            {item.type === 'video' ? (
              <div className="w-full h-full bg-[#0B1428] text-white flex items-center justify-center text-sm">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="ml-0.5">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
              </div>
            ) : (
              <Image src={item.url} alt="" fill sizes="64px" className="object-cover" />
            )}
          </button>
        ))}
      </div>

      {openItem && (
        <Lightbox
          src={openItem.url}
          alt={openItem.alt || productTitle}
          type={openItem.type}
          onClose={() => setOpenIndex(null)}
        />
      )}
    </>
  );
}
