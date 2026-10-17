import Link from 'next/link';

/** Shipping used to be set here as "free above an amount + a flat rate". It is now set per state in Settings. */
export default function ShippingRatesPage() {
  return (
    <div className="p-6 md:p-8 max-w-3xl mx-auto space-y-4">
      <h1 className="text-xl md:text-2xl font-display font-bold text-ink">Shipping rates have moved</h1>
      <p className="text-sm text-ink/70">
        Shipping is now priced state by state: free inside Tamil Nadu, and a charge you set for every other state or union territory. The old &ldquo;free above an amount&rdquo; and flat-rate figures no longer decide any price.
      </p>
      <Link href="/admin/settings" className="inline-block px-4 py-2 bg-gold hover:bg-gold-deep text-ink text-xs font-bold rounded-xl transition-colors">
        Open Settings &gt; Shipping
      </Link>
    </div>
  );
}
