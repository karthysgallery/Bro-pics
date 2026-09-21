'use client';

import { useEffect, useState } from 'react';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import type { Product } from '@bro-pics/shared';
import { getFirebaseApp } from '../../lib/firebase-client';
import {
  getRecentlyViewedIds,
  removeRecentlyViewed,
  clearRecentlyViewed,
  subscribeToRecentlyViewed,
} from '../../lib/recently-viewed';
import { ProductCard } from './ProductCard';
import { Section } from '../ui/Section';

interface RecentlyViewedRailProps {
  excludeProductId?: string;
}

// Renders its own rail markup (rather than delegating to the generic
// ProductRail/SectionHeader pair every other rail uses) specifically
// because this one needs two things those don't support: a per-item remove
// button and a "Clear history" action — both click handlers, not links,
// and specific to browsing history rather than something every product
// rail on the site should carry.
export function RecentlyViewedRail({ excludeProductId }: RecentlyViewedRailProps) {
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    let cancelled = false;

    const load = () => {
      const ids = getRecentlyViewedIds(excludeProductId);
      if (ids.length === 0) {
        setProducts([]);
        return;
      }
      const db = getFirestore(getFirebaseApp());
      Promise.all(ids.map((id) => getDoc(doc(db, 'products', id))))
        .then((snapshots) => {
          if (cancelled) return;
          // Firestore results follow the query order, not ids' order —
          // re-sort to match the most-recently-viewed-first list so a
          // remove/clear action (which re-reads ids fresh) doesn't visibly
          // reshuffle the rail.
          const byId = new Map(snapshots.filter((s) => s.exists()).map((s) => [s.id, s.data() as Product]));
          setProducts(ids.map((id) => byId.get(id)).filter((p): p is Product => !!p && p.isActive));
        })
        .catch(() => {
          // Recently-viewed is a non-critical convenience — a failed fetch
          // just means the rail doesn't render, not a page-level error.
        });
    };

    load();
    const unsubscribe = subscribeToRecentlyViewed(load);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [excludeProductId]);

  if (products.length === 0) return null;

  return (
    <Section space="tight">
      <div className="mb-6 flex items-end justify-between gap-4">
        <h2 className="font-display text-2xl md:text-3xl font-bold tracking-tight">Recently viewed</h2>
        <button
          type="button"
          onClick={() => clearRecentlyViewed()}
          className="shrink-0 text-sm font-medium text-accent hover:text-accent-dark whitespace-nowrap"
        >
          Clear history
        </button>
      </div>
      <div className="rail flex gap-4 overflow-x-auto pb-1">
        {products.map((product) => (
          <div key={product.id} className="relative w-[46%] sm:w-52 shrink-0">
            <button
              type="button"
              aria-label={`Remove ${product.title} from recently viewed`}
              onClick={() => removeRecentlyViewed(product.id)}
              className="absolute top-2 left-2 z-10 w-7 h-7 rounded-full bg-paper/90 flex items-center justify-center text-ink/70 hover:text-ink"
            >
              ✕
            </button>
            <ProductCard product={product} />
          </div>
        ))}
      </div>
    </Section>
  );
}
