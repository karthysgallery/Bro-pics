'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface SignedOutNoticeProps {
  /** What the person came here to do, e.g. "see your orders". */
  action: string;
}

/**
 * The designed stand-in for every account page's signed-out state. It says
 * what is behind the wall and offers the way in, rather than the bare
 * "Please sign in" sentence these pages used to render. The sign-in link
 * carries the current page, so signing in returns the person to what they
 * were doing (checkout, an order) instead of dropping them on /account.
 */
export function SignedOutNotice({ action }: SignedOutNoticeProps) {
  const pathname = usePathname();
  const signInHref = pathname && pathname !== '/signin' ? `/signin?redirect=${encodeURIComponent(pathname)}` : '/signin';

  return (
    <div className="mx-auto w-full max-w-shell px-4 md:px-6 py-16">
      <div className="mx-auto max-w-sm text-center">
        <h1 className="text-xl font-semibold text-ink">Sign in to {action}</h1>
        <p className="mt-2 text-sm text-ink/60">
          Sign in with your mobile number to keep your orders and addresses safe.
        </p>
        <Link
          href={signInHref}
          className="inline-block mt-5 rounded-full bg-gold text-ink px-5 py-2.5 text-sm font-semibold hover:bg-gold-deep transition-colors"
        >
          Sign in
        </Link>
        <p className="mt-4 text-sm text-ink/50">
          Or{' '}
          <Link href="/category" className="text-accent hover:text-accent-dark">
            keep browsing frames
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
