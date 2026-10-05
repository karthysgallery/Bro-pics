'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import type { HomepageSection } from '@bro-pics/shared';

const AUTOPLAY_MS = 6000;

const BANNERS = ['/banners/gallery-wall.png', '/banners/reading-corner.png', '/banners/fireside.png'];

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
  /** When the trust reels have clips, the secondary CTA jumps to them. */
  hasTrustVideos?: boolean;
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
 * Full-bleed editorial hero with cross-fade slides.
 * Mobile-first: image fills top, copy below on small screens.
 * Desktop: 5-col copy / 7-col image split.
 */
export function HeroSlider({ sections, hasTrustVideos = false }: HeroSliderProps) {
  const slides = sections.flatMap((section, index) => sectionToSlides(section, index));

  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const isMultiSlide = slides.length > 1;

  if (slides.length === 0) return null;

  const active = slides[Math.min(activeIndex, slides.length - 1)];

  const goTo = (index: number) =>
    setActiveIndex(((index % slides.length) + slides.length) % slides.length);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (delta > 40) goTo(activeIndex - 1);
    else if (delta < -40) goTo(activeIndex + 1);
  };

  return (
    <section className="mx-auto w-full max-w-shell px-4 md:px-6 pt-6 md:pt-10">
      <div
        className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-12 items-center"
        aria-roledescription="carousel"
        aria-label="Featured collections"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        onFocusCapture={() => setIsPaused(true)}
        onBlurCapture={() => setIsPaused(false)}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* ── Left: Editorial copy ── */}
        <div className="lg:col-span-5 order-2 lg:order-1 flex flex-col justify-center">
          {/* Keyed on the slide so the copy re-enters with each change. */}
          <div key={active.id} className="hero-rise">
            <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-ink/50 mb-4">
              {active.eyebrow || 'Your life, in frame'}
            </p>

            <h1 className="font-display text-[2.5rem] sm:text-[3.25rem] lg:text-[3.75rem] font-bold leading-display tracking-tight text-ink text-balance">
              {active.title || 'Some moments deserve a wall.'}
            </h1>

            <p className="mt-5 text-base text-ink/65 leading-relaxed max-w-[460px]">
              {active.subtitle ||
                'Turn the photos you love into beautifully crafted frames. Made by us. Made personal by you.'}
            </p>
          </div>

          <div className="mt-8 flex flex-col sm:flex-row sm:items-center gap-3">
            <Link href={active.link || '/category'} className="btn-primary btn-press h-12 px-7 text-center">
              {active.cta ?? 'Find your frame'}
            </Link>
            {hasTrustVideos ? (
              <a href="#see-it-made" className="btn-secondary h-12 px-6 text-center">
                Watch it being made
              </a>
            ) : (
              <Link href="/how-it-works" className="btn-secondary h-12 px-6 text-center">
                See how it works
              </Link>
            )}
          </div>

          <ul className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-ink/60">
            <li className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-gold" aria-hidden="true" />
              Preview your photo in the frame before you pay
            </li>
            <li className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-gold" aria-hidden="true" />
              Made to order in India
            </li>
          </ul>
        </div>

        {/* ── Right: Hero image ── */}
        <div className="lg:col-span-7 order-1 lg:order-2">
          <div className="relative aspect-[4/3] sm:aspect-[16/11] rounded-card overflow-hidden bg-tint">
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
          </div>

          {/* Slide selector: each segment fills while its slide is showing,
              so the timing is visible and any slide is one tap away. */}
          {isMultiSlide && (
            <div className="mt-3 flex gap-2" role="group" aria-label="Choose a slide">
              {slides.map((slide, index) => {
                const isActive = index === activeIndex;
                return (
                  <button
                    key={slide.id}
                    type="button"
                    aria-label={`Show slide ${index + 1}: ${slide.title}`}
                    aria-current={isActive ? 'true' : undefined}
                    onClick={() => goTo(index)}
                    className="group flex-1 min-w-0 text-left py-2"
                  >
                    <span className="block h-[3px] rounded-full bg-ink/12 overflow-hidden">
                      <span
                        key={isActive ? `${slide.id}-${activeIndex}` : slide.id}
                        className={`block h-full rounded-full bg-ink ${isActive ? 'hero-progress' : 'w-0'}`}
                        onAnimationEnd={isActive ? () => goTo(activeIndex + 1) : undefined}
                        style={isActive ? { animationDuration: `${AUTOPLAY_MS}ms`, animationPlayState: isPaused ? 'paused' : 'running' } : undefined}
                      />
                    </span>
                    <span
                      className={`mt-2 hidden md:block truncate text-[12px] font-medium transition-colors ${
                        isActive ? 'text-ink' : 'text-ink/45 group-hover:text-ink/70'
                      }`}
                    >
                      {slide.title}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Trust bar ── */}
      <div className="mt-10 pt-7 border-t border-line/50 grid grid-cols-2 md:grid-cols-4 gap-4 text-[12px] text-ink/60">
        {[
          {
            label: 'Archival-quality prints',
            path: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></>,
          },
          {
            label: 'Handcrafted in India',
            path: <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />,
          },
          {
            label: 'Safe, tracked delivery',
            path: <><path d="M1 3h15v13H1zM16 8h4l3 3v5h-7z" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" /></>,
          },
          {
            label: 'Happiness guaranteed',
            path: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M9 12l2 2 4-4" /></>,
          },
        ].map(({ label, path }) => (
          <div key={label} className="flex items-center gap-2.5">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-ink/40 shrink-0" aria-hidden="true">
              {path}
            </svg>
            <span className="font-medium">{label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
