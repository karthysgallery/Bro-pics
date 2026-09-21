import type { ReactNode } from 'react';

interface SectionProps {
  children: ReactNode;
  /**
   * The band behind the content. `tint` is the quiet warm break and `ink`
   * the loud one; a page should use at most one or two of either, or the
   * contrast stops being a contrast and becomes wallpaper.
   */
  tone?: 'field' | 'paper' | 'tint' | 'ink';
  /** Vertical rhythm. `tight` is for stacked rails, `normal` for standalone bands. */
  space?: 'tight' | 'normal';
  id?: string;
  className?: string;
}

const TONE_CLASS: Record<NonNullable<SectionProps['tone']>, string> = {
  field: '',
  paper: 'bg-paper',
  tint: 'bg-tint',
  ink: 'bg-ink text-paper',
};

/**
 * The page's one layout primitive: a full-width band whose content is held to
 * the 1280px shell. Every home/listing section goes through this so the
 * gutter, the vertical rhythm and the set of allowed band colours are each
 * defined in exactly one place. The default is transparent, letting the
 * body's field show through.
 */
export function Section({ children, tone = 'field', space = 'normal', id, className = '' }: SectionProps) {
  const pad = space === 'tight' ? 'py-7' : 'py-10 md:py-14';

  return (
    <section id={id} className={`${TONE_CLASS[tone]} ${pad} ${className}`}>
      <div className="mx-auto w-full max-w-shell px-4 md:px-6">{children}</div>
    </section>
  );
}
