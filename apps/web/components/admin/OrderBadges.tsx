import { PAYMENT_LABELS, type PaymentState } from '../../lib/admin-orders-view';

const PAYMENT_STYLE: Record<PaymentState, string> = {
  paid: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  failed: 'bg-red-50 text-red-700 border-red-200',
  pending: 'bg-amber-50 text-amber-800 border-amber-200',
  refunded: 'bg-stone-100 text-stone-700 border-stone-200',
  unpaid: 'bg-stone-100 text-stone-600 border-stone-200',
};

const PAYMENT_ICON: Record<PaymentState, React.ReactNode> = {
  paid: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  failed: <path d="M7 7l10 10M17 7L7 17" />,
  pending: <><circle cx="12" cy="12" r="8" /><path d="M12 8v4l2.5 2" /></>,
  refunded: <path d="M9 7L5 11l4 4M5 11h9a5 5 0 010 10h-2" />,
  unpaid: <path d="M6 12h12" />,
};

/** Payment state as a compact pill: colour plus an icon and words, never colour alone. */
export function PaymentBadge({ state, size = 'md' }: { state: PaymentState; size?: 'sm' | 'md' }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border font-medium ${PAYMENT_STYLE[state]} ${size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-0.5 text-xs'}`}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {PAYMENT_ICON[state]}
      </svg>
      {PAYMENT_LABELS[state]}
    </span>
  );
}

/** A product picture that falls back to a neutral frame icon instead of a broken image. */
export function ProductThumb({ src, alt, size = 40 }: { src: string | null; alt: string; size?: number }) {
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-tint text-ink/35" style={{ width: size, height: size }}>
      <svg width={size * 0.45} height={size * 0.45} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="1.5" /><rect x="7" y="7" width="10" height="10" /></svg>
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
        />
      )}
    </span>
  );
}
