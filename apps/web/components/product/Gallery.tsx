'use client';

import { useState, useEffect } from 'react';
import type { ProductMedia } from '@bro-pics/shared';

interface GalleryProps {
  media: ProductMedia[];
  productTitle: string;
}

export function Gallery({ media, productTitle }: GalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isZoomed, setIsZoomed] = useState(false);

  useEffect(() => {
    setActiveIndex(0);
    setIsZoomed(false);
  }, [media]);

  const active = media[Math.min(activeIndex, media.length - 1)];

  if (!active) {
    return <div className="aspect-square bg-cream rounded-lg" />;
  }

  return (
    <div>
      <div className="aspect-square bg-cream rounded-lg overflow-hidden relative">
        {active.type === 'video' ? (
          <video src={active.url} controls className="w-full h-full object-cover" />
        ) : (
          <img
            src={active.url}
            alt={active.alt || productTitle}
            onClick={() => setIsZoomed(true)}
            className="w-full h-full object-cover cursor-zoom-in"
          />
        )}
      </div>

      {media.length > 1 && (
        <div className="flex gap-2 mt-3 overflow-x-auto">
          {media.map((item, index) => (
            <button
              key={item.id}
              onClick={() => setActiveIndex(index)}
              aria-label={`Show media ${index + 1}`}
              className={`w-16 h-16 flex-shrink-0 rounded-lg overflow-hidden border-2 ${
                index === activeIndex ? 'border-terracotta' : 'border-transparent'
              }`}
            >
              {item.type === 'video' ? (
                <div className="w-full h-full bg-charcoal/80 text-cream flex items-center justify-center text-xs">▶</div>
              ) : (
                <img src={item.url} alt="" className="w-full h-full object-cover" />
              )}
            </button>
          ))}
        </div>
      )}

      {isZoomed && active.type === 'image' && (
        <div
          className="fixed inset-0 z-50 bg-charcoal/90 flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setIsZoomed(false)}
        >
          <img src={active.url} alt={active.alt || productTitle} className="max-w-full max-h-full object-contain" />
        </div>
      )}
    </div>
  );
}
