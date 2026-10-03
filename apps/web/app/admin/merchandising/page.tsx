'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '../../../lib/auth-context';
import { useToast } from '../../../components/ui/Toast';

interface AnnouncementSettings {
  text: string;
  link?: string;
  isActive: boolean;
}

interface MerchandisingItem {
  id: string;
  title: string;
  type: 'product' | 'collection';
  featuredOnHomepage: boolean;
  sortOrder: number;
  imageUrl?: string;
}

export default function MerchandisingPage() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [announcement, setAnnouncement] = useState<AnnouncementSettings>({
    text: '',
    link: '',
    isActive: false,
  });
  const [items, setItems] = useState<MerchandisingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingAnnouncement, setSavingAnnouncement] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);

  const fetchMerchandisingData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();

      // Fetch announcement bar settings
      const settingsRes = await fetch('/api/admin/settings/announcement-bar', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (settingsRes.ok) {
        const settingsData = await settingsRes.json();
        setAnnouncement({
          text: settingsData.text || '',
          link: settingsData.link || '',
          isActive: !!settingsData.isActive,
        });
      }

      // Fetch products for homepage merchandising
      const productsRes = await fetch('/api/admin/products?limit=50', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (productsRes.ok) {
        const prodData = await productsRes.json();
        const prods = (prodData.products || []).map((p: any, idx: number) => ({
          id: p.id,
          title: p.title,
          type: 'product' as const,
          featuredOnHomepage: !!p.isFeatured,
          sortOrder: p.sortOrder ?? idx,
          imageUrl: p.primaryImageUrl,
        }));
        setItems(prods);
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to load merchandising data', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMerchandisingData();
  }, [user]);

  const handleSaveAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSavingAnnouncement(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/settings/announcement-bar', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(announcement),
      });

      if (!res.ok) throw new Error('Failed to update announcement bar');
      showToast('Announcement bar updated successfully!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Error saving announcement bar', 'error');
    } finally {
      setSavingAnnouncement(false);
    }
  };

  const toggleFeatured = (id: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, featuredOnHomepage: !item.featuredOnHomepage } : item
      )
    );
  };

  const moveItem = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= items.length) return;

    const newItems = [...items];
    const temp = newItems[index];
    newItems[index] = newItems[targetIndex];
    newItems[targetIndex] = temp;

    // Update sortOrder values
    const reordered = newItems.map((item, idx) => ({ ...item, sortOrder: idx }));
    setItems(reordered);
  };

  const handleSaveFeatured = async () => {
    if (!user) return;
    setSavingOrder(true);
    try {
      const token = await user.getIdToken();
      const featured = items.filter((i) => i.featuredOnHomepage);

      // Persist featured status on products
      await Promise.all(
        items.map((item) =>
          fetch(`/api/admin/products/${item.id}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              isFeatured: item.featuredOnHomepage,
              sortOrder: item.sortOrder,
            }),
          })
        )
      );

      showToast(`Saved ${featured.length} featured homepage items`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Error saving featured items order', 'error');
    } finally {
      setSavingOrder(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 bg-tint rounded-xl animate-pulse" />
        <div className="h-48 bg-paper border border-line rounded-2xl animate-pulse" />
        <div className="h-96 bg-paper border border-line rounded-2xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink">
          Storefront Merchandising
        </h1>
        <p className="text-xs text-ink/70">
          Control the top promotional announcement bar and homepage featured catalog ordering.
        </p>
      </div>

      {/* 1. Announcement Bar Section */}
      <div className="bg-paper border border-line rounded-2xl p-6 shadow-xs space-y-5">
        <div className="flex items-center justify-between border-b border-line pb-4">
          <div>
            <h2 className="font-display text-base font-bold text-ink flex items-center gap-2">
              <span>📢</span>
              <span>Top Announcement Bar</span>
            </h2>
            <p className="text-xs text-ink/60">
              Displayed prominently across the header of the customer storefront.
            </p>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={announcement.isActive}
              onChange={(e) => setAnnouncement({ ...announcement, isActive: e.target.checked })}
              className="w-4 h-4 rounded text-gold focus:ring-gold"
            />
            <span className="text-xs font-semibold text-ink">
              {announcement.isActive ? 'Active on Storefront' : 'Disabled'}
            </span>
          </label>
        </div>

        <form onSubmit={handleSaveAnnouncement} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-ink">Announcement Message</label>
              <input
                type="text"
                value={announcement.text}
                onChange={(e) => setAnnouncement({ ...announcement, text: e.target.value })}
                placeholder="e.g. ✨ Free shipping across India on orders above ₹999!"
                className="w-full px-3.5 py-2 text-xs rounded-xl border border-line bg-tint/40 text-ink focus:outline-none focus:bg-paper focus:border-gold"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-ink">Destination Link (Optional)</label>
              <input
                type="text"
                value={announcement.link}
                onChange={(e) => setAnnouncement({ ...announcement, link: e.target.value })}
                placeholder="e.g. /category/wall-frames or /coupons"
                className="w-full px-3.5 py-2 text-xs rounded-xl border border-line bg-tint/40 text-ink focus:outline-none focus:bg-paper focus:border-gold"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={savingAnnouncement}
              className="px-4 py-2 rounded-xl bg-gold hover:bg-gold-deep text-xs font-bold text-ink transition-colors disabled:opacity-50"
            >
              {savingAnnouncement ? 'Saving…' : 'Save Announcement'}
            </button>
          </div>
        </form>
      </div>

      {/* 2. Featured On Homepage Section */}
      <div className="bg-paper border border-line rounded-2xl p-6 shadow-xs space-y-5">
        <div className="flex items-center justify-between border-b border-line pb-4">
          <div>
            <h2 className="font-display text-base font-bold text-ink flex items-center gap-2">
              <span>⭐</span>
              <span>Featured Homepage Products & Order</span>
            </h2>
            <p className="text-xs text-ink/60">
              Toggle which products appear on the homepage grid and reorder their presentation.
            </p>
          </div>
          <button
            type="button"
            onClick={handleSaveFeatured}
            disabled={savingOrder}
            className="px-4 py-2 rounded-xl bg-gold hover:bg-gold-deep text-xs font-bold text-ink transition-colors disabled:opacity-50"
          >
            {savingOrder ? 'Saving Order…' : 'Save Featured Order'}
          </button>
        </div>

        {items.length === 0 ? (
          <div className="py-12 text-center text-xs text-ink/50">
            No products found in catalogue.
          </div>
        ) : (
          <div className="divide-y divide-line border border-line rounded-xl overflow-hidden">
            {items.map((item, idx) => (
              <div
                key={item.id}
                className={`p-3.5 flex items-center justify-between gap-4 transition-colors ${
                  item.featuredOnHomepage ? 'bg-amber-50/40' : 'bg-paper hover:bg-tint/30'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => moveItem(idx, 'up')}
                      className="text-xs text-ink/40 hover:text-ink disabled:opacity-20 px-1"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      disabled={idx === items.length - 1}
                      onClick={() => moveItem(idx, 'down')}
                      className="text-xs text-ink/40 hover:text-ink disabled:opacity-20 px-1"
                    >
                      ▼
                    </button>
                  </div>

                  <span className="font-mono text-2xs text-ink/40 w-5">#{idx + 1}</span>

                  {item.imageUrl && (
                    <img
                      src={item.imageUrl}
                      alt={item.title}
                      className="w-10 h-10 object-cover rounded-lg border border-line"
                    />
                  )}

                  <div>
                    <h3 className="text-xs font-semibold text-ink">{item.title}</h3>
                    <span className="text-2xs text-ink/50 font-mono">ID: {item.id}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => toggleFeatured(item.id)}
                    className={`px-3 py-1 rounded-full text-2xs font-semibold transition-colors ${
                      item.featuredOnHomepage
                        ? 'bg-gold text-ink font-bold shadow-xs'
                        : 'bg-tint text-ink/60 hover:text-ink'
                    }`}
                  >
                    {item.featuredOnHomepage ? '★ Featured on Home' : '☆ Not Featured'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
