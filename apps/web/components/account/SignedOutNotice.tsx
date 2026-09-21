'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AccountModal } from '../layout/AccountModal';

interface SignedOutNoticeProps {
  /** What the person came here to do, e.g. "see your orders". */
  action: string;
}

/**
 * The designed stand-in for every account page's signed-out state. It says
 * what is behind the wall and offers the way in, rather than the bare
 * "Please sign in" sentence these pages used to render.
 */
export function SignedOutNotice({ action }: SignedOutNoticeProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="mx-auto w-full max-w-shell px-4 md:px-6 py-16">
      <div className="mx-auto max-w-sm text-center">
        <h1 className="text-xl font-semibold text-ink">Sign in to {action}</h1>
        <p className="mt-2 text-sm text-ink/60">
          We use your phone number — no password to remember.
        </p>
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="mt-5 rounded-full bg-gold text-ink px-5 py-2.5 text-sm font-semibold hover:bg-gold-deep transition-colors"
        >
          Sign in
        </button>
        <p className="mt-4 text-sm text-ink/50">
          Or{' '}
          <Link href="/category" className="text-accent hover:text-accent-dark">
            keep browsing frames
          </Link>
          .
        </p>
      </div>
      <AccountModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </div>
  );
}
