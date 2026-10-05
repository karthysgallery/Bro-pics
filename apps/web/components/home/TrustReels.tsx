'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { VideoKind } from '@bro-pics/shared';
import FlexCarousel from './FlexCarousel';

export interface TrustReel {
  id: string;
  kind: VideoKind;
  caption: string;
  src: string;
  poster: string | null;
  productSlug: string | null;
}

interface TrustReelsProps {
  reels: TrustReel[];
  /** Development stand-in: cards are not playable and a note explains how to add real clips. */
  preview?: boolean;
  eyebrow?: string;
  title?: string;
  subtitle?: string;
}

const KIND_LABEL: Record<VideoKind, string> = {
  making: 'How it’s made',
  unboxing: 'Opening day',
  feedback: 'Customer feedback',
};

const KIND_TAB: Record<VideoKind, string> = {
  making: 'Frame making',
  unboxing: 'Package opening',
  feedback: 'Feedback',
};

const KIND_ORDER: VideoKind[] = ['making', 'unboxing', 'feedback'];

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);
  return reduced;
}

function PlayGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86A1 1 0 0 0 8 5.14z" />
    </svg>
  );
}


function useWebgl2() {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    try {
      setOk(Boolean(document.createElement('canvas').getContext('webgl2')));
    } catch {
      setOk(false);
    }
  }, []);
  return ok;
}

/**
 * The homepage's proof section: short vertical clips of the frame being made,
 * customers opening their orders and customers talking about them. Cards
 * preview silently in a snap-scroll rail; tapping one opens a full-screen,
 * swipe-up viewer with sound, the way people already watch reels.
 */
export function TrustReels({
  reels,
  preview = false,
  eyebrow = 'Why us?',
  title = 'Don’t take our word for it.',
  subtitle = 'Watch your frame being made, then watch real customers open theirs.',
}: TrustReelsProps) {
  const reducedMotion = usePrefersReducedMotion();
  const kinds = useMemo(() => KIND_ORDER.filter((k) => reels.some((r) => r.kind === k)), [reels]);
  const [filter, setFilter] = useState<VideoKind | 'all'>('all');
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);
  const webgl2 = useWebgl2();
  const [carouselFailed, setCarouselFailed] = useState(false);
  // Each step waits a different 5 to 10 seconds, so the row does not tick like a metronome.
  const [stepSeconds, setStepSeconds] = useState(7);
  const lastTrigger = useRef<HTMLElement | null>(null);

  const visible = useMemo(
    () => (filter === 'all' ? reels : reels.filter((r) => r.kind === filter)),
    [reels, filter]
  );

  // Previews play only while mostly on screen, one rail at a time, and never
  // for visitors who asked for reduced motion (those cards stay on the poster).
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const elements = Array.from(rail.querySelectorAll('video'));
    for (const el of elements) {
      el.muted = true;
      el.volume = 0;
    }
    if (reducedMotion) {
      for (const el of elements) el.pause();
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const el = entry.target as HTMLVideoElement;
          if (entry.isIntersecting) void el.play().catch(() => {});
          else el.pause();
        }
      },
      { threshold: 0.6 }
    );
    for (const el of elements) observer.observe(el);
    return () => observer.disconnect();
  }, [reducedMotion, visible, openIndex]);

  // Clips with a usable still, in display order; the carousel and the viewer
  // both index into this list so a tap on card N opens clip N.
  const carouselReels = visible;
  const carouselMode = webgl2 && !carouselFailed;

  const openFromCarousel = (index: number) => {
    // The viewer pops out from the middle of the carousel.
    const box = railRef.current?.getBoundingClientRect() ?? document.querySelector('#see-it-made .flex-carousel')?.getBoundingClientRect();
    if (box) setOrigin({ x: box.left + box.width / 2, y: box.top + box.height / 2 });
    const reel = carouselReels[index];
    const at = visible.indexOf(reel);
    if (at >= 0) {
      lastTrigger.current = document.querySelector<HTMLElement>('#see-it-made .flex-carousel');
      setOpenIndex(at);
    }
  };

  const scrollRail = (direction: 1 | -1) => {
    const rail = railRef.current;
    if (!rail) return;
    rail.scrollBy({ left: direction * rail.clientWidth * 0.8, behavior: reducedMotion ? 'auto' : 'smooth' });
  };

  const open = (index: number, trigger: HTMLElement) => {
    lastTrigger.current = trigger;
    const box = trigger.getBoundingClientRect();
    setOrigin({ x: box.left + box.width / 2, y: box.top + box.height / 2 });
    setOpenIndex(index);
  };

  const close = useCallback(() => {
    setOpenIndex(null);
    lastTrigger.current?.focus();
  }, []);

  if (reels.length === 0) return null;

  return (
    <section
      id="see-it-made"
      aria-labelledby="trust-reels-title"
      className="bg-ink text-paper py-14 md:py-20 my-12 md:my-16 scroll-mt-44"
    >
      <div className="mx-auto w-full max-w-shell px-4 md:px-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="max-w-xl">
            <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-gold mb-3">{eyebrow}</p>
            <h2
              id="trust-reels-title"
              className="font-display text-3xl sm:text-4xl lg:text-[2.75rem] font-bold leading-display tracking-tight"
            >
              {title}
            </h2>
            <p className="mt-3 text-[15px] text-paper/60 leading-relaxed">{subtitle}</p>
          </div>

          <div className="flex items-center justify-between md:justify-end gap-4">
            {kinds.length > 1 && (
              <div role="group" aria-label="Filter videos" className="flex flex-wrap gap-2">
                {(['all', ...kinds] as const).map((value) => {
                  const active = filter === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setFilter(value)}
                      className={`h-9 px-4 rounded-full text-[13px] font-semibold border transition-colors ${
                        active
                          ? 'bg-paper text-ink border-paper'
                          : 'border-paper/25 text-paper/75 hover:border-paper/60 hover:text-paper'
                      }`}
                    >
                      {value === 'all' ? 'All' : KIND_TAB[value]}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="hidden md:flex gap-2">
              <button
                type="button"
                aria-label="Previous videos"
                onClick={() => scrollRail(-1)}
                className="h-9 w-9 rounded-full border border-paper/25 flex items-center justify-center hover:border-paper/60 transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M15 6l-6 6 6 6" />
                </svg>
              </button>
              <button
                type="button"
                aria-label="Next videos"
                onClick={() => scrollRail(1)}
                className="h-9 w-9 rounded-full border border-paper/25 flex items-center justify-center hover:border-paper/60 transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {carouselMode ? (
        <div className="mt-6 md:mt-8">
          <div className="relative h-[520px] md:h-[600px] w-full">
            {carouselReels.length > 0 && (
              <FlexCarousel
                items={carouselReels.map((r) => ({
                  src: r.poster ?? '',
                  video: r.src || undefined,
                  alt: r.caption || KIND_LABEL[r.kind],
                }))}
                preset="ribbon"
                intro="rise"
                bend={0}
                dispersion={0}
                captions={false}
                fit={preview ? 'portrait' : 'natural'}
                cardHeight={0.9}
                sideScale={0.5}
                gap={12}
                radius={14}
                squeeze={0.1}
                focusOnClick={false}
                autoplay
                interval={stepSeconds}
                onChange={() => {
                  setStepSeconds(5 + Math.random() * 5);
                }}
                onSelect={(index) => openFromCarousel(index)}
                onFail={() => setCarouselFailed(true)}
              />
            )}
          </div>
          <div className="mx-auto max-w-shell px-4 md:px-6 mt-2 flex flex-col items-center gap-3">
            <p className="text-[12px] text-paper/45">Swipe or drag to browse. Tap the centre video to watch it with sound.</p>
            {preview && (
              <p className="text-[12px] text-paper/60 text-center max-w-xl">
                Development preview with sample clips. Upload clips in Admin &rarr; Videos (placement: Homepage trust
                reels) and this switches to your real videos. In production the section stays hidden until clips exist.
              </p>
            )}
          </div>
        </div>
      ) : (
      <div
        ref={railRef}
        className="rail mt-8 md:mt-10 flex gap-3 md:gap-4 overflow-x-auto snap-x snap-mandatory scroll-px-4 md:scroll-px-6 px-4 md:px-6 pb-2 mx-auto max-w-shell"
      >
        {visible.map((reel, index) => (
          <button
            key={reel.id}
            type="button"
            onClick={(e) => open(index, e.currentTarget)}
            aria-label={`Play video: ${reel.caption || KIND_LABEL[reel.kind]}`}
            className="group relative shrink-0 snap-start w-[58vw] max-w-[240px] sm:w-[220px] aspect-[9/16] rounded-2xl overflow-hidden bg-paper/10 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
          >
            <video
              src={reel.src}
              poster={reel.poster ?? undefined}
              muted
              loop
              playsInline
              preload="metadata"
              disablePictureInPicture
              aria-hidden="true"
              tabIndex={-1}
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            />
            <span className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/75 to-transparent" aria-hidden="true" />
            <span className="absolute top-3 left-3 rounded-full bg-black/55 backdrop-blur-sm px-2.5 py-1 text-[11px] font-semibold text-paper">
              {KIND_LABEL[reel.kind]}
            </span>
            <span className="absolute top-3 right-3 h-8 w-8 rounded-full bg-paper/90 text-ink flex items-center justify-center pl-0.5" aria-hidden="true">
              <PlayGlyph />
            </span>
            {reel.caption && (
              <span className="absolute inset-x-3 bottom-3 text-[13px] font-medium leading-snug text-paper line-clamp-2">
                {reel.caption}
              </span>
            )}
          </button>
        ))}
      </div>
      )}

      {openIndex !== null && (
        <ReelViewer reels={visible} startIndex={openIndex} onClose={close} reducedMotion={reducedMotion} origin={origin} />
      )}
    </section>
  );
}

interface ReelViewerProps {
  reels: TrustReel[];
  startIndex: number;
  onClose: () => void;
  reducedMotion: boolean;
  /** Viewport point the viewer grows from and shrinks back to. */
  origin: { x: number; y: number } | null;
}

function ReelViewer({ reels, startIndex, onClose: finishClose, reducedMotion, origin }: ReelViewerProps) {
  const [closing, setClosing] = useState(false);
  const onClose = useCallback(() => {
    if (reducedMotion) {
      finishClose();
      return;
    }
    setClosing(true);
    window.setTimeout(finishClose, 220);
  }, [finishClose, reducedMotion]);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [active, setActive] = useState(startIndex);
  const [muted, setMuted] = useState(false);
  const [paused, setPaused] = useState(false);

  // Page scroll is locked while the viewer is open; focus moves into it.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // Land on the tapped clip before anything is observed.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    scroller.scrollTo({ top: startIndex * scroller.clientHeight, behavior: 'instant' as ScrollBehavior });
  }, [startIndex]);

  const step = useCallback(
    (direction: 1 | -1) => {
      const scroller = scrollerRef.current;
      if (!scroller) return;
      const next = Math.min(Math.max(active + direction, 0), reels.length - 1);
      scroller.scrollTo({ top: next * scroller.clientHeight, behavior: reducedMotion ? 'auto' : 'smooth' });
    },
    [active, reels.length, reducedMotion]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowDown') {
        e.preventDefault();
        step(1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        step(-1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, step]);

  // Whichever clip fills the screen is the one that plays.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const index = Number((entry.target as HTMLElement).dataset.index);
          if (entry.isIntersecting) setActive(index);
        }
      },
      { root: scroller, threshold: 0.7 }
    );
    for (const el of Array.from(scroller.querySelectorAll('[data-index]'))) observer.observe(el);
    return () => observer.disconnect();
  }, [reels]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const videos = Array.from(scroller.querySelectorAll('video'));
    videos.forEach((el, i) => {
      el.muted = muted;
      if (i === active && !paused) void el.play().catch(() => {});
      else el.pause();
      if (i !== active) el.currentTime = 0;
    });
  }, [active, muted, paused]);

  // A new clip always starts playing.
  useEffect(() => setPaused(false), [active]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Customer and workshop videos"
      className={`fixed inset-0 z-[80] bg-black overflow-hidden ${closing ? 'reel-close' : 'reel-pop'}`}
      style={origin ? { transformOrigin: `${origin.x}px ${origin.y}px` } : undefined}
    >
      <div ref={scrollerRef} className="h-full w-full overflow-y-auto snap-y snap-mandatory overscroll-contain scroll-smooth">
        {reels.map((reel, index) => (
          <div
            key={reel.id}
            data-index={index}
            className="relative h-[100dvh] w-full snap-start snap-always flex items-center justify-center"
          >
            <div className="relative h-full max-h-[100dvh] aspect-[9/16] max-w-full bg-black">
              <video
                src={reel.src}
                poster={reel.poster ?? undefined}
                loop
                playsInline
                preload={Math.abs(index - active) <= 1 ? 'auto' : 'none'}
                aria-label={reel.caption || KIND_LABEL[reel.kind]}
                className="h-full w-full object-contain"
              />
              <button
                type="button"
                onClick={() => setPaused((p) => !p)}
                aria-label={index === active && !paused ? 'Pause video' : 'Play video'}
                className="absolute inset-0 flex items-center justify-center text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
              >
                {index === active && paused && (
                  <span className="h-16 w-16 rounded-full bg-black/55 flex items-center justify-center pl-1">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86A1 1 0 0 0 8 5.14z" />
                    </svg>
                  </span>
                )}
              </button>
              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-4 pt-16 pb-6 text-paper">
                <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-gold">{KIND_LABEL[reel.kind]}</p>
                {reel.caption && <p className="mt-1.5 text-[15px] leading-snug">{reel.caption}</p>}
                {reel.productSlug && (
                  <Link
                    href={`/product/${reel.productSlug}`}
                    onClick={onClose}
                    className="pointer-events-auto mt-3 inline-flex h-10 items-center rounded-btn bg-gold px-4 text-[13px] font-semibold text-ink hover:bg-gold-deep transition-colors"
                  >
                    View this frame
                  </Link>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between p-3 sm:p-4">
        <span className="rounded-full bg-black/55 px-3 py-1.5 text-[12px] font-medium text-paper tabular-nums">
          {active + 1} / {reels.length}
        </span>
        <div className="pointer-events-auto flex gap-2">
          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            aria-pressed={!muted}
            aria-label={muted ? 'Turn sound on' : 'Turn sound off'}
            className="h-10 w-10 rounded-full bg-black/55 text-paper flex items-center justify-center hover:bg-black/75 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M11 5L6 9H3v6h3l5 4V5z" />
              {muted ? <path d="M22 9l-6 6M16 9l6 6" /> : <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />}
            </svg>
          </button>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close videos"
            className="h-10 w-10 rounded-full bg-black/55 text-paper flex items-center justify-center hover:bg-black/75 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {reels.length > 1 && (
        <div className="absolute right-4 top-1/2 hidden -translate-y-1/2 flex-col gap-2 md:flex">
          <button
            type="button"
            onClick={() => step(-1)}
            disabled={active === 0}
            aria-label="Previous video"
            className="h-10 w-10 rounded-full bg-paper/15 text-paper flex items-center justify-center hover:bg-paper/25 disabled:opacity-30 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 15l6-6 6 6" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => step(1)}
            disabled={active === reels.length - 1}
            aria-label="Next video"
            className="h-10 w-10 rounded-full bg-paper/15 text-paper flex items-center justify-center hover:bg-paper/25 disabled:opacity-30 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
