'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { SignedOutNotice } from '../../../../components/account/SignedOutNotice';
import { useAuth } from '../../../../lib/auth-context';
import { Skeleton } from '../../../../components/ui/Skeleton';
import { EmptyState } from '../../../../components/ui/EmptyState';
import { Card } from '../../../../components/ui/Card';
import type { Review, ReviewStatus } from '@bro-pics/shared';

function formatCreatedAt(value: unknown): string {
  if (value && typeof value === 'object' && '_seconds' in value) {
    return new Date((value as { _seconds: number })._seconds * 1000).toLocaleDateString('en-IN');
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString('en-IN');
  }
  return '';
}

// Uses the site's own semantic tokens (accent/alert), not raw Tailwind
// greens/reds — tailwind.config.ts's own comment notes the palette
// "carries no red" (alert, a deepened gold, stands in for every danger
// state), unlike OrderStatusTimeline's chip styles, which deliberately use
// plain neutral colours because that one component also renders on
// /app/admin's separate palette. This page never does.
const STATUS_STYLES: Record<ReviewStatus, string> = {
  pending: 'bg-tint text-ink/70',
  approved: 'bg-accent/10 text-accent',
  rejected: 'bg-alert/10 text-alert',
};

const STATUS_LABELS: Record<ReviewStatus, string> = {
  pending: 'Pending review',
  approved: 'Published',
  rejected: 'Not published',
};

interface PendingReviewItem {
  productId: string;
  title: string;
  orderId: string;
  slug: string;
}

export default function MyReviewsPage() {
  const { user } = useAuth();
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [pendingItems, setPendingItems] = useState<PendingReviewItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const idToken = await user.getIdToken();
        const response = await fetch('/api/reviews/mine', {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        if (!response.ok) {
          setError('Could not load your reviews.');
          return;
        }
        const body = await response.json();
        setReviews(body.reviews ?? []);
      } catch {
        // [FE-01] A thrown fetch (offline, DNS) used to leave `reviews` at
        // null and `error` at null forever — an infinite skeleton, same
        // class of bug as the response.ok branch above already handles.
        setError('Could not load your reviews.');
      }
    })();
  }, [user]);

  // [FE-38] "Pending review" prompts — every delivered order's items,
  // minus anything already reviewed. Kept as a separate, best-effort
  // fetch: a failure here shouldn't block the existing "Your reviews"
  // list from loading, so it fails silently (an empty prompt list) rather
  // than sharing `error` with the fetch above.
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const idToken = await user.getIdToken();
        const response = await fetch('/api/reviews/pending', {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        if (!response.ok) return;
        const body = await response.json();
        setPendingItems(body.pending ?? []);
      } catch {
        // Best-effort — see comment above.
      }
    })();
  }, [user]);

  if (!user) return <SignedOutNotice action="see your reviews" />;

  return (
    <main className="mx-auto w-full max-w-2xl px-4 md:px-6 py-8 flex flex-col gap-4">
      <Link href="/account" className="text-sm text-accent/60 hover:text-accent-dark w-fit">
        ← Back to account
      </Link>
      <h1 className="text-2xl font-semibold text-ink">Your reviews</h1>

      {pendingItems.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-ink">Pending reviews</h2>
          <ul className="flex flex-col gap-3">
            {pendingItems.map((item) => (
              <Card key={item.productId} as="li" className="flex items-center justify-between gap-3">
                <span className="text-sm text-ink">{item.title}</span>
                <Link
                  href={`/product/${item.slug}#reviews`}
                  className="rounded-full bg-gold text-ink px-3.5 py-1.5 text-sm font-semibold hover:bg-gold-deep transition-colors whitespace-nowrap"
                >
                  Write a review
                </Link>
              </Card>
            ))}
          </ul>
        </section>
      )}

      {error && <p className="text-sm text-alert">{error}</p>}

      {reviews === null && !error ? (
        <div className="flex flex-col gap-3" role="status" aria-label="Loading">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : reviews && reviews.length === 0 ? (
        <EmptyState title="No reviews yet" message="Reviews you write for products you've ordered will show up here." />
      ) : (
        <ul className="flex flex-col gap-3">
          {reviews?.map((review) => (
            <Card as="li" key={review.id} className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-ink">{review.title}</span>
                <span className={`text-2xs font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLES[review.status]}`}>
                  {STATUS_LABELS[review.status]}
                </span>
              </div>
              <span className="text-sm text-ink/70">{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</span>
              <p className="text-sm text-ink/70">{review.body}</p>
              <span className="text-2xs text-ink/50">{formatCreatedAt(review.createdAt)}</span>
            </Card>
          ))}
        </ul>
      )}
    </main>
  );
}
