'use client';

import { useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import type { CategorySlide } from '../../lib/home-category-slides';
import { Section } from '../ui/Section';
import { SectionHeader } from '../ui/SectionHeader';

/**
 * "Shop by category": eight picture slides in one row. Swipe on phones (about two and a half in view), four at a
 * time with arrows on larger screens.
 */
export function CategorySlider({ title, slides }: { title: string; slides: CategorySlide[] }) {
  const rail = useRef<HTMLUListElement>(null);
  if (slides.length === 0) return null;
  const step = (dir: -1 | 1) => {
    const el = rail.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.9, behavior: 'smooth' });
  };
  const arrow =
    'absolute top-[38%] z-10 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-paper/95 text-ink shadow-md ring-1 ring-line transition-colors hover:bg-paper md:flex';

  return (
    <Section>
      <SectionHeader title={title} subtitle="Find the perfect frame for every moment" href="/category" />
      <div className="relative">
        <button type="button" data-shape="circle" aria-label="Previous categories" onClick={() => step(-1)} className={`${arrow} -left-4`}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <ul ref={rail} className="rail -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:gap-5 md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden">
          {slides.map((s) => (
            <li key={s.title} className="w-[40%] shrink-0 snap-start sm:w-[30%] md:w-[calc((100%-3*1.25rem)/4)]">
              <Link href={s.href} className="group block overflow-hidden rounded-card bg-paper ring-1 ring-line/70 transition-shadow duration-300 hover:shadow-[0_16px_36px_-16px_rgb(78_57_32/0.4)]">
                <div className="relative aspect-[4/5] w-full overflow-hidden bg-tint">
                  <Image src={s.image} alt="" fill sizes="(max-width: 768px) 40vw, 25vw" className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]" />
                </div>
                <div className="border-t border-gold/40 px-2 py-3 text-center">
                  <p className="font-display text-[15px] font-semibold leading-tight text-ink sm:text-lg">{s.title}</p>
                  <p className="mt-1 truncate text-[10px] uppercase tracking-[0.14em] text-ink/55 sm:text-[11px]">{s.tagline}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
        <button type="button" data-shape="circle" aria-label="More categories" onClick={() => step(1)} className={`${arrow} -right-4`}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6" /></svg>
        </button>
      </div>
    </Section>
  );
}
