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
      aria-label={wishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
      aria-pressed={wishlisted}
      data-product-id={productId}
      onClick={(e) => {
        e.preventDefault();
        setWishlisted(toggleWishlist(productId));
      }}
      className="absolute top-2 right-2 z-10 w-7 h-7 rounded-full bg-paper/90 flex items-center justify-center"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill={wishlisted ? ALERT : 'none'}
        stroke={wishlisted ? ALERT : INK}
        strokeWidth="1.8"
        aria-hidden="true"
      >
        <path d="M12 21s-7.5-4.6-10-9.1C.5 8.4 2 5 5.4 5c2 0 3.4 1 4.6 2.6C11.2 6 12.6 5 14.6 5 18 5 19.5 8.4 22 11.9 19.5 16.4 12 21 12 21z" />
      </svg>
    </button>
  );
}
