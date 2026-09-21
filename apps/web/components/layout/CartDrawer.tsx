'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useCart, type CartItem } from '../../lib/cart-context';
import { QuantityStepper } from '../ui/QuantityStepper';
import { formatPaise } from '../../lib/format-price';
import { addToWishlist } from '../../lib/wishlist';
import { useToast } from '../ui/Toast';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

interface VariantStock {
  stockStatus: string;
  isActive: boolean;
}

const STOCK_BADGE_LABEL: Record<string, string> = {
  out_of_stock: 'Out of stock',
  backorder: 'Backorder',
};

export function CartDrawer({ isOpen, onClose }: CartDrawerProps) {
  const { items, updateQuantity, removeItem, totalPaise } = useCart();
  const { showToast } = useToast();
  const [movingKey, setMovingKey] = useState<string | null>(null);
  const [stockByVariant, setStockByVariant] = useState<Map<string, VariantStock>>(new Map());

  // A cart line's own price/title snapshot can go stale after being added —
  // this surfaces a live stock check while browsing the cart, ahead of the
  // 409 checkout would otherwise return only after "Place order" is clicked.
  // Keyed on the joined variantId list (not `items` itself, a fresh array
  // reference on nearly every cart-context render) so this only re-fetches
  // when the actual set of distinct variants in the cart changes.
  const variantIdsKey = [...new Set(items.map((i) => i.variantId))].join(',');
  useEffect(() => {
    if (!isOpen || !variantIdsKey) return;
    let cancelled = false;
    Promise.all(
      variantIdsKey.split(',').map(async (variantId) => {
        try {
          const response = await fetch(`/api/variants/${variantId}/product`);
          if (!response.ok) return [variantId, null] as const;
          const data = await response.json();
          return [variantId, { stockStatus: data.stockStatus, isActive: data.isActive }] as const;
        } catch {
          return [variantId, null] as const;
        }
      })
    ).then((entries) => {
      if (cancelled) return;
      setStockByVariant(new Map(entries.filter((e): e is [string, VariantStock] => e[1] !== null)));
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, variantIdsKey]);

  if (!isOpen) return null;

  const handleMoveToWishlist = async (item: CartItem) => {
    const key = `${item.variantId}-${item.personalizationId}`;
    setMovingKey(key);
    try {
      // CartItem carries no productId (only variantId), so this resolves
      // it server-side via the one lookup that needs firebase-admin (see
      // that route's own comment) before it can add to the wishlist.
      const response = await fetch(`/api/variants/${item.variantId}/product`);
      if (!response.ok) {
        showToast('Could not move this item to your wishlist.', 'error');
        return;
      }
      const { productId } = await response.json();
      addToWishlist(productId);
      removeItem(item.variantId, item.personalizationId);
      showToast('Moved to wishlist', 'success');
    } finally {
      setMovingKey(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end" data-testid="cart-drawer">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div className="relative bg-paper w-full max-w-sm h-full flex flex-col">
        <div className="flex items-center justify-between px-4 h-14 border-b border-line shrink-0">
          <h2 className="text-base font-semibold text-ink">
            Your cart {items.length > 0 ? <span className="text-ink/50 font-normal">({items.length})</span> : null}
          </h2>
          <button aria-label="Close cart" onClick={onClose} className="text-ink/60 hover:text-ink text-lg leading-none">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4">
          {items.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm text-ink/60">Nothing here yet.</p>
              <a href="/category" className="mt-3 inline-block text-sm font-medium text-accent hover:text-accent-dark">
                Start shopping <span aria-hidden="true">&rsaquo;</span>
              </a>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {items.map((item) => {
                const stock = stockByVariant.get(item.variantId);
                const stockBadge = stock && (stock.isActive === false ? 'Discontinued' : STOCK_BADGE_LABEL[stock.stockStatus]);
                return (
                <li key={`${item.variantId}-${item.personalizationId}`} className="flex gap-3 py-4">
                  <div className="relative w-16 h-16 shrink-0 rounded-md bg-tint overflow-hidden">
                    {item.previewUrl && (
                      <Image src={item.previewUrl} alt={item.title} fill sizes="64px" className="object-cover" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-ink line-clamp-2">{item.title}</p>
                    {stockBadge && (
                      <span className="inline-block mt-1 text-2xs font-semibold px-2 py-0.5 rounded-full bg-alert/10 text-alert">
                        {stockBadge}
                      </span>
                    )}
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <QuantityStepper
                        value={item.qty}
                        onChange={(qty) => updateQuantity(item.variantId, item.personalizationId, qty)}
                        label={`Quantity for ${item.title}`}
                      />
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => handleMoveToWishlist(item)}
                          disabled={movingKey === `${item.variantId}-${item.personalizationId}`}
                          aria-label={`Move ${item.title} to wishlist`}
                          className="text-2xs text-ink/50 hover:text-accent underline underline-offset-2 disabled:opacity-50"
                        >
                          Move to wishlist
                        </button>
                        <button
                          onClick={() => removeItem(item.variantId, item.personalizationId)}
                          aria-label={`Remove ${item.title}`}
                          className="text-2xs text-ink/50 hover:text-alert underline underline-offset-2"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="border-t border-line p-4 shrink-0">
          <div className="flex items-center justify-between text-sm">
            <span className="text-ink/70">Subtotal</span>
            <span data-testid="cart-subtotal" className="text-base font-semibold text-ink">
              {formatPaise(totalPaise)}
            </span>
          </div>
          <p className="mt-1 text-2xs text-ink/50">Shipping and taxes calculated at checkout.</p>
          {items.length > 0 && (
            <a
              href="/checkout"
              className="mt-3 block rounded-full bg-gold text-ink px-4 py-3 text-center text-sm font-semibold hover:bg-gold-deep transition-colors"
            >
              Checkout
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
