import type { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  /** Renders as an <a>/<Link>-friendly wrapper when the whole card is clickable. */
  as?: 'div' | 'li';
}

// The one card surface — `rounded-xl border border-line bg-paper p-4/p-5`
// was being re-typed independently on every list row (orders, addresses,
// reviews, product cards); this gives it one definition so a later spacing
// or radius tweak happens once, not on every page that has a "card".
export function Card({ children, className = '', as = 'div' }: CardProps) {
  const classes = `rounded-xl border border-line bg-paper p-4 ${className}`;
  if (as === 'li') return <li className={classes}>{children}</li>;
  return <div className={classes}>{children}</div>;
}
