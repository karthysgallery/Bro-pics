import type { ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'filled' | 'outline';
}

/**
 * Pill buttons, matching the softness of the cards and the hero CTA. The
 * primary is gold with ink on it — bright gold cannot carry white type, and
 * ink on gold is 8.8:1, so the loudest pairing is also the legible one.
 */
export function Button({ variant = 'filled', className = '', ...props }: ButtonProps) {
  const base =
    'rounded-full px-6 py-3 text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
  const styles =
    variant === 'filled'
      ? 'bg-gold text-ink hover:bg-gold-deep'
      : 'border border-line text-ink hover:border-gold hover:text-accent';

  return <button className={`${base} ${styles} ${className}`} {...props} />;
}
