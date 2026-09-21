'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '../../../lib/auth-context';

interface PendingReview {
  id: string;
  productId: string;
  productTitle: string;
  userId: string;
  rating: number;
  title: string;
  body: string;
  isVerified: boolean;
  status: string;
}

// Ported from the former app/staff/reviews/page.tsx — same /api/staff/reviews/*
// routes, already authorized for either the 'admin' or 'staff' claim.
export default function AdminReviewsPage() {
  const { user } = useAuth();
  const [reviews, setReviews] = useState<PendingReview[]>([]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const idToken = await user.getIdToken();
      const response = await fetch('/api/staff/reviews?status=pending', {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (!response.ok) return;
      const body = await response.json();
      setReviews(body.reviews ?? []);
    })();
  }, [user]);

  const moderate = async (id: string, action: 'approve' | 'reject') => {
    const idToken = await user!.getIdToken();
    const response = await fetch(`/api/staff/reviews/${id}/moderate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ action }),
    });
    if (!response.ok) return;
    setReviews((prev) => prev.filter((r) => r.id !== id));
  };

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-2xl text-brown-dark">Pending Reviews</h1>
      {reviews.length === 0 && <p className="text-sm text-brown/60">Nothing pending.</p>}
      <ul className="flex flex-col gap-4">
        {reviews.map((review) => (
          <li key={review.id} className="border-b border-gold/30 pb-4">
            <p className="font-medium text-sm text-brown-dark">{review.productTitle}</p>
            <p className="text-xs text-gold-dark mb-1">{'★'.repeat(review.rating)}{review.isVerified && ' · Verified purchase'}</p>
            <p className="text-sm font-medium text-brown-dark">{review.title}</p>
            <p className="text-sm text-brown/80 mb-2">{review.body}</p>
            <div className="flex gap-2">
              <button onClick={() => moderate(review.id, 'approve')} className="rounded-full bg-gradient-to-b from-brown-light to-brown text-cream px-3 py-1 text-sm">
                Approve
              </button>
              <button onClick={() => moderate(review.id, 'reject')} className="rounded-full border border-brown/30 text-brown px-3 py-1 text-sm">
                Reject
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
