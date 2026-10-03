'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useAuth } from '../../../lib/auth-context';
import { AdminDrawer } from '../../../components/admin/AdminDrawer';
import { ConfirmModal } from '../../../components/admin/AdminModal';
import { StatusChip } from '../../../components/admin/StatusChip';
import { FormField } from '../../../components/admin/AdminForm';
import { useToast } from '../../../components/ui/Toast';
import type { Category } from '@bro-pics/shared';

interface CategoryFormState {
  name: string;
  slug: string;
  parentId?: string;
  image?: string;
  heroDescription?: string;
  sortOrder: number;
  isActive: boolean;
  seoTitle?: string;
  seoDesc?: string;
}

const BLANK_CATEGORY: CategoryFormState = {
  name: '',
  slug: '',
  sortOrder: 0,
  isActive: true,
  heroDescription: '',
  seoTitle: '',
  seoDesc: '',
};

export default function AdminCategoriesPage() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Drawer & Form State
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [form, setForm] = useState<CategoryFormState>(BLANK_CATEGORY);
  const [isSaving, setIsSaving] = useState(false);

  // Archive / Deactivate Confirmation Modal
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [categoryToArchive, setCategoryToArchive] = useState<Category | null>(null);

  // Fetch categories
  const fetchCategories = async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/categories', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load categories');
      const data = await res.json();
      setCategories(data.categories || []);
    } catch (err) {
      showToast('Error loading categories', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, [user]);

  // Filtered categories
  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) return categories;
    const q = searchQuery.toLowerCase();
    return categories.filter(
      (c) => c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q)
    );
  }, [categories, searchQuery]);

  // Open Create Drawer
  const handleOpenCreate = () => {
    setEditingCategory(null);
    setForm({
      ...BLANK_CATEGORY,
      sortOrder: categories.length,
    });
    setDrawerOpen(true);
  };

  // Open Edit Drawer
  const handleOpenEdit = (category: Category) => {
    setEditingCategory(category);
    setForm({
      name: category.name,
      slug: category.slug,
      parentId: (category as unknown as { parentId?: string }).parentId || '',
      image: category.image || '',
      heroDescription: (category as unknown as { heroDescription?: string }).heroDescription || '',
      sortOrder: category.sortOrder ?? 0,
      isActive: category.isActive ?? true,
      seoTitle: (category as unknown as { seoTitle?: string }).seoTitle || '',
      seoDesc: (category as unknown as { seoDesc?: string }).seoDesc || '',
    });
    setDrawerOpen(true);
  };

  // Handle Name change (auto slug for new)
  const handleNameChange = (name: string) => {
    setForm((prev) => ({
      ...prev,
      name,
      slug:
        !editingCategory && (!prev.slug || prev.slug === prev.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'))
          ? name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
          : prev.slug,
    }));
  };

  // Save Category (Create or Update)
  const handleSaveCategory = async () => {
    if (!user) return;
    if (!form.name.trim() || !form.slug.trim()) {
      showToast('Name and URL slug are required', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const token = await user.getIdToken();
      const payload = {
        name: form.name.trim(),
        slug: form.slug.trim(),
        parentId: form.parentId || undefined,
        image: form.image || undefined,
        heroDescription: form.heroDescription || undefined,
        sortOrder: Number(form.sortOrder),
        isActive: form.isActive,
        seoTitle: form.seoTitle || undefined,
        seoDesc: form.seoDesc || undefined,
      };

      if (editingCategory) {
        // PATCH existing
        const res = await fetch(`/api/admin/categories/${editingCategory.id}`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error?.message || 'Failed to update category');
        }

        showToast('Category updated successfully', 'success');
      } else {
        // POST new
        const res = await fetch('/api/admin/categories', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error?.message || 'Failed to create category');
        }

        showToast('Category created successfully', 'success');
      }

      setDrawerOpen(false);
      fetchCategories();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error saving category';
      showToast(msg, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Move Category Up / Down
  const handleMove = async (index: number, direction: 'up' | 'down') => {
    if (!user) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= categories.length) return;

    const reordered = [...categories];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, moved);

    setCategories(reordered);

    try {
      const token = await user.getIdToken();
      const orderedIds = reordered.map((c) => c.id);
      await fetch('/api/admin/categories/reorder', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ orderedIds }),
      });
      showToast('Order saved', 'success');
    } catch {
      showToast('Failed to save order', 'error');
      fetchCategories();
    }
  };

  // Archive Category Action
  const handleArchiveCategory = async () => {
    if (!user || !categoryToArchive) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/categories/${categoryToArchive.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ isActive: false }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error?.message || 'Cannot archive category with active products');
      }

      showToast(`Category "${categoryToArchive.name}" archived`, 'success');
      setShowArchiveConfirm(false);
      setCategoryToArchive(null);
      fetchCategories();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to archive category';
      showToast(msg, 'error');
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line pb-4">
        <div>
          <h1 className="text-xl md:text-2xl font-display font-bold text-ink">
            Category Management
          </h1>
          <p className="text-xs text-ink/60">
            Organize products into hierarchical categories, configure hero banners, and adjust storefront navigation order.
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenCreate}
          className="px-4 py-2 rounded-xl bg-gold hover:bg-gold-deep text-ink text-xs font-semibold transition-colors shadow-xs"
        >
          + Add Category
        </button>
      </div>

      {/* Search Bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-ink/40 text-xs">
            🔍
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search categories by name or slug..."
            className="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink placeholder:text-ink/40 focus:outline-none focus:border-gold"
          />
        </div>
      </div>

      {/* Categories List */}
      <div className="rounded-2xl border border-line bg-paper shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-3 animate-pulse">
            <div className="h-12 bg-field rounded-xl" />
            <div className="h-12 bg-field rounded-xl" />
            <div className="h-12 bg-field rounded-xl" />
          </div>
        ) : filteredCategories.length === 0 ? (
          <div className="p-12 text-center text-xs text-ink/50 space-y-3">
            <p>No categories found matching your search.</p>
            <button
              type="button"
              onClick={handleOpenCreate}
              className="px-3.5 py-1.5 rounded-xl bg-gold text-ink text-xs font-semibold"
            >
              Create Category
            </button>
          </div>
        ) : (
          <div className="divide-y divide-line">
            {filteredCategories.map((category, index) => (
              <div
                key={category.id}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-field/30 transition-colors"
              >
                {/* Reorder Controls & Details */}
                <div className="flex items-center gap-3">
                  <div className="flex flex-col gap-0.5">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => handleMove(index, 'up')}
                      className="p-1 text-2xs text-ink/40 hover:text-ink disabled:opacity-20 hover:bg-field rounded"
                      title="Move Up"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      disabled={index === filteredCategories.length - 1}
                      onClick={() => handleMove(index, 'down')}
                      className="p-1 text-2xs text-ink/40 hover:text-ink disabled:opacity-20 hover:bg-field rounded"
                      title="Move Down"
                    >
                      ▼
                    </button>
                  </div>

                  <div className="w-10 h-10 rounded-xl border border-line bg-field overflow-hidden flex items-center justify-center shrink-0">
                    {category.image ? (
                      <img src={category.image} alt={category.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-xs text-ink/30">🖼️</span>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-ink">{category.name}</span>
                      <StatusChip status={category.isActive ? 'published' : 'archived'} />
                    </div>
                    <div className="flex items-center gap-2 text-2xs text-ink/50 font-mono mt-0.5">
                      <span>/{category.slug}</span>
                      <span>·</span>
                      <span>Sort: {category.sortOrder}</span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 sm:self-center">
                  <Link
                    href={`/category/${category.slug}`}
                    target="_blank"
                    className="px-2.5 py-1.5 rounded-lg border border-line hover:bg-field text-2xs text-ink/70 font-semibold transition-colors"
                  >
                    View Storefront ↗
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(category)}
                    className="px-3 py-1.5 rounded-lg bg-gold/10 hover:bg-gold/20 text-gold-deep text-2xs font-bold transition-colors"
                  >
                    Edit
                  </button>
                  {category.isActive && (
                    <button
                      type="button"
                      onClick={() => {
                        setCategoryToArchive(category);
                        setShowArchiveConfirm(true);
                      }}
                      className="px-2.5 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-2xs font-semibold transition-colors"
                    >
                      Archive
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Category Edit/Create Drawer */}
      <AdminDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={editingCategory ? `Edit: ${editingCategory.name}` : 'New Category'}
        subtitle="Manage category hierarchy, slug, and storefront banner"
      >
        <div className="space-y-4">
          <FormField label="Category Name" required>
            <input
              type="text"
              value={form.name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g. Wooden Frames"
              className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:outline-none focus:border-gold"
            />
          </FormField>

          <FormField label="URL Slug" required hint="e.g. /category/wooden-frames">
            <input
              type="text"
              value={form.slug}
              onChange={(e) => setForm((prev) => ({ ...prev, slug: e.target.value }))}
              placeholder="wooden-frames"
              className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink font-mono focus:outline-none focus:border-gold"
            />
          </FormField>

          <FormField label="Parent Category" hint="Leave blank for top-level root category">
            <select
              value={form.parentId || ''}
              onChange={(e) => setForm((prev) => ({ ...prev, parentId: e.target.value || undefined }))}
              className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:outline-none focus:border-gold"
            >
              <option value="">-- Top Level Category --</option>
              {categories
                .filter((c) => !editingCategory || c.id !== editingCategory.id)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.slug})
                  </option>
                ))}
            </select>
          </FormField>

          <FormField label="Hero Image URL" hint="Banner displayed on category landing page">
            <input
              type="text"
              value={form.image || ''}
              onChange={(e) => setForm((prev) => ({ ...prev, image: e.target.value }))}
              placeholder="https://..."
              className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:outline-none focus:border-gold"
            />
          </FormField>

          <FormField label="Hero Description" hint="Introductory paragraph above products">
            <textarea
              rows={3}
              value={form.heroDescription || ''}
              onChange={(e) => setForm((prev) => ({ ...prev, heroDescription: e.target.value }))}
              placeholder="Explore our curated collection of handcrafted solid wood photo frames..."
              className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:outline-none focus:border-gold"
            />
          </FormField>

          <FormField label="Sort Order Weight">
            <input
              type="number"
              value={form.sortOrder}
              onChange={(e) => setForm((prev) => ({ ...prev, sortOrder: Number(e.target.value) || 0 }))}
              className="w-24 px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:outline-none focus:border-gold"
            />
          </FormField>

          <div className="pt-2 border-t border-line space-y-3">
            <span className="text-2xs font-bold text-ink uppercase tracking-wider block">SEO & Meta</span>
            <FormField label="SEO Title">
              <input
                type="text"
                value={form.seoTitle || ''}
                onChange={(e) => setForm((prev) => ({ ...prev, seoTitle: e.target.value }))}
                placeholder="Handcrafted Wooden Photo Frames Online | BroPics"
                className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:outline-none focus:border-gold"
              />
            </FormField>

            <FormField label="Meta Description">
              <textarea
                rows={2}
                value={form.seoDesc || ''}
                onChange={(e) => setForm((prev) => ({ ...prev, seoDesc: e.target.value }))}
                placeholder="Buy archival wood photo frames online with personalized photos and text..."
                className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:outline-none focus:border-gold"
              />
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
              <span className="text-xs font-bold text-ink block">Category Active</span>
              <span className="text-2xs text-ink/60">
                Visible on storefront menus and category routing.
              </span>
            </div>
          </label>

          <div className="flex justify-end gap-2 pt-4">
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="px-4 py-2 rounded-xl border border-line text-xs font-semibold hover:bg-field"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveCategory}
              disabled={isSaving}
              className="px-5 py-2 rounded-xl bg-gold hover:bg-gold-deep text-ink text-xs font-bold transition-colors disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : editingCategory ? 'Save Changes' : 'Create Category'}
            </button>
          </div>
        </div>
      </AdminDrawer>

      {/* Archive Confirmation Modal */}
      <ConfirmModal
        isOpen={showArchiveConfirm}
        onClose={() => setShowArchiveConfirm(false)}
        onConfirm={handleArchiveCategory}
        title="Archive Category"
        message={`Are you sure you want to archive "${categoryToArchive?.name}"? Deactivating a category hides it from the storefront. It cannot be archived if it still contains active products.`}
        confirmText="Archive Category"
        variant="danger"
      />
    </div>
  );
}
