import Link from 'next/link';

interface SectionHeaderProps {
  title: string;
  /** Optional one-line context under the title. */
  subtitle?: string;
  /** Renders the trailing "View all" link when a destination is given. */
  href?: string;
  /** Overrides the link text, e.g. "See all frames". */
  linkLabel?: string;
  /** Set to `dark` inside an ink `Section`, where accent link text would vanish. */
  tone?: 'light' | 'dark';
}

/**
 * Heading + "View all" pair that opens every catalogue band. Keeping it as one
 * component is what makes the repeated rhythm read as a system rather than as
 * five headings that happen to look alike.
 */
export function SectionHeader({ title, subtitle, href, linkLabel = 'View all', tone = 'light' }: SectionHeaderProps) {
  const linkClass = tone === 'dark' ? 'text-gold hover:text-paper' : 'text-accent hover:text-accent-dark';

  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        {/* Colour is inherited so the same header works on field, tint and
            ink bands without each caller restating it. */}
        <h2 className="font-display text-2xl md:text-3xl font-bold tracking-tight">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm opacity-60">{subtitle}</p> : null}
      </div>
      {href ? (
        <Link href={href} className={`group shrink-0 inline-flex items-center gap-1.5 text-sm font-medium whitespace-nowrap ${linkClass}`}>
          {linkLabel}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="transition-transform group-hover:translate-x-0.5" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </Link>
      ) : null}
    </div>
  );
}
