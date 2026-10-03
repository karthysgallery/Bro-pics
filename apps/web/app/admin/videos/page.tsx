'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '../../../lib/auth-context';
import { AdminDrawer } from '../../../components/admin/AdminDrawer';
import { MediaPickerModal } from '../../../components/admin/MediaPickerModal';
import { StatusChip } from '../../../components/admin/StatusChip';
import { FormField } from '../../../components/admin/AdminForm';
import { useToast } from '../../../components/ui/Toast';
import type { Video, Product } from '@bro-pics/shared';

interface VideoFormState {
  mediaId: string;
  thumbnailMediaId?: string;
  caption: string;
  placement: 'homepage' | 'gallery' | 'product';
  productId?: string;
  sortOrder: number;
  isActive: boolean;
}

const BLANK_VIDEO: VideoFormState = {
  mediaId: '',
  thumbnailMediaId: '',
  caption: '',
  placement: 'homepage',
  productId: '',
  sortOrder: 0,
  isActive: true,
};

export default function AdminVideosPage() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [videos, setVideos] = useState<Video[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  // Drawer / Form State
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingVideo, setEditingVideo] = useState<Video | null>(null);
  const [form, setForm] = useState<VideoFormState>(BLANK_VIDEO);
  const [isSaving, setIsSaving] = useState(false);

  // Media Picker
  const [mediaPickerMode, setMediaPickerMode] = useState<'video' | 'thumbnail' | null>(null);

  // Fetch Data
  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const [vidRes, prodRes] = await Promise.all([
        fetch('/api/admin/videos', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/admin/products', { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      if (vidRes.ok) {
        const vData = await vidRes.json();
        setVideos(vData.videos || []);
      }
      if (prodRes.ok) {
        const pData = await prodRes.json();
        setProducts(pData.products || []);
      }
    } catch {
      showToast('Error loading video showcase items', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user]);

  // Open Create
  const handleOpenCreate = () => {
    setEditingVideo(null);
    setForm({
      ...BLANK_VIDEO,
      sortOrder: videos.length,
    });
    setDrawerOpen(true);
  };

  // Open Edit
  const handleOpenEdit = (v: Video) => {
    setEditingVideo(v);
    setForm({
      mediaId: v.mediaId,
      thumbnailMediaId: v.thumbnailMediaId || '',
      caption: v.caption,
      placement: v.placement as 'homepage' | 'gallery' | 'product',
      productId: v.productId || '',
      sortOrder: v.sortOrder,
      isActive: v.isActive,
    });
    setDrawerOpen(true);
  };

  // Save Video
  const handleSaveVideo = async () => {
    if (!user) return;
    if (!form.mediaId) {
      showToast('Please select a video asset from the media library', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const token = await user.getIdToken();
      const payload = {
        mediaId: form.mediaId,
        thumbnailMediaId: form.thumbnailMediaId || undefined,
        caption: form.caption.trim(),
        placement: form.placement,
        productId: form.productId || undefined,
        sortOrder: Number(form.sortOrder) || 0,
        isActive: form.isActive,
      };

      if (editingVideo) {
        const res = await fetch(`/api/admin/videos/${editingVideo.id}`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('Failed to update video');
        showToast('Video showcase item updated', 'success');
      } else {
        const res = await fetch('/api/admin/videos', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('Failed to create video item');
        showToast('Video item added to showcase', 'success');
      }

      setDrawerOpen(false);
      fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error saving video';
      showToast(msg, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Reorder
  const handleMove = async (index: number, direction: 'up' | 'down') => {
    if (!user) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= videos.length) return;

    const reordered = [...videos];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, moved);
    setVideos(reordered);

    try {
      const token = await user.getIdToken();
      const orderedIds = reordered.map((v) => v.id);
      await fetch('/api/admin/videos/reorder', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ orderedIds }),
      });
      showToast('Video order saved', 'success');
    } catch {
      showToast('Failed to save order', 'error');
      fetchData();
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line pb-4">
        <div>
          <h1 className="text-xl md:text-2xl font-display font-bold text-ink">
            Customer Video Showcase (Reels CMS)
          </h1>
          <p className="text-xs text-ink/60">
            Manage vertical video unboxings, customer reaction reels, and product demonstrations across storefront rails.
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenCreate}
          className="px-4 py-2 rounded-xl bg-gold hover:bg-gold-deep text-ink text-xs font-semibold transition-colors shadow-xs"
        >
          + Add Showcase Video
        </button>
      </div>

      {/* Video Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="aspect-[9/16] bg-field rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : videos.length === 0 ? (
        <div className="p-16 border border-line rounded-2xl bg-paper text-center space-y-3">
          <span className="text-4xl block">🎬</span>
          <p className="text-xs text-ink/50">No showcase videos added yet.</p>
          <button
            type="button"
            onClick={handleOpenCreate}
            className="px-3.5 py-1.5 rounded-xl bg-gold text-ink text-xs font-semibold"
          >
            Add First Video
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {videos.map((v, index) => {
            const product = products.find((p) => p.id === v.productId);

            return (
              <div
                key={v.id}
                className="rounded-2xl border border-line bg-paper overflow-hidden shadow-xs flex flex-col justify-between"
              >
                <div className="relative aspect-[9/14] bg-ink flex items-center justify-center overflow-hidden">
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-paper p-4 text-center">
                    <span className="text-4xl mb-2">▶️</span>
                    <p className="text-xs font-bold line-clamp-2">{v.caption || 'Customer Video'}</p>
                    {product && (
                      <span className="mt-2 text-[10px] bg-gold text-ink font-bold px-2 py-0.5 rounded-full">
                        {product.title}
                      </span>
                    )}
                  </div>

                  <div className="absolute top-2 left-2">
                    <StatusChip status={v.isActive ? 'published' : 'archived'} size="sm" />
                  </div>
                  <div className="absolute top-2 right-2 px-2 py-0.5 rounded bg-ink/70 text-paper text-[10px] font-mono capitalize">
                    {v.placement}
                  </div>
                </div>

                <div className="p-3.5 space-y-2">
                  <div className="flex items-center justify-between text-2xs text-ink/60">
                    <span>Sort Order: {v.sortOrder}</span>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() => handleMove(index, 'up')}
                        className="p-1 text-ink/40 hover:text-ink disabled:opacity-20 rounded hover:bg-field"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        disabled={index === videos.length - 1}
                        onClick={() => handleMove(index, 'down')}
                        className="p-1 text-ink/40 hover:text-ink disabled:opacity-20 rounded hover:bg-field"
                      >
                        ▼
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleOpenEdit(v)}
                    className="w-full py-1.5 rounded-xl bg-gold/10 hover:bg-gold/20 text-gold-deep text-xs font-bold transition-colors"
                  >
                    Edit Video Settings
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Drawer */}
      <AdminDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={editingVideo ? 'Edit Showcase Video' : 'Add Showcase Video'}
        subtitle="Select media assets and configure storefront placement"
      >
        <div className="space-y-4 text-xs">
          {/* Video Asset Picker */}
          <div className="p-3.5 rounded-xl border border-line bg-field space-y-2">
            <span className="text-2xs font-bold text-ink uppercase tracking-wider block">
              1. Video Media Asset (Required)
            </span>
            <div className="flex items-center justify-between">
              <span className="font-mono text-2xs text-ink/60 truncate max-w-xs">
                {form.mediaId ? `Media ID: ${form.mediaId}` : 'No video selected'}
              </span>
              <button
                type="button"
                onClick={() => setMediaPickerMode('video')}
                className="px-3 py-1.5 rounded-lg bg-gold text-ink text-2xs font-bold"
              >
                Choose Video ↗
              </button>
            </div>
          </div>

          {/* Thumbnail Asset Picker */}
          <div className="p-3.5 rounded-xl border border-line bg-field space-y-2">
            <span className="text-2xs font-bold text-ink uppercase tracking-wider block">
              2. Poster Image Thumbnail (Optional)
            </span>
            <div className="flex items-center justify-between">
              <span className="font-mono text-2xs text-ink/60 truncate max-w-xs">
                {form.thumbnailMediaId ? `Media ID: ${form.thumbnailMediaId}` : 'Default video first-frame'}
              </span>
              <button
                type="button"
                onClick={() => setMediaPickerMode('thumbnail')}
                className="px-3 py-1.5 rounded-lg border border-line bg-paper text-ink text-2xs font-bold"
              >
                Choose Image ↗
              </button>
            </div>
          </div>

          <FormField label="Video Caption" required>
            <input
              type="text"
              value={form.caption}
              onChange={(e) => setForm((prev) => ({ ...prev, caption: e.target.value }))}
              placeholder="e.g. Unboxing our 12x18 Teak Frame in Mumbai!"
              className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:outline-none focus:border-gold"
            />
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Storefront Placement" required>
              <select
                value={form.placement}
                onChange={(e) => setForm((prev) => ({ ...prev, placement: e.target.value as 'homepage' | 'gallery' | 'product' }))}
                className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:outline-none focus:border-gold"
              >
                <option value="homepage">Homepage Video Rail</option>
                <option value="gallery">Customer Gallery</option>
                <option value="product">Product Detail Page</option>
              </select>
            </FormField>

            <FormField label="Linked Product (Optional)">
              <select
                value={form.productId || ''}
                onChange={(e) => setForm((prev) => ({ ...prev, productId: e.target.value || undefined }))}
                className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:outline-none focus:border-gold"
              >
                <option value="">-- No Linked Product --</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </FormField>
          </div>

          <label className="flex items-start gap-3 p-3 rounded-xl border border-line bg-field cursor-pointer">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))}
              className="mt-0.5 rounded text-gold focus:ring-gold"
            />
            <div>
              <span className="text-xs font-bold text-ink block">Video Active</span>
              <span className="text-2xs text-ink/60">
                Visible on customer video rails and reels players.
              </span>
            </div>
          </label>

          <div className="flex justify-end gap-2 pt-4 border-t border-line">
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="px-4 py-2 rounded-xl border border-line text-xs font-semibold hover:bg-field"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveVideo}
              disabled={isSaving}
              className="px-5 py-2 rounded-xl bg-gold hover:bg-gold-deep text-ink text-xs font-bold transition-colors disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : editingVideo ? 'Save Changes' : 'Add Video'}
            </button>
          </div>
        </div>
      </AdminDrawer>

      {/* Media Picker Modal */}
      <MediaPickerModal
        isOpen={Boolean(mediaPickerMode)}
        onClose={() => setMediaPickerMode(null)}
        onSelect={(asset) => {
          if (mediaPickerMode === 'video') {
            setForm((prev) => ({ ...prev, mediaId: asset.id }));
          } else if (mediaPickerMode === 'thumbnail') {
            setForm((prev) => ({ ...prev, thumbnailMediaId: asset.id }));
          }
        }}
        allowedTypes={mediaPickerMode === 'video' ? ['video'] : ['image']}
      />
    </div>
  );
}
