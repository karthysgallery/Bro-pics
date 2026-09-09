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

export default function StaffReviewsPage() {
  const { user, loading } = useAuth();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [reviews, setReviews] = useState<PendingReview[]>([]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      setAuthorized(false);
      return;
    }
    user
      .getIdTokenResult()
      .then((result) => {
        const role = result.claims.role;
        setAuthorized(role === 'admin' || role === 'staff');
      })
      .catch(() => setAuthorized(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, loading]);

  useEffect(() => {
    if (authorized !== true) return;
    (async () => {
      const idToken = await user!.getIdToken();
      const response = await fetch('/api/staff/reviews?status=pending', {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (!response.ok) return;
      const body = await response.json();
      setReviews(body.reviews ?? []);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorized]);

  if (authorized === null) return null;
  if (!authorized) return <p>Not authorized.</p>;

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
    <main className="flex flex-col gap-4 p-6">
      <h1 className="font-display text-2xl">Pending Reviews</h1>
      {reviews.length === 0 && <p className="text-sm text-charcoal/70">Nothing pending.</p>}
      <ul className="flex flex-col gap-4">
        {reviews.map((review) => (
          <li key={review.id} className="border-b border-charcoal/10 pb-4">
            <p className="font-medium text-sm">{review.productTitle}</p>
            <p className="text-xs text-sage mb-1">{'★'.repeat(review.rating)}{review.isVerified && ' · Verified purchase'}</p>
            <p className="text-sm font-medium">{review.title}</p>
            <p className="text-sm text-charcoal/80 mb-2">{review.body}</p>
            <div className="flex gap-2">
              <button onClick={() => moderate(review.id, 'approve')} className="rounded bg-charcoal text-cream px-3 py-1 text-sm">
                Approve
              </button>
              <button onClick={() => moderate(review.id, 'reject')} className="rounded border border-charcoal/30 px-3 py-1 text-sm">
                Reject
              </button>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
