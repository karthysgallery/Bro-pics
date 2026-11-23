'use client';

import { useRef, useState } from 'react';
import { Lightbox } from '../ui/Lightbox';
import { CUSTOMER_FRAME_PHOTOS, allCommentsOrdered, displayName, monthLabel } from '../../lib/customer-frames';

const COMMENTS = allCommentsOrdered();
const PHOTO_STEP = 18;

/**
 * Lower on the product page: real photos of frames KarthysGallery delivered (a masonry grid that keeps each photo's
 * shape, lazy-loaded, tap to enlarge), and every Instagram comment as written. The two are shown side by side but
 * never paired: nobody's comment is presented as belonging to a particular photo.
 */
export function CustomerStories() {
  const [photos, setPhotos] = useState(PHOTO_STEP);
  const rowRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState<number | null>(null);

  if (CUSTOMER_FRAME_PHOTOS.length === 0 && COMMENTS.length === 0) return null;

  return (
    <section id="customer-stories" aria-labelledby="customer-stories-h" className="scroll-mt-28 border-t border-line py-10 sm:py-14">
      <div className="mb-6 max-w-2xl">
        <h2 id="customer-stories-h" className="font-display text-3xl font-semibold text-ink sm:text-4xl">Real frames, real customers</h2>
        <p className="mt-2 text-sm text-ink/65">What customers wrote to us, and photos of frames we made and delivered.</p>
      </div>

      {COMMENTS.length > 0 && (
        <div className="mb-10">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h3 className="font-display text-2xl font-semibold text-ink">Customers say</h3>
              <p className="mt-1 text-xs text-ink/55">{COMMENTS.length} customers wrote to us on Instagram. Swipe to read them all.</p>
            </div>
            <div className="hidden gap-2 sm:flex">
              <button type="button" aria-label="Previous reviews" onClick={() => rowRef.current?.scrollBy({ left: -rowRef.current.clientWidth * 0.9, behavior: 'smooth' })} className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-paper text-ink hover:bg-tint">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
              </button>
              <button type="button" aria-label="Next reviews" onClick={() => rowRef.current?.scrollBy({ left: rowRef.current.clientWidth * 0.9, behavior: 'smooth' })} className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-paper text-ink hover:bg-tint">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
              </button>
            </div>
          </div>
          <ul ref={rowRef} className="-mx-4 mt-4 flex items-start snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth px-4 pb-3 [scrollbar-width:none] sm:mx-0 sm:px-0" aria-label="Customer reviews">
            {COMMENTS.map((c) => (
              <li key={c.handle} className="flex w-[78%] shrink-0 snap-start flex-col rounded-2xl border border-line bg-paper p-4 sm:w-[300px]">
                <p className="font-semibold text-ink">{displayName(c)}</p>
                <p className="text-[11px] text-ink/50">{monthLabel(c.month)} · via Instagram</p>
                <p className="mt-2.5 text-[15px] leading-relaxed text-ink/90">{c.text}</p>
                {c.photo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.photo} alt={`${displayName(c)}'s frame`} loading="lazy" className="mt-3 aspect-square w-full rounded-xl object-cover" />
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {CUSTOMER_FRAME_PHOTOS.length > 0 && (
        <>
          <h3 className="mb-4 font-display text-2xl font-semibold text-ink">Frames we delivered</h3>
          <ul className="columns-2 gap-2.5 sm:columns-3 lg:columns-4" aria-label="Photos of delivered frames">
            {CUSTOMER_FRAME_PHOTOS.slice(0, photos).map((p, k) => (
              <li key={p.id} className="mb-2.5 break-inside-avoid">
                <button
                  type="button"
                  onClick={() => setOpen(k)}
                  className="block w-full overflow-hidden rounded-xl bg-tint focus:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                  aria-label={`Open photo ${k + 1} of a delivered frame`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.thumb}
                    alt="A frame KarthysGallery delivered"
                    width={p.width}
                    height={p.height}
                    loading="lazy"
                    decoding="async"
                    className="h-auto w-full transition-transform duration-300 hover:scale-[1.02]"
                    style={{ aspectRatio: `${p.width} / ${p.height}` }}
                  />
                </button>
              </li>
            ))}
          </ul>
          {photos < CUSTOMER_FRAME_PHOTOS.length && (
            <div className="mt-4 flex justify-center">
              <button type="button" onClick={() => setPhotos((v) => v + PHOTO_STEP)} className="rounded-full border border-line bg-paper px-5 py-2 text-sm font-semibold text-ink hover:bg-tint">
                Show more photos ({CUSTOMER_FRAME_PHOTOS.length - photos} more)
              </button>
            </div>
          )}
        </>
      )}

      {open !== null && (
        <Lightbox
          items={CUSTOMER_FRAME_PHOTOS.map((p) => ({ src: p.src, alt: 'A frame KarthysGallery delivered' }))}
          startIndex={open}
          onClose={() => setOpen(null)}
        />
      )}
    </section>
  );
}
