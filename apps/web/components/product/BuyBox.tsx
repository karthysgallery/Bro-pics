'use client';

import { useState } from 'react';
import type { Product, Variant } from '@bro-pics/shared';
import { useCart } from '../../lib/cart-context';
import { VariantSelector } from './VariantSelector';
import { PersonalizeComingSoonModal } from './PersonalizeComingSoonModal';

function formatPaise(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface BuyBoxProps {
  product: Product;
  variants: Variant[];
  selectedVariant: Variant | null;
  selectedSize: string;
  selectedColour: string;
  onSelectSize: (size: string) => void;
  onSelectColour: (colour: string) => void;
}

export function BuyBox({
  product,
  variants,
  selectedVariant,
  selectedSize,
  selectedColour,
  onSelectSize,
  onSelectColour,
}: BuyBoxProps) {
  const [quantity, setQuantity] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { addItem } = useCart();

  // Options are scoped to the other dimension's current selection so the
  // user can never click into a size+colour combination that has no
  // matching variant (see ProductDetailClient's onSelectSize/onSelectColour
  // for how a now-invalid pairing gets resolved to a real variant).
  const sizes = [...new Set(variants.filter((v) => v.frameColour === selectedColour).map((v) => v.sizeLabel))];
  const colours = [...new Set(variants.filter((v) => v.sizeLabel === selectedSize).map((v) => v.frameColour))];
  const price = selectedVariant?.price ?? product.minPrice;
  const compareAtPrice = selectedVariant?.compareAtPrice;
  const inStock = selectedVariant ? selectedVariant.stockStatus === 'in_stock' : product.inStock;

  const handleAddToCart = () => {
    if (!selectedVariant) return;
    addItem({ variantId: selectedVariant.id, title: `${product.title} — ${selectedVariant.sizeLabel}`, unitPriceSnapshot: selectedVariant.price, qty: quantity });
    setIsModalOpen(true);
  };

  return (
    <div>
      <h1 className="font-display text-3xl mb-1">{product.title}</h1>
      {product.ratingCount > 0 && (
        <a href="#reviews" className="text-sm text-charcoal/70 mb-2 inline-block">
          ★ {product.ratingAverage} ({product.ratingCount} reviews)
        </a>
      )}

      <div className="flex items-center gap-2 my-3">
        <span className="text-2xl font-medium">{formatPaise(price)}</span>
        {compareAtPrice && compareAtPrice > price && (
          <span className="text-sm text-charcoal/50 line-through">{formatPaise(compareAtPrice)}</span>
        )}
      </div>

      <VariantSelector label="Size" options={sizes} selected={selectedSize} onSelect={onSelectSize} />
      <VariantSelector label="Colour" options={colours} selected={selectedColour} onSelect={onSelectColour} />

      <p className={`text-sm mb-3 ${inStock ? 'text-sage' : 'text-charcoal/50'}`}>
        {inStock ? `Dispatches in ${product.dispatchDaysMin}-${product.dispatchDaysMax} days` : 'Out of stock'}
      </p>

      <div className="flex items-center gap-3 mb-4">
        <label htmlFor="qty" className="text-sm">Qty</label>
        <input
          id="qty"
          type="number"
          min={1}
          value={quantity}
          onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
          className="w-16 rounded-lg border border-charcoal/20 px-2 py-1"
        />
      </div>

      <button
        onClick={handleAddToCart}
        disabled={!inStock || !selectedVariant}
        className="w-full bg-terracotta text-cream rounded-lg py-3 font-medium disabled:opacity-50"
      >
        Personalize &amp; Add to Cart
      </button>

      <a
        href={`https://wa.me/${process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? '910000000000'}`}
        target="_blank"
        rel="noopener noreferrer"
        className="block text-center mt-3 text-sm text-sage underline"
      >
        Need help? Chat with us on WhatsApp
      </a>

      <PersonalizeComingSoonModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </div>
  );
}
