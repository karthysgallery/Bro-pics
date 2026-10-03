'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '../../../lib/auth-context';
import { StatusChip } from '../../../components/admin/StatusChip';
import { useToast } from '../../../components/ui/Toast';

type ReviewStatusTab = 'pending' | 'approved' | 'rejected';

interface AdminReview {
  id: string;
  productId: string;
  productTitle?: string;
  userId: string;
  orderId?: string;
  rating: number;
  title: string;
  body: string;
  isVerified: boolean;
  status: string;
  featured?: boolean;
  moderationNote?: string | null;
}

export default function AdminReviewsPage() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<ReviewStatusTab>('pending');
  const [reviews, setReviews] = useState<AdminReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [ratingFilter, setRatingFilter] = useState<string>('all');

  // Moderation notes map
  const [notesMap, setNotesMap] = useState<Record<string, string>>({});
  const [moderatingId, setModeratingId] = useState<string | null>(null);

  // Fetch reviews
  const fetchReviews = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      let url = `/api/staff/reviews?status=${activeTab}`;
      if (ratingFilter !== 'all') {
        url += `&rating=${ratingFilter}`;
      }
      if (searchQuery.trim()) {
        url += `&q=${encodeURIComponent(searchQuery.trim())}`;
      }

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load reviews');
      const data = await res.json();
      setReviews(data.reviews || []);
    } catch {
      showToast('Error loading reviews', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReviews();
  }, [user, activeTab, ratingFilter]);

  // Moderate review action
  const handleModerate = async (id: string, action: 'approve' | 'reject') => {
    if (!user) return;
    setModeratingId(id);
    const note = notesMap[id]?.trim() || undefined;

    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/staff/reviews/${id}/moderate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action, note }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Moderation failed');
      }

      showToast(`Review ${action === 'approve' ? 'approved' : 'rejected'}`, 'success');
      setReviews((prev) => prev.filter((r) => r.id !== id));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error moderating review';
      showToast(msg, 'error');
    } finally {
      setModeratingId(null);
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line pb-4">
        <div>
          <h1 className="text-xl md:text-2xl font-display font-bold text-ink">
            Customer Reviews & Ratings Moderation
          </h1>
          <p className="text-xs text-ink/60">
            Moderate incoming customer reviews, verify proof-of-purchase flags, and feature top feedback on product pages.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="border-b border-line sm:border-b-0 flex items-center gap-1">
          {(['pending', 'approved', 'rejected'] as ReviewStatusTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 text-xs font-semibold rounded-lg capitalize transition-colors ${
                activeTab === tab
                  ? 'bg-ink text-gold font-bold shadow-xs'
                  : 'text-ink/60 hover:text-ink hover:bg-field'
              }`}
            >
              {tab} ({tab === activeTab ? reviews.length : ''})
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <select
            value={ratingFilter}
            onChange={(e) => setRatingFilter(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-xl border border-line bg-paper text-ink focus:outline-none focus:border-gold"
          >
            <option value="all">All Star Ratings</option>
            <option value="5">★★★★★ (5 Stars)</option>
            <option value="4">★★★★☆ (4 Stars)</option>
            <option value="3">★★★☆☆ (3 Stars)</option>
            <option value="2">★★☆☆☆ (2 Stars)</option>
            <option value="1">★☆☆☆☆ (1 Star)</option>
          </select>

          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchReviews()}
            placeholder="Search keyword..."
            className="px-3 py-1.5 text-xs rounded-xl border border-line bg-paper text-ink placeholder:text-ink/40 focus:outline-none focus:border-gold"
          />
        </div>
      </div>

      {/* Reviews List */}
      <div className="space-y-4">
        {loading ? (
          <div className="p-8 space-y-4 animate-pulse">
            <div className="h-28 bg-field rounded-2xl" />
            <div className="h-28 bg-field rounded-2xl" />
          </div>
        ) : reviews.length === 0 ? (
          <div className="p-16 border border-line rounded-2xl bg-paper text-center space-y-2">
            <span className="text-3xl block">⭐</span>
            <p className="text-xs text-ink/50">No reviews found in the &quot;{activeTab}&quot; queue.</p>
          </div>
        ) : (
          reviews.map((rev) => (
            <div
              key={rev.id}
              className="rounded-2xl border border-line bg-paper p-5 shadow-xs space-y-3 hover:border-gold/30 transition-all"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="flex text-amber-500 text-sm tracking-tighter">
                    {'★'.repeat(rev.rating)}
                    {'☆'.repeat(5 - rev.rating)}
                  </div>
                  <h3 className="text-xs font-bold text-ink">{rev.title}</h3>
                  {rev.isVerified && (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                      ✓ Verified Purchase
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 text-2xs text-ink/50 font-mono">
                  <Link
                    href={`/admin/products/${rev.productId}`}
                    className="hover:text-gold hover:underline font-semibold"
                  >
                    {rev.productTitle || rev.productId}
                  </Link>
                  <span>·</span>
                  <span>User: {rev.userId.slice(0, 6)}...</span>
                </div>
              </div>

              <p className="text-xs text-ink/80 leading-relaxed bg-field/30 p-3 rounded-xl border border-line/40">
                &quot;{rev.body}&quot;
              </p>

              {/* Moderation Controls */}
              {activeTab === 'pending' ? (
                <div className="pt-2 border-t border-line flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <input
                    type="text"
                    value={notesMap[rev.id] || ''}
                    onChange={(e) => setNotesMap((prev) => ({ ...prev, [rev.id]: e.target.value }))}
                    placeholder="Optional internal moderation remark / note..."
                    className="flex-1 px-3 py-1.5 text-2xs rounded-xl border border-line bg-field text-ink focus:outline-none focus:border-gold"
                  />

                  <div className="flex items-center gap-2 self-end sm:self-center">
                    <button
                      type="button"
                      disabled={moderatingId === rev.id}
                      onClick={() => handleModerate(rev.id, 'reject')}
                      className="px-3.5 py-1.5 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 text-xs font-semibold transition-colors disabled:opacity-50"
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      disabled={moderatingId === rev.id}
                      onClick={() => handleModerate(rev.id, 'approve')}
                      className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors disabled:opacity-50"
                    >
                      Approve Review
                    </button>
                  </div>
                </div>
              ) : (
                <div className="pt-2 border-t border-line flex items-center justify-between text-2xs text-ink/50">
                  <span>Status: <strong className="capitalize text-ink">{rev.status}</strong></span>
                  {rev.moderationNote && <span>Staff Note: {rev.moderationNote}</span>}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
