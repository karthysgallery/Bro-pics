'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../../lib/auth-context';
import { FormField, SaveBar } from '../../../../components/admin/AdminForm';
import { StatusChip } from '../../../../components/admin/StatusChip';
import { ConfirmModal } from '../../../../components/admin/AdminModal';
import { useToast } from '../../../../components/ui/Toast';
import type { Product, Category } from '@bro-pics/shared';

interface ProductFormPageProps {
  params: Promise<{ id: string }>;
}

type TabKey = 'details' | 'personalization' | 'variants' | 'delivery' | 'seo' | 'publishing';

export default function AdminProductFormPage({ params }: ProductFormPageProps) {
  const { id: productId } = use(params);
  const router = useRouter();
  const { user } = useAuth();
  const { showToast } = useToast();

  const isNew = productId === 'new';

  const [activeTab, setActiveTab] = useState<TabKey>('details');
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);

  // Form Fields
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [shortDesc, setShortDesc] = useState('');
  const [basePrice, setBasePrice] = useState('999');
  const [photoSlots, setPhotoSlots] = useState(1);
  const [badges, setBadges] = useState('');
  const [highlights, setHighlights] = useState('');
  const [status, setStatus] = useState<'published' | 'draft' | 'archived'>('published');
  const [isFeatured, setIsFeatured] = useState(false);
  const [allowsTextPersonalization, setAllowsTextPersonalization] = useState(false);
  const [dispatchDaysMin, setDispatchDaysMin] = useState(2);
  const [dispatchDaysMax, setDispatchDaysMax] = useState(4);
  const [seoTitle, setSeoTitle] = useState('');
  const [seoDesc, setSeoDesc] = useState('');

  // Auto-generate slug from title for new products
  const handleTitleChange = (newTitle: string) => {
    setTitle(newTitle);
    setIsDirty(true);
    if (isNew && !slug) {
      setSlug(
        newTitle
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
      );
    }
  };

  useEffect(() => {
    if (!user) return;

    // Fetch categories for category dropdown
    user.getIdToken().then((token) => {
      fetch('/api/admin/categories', {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => res.json())
        .then((data) => {
          setCategories(data.categories || []);
          if (isNew && data.categories?.length > 0 && !categoryId) {
            setCategoryId(data.categories[0].id);
          }
        })
        .catch(() => {});
    });

    if (isNew) {
      setLoading(false);
      return;
    }

    // Fetch existing product
    user.getIdToken().then((token) => {
      fetch(`/api/admin/products?id=${productId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => res.json())
        .then((data) => {
          const p = data.products?.find((item: Product) => item.id === productId);
          if (p) {
            setTitle(p.title || '');
            setSlug(p.slug || '');
            setCategoryId(p.categoryId || '');
            setShortDesc(p.shortDesc || '');
            setBasePrice(String(p.basePrice ? p.basePrice / 100 : 999));
            setPhotoSlots(p.photoSlots || 1);
            setBadges(p.badges?.join(', ') || '');
            setHighlights(p.highlights?.join('\n') || '');
            setStatus(p.status || (p.isActive ? 'published' : 'draft'));
            setIsFeatured(Boolean(p.isFeatured));
            setAllowsTextPersonalization(Boolean(p.allowsTextPersonalization));
            setDispatchDaysMin(p.dispatchDaysMin || 2);
            setDispatchDaysMax(p.dispatchDaysMax || 4);
            setSeoTitle(p.seo?.title || '');
            setSeoDesc(p.seo?.description || '');
          }
        })
        .catch((err) => showToast(err.message, 'error'))
        .finally(() => setLoading(false));
    });
  }, [productId, isNew, user]);

  const handleSave = async () => {
    if (!user) return;
    if (!title.trim() || !slug.trim() || !categoryId) {
      showToast('Please fill in title, slug, and category', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const token = await user.getIdToken();
      const payload = {
        title: title.trim(),
        slug: slug.trim(),
        categoryId,
        shortDesc: shortDesc.trim(),
        basePrice: Math.round(parseFloat(basePrice || '0') * 100),
        photoSlots: Number(photoSlots),
        badges: badges
          .split(',')
          .map((b) => b.trim())
          .filter(Boolean),
        highlights: highlights
          .split('\n')
          .map((h) => h.trim())
          .filter(Boolean),
        status,
        isFeatured,
        allowsTextPersonalization,
        dispatchDaysMin: Number(dispatchDaysMin),
        dispatchDaysMax: Number(dispatchDaysMax),
        seo: {
          title: seoTitle.trim() || undefined,
          description: seoDesc.trim() || undefined,
        },
      };

      const url = isNew ? '/api/admin/products' : `/api/admin/products/${productId}`;
      const method = isNew ? 'POST' : 'PATCH';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(errorData?.message || errorData?.error?.message || 'Failed to save product');
      }

      const result = await res.json();
      showToast(isNew ? 'Product created successfully' : 'Product updated successfully', 'success');
      setIsDirty(false);

      if (isNew && result.product?.id) {
        router.push(`/admin/products/${result.product.id}`);
      }
    } catch (err: any) {
      showToast(err.message || 'Error saving product', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleArchive = async () => {
    if (!user || isNew) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/products/${productId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: 'archived' }),
      });

      if (!res.ok) throw new Error('Failed to archive product');

      setStatus('archived');
      setShowArchiveConfirm(false);
      showToast('Product moved to archive', 'success');
    } catch (err: any) {
      showToast(err.message || 'Could not archive product', 'error');
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-tint rounded-xl animate-pulse" />
        <div className="h-96 rounded-2xl bg-paper border border-line animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/admin/products" className="text-2xs text-ink/50 hover:text-ink font-medium">
              ← Products Catalogue
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-2xl font-bold text-ink">
              {isNew ? 'New Product' : title || 'Edit Product'}
            </h1>
            {!isNew && <StatusChip status={status} />}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!isNew && (
            <>
              <Link
                href={`/admin/products/${productId}/variants`}
                className="px-3 py-1.5 rounded-xl border border-line bg-paper text-ink font-semibold text-xs hover:bg-tint transition-colors"
              >
                Variant Matrix →
              </Link>
              <Link
                href={`/admin/products/${productId}/template`}
                className="px-3 py-1.5 rounded-xl border border-line bg-paper text-gold-deep font-semibold text-xs hover:bg-tint transition-colors"
              >
                Personalization Template →
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center gap-1 border-b border-line overflow-x-auto pb-px">
        {[
          { key: 'details', label: 'Details & Copy' },
          { key: 'personalization', label: 'Personalization' },
          { key: 'variants', label: 'Pricing & Variants' },
          { key: 'delivery', label: 'Delivery' },
          { key: 'seo', label: 'SEO & Meta' },
          { key: 'publishing', label: 'Publishing & Status' },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key as TabKey)}
            className={`px-4 py-2 text-xs font-semibold whitespace-nowrap transition-colors border-b-2 ${
              activeTab === tab.key
                ? 'border-gold text-ink font-bold'
                : 'border-transparent text-ink/50 hover:text-ink hover:border-line'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Panels */}
      <div className="rounded-2xl bg-paper border border-line p-6 shadow-xs max-w-4xl space-y-6">
        {activeTab === 'details' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label="Product Title" required>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  placeholder="e.g. Classic Archival Wooden Frame"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:outline-none focus:border-gold"
                />
              </FormField>

              <FormField label="URL Slug" required hint="Used in storefront URL (/product/...)">
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => { setSlug(e.target.value); setIsDirty(true); }}
                  placeholder="classic-archival-wooden-frame"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink font-mono focus:outline-none focus:border-gold"
                />
              </FormField>
            </div>

            <FormField label="Category" required>
              <select
                value={categoryId}
                onChange={(e) => { setCategoryId(e.target.value); setIsDirty(true); }}
                className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:outline-none focus:border-gold"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.slug})
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Short Description" hint="Shown in buy box and search previews">
              <textarea
                rows={3}
                value={shortDesc}
                onChange={(e) => { setShortDesc(e.target.value); setIsDirty(true); }}
                placeholder="Handcrafted premium teak wood frame with museum-grade archival photo print..."
                className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:outline-none focus:border-gold"
              />
            </FormField>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label="Badges (comma separated)" hint="e.g. Best Seller, Bestseller">
                <input
                  type="text"
                  value={badges}
                  onChange={(e) => { setBadges(e.target.value); setIsDirty(true); }}
                  placeholder="Best Seller, 20% Off"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:outline-none focus:border-gold"
                />
              </FormField>

              <FormField label="Highlights (one per line)">
                <textarea
                  rows={3}
                  value={highlights}
                  onChange={(e) => { setHighlights(e.target.value); setIsDirty(true); }}
                  placeholder="300 DPI Archival Print&#10;Shatterproof Plexiglass&#10;Ready to Hang"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:outline-none focus:border-gold"
                />
              </FormField>
            </div>
          </div>
        )}

        {activeTab === 'personalization' && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-field border border-line flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold text-ink">Photo Slots</h3>
                <p className="text-2xs text-ink/60">Number of customer photos this frame holds</p>
              </div>
              <input
                type="number"
                min={1}
                max={12}
                value={photoSlots}
                onChange={(e) => { setPhotoSlots(parseInt(e.target.value) || 1); setIsDirty(true); }}
                className="w-20 px-3 py-1.5 text-xs rounded-xl border border-line bg-paper text-ink text-center font-bold focus:outline-none focus:border-gold"
              />
            </div>

            <label className="flex items-start gap-3 p-4 rounded-xl border border-line bg-field cursor-pointer">
              <input
                type="checkbox"
                checked={allowsTextPersonalization}
                onChange={(e) => { setAllowsTextPersonalization(e.target.checked); setIsDirty(true); }}
                className="mt-0.5 rounded text-gold focus:ring-gold"
              />
              <div>
                <span className="text-xs font-bold text-ink block">Enable Text Personalization</span>
                <span className="text-2xs text-ink/60">
                  Allow customers to customize names, dates, or quotes on the frame
                </span>
              </div>
            </label>

            {!isNew && (
              <div className="p-4 rounded-xl border border-gold/30 bg-gold/5 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-ink">Visual Template Configuration</h4>
                  <p className="text-2xs text-ink/60">
                    Set up frame overlays, SVG aspect masks, and visual coordinate zones
                  </p>
                </div>
                <Link
                  href={`/admin/products/${productId}/template`}
                  className="px-3.5 py-2 rounded-xl bg-gold hover:bg-gold-deep text-ink text-xs font-semibold transition-colors"
                >
                  Open Template Builder →
                </Link>
              </div>
            )}
          </div>
        )}

        {activeTab === 'variants' && (
          <div className="space-y-4">
            <FormField label="Base Starting Price (₹)">
              <input
                type="number"
                step="1"
                value={basePrice}
                onChange={(e) => { setBasePrice(e.target.value); setIsDirty(true); }}
                className="w-48 px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink font-semibold focus:outline-none focus:border-gold"
              />
            </FormField>

            {!isNew ? (
              <div className="p-5 rounded-xl border border-line bg-field space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-bold text-ink">2D Variant Matrix</h3>
                    <p className="text-2xs text-ink/60">
                      Configure size rows (6x8, 8x12, 12x18) × frame colour columns with individual SKUs and pricing
                    </p>
                  </div>
                  <Link
                    href={`/admin/products/${productId}/variants`}
                    className="px-4 py-2 rounded-xl bg-ink text-gold hover:bg-ink/80 text-xs font-semibold transition-colors"
                  >
                    Open Matrix Editor ↗
                  </Link>
                </div>
              </div>
            ) : (
              <p className="text-2xs text-ink/50 italic">
                Save the product first to configure the Size × Colour variant matrix.
              </p>
            )}
          </div>
        )}

        {activeTab === 'delivery' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label="Min Dispatch Days" hint="Production preparation time">
                <input
                  type="number"
                  min={1}
                  value={dispatchDaysMin}
                  onChange={(e) => { setDispatchDaysMin(parseInt(e.target.value) || 1); setIsDirty(true); }}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:outline-none focus:border-gold"
                />
              </FormField>

              <FormField label="Max Dispatch Days">
                <input
                  type="number"
                  min={1}
                  value={dispatchDaysMax}
                  onChange={(e) => { setDispatchDaysMax(parseInt(e.target.value) || 1); setIsDirty(true); }}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:outline-none focus:border-gold"
                />
              </FormField>
            </div>
          </div>
        )}

        {activeTab === 'seo' && (
          <div className="space-y-4">
            <FormField label="SEO Meta Title" hint="Leave blank to use Product Title | BroPics">
              <input
                type="text"
                value={seoTitle}
                onChange={(e) => { setSeoTitle(e.target.value); setIsDirty(true); }}
                placeholder="Personalized Photo Frames Online | BroPics"
                className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:outline-none focus:border-gold"
              />
            </FormField>

            <FormField label="SEO Meta Description">
              <textarea
                rows={3}
                value={seoDesc}
                onChange={(e) => { setSeoDesc(e.target.value); setIsDirty(true); }}
                placeholder="Buy custom photo frames online with instant live preview and 300 DPI high-resolution prints."
                className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:outline-none focus:border-gold"
              />
            </FormField>
          </div>
        )}

        {activeTab === 'publishing' && (
          <div className="space-y-4">
            <FormField label="Catalog Visibility Status">
              <div className="grid grid-cols-3 gap-3">
                {(['published', 'draft', 'archived'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => { setStatus(s); setIsDirty(true); }}
                    className={`p-3 rounded-xl border text-center capitalize font-semibold text-xs transition-all ${
                      status === s
                        ? 'border-gold bg-gold/10 text-ink shadow-xs'
                        : 'border-line bg-paper text-ink/60 hover:text-ink'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </FormField>

            <label className="flex items-center gap-2 p-3 rounded-xl border border-line bg-field cursor-pointer">
              <input
                type="checkbox"
                checked={isFeatured}
                onChange={(e) => { setIsFeatured(e.target.checked); setIsDirty(true); }}
                className="rounded text-gold focus:ring-gold"
              />
              <span className="text-xs font-semibold text-ink">Feature on Homepage Collection Rails</span>
            </label>

            {!isNew && (
              <div className="pt-6 border-t border-line flex justify-between items-center">
                <div>
                  <h4 className="text-xs font-bold text-red-800">Archive Product</h4>
                  <p className="text-2xs text-ink/60">
                    Removes product from storefront while preserving past order records
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowArchiveConfirm(true)}
                  className="px-3.5 py-2 rounded-xl border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 text-xs font-semibold transition-colors"
                >
                  Archive Product
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Sticky Save Bar */}
      <SaveBar
        isDirty={isDirty || isNew}
        isSaving={isSaving}
        onSave={handleSave}
        onReset={() => router.push('/admin/products')}
        saveLabel={isNew ? 'Create Product' : 'Save Changes'}
        cancelLabel="Cancel"
      />

      {/* Archive Confirmation Modal */}
      <ConfirmModal
        isOpen={showArchiveConfirm}
        onClose={() => setShowArchiveConfirm(false)}
        onConfirm={handleArchive}
        title="Archive Product"
        message={`Are you sure you want to archive "${title}"? It will no longer be visible on the customer storefront.`}
        variant="danger"
        confirmText="Archive"
        requireTypedText="ARCHIVE"
      />
    </div>
  );
}
