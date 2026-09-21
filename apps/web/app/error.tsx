'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto w-full max-w-shell px-4 md:px-6 py-20">
      <div className="mx-auto max-w-sm text-center">
        <h1 className="text-2xl font-semibold text-ink">Something broke on our side</h1>
        <p className="mt-2 text-sm text-ink/60">
          The page failed to load. Trying again usually works — nothing in your cart was lost.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-full bg-gold text-ink px-5 py-2.5 text-sm font-semibold hover:bg-gold-deep transition-colors"
          >
            Try again
          </button>
          <Link
            href="/"
            className="rounded-full border border-line text-ink px-6 py-3 text-sm font-semibold hover:border-accent hover:text-accent transition-colors"
          >
            Go to the homepage
          </Link>
        </div>
        {error.digest && <p className="mt-6 text-2xs text-ink/40">Reference: {error.digest}</p>}
      </div>
    </div>
  );
}
