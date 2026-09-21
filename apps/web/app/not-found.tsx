import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="mx-auto w-full max-w-shell px-4 md:px-6 py-20">
      <div className="mx-auto max-w-sm text-center">
        <p className="text-sm font-semibold text-accent">404</p>
        <h1 className="mt-1 text-2xl font-semibold text-ink">This page doesn&rsquo;t exist</h1>
        <p className="mt-2 text-sm text-ink/60">
          The link may be old, or the product may have been retired.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Link
            href="/"
            className="rounded-full bg-gold text-ink px-5 py-2.5 text-sm font-semibold hover:bg-gold-deep transition-colors"
          >
            Go to the homepage
          </Link>
          <Link
            href="/category"
            className="rounded-full border border-line text-ink px-6 py-3 text-sm font-semibold hover:border-accent hover:text-accent transition-colors"
          >
            Browse frames
          </Link>
        </div>
      </div>
    </div>
  );
}
