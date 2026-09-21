'use client';

import { useState } from 'react';
import { useAuth } from '../../lib/auth-context';

export function ReviewForm({ productId }: { productId: string }) {
  const { user, loading } = useAuth();
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (loading) {
    return null;
  }

  if (!user) {
    return <p className="text-sm text-ink/70">Sign in to write a review.</p>;
  }

  if (submitted) {
    return <p className="text-sm text-accent">Thanks — your review is awaiting approval.</p>;
  }

  const trimmedTitle = title.trim();
  const trimmedBody = body.trim();

  const handleSubmit = async () => {
    if (isSubmitting) {
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const idToken = await user.getIdToken();
      const response = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ productId, rating, title: trimmedTitle, body: trimmedBody }),
      });
      if (response.status === 409) {
        setError("You've already reviewed this product.");
        return;
      }
      if (!response.ok) {
        setError('Could not submit your review.');
        return;
      }
      setSubmitted(true);
    } catch {
      setError('Could not submit your review.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 mt-6 max-w-sm">
      <label htmlFor="review-rating">Rating</label>
      <select
        id="review-rating"
        value={rating}
        onChange={(e) => setRating(Number(e.target.value))}
        className="rounded border border-line px-3 py-2 w-fit"
      >
        {[5, 4, 3, 2, 1].map((n) => (
          <option key={n} value={n}>
            {n} star{n > 1 ? 's' : ''}
          </option>
        ))}
      </select>

      <label htmlFor="review-title">Title</label>
      <input id="review-title" value={title} onChange={(e) => setTitle(e.target.value)} className="rounded border border-line px-3 py-2" />

      <label htmlFor="review-body">Your review</label>
      <textarea id="review-body" value={body} onChange={(e) => setBody(e.target.value)} className="rounded border border-line px-3 py-2" />

      {error && <p className="text-sm text-alert">{error}</p>}

      <button
        onClick={handleSubmit}
        disabled={!trimmedTitle || !trimmedBody || isSubmitting}
        className="rounded bg-ink text-paper px-4 py-2 w-fit"
      >
        Submit
      </button>
    </div>
  );
}
