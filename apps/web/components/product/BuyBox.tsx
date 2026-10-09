'use client';

import { useEffect, useState } from 'react';
import type { Product, PublicFrameModel, Variant } from '@bro-pics/shared';
import { useCart } from '../../lib/cart-context';
import { useComboFrame } from '../../lib/combo-frame-context';
import { useSiteText } from '../layout/SiteTextContext';
import { VariantSelector } from './VariantSelector';
import { DeliveryTimeline } from './DeliveryTimeline';
import { RatingStars } from '../ui/RatingStars';
import { QuantityStepper } from '../ui/QuantityStepper';
import { Button } from '../ui/Button';
import { orientationFromDimensions, type Orientation } from '../../lib/orientation';
import { formatPaise } from '../../lib/format-price';
import { HelpCallout } from './HelpCallout';
import { PincodeChecker } from '../checkout/PincodeChecker';
import { freeShippingPromise, useShippingSettings } from '../../lib/use-shipping-settings';

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
  /** Frame models the product offers: the finish choice becomes "Frame", shown with each model's photo. */
  frameModels?: PublicFrameModel[];
  children?: React.ReactNode;
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
  frameModels = [],
  children,
}: BuyBoxProps) {
  const [quantity, setQuantity] = useState(1);
  const text = useSiteText();
  const { addItem, updateItem } = useCart();
  // Inside a combo this box saves one frame into the combo instead of adding a product to the cart.
  const comboFrame = useComboFrame();
  const shippingPromise = freeShippingPromise(useShippingSettings());

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
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('karthys:open-cart'));
        }
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
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('karthys:open-cart'));
      }
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
    <div className="rounded-3xl bg-field border border-line/80 p-6 lg:p-7 shadow-xs flex flex-col justify-start">
      {/* Figma Bestseller / Featured Badge */}
      {(product.isFeatured || (product.badges && product.badges.length > 0)) && (
        <div className="mb-2.5">
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold text-[#92400E] bg-[#FDE68A]">
            {product.badges?.[0] || 'best-seller'}
          </span>
        </div>
      )}

      <h1 className="font-display text-2xl sm:text-3xl font-bold leading-tight text-ink mb-1.5">{product.title}</h1>
      
      {product.ratingCount > 0 && (
        <a href="#reviews" className="flex items-center gap-1.5 text-xs sm:text-sm text-ink/70 mb-2.5 hover:text-ink transition-colors">
          <RatingStars rating={product.ratingAverage} />
          <span className="font-semibold text-ink">{product.ratingAverage}</span>
          <span className="text-ink/60">· {product.ratingCount} reviews</span>
        </a>
      )}

      <div className="my-2">
        {comboFrame ? (
          <>
            <p className="font-display text-xl sm:text-2xl font-bold text-ink">{comboFrame.label}</p>
            <p className="text-xs text-ink/60 mt-0.5">Included in {comboFrame.comboName}. The combo price covers every frame.</p>
          </>
        ) : (
          <>
            <div className="flex items-baseline gap-2">
              <span className="font-display text-2xl sm:text-3xl font-bold text-ink">{formatPaise(price)}</span>
              {compareAtPrice && compareAtPrice > price && (
                <span className="text-sm text-ink/40 line-through">{formatPaise(compareAtPrice)}</span>
              )}
            </div>
            <p className="text-xs text-ink/50 mt-0.5">{text.priceNote}</p>
          </>
        )}
      </div>

      {product.shortDesc && (
        <p className="text-xs sm:text-sm text-ink/75 leading-relaxed my-3 border-b border-line pb-3">
          {product.shortDesc}
        </p>
      )}

      <div className="space-y-3.5 my-2">
        <VariantSelector
          label="Orientation"
          options={orientations.map((o) => ORIENTATION_LABELS[o])}
          selected={selectedOrientation ? ORIENTATION_LABELS[selectedOrientation] : ''}
          onSelect={(label) => {
            const orientation = (Object.entries(ORIENTATION_LABELS).find(([, l]) => l === label)?.[0] ?? 'portrait') as Orientation;
            onSelectOrientation(orientation);
          }}
        />
        <VariantSelector label="Size" options={sizes} selected={selectedSize} onSelect={onSelectSize} />
        <VariantSelector
          label={frameModels.length ? 'Frame' : 'Finish'}
          options={colours}
          selected={selectedColour}
          onSelect={onSelectColour}
          display="swatch"
          swatches={Object.fromEntries(frameModels.map((m) => [m.name, { imageUrl: m.image?.url, hex: m.colourHex, borderPx: m.image?.borderPx, widthPx: m.image?.widthPx }]))}
        />
      </div>

      {children}

      {/* Delivery Information Section */}
      <div className="my-3 p-3.5 rounded-2xl bg-paper border border-line/70 space-y-2.5">
        <div className="flex items-center gap-2 text-xs font-semibold text-ink">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-accent shrink-0">
            <rect x="1" y="3" width="15" height="13" rx="2" />
            <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
            <circle cx="5.5" cy="18.5" r="2.5" />
            <circle cx="18.5" cy="18.5" r="2.5" />
          </svg>
          <span>Delivery & Dispatch</span>
        </div>
        <p className={`text-xs ${inStock ? 'text-ink/80' : 'text-alert'}`}>
          {inStock ? `Made to order · Dispatches in ${product.dispatchDaysMin}-${product.dispatchDaysMax} working days` : stockMessage}
        </p>
        <p className="text-2xs text-ink/50">
          {selectedVariant?.sku ? `SKU ${selectedVariant.sku}` : ''}
          {selectedVariant?.sku && shippingPromise ? ' · ' : ''}
          {shippingPromise}
        </p>
        <div className="pt-1 border-t border-line/60">
          <PincodeChecker />
        </div>
      </div>

      {/* Quantity & Primary Action Button */}
      <div className="my-2 space-y-3">
        {!comboFrame && (
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-ink/70 font-medium">Quantity</span>
            <QuantityStepper value={quantity} onChange={setQuantity} />
          </div>
        )}

        {!personalizationReady && personalizationReason && (
          <p className="text-xs text-ink/60">{personalizationReason}</p>
        )}
        {submitError && <p className="text-xs text-alert">{submitError}</p>}

        <Button
          onClick={handleAddToCart}
          disabled={!inStock || !selectedVariant || !onAddToCart || !personalizationReady || submitting}
          className="w-full h-12 rounded-full bg-gold hover:bg-gold-deep text-ink text-sm font-semibold transition-all shadow-xs flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {comboFrame
            ? submitting ? 'Saving…' : `Save ${comboFrame.label}`
            : isEditingCartLine
              ? submitting ? 'Saving…' : 'Save changes'
              : submitting ? 'Adding…' : 'Add to cart'}
        </Button>
      </div>

      {/* Accordions */}
      <div className="divide-y divide-line text-sm mt-3 pt-2 border-t border-line">
        <details className="group py-3 cursor-pointer">
          <summary className="flex items-center justify-between font-medium text-ink list-none">
            <span>Materials & care</span>
            <span className="transition group-open:rotate-45 text-lg font-light">+</span>
          </summary>
          <div className="pt-2 text-xs text-ink/70 leading-relaxed">
            {product.careText || text.careText}
          </div>
        </details>
        <details className="group py-3 cursor-pointer">
          <summary className="flex items-center justify-between font-medium text-ink list-none">
            <span>Returns & warranty</span>
            <span className="transition group-open:rotate-45 text-lg font-light">+</span>
          </summary>
          <div className="pt-2 text-xs text-ink/70 leading-relaxed">
            <p>{text.returnsText}</p>
          </div>
        </details>
      </div>

      <HelpCallout
        whatsappHref={`https://wa.me/${process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? '910000000000'}?text=${encodeURIComponent(whatsappMessage)}`}
      />

      {/* Sticky Mobile Bottom CTA Bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-paper/95 backdrop-blur-md border-t border-line px-4 py-2.5 flex items-center justify-between gap-3 shadow-lg">
        <div className="min-w-0">
          <div className="text-xs font-bold text-ink truncate">{comboFrame ? comboFrame.label : `Total ${formatPaise(price * quantity)}`}</div>
          <div className="text-3xs text-ink/60 truncate">{selectedSize || 'Standard'} · {selectedColour || 'Default'}</div>
        </div>
        <button
          type="button"
          aria-label="Quick checkout"
          onClick={handleAddToCart}
          disabled={!inStock || !selectedVariant || !onAddToCart || !personalizationReady || submitting}
          className="h-11 min-h-[44px] px-6 rounded-full bg-gold hover:bg-gold-deep text-ink text-sm font-bold shrink-0 disabled:opacity-50 transition-colors shadow-xs"
        >
          {comboFrame
            ? submitting ? 'Saving…' : 'Save frame'
            : isEditingCartLine
              ? submitting ? 'Saving…' : 'Save'
              : submitting ? 'Adding…' : 'Add to cart'}
        </button>
      </div>
    </div>
  );
}
