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

export default function MyReviewsPage() {
  const { user } = useAuth();
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
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
    })();
  }, [user]);

  if (!user) return <SignedOutNotice action="see your reviews" />;

  return (
    <main className="mx-auto w-full max-w-2xl px-4 md:px-6 py-8 flex flex-col gap-4">
      <Link href="/account" className="text-sm text-accent/60 hover:text-accent-dark w-fit">
        ← Back to account
      </Link>
      <h1 className="text-2xl font-semibold text-ink">Your reviews</h1>

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
