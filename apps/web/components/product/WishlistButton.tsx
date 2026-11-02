'use client';

import { useEffect, useState } from 'react';
import { isWishlisted as checkWishlisted, subscribeToWishlist, toggleWishlist } from '../../lib/wishlist';
import { ALERT, INK } from '../../lib/design-tokens';

// A tiny client-only island so ProductCard itself can stay a Server
// Component — wrapping the whole card in 'use client' would force every
// Product prop (including Firestore Timestamp-shaped date fields) across
// the server/client boundary, which RSC rejects for non-plain-object
// values. Keeping this island prop-free (just an id) avoids that entirely.
export function WishlistButton({ productId }: { productId: string }) {
  const [wishlisted, setWishlisted] = useState(false);

  useEffect(() => {
    setWishlisted(checkWishlisted(productId));
    return subscribeToWishlist(() => setWishlisted(checkWishlisted(productId)));
  }, [productId]);

  return (
    <button
      type="button"
      aria-label={wishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
      aria-pressed={wishlisted}
      data-product-id={productId}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setWishlisted(toggleWishlist(productId));
      }}
      data-shape="circle"
      className="absolute top-3.5 right-3.5 z-10 w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white shadow-xs hover:shadow-md flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95 border border-black/5"
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill={wishlisted ? ALERT : 'none'}
        stroke={wishlisted ? ALERT : '#1E293B'}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="transition-colors"
      >
        <path d="M12 20.5s-7.5-4.4-9.3-9.2C1.6 8.2 3.5 4.5 7.2 4.5c2 0 3.6 1.1 4.8 2.8 1.2-1.7 2.8-2.8 4.8-2.8 3.7 0 5.6 3.7 4.5 6.8-1.8 4.8-9.3 9.2-9.3 9.2z" />
      </svg>
    </button>
  );
}
