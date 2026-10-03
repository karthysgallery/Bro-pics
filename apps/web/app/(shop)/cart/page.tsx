'use client';

import { useContext, useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useCart, type CartItem } from '../../../lib/cart-context';
import { QuantityStepper } from '../../../components/ui/QuantityStepper';
import { formatPaise } from '../../../lib/format-price';
import { resolveMediaUrl, getIdTokenSafe } from '../../../lib/resolve-media-url';
import { AuthContext } from '../../../lib/auth-context';
import { getShippingSettingsClient } from '../../../lib/shipping-settings-client';

export default function CartPage() {
  const { items, updateQuantity, removeItem, totalPaise } = useCart();
  const auth = useContext(AuthContext);
  const [previewUrls, setPreviewUrls] = useState<Map<string, string>>(new Map());
  const [freeShippingThreshold, setFreeShippingThreshold] = useState<number | null>(null);
  const [promoCode, setPromoCode] = useState('');

  useEffect(() => {
    getShippingSettingsClient().then((settings) => setFreeShippingThreshold(settings.freeShippingThreshold));
  }, []);

  const previewPathsKey = [...new Set(items.map((i) => i.previewPath).filter((p): p is string => !!p))].join(',');
  useEffect(() => {
    if (!previewPathsKey) return;
    let cancelled = false;
    (async () => {
      const idToken = await getIdTokenSafe(auth?.user);
      const paths = previewPathsKey.split(',');
      const entries = await Promise.all(paths.map(async (path) => [path, await resolveMediaUrl(path, idToken)] as const));
      if (cancelled) return;
      setPreviewUrls(new Map(entries.filter((e): e is [string, string] => e[1] !== null)));
    })();
    return () => {
      cancelled = true;
    };
  }, [previewPathsKey, auth?.user]);

  const itemCount = items.reduce((sum, item) => sum + item.qty, 0);
  const qualifiesForFreeShipping = freeShippingThreshold !== null && totalPaise >= freeShippingThreshold;
  const gstPaise = Math.round((totalPaise * 18) / 118);

  return (
    <div className="mx-auto w-full max-w-shell px-4 md:px-6 py-6 md:py-8">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="text-xs text-ink/50 mb-6">
        <Link href="/" className="hover:text-ink">Home</Link>
        {' / '}
        <span className="text-ink font-medium">Cart</span>
      </nav>

      <div className="mb-8">
        <h1 className="font-display text-3xl md:text-4xl font-bold text-ink mb-2">
          Your bag {itemCount > 0 ? `(${itemCount})` : ''}
        </h1>
        <p className="text-sm text-ink/70">
          {itemCount === 0
            ? 'Your bag is empty.'
            : itemCount === 1
            ? 'One memory, ready for a place on your wall.'
            : `${itemCount} memories, ready for a place on your wall.`}
        </p>
      </div>

      {items.length === 0 ? (
        <div className="py-16 text-center bg-field rounded-3xl border border-line p-8">
          <p className="text-base text-ink/70 mb-4">You haven&apos;t added any frames to your bag yet.</p>
          <Link
            href="/category"
            className="inline-flex items-center justify-center px-8 py-3 rounded-full bg-gold hover:bg-gold-deep text-ink font-semibold text-sm transition-colors"
          >
            Explore frames
          </Link>
        </div>
      ) : (
        <div className="grid lg:grid-cols-[1fr_380px] gap-8 items-start">
          {/* Items List */}
          <div className="space-y-6">
            <div className="divide-y divide-line">
              {items.map((item) => (
                <div key={`${item.variantId}-${item.personalizationId}`} className="py-6 flex flex-col sm:flex-row gap-5 items-start">
                  <div className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-2xl bg-tint overflow-hidden border border-line flex-shrink-0">
                    {item.previewPath && previewUrls.get(item.previewPath) ? (
                      <Image src={previewUrls.get(item.previewPath)!} alt={item.title} fill sizes="128px" className="object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs text-ink/40">Frame</div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0 flex flex-col justify-between self-stretch">
                    <div>
                      <div className="flex items-start justify-between gap-4">
                        <h2 className="font-display text-lg font-bold text-ink">{item.title}</h2>
                        <span className="font-display text-lg font-bold text-ink">
                          {formatPaise(item.unitPriceSnapshot * item.qty)}
                        </span>
                      </div>
                      <p className="text-xs text-ink/60 mt-1">Personalised photo print</p>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 pt-2">
                      <QuantityStepper
                        value={item.qty}
                        onChange={(qty) => updateQuantity(item.variantId, item.personalizationId, qty)}
                        label={`Quantity for ${item.title}`}
                      />
                      <div className="flex items-center gap-4 text-xs font-medium text-ink/60">
                        {item.productSlug && (
                          <Link
                            href={`/product/${item.productSlug}?edit=${item.personalizationId}&variantId=${item.variantId}`}
                            className="hover:text-ink transition-colors"
                          >
                            Edit photo
                          </Link>
                        )}
                        <span>·</span>
                        <button
                          type="button"
                          onClick={() => removeItem(item.variantId, item.personalizationId)}
                          className="hover:text-alert transition-colors"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {qualifiesForFreeShipping && (
              <div className="flex items-center gap-2 text-xs font-semibold text-accent py-3">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>Your order qualifies for free shipping.</span>
              </div>
            )}

            <div className="pt-2">
              <Link
                href="/category"
                className="inline-flex items-center justify-center px-6 py-2.5 rounded-full border border-line bg-paper hover:bg-tint text-ink text-xs font-semibold transition-colors"
              >
                Continue exploring
              </Link>
            </div>

            {/* Reassurance note */}
            <div className="mt-10 p-6 rounded-2xl bg-tint/60 border border-line">
              <h3 className="font-display text-base font-bold text-ink mb-1">Every frame includes a little care.</h3>
              <p className="text-xs text-ink/70 leading-relaxed">
                We review your photos for print quality, hand-finish your frames and pack them securely. Expected dispatch: 3-5 working days.
              </p>
            </div>
          </div>

          {/* Order Summary Card */}
          <div className="rounded-3xl bg-paper border border-line p-6 lg:sticky lg:top-32 shadow-sm">
            <h2 className="font-display text-xl font-bold text-ink mb-4">Order summary</h2>

            <div className="space-y-2 mb-4 text-sm">
              {items.map((item) => (
                <div key={`summary-${item.variantId}-${item.personalizationId}`} className="flex justify-between text-xs text-ink/80">
                  <span className="truncate pr-2">{item.title} × {item.qty}</span>
                  <span className="font-semibold text-ink">{formatPaise(item.unitPriceSnapshot * item.qty)}</span>
                </div>
              ))}
            </div>

            {/* Discount Code Input */}
            <div className="my-4 pt-4 border-t border-line">
              <label htmlFor="promo" className="block text-2xs text-ink/60 mb-1 font-medium">Gift or discount code</label>
              <div className="flex gap-2">
                <input
                  id="promo"
                  type="text"
                  placeholder="Enter code"
                  value={promoCode}
                  onChange={(e) => setPromoCode(e.target.value)}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-line bg-field text-xs text-ink placeholder:text-ink/40 focus:outline-none focus:border-accent"
                />
              </div>
            </div>

            <div className="space-y-2 py-4 border-t border-line text-xs">
              <div className="flex justify-between text-ink/70">
                <span>Subtotal</span>
                <span className="font-medium text-ink">{formatPaise(totalPaise)}</span>
              </div>
              <div className="flex justify-between text-ink/70">
                <span>Shipping</span>
                <span className="font-medium text-ink">{qualifiesForFreeShipping ? 'Free' : 'Calculated at checkout'}</span>
              </div>
              <div className="flex justify-between text-ink/50 text-2xs">
                <span>Includes GST (18%)</span>
                <span>{formatPaise(gstPaise)}</span>
              </div>
            </div>

            <div className="flex justify-between items-baseline py-4 border-t border-line">
              <span className="font-display text-base font-bold text-ink">Total</span>
              <span className="font-display text-2xl font-bold text-ink">{formatPaise(totalPaise)}</span>
            </div>

            <Link
              href="/checkout"
              className="mt-2 block w-full py-3.5 rounded-full bg-gold hover:bg-gold-deep text-ink text-center font-semibold text-sm transition-all shadow-sm"
            >
              Proceed to checkout
            </Link>

            <p className="mt-4 text-center text-2xs text-ink/50">
              Secure payment · UPI, cards & net banking
            </p>
          </div>
        </div>
      )}

      {/* 4-Item Trust Bar */}
      <div className="mt-16 py-6 border-y border-line grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 text-ink/80 text-xs md:text-sm font-medium">
        <div className="flex items-center gap-2.5">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="text-ink flex-shrink-0">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="M21 15l-5-5L5 21" />
          </svg>
          <span>Archival-quality prints</span>
        </div>
        <div className="flex items-center gap-2.5">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="text-ink flex-shrink-0">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
          </svg>
          <span>Handcrafted in India</span>
        </div>
        <div className="flex items-center gap-2.5">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="text-ink flex-shrink-0">
            <rect x="1" y="3" width="15" height="13" rx="2" />
            <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
            <circle cx="5.5" cy="18.5" r="2.5" />
            <circle cx="18.5" cy="18.5" r="2.5" />
          </svg>
          <span>Safe, tracked delivery</span>
        </div>
        <div className="flex items-center gap-2.5">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="text-ink flex-shrink-0">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <path d="M9 12l2 2 4-4" />
          </svg>
          <span>Happiness guaranteed</span>
        </div>
      </div>
    </div>
  );
}
