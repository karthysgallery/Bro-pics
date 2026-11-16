'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ZoomPane } from './ZoomPane';

export interface LightboxItem {
  src: string;
  alt: string;
  type?: 'image' | 'video';
}

interface LightboxProps {
  /** A single picture (or clip)… */
  src?: string;
  alt?: string;
  type?: 'image' | 'video';
  /** …or a set to browse, opened at `startIndex`. */
  items?: LightboxItem[];
  startIndex?: number;
  onClose: () => void;
}

/** A media-library / upload image URL at another width (other URLs are used as they are). */
function sizedUrl(url: string, width: number): string {
  return /[?&]w=\d+/.test(url) ? url.replace(/([?&])w=\d+/, `$1w=${width}`) : url;
}

// Full-screen viewer shared by Gallery, GalleryStrip and the editor's Preview button. Every picture
// in it can be zoomed (pinch, wheel, double-tap or the buttons) and moved around; arrows, a swipe
// or ← → step through a set. It closes on the ×, Esc, or a click on the dark backdrop — not on the
// picture itself, so dragging around a zoomed picture never closes it.
//
// `type: 'video'` plays the clip with native controls instead — GalleryStrip has no other place to
// play a video thumbnail.
export function Lightbox({ src, alt = '', type = 'image', items, startIndex = 0, onClose }: LightboxProps) {
  const list: LightboxItem[] = items && items.length > 0 ? items : src ? [{ src, alt, type }] : [];
  const [index, setIndex] = useState(Math.min(Math.max(0, startIndex), Math.max(0, list.length - 1)));
  const closeRef = useRef<HTMLButtonElement>(null);
  const many = list.length > 1;
  const step = (d: -1 | 1) => setIndex((i) => (i + d + list.length) % list.length);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (many && e.key === 'ArrowLeft') step(-1);
      else if (many && e.key === 'ArrowRight') step(1);
    };
    window.addEventListener('keydown', key);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', key);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [many, onClose]);

  const item = list[index];
  if (!item) return null;
  const arrow =
    'absolute top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-paper/90 text-ink shadow-md ring-1 ring-ink/10 transition-colors hover:bg-paper';

  return createPortal(
    <div
      style={{ backgroundColor: 'rgba(24,19,15,0.97)' }}
      className="fixed inset-0 z-[200] flex flex-col text-paper"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={many ? `${item.alt} — picture ${index + 1} of ${list.length}` : item.alt}
    >
      <div className="flex items-center justify-between px-4 py-3" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <span className="text-sm font-semibold tabular-nums text-paper/70">{many ? `${index + 1} / ${list.length}` : ''}</span>
        <button
          ref={closeRef}
          type="button"
          data-shape="circle"
          aria-label="Close preview"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-paper/10 text-2xl leading-none text-paper hover:bg-paper/20"
        >
          &times;
        </button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-3 pb-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
        {item.type === 'video' ? (
          <video src={item.src} controls autoPlay playsInline className="max-h-full max-w-full rounded-xl" />
        ) : (
          <ZoomPane resetKey={index} onSwipe={many ? step : undefined} className="h-full w-full max-w-[min(94vw,calc(100vh-140px))] rounded-2xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={sizedUrl(item.src, 2400)} alt={item.alt} draggable={false} className="absolute inset-0 h-full w-full object-contain" />
          </ZoomPane>
        )}
        {many && (
          <>
            <button type="button" data-shape="circle" onClick={() => step(-1)} aria-label="Previous picture" className={`${arrow} left-3 sm:left-6`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
            </button>
            <button type="button" data-shape="circle" onClick={() => step(1)} aria-label="Next picture" className={`${arrow} right-3 sm:right-6`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6" /></svg>
            </button>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
