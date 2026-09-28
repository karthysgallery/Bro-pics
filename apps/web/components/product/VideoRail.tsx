'use client';

import { useEffect, useRef, useState } from 'react';
import type { ProductMedia } from '@bro-pics/shared';

interface VideoRailProps {
  media: ProductMedia[];
  title?: string;
}

export function VideoRail({ media, title = 'In motion' }: VideoRailProps) {
  const videos = media.filter((m) => m.type === 'video');
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const railRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setPrefersReducedMotion(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;

    // Queried off the container rather than collected through per-element
    // ref callbacks: an inline ref callback is detached and reattached on
    // every render, so any element remounted since the last effect run kept
    // its audio on and never started.
    const elements = Array.from(rail.querySelectorAll('video'));

    for (const el of elements) {
      // Set as properties, not just attributes: React omits `muted` from
      // server-rendered markup, and an unmuted video has its autoplay
      // blocked by every browser. This also keeps clips silent if one ever
      // ships with an audio track.
      el.muted = true;
      el.volume = 0;
    }

    if (prefersReducedMotion) {
      for (const el of elements) el.pause();
      return;
    }

    // Playback is driven by visibility rather than by a play() call at mount
    // time. Calling it on mount raced the element's own setup and lost —
    // the promise rejected and nothing retried, so whether a clip animated
    // came down to load timing. An observer fires after layout, repeats
    // naturally as the rail scrolls, and has the side benefit that clips
    // below the fold do not decode until someone can actually see them.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const el = entry.target as HTMLVideoElement;
          if (entry.isIntersecting) {
            // Rejects only if the browser declines autoplay outright, in
            // which case the clip rests on its first frame.
            void el.play().catch(() => {});
          } else {
            el.pause();
          }
        }
      },
      { threshold: 0.25 }
    );

    for (const el of elements) observer.observe(el);
    return () => observer.disconnect();
  }, [prefersReducedMotion, videos.length]);

  if (videos.length === 0) return null;

  return (
    <section data-testid="video-rail" className="mt-8">
      <h2 className="font-display text-xl md:text-2xl font-bold text-ink mb-4">{title}</h2>
      {/* Small, strongly rounded cards rather than the tall posters these
          used to be: a clip of a frame turning is a glance, not a feature.
          They loop silently with no chrome — playback controls on a muted
          few-second loop are just clutter. Anyone who has asked for reduced
          motion gets them paused, and gets the controls back so the clips
          stay reachable rather than simply frozen. */}
      <div ref={railRef} className="rail flex gap-3 overflow-x-auto pb-1">
        {videos.map((video) => (
          <video
            key={video.id}
            src={video.url}
            muted
            loop
            playsInline
            // [FE-45] Was `preload="auto"` — every clip on the rail
            // eagerly buffered its full video, including every one below
            // the fold that the IntersectionObserver above wouldn't even
            // play yet. `"metadata"` fetches just enough to decode
            // dimensions/a first frame (the browser then shows that frame
            // natively, the same visual role a `poster` image would play)
            // without downloading the rest until visibility triggers
            // `.play()`. A real `poster` attribute would be better still,
            // but needs its own thumbnail asset — `ProductMedia` has no
            // such field today (no admin path populates one), so this is
            // the change achievable without inventing that data.
            preload="metadata"
            controls={prefersReducedMotion}
            disablePictureInPicture
            aria-label="Product clip"
            className="w-40 md:w-48 aspect-[3/4] object-cover rounded-2xl bg-tint shrink-0"
          />
        ))}
      </div>
    </section>
  );
}
