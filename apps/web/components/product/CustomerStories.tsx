'use client';

import { useState } from 'react';
import { Lightbox } from '../ui/Lightbox';
import { CUSTOMER_FRAME_PHOTOS, allCommentsOrdered, monthLabel } from '../../lib/customer-frames';

const COMMENTS = allCommentsOrdered();
const PHOTO_STEP = 18;
const COMMENT_STEP = 9;

/**
 * Lower on the product page: real photos of frames KarthysGallery delivered (a masonry grid that keeps each photo's
 * shape, lazy-loaded, tap to enlarge), and every Instagram comment as written. The two are shown side by side but
 * never paired: nobody's comment is presented as belonging to a particular photo.
 */
export function CustomerStories() {
  const [photos, setPhotos] = useState(PHOTO_STEP);
  const [comments, setComments] = useState(COMMENT_STEP);
  const [open, setOpen] = useState<number | null>(null);

  if (CUSTOMER_FRAME_PHOTOS.length === 0 && COMMENTS.length === 0) return null;

  return (
    <section id="customer-stories" aria-labelledby="customer-stories-h" className="scroll-mt-28 border-t border-line py-10 sm:py-14">
      <div className="mb-6 max-w-2xl">
        <h2 id="customer-stories-h" className="font-display text-3xl font-semibold text-ink sm:text-4xl">Real frames, real homes</h2>
        <p className="mt-2 text-sm text-ink/65">
          Photos of frames we made and delivered, and what customers wrote to us on Instagram.
        </p>
      </div>

      {CUSTOMER_FRAME_PHOTOS.length > 0 && (
        <>
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

      {COMMENTS.length > 0 && (
        <div className="mt-10">
          <h3 className="font-display text-2xl font-semibold text-ink">What customers say</h3>
          <p className="mt-1 text-xs text-ink/55">Comments on our Instagram, as written. {COMMENTS.length} customers so far.</p>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {COMMENTS.slice(0, comments).map((c) => (
              <li key={c.handle} className="rounded-2xl border border-line bg-paper p-4">
                <p className="text-sm leading-relaxed text-ink/90">{c.text}</p>
                <p className="mt-3 flex items-center justify-between gap-2 text-xs text-ink/55">
                  <span className="truncate font-semibold text-ink/80">{c.handle}</span>
                  <span className="shrink-0">Instagram · {monthLabel(c.month)}</span>
                </p>
              </li>
            ))}
          </ul>
          {comments < COMMENTS.length && (
            <div className="mt-4 flex justify-center">
              <button type="button" onClick={() => setComments((v) => v + COMMENT_STEP)} className="rounded-full border border-line bg-paper px-5 py-2 text-sm font-semibold text-ink hover:bg-tint">
                Load more reviews
              </button>
            </div>
          )}
        </div>
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
