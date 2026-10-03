'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '../../../lib/auth-context';
import { AdminDrawer } from '../../../components/admin/AdminDrawer';
import { MediaPickerModal } from '../../../components/admin/MediaPickerModal';
import { StatusChip } from '../../../components/admin/StatusChip';
import { FormField } from '../../../components/admin/AdminForm';
import { useToast } from '../../../components/ui/Toast';
import type { HomepageSection } from '@bro-pics/shared';

interface SectionFormState {
  type: string;
  sortOrder: number;
  isActive: boolean;
  startsAt?: string;
  endsAt?: string;
  content: Record<string, unknown>;
}

const SECTION_TYPE_LABELS: Record<string, { label: string; icon: string; desc: string }> = {
  hero: { label: 'Hero Carousel / Banner', icon: '🌟', desc: 'Main full-width headline banner with desktop/mobile photos and CTA' },
  categories: { label: 'Category Browse Tiles', icon: '🗂️', desc: 'Curated category cards with image thumbnails' },
  bestsellers: { label: 'Bestseller Highlights', icon: '🔥', desc: 'Top-selling frames with dynamic ratings & price' },
  how_it_works: { label: 'How It Works (3 Steps)', icon: '✨', desc: 'Upload photo → Customize frame → Doorstep delivery' },
  featured_collection: { label: 'Featured Campaign Grid', icon: '🎨', desc: 'Curated collection showcase block' },
  videos: { label: 'Customer Video Showcase', icon: '🎬', desc: 'Reels-style unboxing and customer reaction videos' },
  reviews: { label: 'Featured Customer Reviews', icon: '⭐', desc: 'Verified buyer testimonials and star ratings' },
  why_us: { label: 'Why Choose BroPics', icon: '💎', desc: 'Solid wood, museum glass, 300 DPI archival guarantees' },
  closing_cta: { label: 'Closing CTA Banner', icon: '🚀', desc: 'Bottom call-to-action banner' },
};

export default function AdminHomepageBuilderPage() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [sections, setSections] = useState<HomepageSection[]>([]);
  const [loading, setLoading] = useState(true);

  // Drawer / Form State
  const [editingSection, setEditingSection] = useState<HomepageSection | null>(null);
  const [form, setForm] = useState<SectionFormState>({
    type: 'hero',
    sortOrder: 0,
    isActive: true,
    content: {},
  });
  const [isSaving, setIsSaving] = useState(false);

  // Media Picker
  const [mediaTarget, setMediaTarget] = useState<'desktop' | 'mobile' | null>(null);

  // Fetch sections
  const fetchSections = async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/homepage-sections', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load homepage sections');
      const data = await res.json();
      setSections(data.sections || []);
    } catch {
      showToast('Error loading homepage sections', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSections();
  }, [user]);

  // Open Edit Drawer
  const handleOpenEdit = (sec: HomepageSection) => {
    setEditingSection(sec);
    setForm({
      type: sec.type,
      sortOrder: sec.sortOrder,
      isActive: sec.isActive,
      startsAt: sec.startsAt ? new Date(sec.startsAt).toISOString().slice(0, 16) : '',
      endsAt: sec.endsAt ? new Date(sec.endsAt).toISOString().slice(0, 16) : '',
      content: (sec.config as Record<string, unknown>) || {},
    });
  };

  // Reorder Sections Up / Down
  const handleMove = async (index: number, direction: 'up' | 'down') => {
    if (!user) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= sections.length) return;

    const reordered = [...sections];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, moved);
    setSections(reordered);

    try {
      const token = await user.getIdToken();
      const orderedIds = reordered.map((s) => s.id);
      await fetch('/api/admin/homepage-sections/reorder', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ orderedIds }),
      });
      showToast('Homepage section order saved', 'success');
    } catch {
      showToast('Failed to save order', 'error');
      fetchSections();
    }
  };

  // Toggle Active
  const handleToggleActive = async (sec: HomepageSection) => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const nextActive = !sec.isActive;
      await fetch(`/api/admin/homepage-sections/${sec.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ isActive: nextActive }),
      });
      showToast(`Section ${nextActive ? 'enabled' : 'disabled'}`, 'info');
      fetchSections();
    } catch {
      showToast('Error toggling section', 'error');
    }
  };

  // Save Section Form
  const handleSaveSection = async () => {
    if (!user || !editingSection) return;
    setIsSaving(true);

    try {
      const token = await user.getIdToken();
      const payload = {
        isActive: form.isActive,
        startsAt: form.startsAt ? new Date(form.startsAt) : null,
        endsAt: form.endsAt ? new Date(form.endsAt) : null,
        content: form.content,
      };

      const res = await fetch(`/api/admin/homepage-sections/${editingSection.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error('Failed to update homepage section');
      showToast('Section updated successfully', 'success');
      setEditingSection(null);
      fetchSections();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error updating section';
      showToast(msg, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line pb-4">
        <div>
          <h1 className="text-xl md:text-2xl font-display font-bold text-ink">
            Homepage Layout & Content Builder
          </h1>
          <p className="text-xs text-ink/60">
            Customize homepage section order, upload seasonal hero banners, configure promotional campaigns, and schedule flash sales.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/"
            target="_blank"
            className="px-3.5 py-2 rounded-xl border border-line bg-paper hover:bg-field text-ink text-xs font-semibold transition-colors"
          >
            Live Storefront ↗
          </Link>
        </div>
      </div>

      {/* Sections List */}
      <div className="rounded-2xl border border-line bg-paper shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-3 animate-pulse">
            <div className="h-14 bg-field rounded-xl" />
            <div className="h-14 bg-field rounded-xl" />
            <div className="h-14 bg-field rounded-xl" />
          </div>
        ) : sections.length === 0 ? (
          <div className="p-16 text-center text-xs text-ink/50 space-y-2">
            <span className="text-3xl block">🏠</span>
            <p>No homepage sections registered in the database.</p>
          </div>
        ) : (
          <div className="divide-y divide-line">
            {sections.map((sec, index) => {
              const meta = SECTION_TYPE_LABELS[sec.type] || {
                label: sec.type.replace(/_/g, ' '),
                icon: '📄',
                desc: 'Standard homepage section',
              };

              return (
                <div
                  key={sec.id}
                  className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors hover:bg-field/30 ${
                    !sec.isActive ? 'opacity-60 bg-field/20' : ''
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {/* Reorder Up/Down */}
                    <div className="flex flex-col gap-0.5">
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() => handleMove(index, 'up')}
                        className="p-1 text-2xs text-ink/40 hover:text-ink disabled:opacity-20 rounded hover:bg-field"
                        title="Move Up"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        disabled={index === sections.length - 1}
                        onClick={() => handleMove(index, 'down')}
                        className="p-1 text-2xs text-ink/40 hover:text-ink disabled:opacity-20 rounded hover:bg-field"
                        title="Move Down"
                      >
                        ▼
                      </button>
                    </div>

                    <div className="w-10 h-10 rounded-xl bg-field border border-line flex items-center justify-center text-xl shrink-0">
                      {meta.icon}
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-ink">{meta.label}</span>
                        <StatusChip status={sec.isActive ? 'published' : 'archived'} size="sm" />
                      </div>
                      <p className="text-2xs text-ink/60">{meta.desc}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleToggleActive(sec)}
                      className={`px-2.5 py-1.5 rounded-lg text-2xs font-semibold transition-colors ${
                        sec.isActive
                          ? 'border border-line bg-paper text-ink/70 hover:bg-field'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {sec.isActive ? 'Disable' : 'Enable'}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenEdit(sec)}
                      className="px-3.5 py-1.5 rounded-lg bg-gold hover:bg-gold-deep text-ink text-2xs font-bold transition-colors shadow-xs"
                    >
                      Edit Content
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Edit Drawer */}
      <AdminDrawer
        isOpen={Boolean(editingSection)}
        onClose={() => setEditingSection(null)}
        title={editingSection ? `Edit: ${SECTION_TYPE_LABELS[editingSection.type]?.label || editingSection.type}` : 'Section Editor'}
        subtitle="Manage section copy, hero slides, and scheduling"
      >
        {editingSection && (
          <div className="space-y-5 text-xs">
            {/* Type Specific Fields */}
            {editingSection.type === 'hero_slider' && (
              <div className="space-y-4">
                <FormField label="Headline Title" required>
                  <input
                    type="text"
                    value={String(form.content.title || '')}
                    onChange={(e) => setForm((prev) => ({ ...prev, content: { ...prev.content, title: e.target.value } }))}
                    placeholder="Frames That Hold Your Story"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:outline-none focus:border-gold"
                  />
                </FormField>

                <FormField label="Subtitle Tagline">
                  <input
                    type="text"
                    value={String(form.content.subtitle || '')}
                    onChange={(e) => setForm((prev) => ({ ...prev, content: { ...prev.content, subtitle: e.target.value } }))}
                    placeholder="Handcrafted, personalized photo frames — delivered with care."
                    className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:outline-none focus:border-gold"
                  />
                </FormField>

                <div className="grid grid-cols-2 gap-3">
                  <FormField label="CTA Button Text">
                    <input
                      type="text"
                      value={String(form.content.ctaText || 'Shop Custom Frames')}
                      onChange={(e) => setForm((prev) => ({ ...prev, content: { ...prev.content, ctaText: e.target.value } }))}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:outline-none focus:border-gold"
                    />
                  </FormField>

                  <FormField label="CTA Button Link">
                    <input
                      type="text"
                      value={String(form.content.ctaLink || '/category/frames-wall-decor')}
                      onChange={(e) => setForm((prev) => ({ ...prev, content: { ...prev.content, ctaLink: e.target.value } }))}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink font-mono focus:outline-none focus:border-gold"
                    />
                  </FormField>
                </div>

                {/* Hero Images */}
                <div className="p-3.5 rounded-xl bg-field border border-line space-y-3">
                  <span className="text-2xs font-bold text-ink uppercase tracking-wider block">Hero Photography</span>
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold text-ink block">Desktop Banner Image</span>
                      <span className="text-2xs text-ink/50 font-mono truncate block max-w-xs">
                        {String(form.content.desktopImageUrl || 'Default hero photo')}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setMediaTarget('desktop')}
                      className="px-3 py-1.5 rounded-lg bg-gold text-ink text-2xs font-bold"
                    >
                      Choose ↗
                    </button>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-line/50">
                    <div>
                      <span className="text-xs font-semibold text-ink block">Mobile Banner Image</span>
                      <span className="text-2xs text-ink/50 font-mono truncate block max-w-xs">
                        {String(form.content.mobileImageUrl || 'Same as desktop')}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setMediaTarget('mobile')}
                      className="px-3 py-1.5 rounded-lg border border-line bg-paper text-ink text-2xs font-bold"
                    >
                      Choose ↗
                    </button>
                  </div>
                </div>
              </div>
            )}

            {editingSection.type === 'offer_strip' && (
              <div className="space-y-4">
                <FormField label="Banner Heading" required>
                  <input
                    type="text"
                    value={String(form.content.heading || '')}
                    onChange={(e) => setForm((prev) => ({ ...prev, content: { ...prev.content, heading: e.target.value } }))}
                    placeholder="Build Your Story With Confident Frames On Every Wall."
                    className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:outline-none focus:border-gold"
                  />
                </FormField>

                <FormField label="CTA Link">
                  <input
                    type="text"
                    value={String(form.content.link || '')}
                    onChange={(e) => setForm((prev) => ({ ...prev, content: { ...prev.content, link: e.target.value } }))}
                    placeholder="/category/frames-wall-decor"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink font-mono focus:outline-none focus:border-gold"
                  />
                </FormField>
              </div>
            )}

            {/* Campaign Scheduling */}
            <div className="pt-3 border-t border-line space-y-3">
              <span className="text-2xs font-bold text-ink uppercase tracking-wider block">
                Campaign Scheduling (Optional)
              </span>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Starts At">
                  <input
                    type="datetime-local"
                    value={form.startsAt || ''}
                    onChange={(e) => setForm((prev) => ({ ...prev, startsAt: e.target.value }))}
                    className="w-full px-3 py-1.5 text-2xs rounded-xl border border-line bg-paper text-ink"
                  />
                </FormField>

                <FormField label="Ends At">
                  <input
                    type="datetime-local"
                    value={form.endsAt || ''}
                    onChange={(e) => setForm((prev) => ({ ...prev, endsAt: e.target.value }))}
                    className="w-full px-3 py-1.5 text-2xs rounded-xl border border-line bg-paper text-ink"
                  />
                </FormField>
              </div>
            </div>

            <label className="flex items-start gap-3 p-3 rounded-xl border border-line bg-field cursor-pointer">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))}
                className="mt-0.5 rounded text-gold focus:ring-gold"
              />
              <div>
                <span className="text-xs font-bold text-ink block">Section Active</span>
                <span className="text-2xs text-ink/60">
                  Rendered on the storefront homepage in its current sort position.
                </span>
              </div>
            </label>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-4 border-t border-line">
              <button
                type="button"
                onClick={() => setEditingSection(null)}
                className="px-4 py-2 rounded-xl border border-line text-xs font-semibold hover:bg-field"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveSection}
                disabled={isSaving}
                className="px-5 py-2 rounded-xl bg-gold hover:bg-gold-deep text-ink text-xs font-bold transition-colors disabled:opacity-50"
              >
                {isSaving ? 'Saving...' : 'Save Section'}
              </button>
            </div>
          </div>
        )}
      </AdminDrawer>

      {/* Media Picker */}
      <MediaPickerModal
        isOpen={Boolean(mediaTarget)}
        onClose={() => setMediaTarget(null)}
        onSelect={(asset) => {
          if (mediaTarget === 'desktop') {
            setForm((prev) => ({ ...prev, content: { ...prev.content, desktopImageUrl: asset.url } }));
          } else if (mediaTarget === 'mobile') {
            setForm((prev) => ({ ...prev, content: { ...prev.content, mobileImageUrl: asset.url } }));
          }
        }}
        allowedTypes={['image']}
      />
    </div>
  );
}
