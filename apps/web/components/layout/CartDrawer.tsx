'use client';

import { useCart } from '../../lib/cart-context';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

function formatPaise(paise: number): string {
  return (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function CartDrawer({ isOpen, onClose }: CartDrawerProps) {
  const { items, updateQuantity, removeItem, totalPaise } = useCart();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" data-testid="cart-drawer">
      <div className="absolute inset-0 bg-charcoal/40" onClick={onClose} />
      <div className="relative bg-cream w-full max-w-sm h-full p-4 flex flex-col gap-4 overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl">Your Cart</h2>
          <button aria-label="Close cart" onClick={onClose} className="text-charcoal">
            ✕
          </button>
        </div>

        {items.length === 0 ? (
          <p className="text-sm text-charcoal/70">Your cart is empty.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((item) => (
              <li key={item.variantId} className="flex items-center justify-between gap-2 text-sm">
                <span>{item.title}</span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    value={item.qty}
                    onChange={(e) => updateQuantity(item.variantId, Number(e.target.value))}
                    className="w-14 rounded border border-charcoal/20 px-2 py-1"
                    aria-label={`Quantity for ${item.title}`}
                  />
                  <button onClick={() => removeItem(item.variantId)} aria-label={`Remove ${item.title}`}>
                    🗑
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-auto pt-4 border-t border-charcoal/10 flex items-center justify-between">
          <span className="font-medium">Subtotal</span>
          <span data-testid="cart-subtotal" className="font-medium">
            ₹{formatPaise(totalPaise)}
          </span>
        </div>
      </div>
    </div>
  );
}
