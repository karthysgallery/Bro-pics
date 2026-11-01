'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { ThemeOffer } from '@bro-pics/shared';

interface OfferBannerProps {
  /** The offer running now (Admin > Website > Festival themes > offer); nothing is drawn without one. */
  offer: ThemeOffer | null;
  /** A short second line, e.g. the free-delivery promise from the shipping settings. */
  note?: string | null;
}

const Sparkle = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current">
    <path d="M12 2l1.8 6.9L21 12l-7.2 3.1L12 22l-1.8-6.9L3 12l7.2-3.1z" />
  </svg>
);

function endsLabel(endsOn: string): string {
  const d = new Date(`${endsOn}T12:00:00+05:30`);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' });
}

/**
 * One quiet, elegant offer band for the homepage: the running offer's discount, its code (copyable) and its last
 * day. It reads the offer from the active theme, so it disappears on its own when the offer ends, and is never
 * a hard-coded promise.
 */
export function OfferBanner({ offer, note }: OfferBannerProps) {
  const [copied, setCopied] = useState(false);
  if (!offer) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(offer.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section aria-label="Current offer" className="mx-auto w-full max-w-shell px-4 py-6 md:px-6 md:py-10">
      <div className="relative overflow-hidden rounded-card border border-gold/50 bg-tint px-5 py-8 text-center md:px-12 md:py-10">
        {/* Inner hairline, like a passe-partout. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-2 rounded-[4px] border border-gold/25" />
        <div className="relative flex items-center justify-center gap-3 text-gold-deep">
          <span className="h-px w-10 bg-gold/60 md:w-16" />
          <Sparkle />
          <span className="h-px w-10 bg-gold/60 md:w-16" />
        </div>
        <h2 className="relative mt-4 font-display text-[2rem] font-semibold leading-tight text-ink md:text-[2.75rem]">
          {offer.percentOff}% off every frame
        </h2>
        <p className="relative mt-2 text-sm text-ink/70 md:text-base">
          Until {endsLabel(offer.endsOn)}
          {note ? ` · ${note}` : ''}
        </p>
        <div className="relative mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <span className="inline-flex h-12 items-stretch overflow-hidden rounded-[6px] border border-dashed border-accent/50 bg-paper">
            <span className="flex flex-col justify-center px-4 text-left">
              <span className="text-[11px] text-ink/60">Use code at checkout</span>
              <span className="select-all font-semibold tracking-[0.14em] text-accent">{offer.code}</span>
            </span>
            <button
              type="button"
              onClick={copy}
              aria-label={copied ? `Code ${offer.code} copied` : `Copy code ${offer.code}`}
              className="border-l border-dashed border-accent/40 px-4 text-sm font-semibold text-accent transition-colors hover:bg-tint"
            >
              <span aria-live="polite">{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </span>
          <Link href="/category" className="inline-flex h-12 items-center rounded-full bg-ink px-7 text-sm font-semibold tracking-wide text-paper transition-colors hover:bg-ink/90">
            Shop the collection
          </Link>
        </div>
      </div>
    </section>
  );
}
