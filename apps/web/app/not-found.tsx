import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto w-full max-w-shell px-4 md:px-6 py-8 md:py-16">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="text-xs text-ink/50 mb-8">
        <Link href="/" className="hover:text-ink">Home</Link>
        {' / '}
        <span className="text-ink font-medium">404 · Frame not found</span>
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
        {/* Left Column: Text & Actions */}
        <div className="lg:col-span-6 space-y-6">
          <span className="inline-block text-2xs font-semibold uppercase tracking-wider text-ink/60">
            404 / A LITTLE OUT OF FRAME
          </span>
          <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-ink leading-tight">
            This page isn&rsquo;t on our wall.
          </h1>
          <p className="text-sm sm:text-base text-ink/70 leading-relaxed max-w-md">
            The frame you&rsquo;re looking for may have moved, or the address might not be quite right. Your next favourite is still here.
          </p>

          <div className="flex flex-wrap items-center gap-4 pt-2">
            <Link
              href="/category"
              className="rounded-full bg-gold hover:bg-gold-deep text-ink px-6 py-3 text-sm font-semibold transition-colors shadow-sm"
            >
              Explore frames
            </Link>
            <Link
              href="/"
              className="rounded-full border border-line bg-surface hover:bg-tint/40 text-ink px-6 py-3 text-sm font-semibold transition-colors"
            >
              Back to home
            </Link>
          </div>

          <p className="text-xs text-ink/50 pt-4">
            Need a hand?{' '}
            <a href="mailto:hello@karthysgallery.in" className="text-ink underline hover:text-accent">
              hello@karthysgallery.in
            </a>
          </p>
        </div>

        {/* Right Column: Framed Photo Visual */}
        <div className="lg:col-span-6 flex justify-center">
          <div className="relative w-full max-w-md rounded-3xl overflow-hidden shadow-2xl border border-line bg-field p-8 flex items-center justify-center">
            <div className="relative bg-ink p-4 rounded-xl shadow-lg border border-line max-w-xs w-full aspect-[4/5] flex flex-col items-center justify-center bg-[#2B231D]">
              <div className="w-full h-full bg-surface p-4 flex flex-col items-center justify-center shadow-inner">
                <div className="w-full flex-1 bg-[#F5EBE1] rounded flex items-center justify-center relative overflow-hidden">
                  <span className="font-display text-2xl sm:text-3xl font-serif italic text-ink/30">KarthysGallery</span>
                </div>
                <p className="text-2xs font-serif text-ink/60 mt-3 italic text-center">A little out of frame</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
