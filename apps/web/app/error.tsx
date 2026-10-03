'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto w-full max-w-shell px-4 md:px-6 py-8 md:py-16">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="text-xs text-ink/50 mb-8">
        <Link href="/" className="hover:text-ink">Home</Link>
        {' / '}
        <span className="text-ink font-medium">500 · Temporary error</span>
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
        {/* Left Column: Error details and actions */}
        <div className="lg:col-span-7 space-y-6">
          <span className="inline-block rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-2xs font-semibold text-accent">
            500 · Temporary interruption
          </span>
          <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-ink leading-tight">
            A small pause in the picture.
          </h1>
          <p className="text-sm sm:text-base text-ink/70 leading-relaxed max-w-lg">
            Something went wrong on our side. Your saved photos, designs and orders are safe. Please give us a moment, then try again.
          </p>

          <div className="flex flex-wrap items-center gap-4 pt-2">
            <button
              type="button"
              onClick={reset}
              className="rounded-full bg-gold hover:bg-gold-deep text-ink px-6 py-3 text-sm font-semibold transition-colors shadow-sm"
            >
              Try again
            </button>
            <Link
              href="/"
              className="rounded-full border border-line bg-surface hover:bg-tint/40 text-ink px-6 py-3 text-sm font-semibold transition-colors"
            >
              Go to home
            </Link>
          </div>
        </div>

        {/* Right Column: Reassurance Card */}
        <div className="lg:col-span-5">
          <div className="rounded-3xl border border-line bg-surface p-6 sm:p-8 shadow-sm space-y-4">
            <h2 className="font-display text-base font-bold text-ink">Your memories are safe</h2>
            <p className="text-xs text-ink/70 leading-relaxed">
              No need to upload your photos again.
            </p>
            <p className="text-xs text-ink/70 leading-relaxed">
              Already paid? Check your email before retrying payment.
            </p>
            <p className="text-2xs text-ink/50 pt-2 border-t border-line">
              If this keeps happening, email{' '}
              <a href="mailto:hello@bropics.in" className="text-ink underline">
                hello@bropics.in
              </a>{' '}
              with reference {error.digest ? `BP-ERR-${error.digest}` : 'BP-ERR-021026'}.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
