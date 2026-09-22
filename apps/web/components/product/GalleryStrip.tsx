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
    <div className="mb-3">
      <div className="rail flex gap-2 overflow-x-auto">
        {media.map((item, index) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setOpenIndex(index)}
            aria-label={`View product photo ${index + 1}`}
            className="relative w-14 h-14 flex-shrink-0 rounded-lg overflow-hidden bg-tint border border-line hover:border-gold transition-colors"
          >
            {item.type === 'video' ? (
              <div className="w-full h-full bg-ink/80 text-paper flex items-center justify-center text-xs">▶</div>
            ) : (
              <Image src={item.url} alt="" fill sizes="56px" className="object-cover" />
            )}
          </button>
        ))}
      </div>

      {openItem && openItem.type === 'image' && (
        <Lightbox src={openItem.url} alt={openItem.alt || productTitle} onClose={() => setOpenIndex(null)} />
      )}
    </div>
  );
}
