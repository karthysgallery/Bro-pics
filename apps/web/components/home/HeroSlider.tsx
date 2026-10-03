'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import type { HomepageSection } from '@bro-pics/shared';

const AUTOPLAY_MS = 6000;

/**
 * The three banners shot for this site, in order. A hero document keeps its
 * own artwork when an admin has uploaded one; the seeded `/placeholders/`
 * stand-ins are replaced by these, which is what makes the band look shot for
 * the shop rather than assembled from stock.
 */
const BANNERS = ['/banners/gallery-wall.png', '/banners/reading-corner.png', '/banners/fireside.png'];

/** What the hero promises, sitting under the headline. */
const FEATURES = [
  {
    label: 'Premium quality',
    icon: <path d="M12 3l2.4 5 5.6.8-4 3.9 1 5.5-5-2.6-5 2.6 1-5.5-4-3.9 5.6-.8L12 3z" />,
  },
  {
    label: 'Personalized designs',
    icon: (
      <path d="M12 20s-6.5-4-8.5-7.8C1.9 9.2 3.4 6.3 6.3 6.3c1.7 0 2.9.9 3.9 2.2 1-1.3 2.2-2.2 3.9-2.2 2.9 0 4.4 2.9 2.8 5.9C18.5 16 12 20 12 20z" />
    ),
  },
  {
    label: 'Perfect for gifting',
    icon: <path d="M3 9h18v11H3zM3 9l1.5-4h15L21 9M12 5v15" />,
  },
];

interface HeroSlide {
  id: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  image: string;
  mobileImage?: string;
  link: string;
  cta?: string;
}

interface HeroSliderProps {
  sections: HomepageSection[];
}

function toSlide(section: HomepageSection, index: number): HeroSlide {
  const hasOwnArt = Boolean(section.image) && !section.image.includes('/placeholders/');
  return {
    id: section.id,
    eyebrow: typeof section.config?.eyebrow === 'string' ? section.config.eyebrow : 'More than frames',
    title: section.title,
    subtitle: section.subtitle,
    image: hasOwnArt ? section.image : BANNERS[index % BANNERS.length],
    mobileImage: hasOwnArt && section.mobileImage ? section.mobileImage : undefined,
    link: section.link,
  };
}

/**
 * [FE-26] `HeroSlideSchema` (ABE-17) lets ONE hero_slider doc carry several
 * slides of its own — a concrete, admin-editable alternative to authoring
 * one doc per slide, which the write API already supports but nothing here
 * ever read. A doc with a non-empty `heroSlides` array expands into that
 * many slides instead of the one this doc itself would otherwise produce;
 * a doc with none keeps rendering as exactly one slide via `toSlide` above
 * — so every pre-existing seeded/authored hero_slider doc looks identical
 * to before this change.
 */
function sectionToSlides(section: HomepageSection, index: number): HeroSlide[] {
  if (section.heroSlides && section.heroSlides.length > 0) {
    return [...section.heroSlides]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((slide) => ({
        id: slide.id,
        eyebrow: slide.eyebrow ?? 'More than frames',
        title: slide.title,
        subtitle: slide.subtitle ?? '',
        image: slide.image,
        mobileImage: slide.mobileImage || undefined,
        link: slide.ctaLink ?? section.link,
        cta: slide.ctaLabel,
      }));
  }
  return [toSlide(section, index)];
}

/**
 * The homepage's opening statement: one wide banner at a time, advancing on a
 * timer and wrapping around at both ends. Slides cross-fade rather than
 * sliding along a track — a track has to visibly rewind at the last banner,
 * and a fade loops without ever showing that seam.
 */
export function HeroSlider({ sections }: HeroSliderProps) {
  const slides = sections.flatMap((section, index) => sectionToSlides(section, index));

  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const isMultiSlide = slides.length > 1;

  useEffect(() => {
    if (!isMultiSlide || isPaused) return;
    // Someone who has asked for reduced motion gets the first banner and the
    // controls, not a band that keeps changing under them.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const id = setInterval(() => {
      setActiveIndex((i) => (i + 1) % slides.length);
    }, AUTOPLAY_MS);
    return () => clearInterval(id);
  }, [isMultiSlide, isPaused, slides.length]);

  if (slides.length === 0) return null;

  const active = slides[Math.min(activeIndex, slides.length - 1)];

  const goTo = (index: number) => setActiveIndex(((index % slides.length) + slides.length) % slides.length);

  const handleTouchStart = (event: React.TouchEvent) => {
    touchStartX.current = event.touches[0].clientX;
  };

  const handleTouchEnd = (event: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const deltaX = event.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    const SWIPE_THRESHOLD = 40;
    if (deltaX > SWIPE_THRESHOLD) goTo(activeIndex - 1);
    else if (deltaX < -SWIPE_THRESHOLD) goTo(activeIndex + 1);
  };

  return (
    <section className="mx-auto w-full max-w-shell px-4 md:px-6 pt-6 md:pt-10">
      {/* 2-Column Split Hero Layout matching Figma */}
      <div
        className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center"
        aria-roledescription="carousel"
        aria-label="Featured collections"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        onFocusCapture={() => setIsPaused(true)}
        onBlurCapture={() => setIsPaused(false)}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Left Column: Typography, CTAs, Social Proof */}
        <div className="lg:col-span-5 flex flex-col justify-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-ink/60">
            {active.eyebrow || 'YOUR LIFE, IN FRAME.'}
          </p>

          <h1 className="mt-4 font-display text-4xl sm:text-5xl lg:text-[3.25rem] font-bold leading-[1.08] text-ink tracking-tight">
            {active.title || 'Some moments deserve a wall.'}
          </h1>

          <p className="mt-4 text-base text-ink/70 leading-relaxed max-w-md">
            {active.subtitle ||
              'Turn the photos you love into beautifully crafted frames. Made by us. Made personal by you.'}
          </p>

          {/* Dual Action Buttons */}
          <div className="mt-7 flex flex-col sm:flex-row sm:items-center gap-3">
            <Link
              href={active.link || '/category'}
              className="rounded-full bg-gold text-ink px-7 py-3 text-sm font-semibold hover:bg-gold-deep transition-all shadow-sm active:scale-95 text-center"
            >
              {active.cta ?? 'Find your frame'}
            </Link>
            <Link
              href="/how-it-works"
              className="rounded-full border border-line bg-paper text-ink px-6 py-3 text-sm font-medium hover:border-ink hover:text-ink transition-all text-center"
            >
              See how it works
            </Link>
          </div>

          {/* Pricing & Guarantee Meta */}
          <p className="mt-5 text-xs text-ink/60 font-medium">
            From ₹399 · Printed, framed & delivered
          </p>

          {/* Star Rating Social Proof */}
          <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-ink">
            <span className="flex text-[#FCA311]">★★★★★</span>
            <span>4.9/5 from 320 happy homes</span>
          </div>
        </div>

        {/* Right Column: Large Lifestyle Mockup with Floating Product Badge */}
        <div className="lg:col-span-7 relative">
          <div className="relative aspect-[4/3] sm:aspect-[16/11] rounded-3xl overflow-hidden bg-tint shadow-lg border border-line/40">
            {slides.map((slide, index) => (
              <div
                key={slide.id}
                role="group"
                aria-roledescription="slide"
                aria-label={`${index + 1} of ${slides.length}`}
                aria-hidden={index !== activeIndex}
                className={`absolute inset-0 transition-opacity duration-700 ${
                  index === activeIndex ? 'opacity-100' : 'opacity-0'
                }`}
              >
                {slide.mobileImage && (
                  <Image
                    src={slide.mobileImage}
                    alt=""
                    fill
                    priority={index === 0}
                    sizes="100vw"
                    className="object-cover md:hidden"
                  />
                )}
                <Image
                  src={slide.image}
                  alt={slide.title}
                  fill
                  priority={index === 0}
                  sizes="(max-width: 1280px) 100vw, 750px"
                  className={`object-cover ${slide.mobileImage ? 'hidden md:block' : ''}`}
                />
              </div>
            ))}

            {/* Floating Glassmorphic Badge matching Figma */}
            <div className="absolute bottom-3 left-3 sm:bottom-5 sm:left-5 z-20 max-w-[calc(100%-80px)] sm:max-w-none rounded-2xl bg-paper/95 backdrop-blur-md px-3 py-2 sm:px-4 sm:py-2.5 shadow-md border border-line/50">
              <p className="text-xs font-bold text-ink leading-tight truncate">Real wood. Real memories.</p>
              <p className="text-[11px] text-ink/65 mt-0.5 truncate">The Classic Frame · From ₹1,499</p>
            </div>

            {/* Carousel navigation controls if multi-slide */}
            {isMultiSlide && (
              <div className="absolute bottom-3 right-3 sm:bottom-5 sm:right-5 z-20 flex items-center gap-1.5">
                {slides.map((slide, index) => (
                  <button
                    key={slide.id}
                    type="button"
                    aria-label={`Go to slide ${index + 1}`}
                    aria-current={index === activeIndex}
                    onClick={() => goTo(index)}
                    className={`h-1.5 rounded-full transition-all ${
                      index === activeIndex ? 'w-6 bg-paper' : 'w-2.5 bg-paper/50 hover:bg-paper/80'
                    }`}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Trust Bar (4-Item Responsive Strip below Hero) */}
      <div className="mt-12 pt-8 border-t border-line/60 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3.5 sm:gap-6 text-xs text-ink/80">
        <div className="flex items-center gap-2.5">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="text-ink shrink-0" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="M21 15l-5-5L5 21" />
          </svg>
          <span className="font-medium">Archival-quality prints</span>
        </div>

        <div className="flex items-center gap-2.5">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="text-ink shrink-0" aria-hidden="true">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
          </svg>
          <span className="font-medium">Handcrafted in India</span>
        </div>

        <div className="flex items-center gap-2.5">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="text-ink shrink-0" aria-hidden="true">
            <path d="M1 3h15v13H1zM16 8h4l3 3v5h-7z" />
            <circle cx="5.5" cy="18.5" r="2.5" />
            <circle cx="18.5" cy="18.5" r="2.5" />
          </svg>
          <span className="font-medium">Safe, tracked delivery</span>
        </div>

        <div className="flex items-center gap-2.5">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="text-ink shrink-0" aria-hidden="true">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <path d="M9 12l2 2 4-4" />
          </svg>
          <span className="font-medium">Happiness guaranteed</span>
        </div>
      </div>
    </section>
  );
}
