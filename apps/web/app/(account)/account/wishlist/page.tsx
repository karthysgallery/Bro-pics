'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import type { Product } from '@bro-pics/shared';
import { getFirebaseApp } from '../../../../lib/firebase-client';
import { getWishlistIds, subscribeToWishlist } from '../../../../lib/wishlist';
import { ProductCard } from '../../../../components/product/ProductCard';
import { PageSkeleton } from '../../../../components/ui/Skeleton';
import { EmptyState } from '../../../../components/ui/EmptyState';

export default function WishlistPage() {
  const [products, setProducts] = useState<Product[] | null>(null);

  useEffect(() => {
    const load = () => {
      const ids = getWishlistIds();
      if (ids.length === 0) {
        setProducts([]);
        return;
      }
      const db = getFirestore(getFirebaseApp());
      Promise.all(ids.map((id) => getDoc(doc(db, 'products', id)))).then((snapshots) => {
        setProducts(snapshots.filter((s) => s.exists()).map((s) => s.data() as Product));
      });
    };
    load();
    return subscribeToWishlist(load);
  }, []);

  if (products === null) return <PageSkeleton />;

  return (
    <main className="mx-auto w-full max-w-shell px-4 md:px-6 py-8 flex flex-col gap-4">
      <Link href="/account" className="text-sm text-accent/60 hover:text-accent-dark w-fit">
        ← Back to account
      </Link>
      <h1 className="text-2xl font-semibold text-ink">Wishlist</h1>

      {products.length === 0 ? (
        <EmptyState
          title="Nothing saved yet"
          message="Save frames you like to find them here later."
          action={
            <Link href="/category/frames-wall-decor" className="text-sm text-accent hover:text-accent-dark underline">
              Browse frames
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {products.map((product) => (
            <div key={product.id} className="flex flex-col gap-2">
              <ProductCard product={product} />
              {/* Every product in this catalogue requires personalization
                  (photoSlots is always >= 1), so there's no "just add the
                  base variant" cart line to re-create here the way a plain
                  catalogue could — this always routes to the product page
                  to personalize, same constraint "Personalize again" on an
                  order line already documents. */}
              <Link
                href={`/product/${product.slug}`}
                className="text-center text-sm font-medium text-accent hover:text-accent-dark rounded-full border border-line py-2"
              >
                Personalize &amp; add to cart
              </Link>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
