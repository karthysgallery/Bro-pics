'use client';

import { useEffect, useState } from 'react';
import type { Product, Variant } from '@bro-pics/shared';
import { useCart } from '../../lib/cart-context';
import { VariantSelector } from './VariantSelector';
import { DeliveryTimeline } from './DeliveryTimeline';
import { RatingStars } from '../ui/RatingStars';
import { QuantityStepper } from '../ui/QuantityStepper';
import { Button } from '../ui/Button';
import { orientationFromDimensions, type Orientation } from '../../lib/orientation';
import { formatPaise } from '../../lib/format-price';
import { HelpCallout } from './HelpCallout';
import { PincodeChecker } from '../checkout/PincodeChecker';

const ORIENTATION_LABELS: Record<Orientation, string> = {
  portrait: 'Portrait',
  landscape: 'Landscape',
  square: 'Square',
};

/** Line icons for the closing reassurance strip. */
const TRUST_POINTS = [
  {
    label: 'Secure packaging',
    icon: (
      <>
        <path d="M3 8h11v9H3zM14 11h4l3 3v3h-7z" />
        <circle cx="7" cy="19" r="1.6" />
        <circle cx="17.5" cy="19" r="1.6" />
      </>
    ),
  },
  {
    label: 'High quality prints',
    icon: (
      <>
        <path d="M12 3l7.5 3v5.5c0 4.3-3.1 7.7-7.5 9-4.4-1.3-7.5-4.7-7.5-9V6L12 3z" />
        <path d="M9 12l2 2 4-4" />
      </>
    ),
  },
  {
    label: 'Perfect for gifting',
    icon: (
      <>
        <path d="M3 9h18v11H3zM3 9l1.5-4h15L21 9M12 5v15" />
      </>
    ),
  },
];

interface BuyBoxProps {
  product: Product;
  variants: Variant[];
  selectedVariant: Variant | null;
  selectedSize: string;
  selectedColour: string;
  selectedOrientation: Orientation | '';
  onSelectSize: (size: string) => void;
  onSelectColour: (colour: string) => void;
  onSelectOrientation: (orientation: Orientation) => void;
  // The personalization panel (canvas + upload + text/clipart controls) now
  // lives inline in the page's own left column (see ProductDetailClient),
  // not behind a popup this component opens — this box just reads whatever
  // state it produced and, on click, asks the parent to submit it.
  personalizationReady: boolean;
  personalizationReason?: string;
  submitting: boolean;
  submitError: string | null;
  onAddToCart?: (quantity: number, onDone: (personalizationId: string, previewPath?: string) => void) => void;
  // [FE-16] Re-editing an existing cart line's personalization updates
  // that SAME line's price/preview (via updateItem) instead of adding a
  // new one, and changes the button's own label to match the action.
  isEditingCartLine?: boolean;
}

export function BuyBox({
  product,
  variants,
  selectedVariant,
  selectedSize,
  selectedColour,
  selectedOrientation,
  onSelectSize,
  onSelectColour,
  onSelectOrientation,
  personalizationReady,
  personalizationReason,
  submitting,
  submitError,
  onAddToCart,
  isEditingCartLine,
}: BuyBoxProps) {
  const [quantity, setQuantity] = useState(1);
  const { addItem, updateItem } = useCart();

  // Options are scoped to the current orientation + the other dimension's
  // current selection, so the user can never click into a combination that
  // has no matching variant (see ProductDetailClient's handlers for how a
  // now-invalid combination gets resolved to a real variant).
  const sizes = [
    ...new Set(
      variants
        .filter((v) => v.frameColour === selectedColour && orientationFromDimensions(v.widthIn, v.heightIn) === selectedOrientation)
        .map((v) => v.sizeLabel)
    ),
  ];
  const colours = [
    ...new Set(
      variants
        .filter((v) => v.sizeLabel === selectedSize && orientationFromDimensions(v.widthIn, v.heightIn) === selectedOrientation)
        .map((v) => v.frameColour)
    ),
  ];
  const orientations = [
    ...new Set(variants.map((v) => orientationFromDimensions(v.widthIn, v.heightIn))),
  ];
  const price = selectedVariant?.price ?? product.minPrice;
  const compareAtPrice = selectedVariant?.compareAtPrice;
  // [FE-32] `inStock` gates purchasability (Add to cart, the delivery
  // timeline) — unchanged: 'backorder' stays non-purchasable here, same
  // as 'out_of_stock', since deciding backorder items ARE orderable is a
  // real business-rule call this task's own text doesn't make, only asks
  // for the messaging to reflect the variant's actual stockStatus. The
  // MESSAGE below is what previously collapsed 'backorder' and
  // 'out_of_stock' into the identical "Out of stock" text.
  const stockStatus = selectedVariant ? selectedVariant.stockStatus : product.inStock ? 'in_stock' : 'out_of_stock';
  const inStock = stockStatus === 'in_stock';
  const stockMessage =
    stockStatus === 'in_stock'
      ? `Dispatches in ${product.dispatchDaysMin}-${product.dispatchDaysMax} days`
      : stockStatus === 'backorder'
        ? 'On backorder — dispatch will take longer than usual'
        : 'Out of stock';

  const handleAddToCart = () => {
    if (!selectedVariant || !onAddToCart) return;
    onAddToCart(quantity, (personalizationId, previewPath) => {
      if (isEditingCartLine) {
        // Same personalizationId, same line — only the fields a re-edit
        // could actually have changed (price, if the variant changed;
        // the preview thumbnail, always). qty is deliberately untouched.
        updateItem(selectedVariant.id, personalizationId, {
          title: `${product.title} — ${selectedVariant.sizeLabel}`,
          unitPriceSnapshot: selectedVariant.price,
          previewPath,
        });
        return;
      }
      addItem({
        variantId: selectedVariant.id,
        personalizationId,
        title: `${product.title} — ${selectedVariant.sizeLabel}`,
        unitPriceSnapshot: selectedVariant.price,
        qty: quantity,
        previewPath,
        productSlug: product.slug,
      });
    });
  };

  // Branching on `typeof window` directly during render produces a
  // different string on the server (no window) vs. the client (has
  // window), which React flags as a hydration mismatch. Instead, render
  // the same URL-less fallback on both the server pass and the client's
  // FIRST paint, then upgrade to the URL-including message in an effect
  // (post-hydration) — a harmless one-render-later change, not a mismatch.
  const [whatsappMessage, setWhatsappMessage] = useState(`Trouble uploading? I have a question about ${product.title}`);
  useEffect(() => {
    setWhatsappMessage(`Trouble uploading? I have a question about ${product.title} — ${window.location.href}`);
  }, [product.title]);

  return (
    <div className="rounded-2xl bg-paper border border-line p-4 md:p-5 lg:sticky lg:top-36 self-start">
      <h1 className="font-display text-2xl font-bold leading-tight text-ink mb-1">{product.title}</h1>
      {product.ratingCount > 0 && (
        <a href="#reviews" className="flex items-center gap-1.5 text-sm text-ink/70 mb-2">
          <RatingStars rating={product.ratingAverage} />
          <span>{product.ratingAverage}</span>
          <span>({product.ratingCount} reviews)</span>
        </a>
      )}

      <div className="flex items-center gap-2 my-3">
        <span className="text-2xl font-semibold text-ink">{formatPaise(price)}</span>
        {compareAtPrice && compareAtPrice > price && (
          <span className="text-sm text-ink/50 line-through">{formatPaise(compareAtPrice)}</span>
        )}
      </div>

      <VariantSelector label="Orientation" options={orientations.map((o) => ORIENTATION_LABELS[o])} selected={selectedOrientation ? ORIENTATION_LABELS[selectedOrientation] : ''} onSelect={(label) => {
        const orientation = (Object.entries(ORIENTATION_LABELS).find(([, l]) => l === label)?.[0] ?? 'portrait') as Orientation;
        onSelectOrientation(orientation);
      }} />
      <VariantSelector label="Size" options={sizes} selected={selectedSize} onSelect={onSelectSize} />
      <VariantSelector label="Frame design" options={colours} selected={selectedColour} onSelect={onSelectColour} display="swatch" />

      <p className={`text-sm mb-3 ${inStock ? 'text-accent font-medium' : 'text-ink/50'}`}>{stockMessage}</p>

      {inStock && (
        <DeliveryTimeline dispatchDaysMin={product.dispatchDaysMin} dispatchDaysMax={product.dispatchDaysMax} />
      )}

      {/* [FE-33] BE-21's delivery-estimate endpoint existed but nothing
          called it — a customer had no way to check delivery to their
          own pincode before adding to cart. */}
      <PincodeChecker className="mb-4" />

      <div className="flex items-center gap-3 mb-4">
        <span className="text-sm text-ink/70">Qty</span>
        <QuantityStepper value={quantity} onChange={setQuantity} />
      </div>

      {!personalizationReady && personalizationReason && (
        <p className="text-xs text-ink/60 mb-2">{personalizationReason}</p>
      )}
      {submitError && <p className="text-xs text-alert mb-2">{submitError}</p>}

      {/* w-[calc(100%-5rem)] on mobile keeps this primary CTA clear of
          LayoutChrome's fixed bottom-right WhatsApp button (bottom-6
          right-6, w-14 h-14) at whatever scroll position it naturally
          falls at -- this is the single most important button on the
          page, so unlike the other instances of this recurring overlap
          (see VariantSelector's comment), it gets a dedicated fix rather
          than being left to the general "floating buttons can overlap
          content" tradeoff documented in PROJECT_STATUS.md. */}
      <Button
        onClick={handleAddToCart}
        disabled={!inStock || !selectedVariant || !onAddToCart || !personalizationReady || submitting}
        className="w-[calc(100%-5rem)] sm:w-full"
      >
        {isEditingCartLine ? (submitting ? 'Saving…' : 'Save changes') : submitting ? 'Adding…' : 'Add to cart'}
      </Button>

      <HelpCallout
        whatsappHref={`https://wa.me/${process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? '910000000000'}?text=${encodeURIComponent(whatsappMessage)}`}
      />

      <ul className="mt-5 grid grid-cols-3 rounded-2xl bg-tint divide-x divide-line">
        {TRUST_POINTS.map((point) => (
          <li key={point.label} className="flex flex-col items-center gap-1.5 px-2 py-3 text-center">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#14213D"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              {point.icon}
            </svg>
            <span className="text-2xs leading-tight text-ink/70">{point.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
