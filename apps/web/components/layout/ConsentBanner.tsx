'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getConsentStatus, setConsentStatus } from '../../lib/consent';

/**
 * [FE-40] Shown once, until the visitor accepts or declines — never
 * again after that, in either case (re-asking on every visit would be
 * exactly the dark pattern a consent banner exists to avoid). No
 * analytics call is wired up yet (see consent.ts's own doc comment for
 * why), so declining changes nothing observable today; it still records
 * a real choice `hasAnalyticsConsent()` can check the moment tracking
 * code exists.
 */
export function ConsentBanner() {
  const [status, setStatus] = useState<'accepted' | 'declined' | null>('accepted');

  useEffect(() => {
    setStatus(getConsentStatus());
  }, []);

  if (status !== null) return null;

  const choose = (next: 'accepted' | 'declined') => {
    setConsentStatus(next);
    setStatus(next);
  };

  return (
    <div
      role="region"
      aria-label="Cookie consent"
      className="fixed inset-x-0 bottom-0 z-50 bg-ink text-paper px-4 py-4 md:px-6 flex flex-col sm:flex-row items-center gap-3 justify-between"
    >
      <p className="text-sm text-paper/85">
        We use cookies to keep your cart and preferences working, and — only with your consent — to understand
        how the site is used. See our <Link href="/privacy" className="underline hover:text-gold">privacy policy</Link>.
      </p>
      <div className="flex gap-2 shrink-0">
        <button
          type="button"
          onClick={() => choose('declined')}
          className="rounded-full border border-paper/30 text-paper px-4 py-2 text-sm font-semibold hover:border-paper/60 transition-colors"
        >
          Decline
        </button>
        <button
          type="button"
          onClick={() => choose('accepted')}
          className="rounded-full bg-gold text-ink px-4 py-2 text-sm font-semibold hover:bg-gold-deep transition-colors"
        >
          Accept
        </button>
      </div>
    </div>
  );
}
