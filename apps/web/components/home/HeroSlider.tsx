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
    <section className="mx-auto w-full max-w-shell px-4 md:px-6 pt-5">
      <div
        className="group relative rounded-3xl overflow-hidden bg-tint"
        aria-roledescription="carousel"
        aria-label="Featured collections"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        onFocusCapture={() => setIsPaused(true)}
        onBlurCapture={() => setIsPaused(false)}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
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
            {/* [FE-26] Art-directed mobile crop when the doc/slide has its
                own — a wide banner shot for desktop often loses its focal
                point when simply squeezed narrower on a phone. Falls back
                to the one image at every width when no mobile-specific art
                exists. */}
            {slide.mobileImage && (
              <Image
                src={slide.mobileImage}
                alt=""
                fill
                priority={index === 0}
                sizes="100vw"
                className="object-cover object-right md:hidden"
              />
            )}
            <Image
              src={slide.image}
              alt=""
              fill
              priority={index === 0}
              sizes="(max-width: 1280px) 100vw, 1280px"
              className={`object-cover object-right ${slide.mobileImage ? 'hidden md:block' : ''}`}
            />
            {/* Two scrims, because the text sits in different places at the
                two sizes. On a phone the copy is over the middle of the
                photo, so it needs a flat wash; from md the copy has its own
                left column and the gradient can release the artwork by ~70%,
                keeping the golden light that makes these banners worth
                using. Stops are explicit rather than Tailwind's default
                three, which faded out far too early to read against. */}
            <div className="absolute inset-0 md:hidden" style={{ backgroundColor: 'rgba(250,248,244,0.9)' }} />
            <div
              className="absolute inset-0 hidden md:block"
              style={{
                backgroundImage:
                  'linear-gradient(90deg, #FAF8F4 0%, #FAF8F4 20%, rgba(250,248,244,0.94) 34%, rgba(250,248,244,0.72) 46%, rgba(250,248,244,0.3) 57%, rgba(250,248,244,0) 66%)',
              }}
            />
          </div>
        ))}

        <div className="relative z-10 flex items-center min-h-[400px] sm:min-h-[420px] lg:min-h-[440px]">
          <div className="w-full md:w-[62%] lg:w-[54%] px-6 sm:px-10 md:pl-20 lg:pl-24 py-10 md:py-12">
            <p className="flex items-center gap-3 text-[10px] uppercase tracking-[0.3em] text-accent">
              {active.eyebrow}
              <span className="h-px w-10 bg-gold" aria-hidden="true" />
            </p>

            {/* The heading element stays put across slides so switching
                banners never rewrites the document outline. */}
            <h1 className="mt-4 font-display text-4xl sm:text-5xl lg:text-[3.4rem] font-bold leading-[1.05] text-ink">
              {active.title}
            </h1>

            {active.subtitle && <p className="mt-4 max-w-md text-base text-ink/70">{active.subtitle}</p>}

            <Link
              href={active.link || '/category'}
              className="group/cta mt-7 inline-flex items-center gap-2 rounded-full bg-gold text-ink pl-6 pr-5 py-3 text-sm font-semibold hover:bg-gold-deep transition-colors"
            >
              {active.cta ?? 'Shop now'}
              <span
                className="grid place-items-center w-6 h-6 rounded-full bg-ink/10 transition-transform group-hover/cta:translate-x-0.5"
                aria-hidden="true"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </span>
            </Link>

            <ul className="mt-9 flex flex-wrap gap-x-7 gap-y-3">
              {FEATURES.map((feature) => (
                <li key={feature.label} className="flex items-center gap-2 text-xs text-ink/70">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#14213D"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    {feature.icon}
                  </svg>
                  {feature.label}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* The frame. Drawn as an inset ring ABOVE the slides rather than as a
            border on the container: a container border sits behind the
            absolutely-positioned artwork, so it only showed where the scrim
            happened to be opaque and broke up across the photograph. */}
        <div
          className="pointer-events-none absolute inset-0 z-20 rounded-3xl ring-1 ring-inset ring-ink/10"
          aria-hidden="true"
        />

        {isMultiSlide && (
          <>
            <button
              type="button"
              aria-label="Previous slide"
              onClick={() => goTo(activeIndex - 1)}
              className="hidden md:flex absolute left-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-paper/90 text-ink items-center justify-center shadow-sm hover:bg-paper transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M15 6l-6 6 6 6" />
              </svg>
            </button>
            <button
              type="button"
              aria-label="Next slide"
              onClick={() => goTo(activeIndex + 1)}
              className="hidden md:flex absolute right-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-paper/90 text-ink items-center justify-center shadow-sm hover:bg-paper transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>

            {/* Dashes rather than dots: they read as chapters of one banner
                and sit quietly in the corner of the artwork. */}
            <div className="absolute bottom-5 right-6 z-20 flex items-center gap-1.5">
              {slides.map((slide, index) => (
                <button
                  key={slide.id}
                  type="button"
                  aria-label={`Go to slide ${index + 1}`}
                  aria-current={index === activeIndex}
                  onClick={() => goTo(index)}
                  className={`h-1 rounded-full transition-all ${
                    index === activeIndex ? 'w-8 bg-ink/70' : 'w-4 bg-ink/25 hover:bg-ink/40'
                  }`}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
