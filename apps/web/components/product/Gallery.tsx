'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import type { ProductMedia } from '@bro-pics/shared';
import { Lightbox } from '../ui/Lightbox';

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
    return <div className="aspect-square bg-tint rounded-2xl" />;
  }

  return (
    <div>
      <div className="aspect-square bg-tint rounded-2xl overflow-hidden relative">
        {active.type === 'video' ? (
          <video src={active.url} controls preload="none" className="w-full h-full object-cover" />
        ) : (
          <Image
            src={active.url}
            alt={active.alt || productTitle}
            onClick={() => setIsZoomed(true)}
            fill
            sizes="(max-width: 768px) 100vw, 50vw"
            priority
            className="object-cover cursor-zoom-in"
          />
        )}
      </div>

      {media.length > 1 && (
        <div className="rail flex gap-2 mt-3 overflow-x-auto">
          {media.map((item, index) => (
            <button
              key={item.id}
              onClick={() => setActiveIndex(index)}
              aria-label={`Show media ${index + 1}`}
              className={`relative w-16 h-16 flex-shrink-0 rounded-xl overflow-hidden bg-tint border ${
                index === activeIndex ? 'border-accent' : 'border-transparent'
              }`}
            >
              {item.type === 'video' ? (
                <div className="w-full h-full bg-ink/80 text-paper flex items-center justify-center text-xs">▶</div>
              ) : (
                <Image src={item.url} alt="" fill sizes="64px" className="object-cover" />
              )}
            </button>
          ))}
        </div>
      )}

      {isZoomed && active.type === 'image' && (
        <Lightbox src={active.url} alt={active.alt || productTitle} onClose={() => setIsZoomed(false)} />
      )}
    </div>
  );
}
