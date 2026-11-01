import Link from 'next/link';

interface SectionHeaderProps {
  title: string;
  /** Optional one-line context under the title. */
  subtitle?: string;
  /** Small line above the title, e.g. "Explore". */
  eyebrow?: string;
  /** Renders the trailing "View all" link when a destination is given. */
  href?: string;
  /** Overrides the link text, e.g. "See all frames". */
  linkLabel?: string;
  /** Set to `dark` inside an ink `Section`, where accent link text would vanish. */
  tone?: 'light' | 'dark';
}

/** Thin gold rule with a small four-point sparkle: the shop's one ornament, used under section titles. */
export function Ornament({ className = '' }: { className?: string }) {
  return (
    <div aria-hidden="true" className={`flex items-center justify-center gap-3 text-gold ${className}`}>
      <span className="h-px w-12 bg-current opacity-70 md:w-16" />
      <svg viewBox="0 0 24 24" className="h-3 w-3 fill-current">
        <path d="M12 2l1.8 6.9L21 12l-7.2 3.1L12 22l-1.8-6.9L3 12l7.2-3.1z" />
      </svg>
      <span className="h-px w-12 bg-current opacity-70 md:w-16" />
    </div>
  );
}

/**
 * The heading that opens every catalogue band: a centred serif title over the gold ornament, with the "View all"
 * link set quietly beneath. One component, so the repeated rhythm reads as a system.
 */
export function SectionHeader({ title, subtitle, eyebrow, href, linkLabel = 'View all', tone = 'light' }: SectionHeaderProps) {
  const linkClass = tone === 'dark' ? 'text-gold hover:text-paper' : 'text-accent hover:text-accent-dark';

  return (
    <div className="mb-8 flex flex-col items-center text-center md:mb-10">
      {eyebrow ? <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.28em] text-accent">{eyebrow}</p> : null}
      {/* Colour is inherited so the same header works on field, tint and ink bands without each caller restating it. */}
      <h2 className="font-display text-[2rem] font-semibold leading-[1.1] md:text-[2.6rem]">{title}</h2>
      <Ornament className="mt-4" />
      {subtitle ? <p className="mt-4 max-w-xl text-[15px] leading-relaxed opacity-70">{subtitle}</p> : null}
      {href ? (
        <Link
          href={href}
          className={`mt-4 inline-flex items-center gap-1.5 border-b border-gold/60 pb-0.5 text-[13px] font-semibold uppercase tracking-[0.16em] ${linkClass}`}
        >
          {linkLabel}
        </Link>
      ) : null}
    </div>
  );
}
