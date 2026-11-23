'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CUSTOMER_FRAME_PHOTOS, displayName, featuredComments, monthLabel } from '../../lib/customer-frames';
import { INSTAGRAM_COMMENTS } from '../../lib/customer-comments';

const COMMENTS = featuredComments();
// A fixed handful of delivered-frame photos for the strip (portrait ones read best this small).
const STRIP = CUSTOMER_FRAME_PHOTOS.filter((p) => p.height >= p.width).filter((_, i) => i % 7 === 0).slice(0, 5);

/** Initial-letter avatar in a warm tone picked from the handle (Instagram profile pictures are not copied). */
function Avatar({ handle }: { handle: string }) {
  const letter = handle.replace(/[^a-z]/gi, '').charAt(0).toUpperCase() || '★';
  const tones = ['#c9861a', '#8a5a2b', '#b5651d', '#6f4e37', '#a0522d'];
  const tone = tones[[...handle].reduce((s, c) => s + c.charCodeAt(0), 0) % tones.length];
  return (
    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full font-display text-lg font-semibold text-white" style={{ background: tone }} aria-hidden="true">
      {letter}
    </span>
  );
}

/**
 * The small review card beside the size choice: real Instagram comments, one at a time, with arrows and dots, and a
 * strip of real delivered frames under it. Moves on by itself every few seconds unless the customer is reading
 * (hover, focus or a tap) or prefers reduced motion. No stars: these comments carry no rating.
 */
export function ReviewTeaser() {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchX = useRef<number | null>(null);
  const n = COMMENTS.length;
  const go = useCallback((d: number) => setI((v) => (v + d + n) % n), [n]);

  useEffect(() => {
    if (paused || n < 2 || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => setI((v) => (v + 1) % n), 5000);
    return () => clearInterval(t);
  }, [paused, n]);

  if (n === 0) return null;
  const c = COMMENTS[i];

  return (
    <section aria-label="What customers say" className="my-4 space-y-2.5" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      <div
        className="relative rounded-2xl border border-line bg-paper p-3.5 pr-12"
        onTouchStart={(e) => { touchX.current = e.touches[0].clientX; setPaused(true); }}
        onTouchEnd={(e) => {
          if (touchX.current === null) return;
          const dx = e.changedTouches[0].clientX - touchX.current;
          if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
          touchX.current = null;
        }}
      >
        <div className="flex items-start gap-3" aria-live="polite">
          {c.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.photo} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover" />
          ) : (
            <Avatar handle={displayName(c)} />
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">{displayName(c)}</p>
            <p className="text-[11px] text-ink/50">{monthLabel(c.month)} · via Instagram</p>
            <p className="mt-1 line-clamp-3 text-[13px] leading-snug text-ink/85">{c.text}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => go(1)}
          aria-label="Next review"
          className="absolute right-2.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-paper text-ink shadow-sm hover:bg-tint"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
        </button>
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1" role="tablist" aria-label="Choose a review">
          {COMMENTS.slice(0, 8).map((x, k) => (
            <button
              key={x.handle}
              type="button"
              role="tab"
              aria-selected={i % 8 === k}
              aria-label={`Review ${k + 1}`}
              onClick={() => setI(k)}
              className="flex h-6 items-center px-0.5"
            >
              <span className={`block h-1.5 rounded-full transition-all ${i % 8 === k ? 'w-5 bg-gold' : 'w-1.5 bg-ink/20'}`} />
            </button>
          ))}
        </div>
        <a href="#customer-stories" className="text-xs font-medium text-ink/70 underline underline-offset-2 hover:text-ink">
          See all {INSTAGRAM_COMMENTS.length} reviews
        </a>
      </div>
      {STRIP.length > 0 && (
        <a href="#customer-stories" className="flex items-center gap-2 rounded-xl bg-tint/70 p-2 pr-3 hover:bg-tint" aria-label="See photos of frames we delivered">
          <span className="flex -space-x-2">
            {STRIP.map((p) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={p.id} src={p.thumb} alt="" loading="lazy" className="h-10 w-8 rounded-md border-2 border-paper object-cover" />
            ))}
          </span>
          <span className="text-xs text-ink/80">
            <strong className="font-semibold text-ink">{CUSTOMER_FRAME_PHOTOS.length} real photos</strong> of frames we delivered
          </span>
        </a>
      )}
    </section>
  );
}
