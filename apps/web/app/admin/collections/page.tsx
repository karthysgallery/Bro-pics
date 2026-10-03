'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useAuth } from '../../../lib/auth-context';
import { AdminDrawer } from '../../../components/admin/AdminDrawer';
import { ConfirmModal } from '../../../components/admin/AdminModal';
import { StatusChip } from '../../../components/admin/StatusChip';
import { FormField } from '../../../components/admin/AdminForm';
import { useToast } from '../../../components/ui/Toast';
import type { Collection, Product } from '@bro-pics/shared';

interface CollectionFormState {
  name: string;
  slug: string;
  description?: string;
  productIds: string[];
  isActive: boolean;
}

const BLANK_COLLECTION: CollectionFormState = {
  name: '',
  slug: '',
  description: '',
  productIds: [],
  isActive: true,
};

export default function AdminCollectionsPage() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [collections, setCollections] = useState<Collection[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Drawer & Form State
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingCollection, setEditingCollection] = useState<Collection | null>(null);
  const [form, setForm] = useState<CollectionFormState>(BLANK_COLLECTION);
  const [isSaving, setIsSaving] = useState(false);

  // Archive Confirm
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [collectionToArchive, setCollectionToArchive] = useState<Collection | null>(null);

  // Fetch Collections & Products
  const fetchData = async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const [colRes, prodRes] = await Promise.all([
        fetch('/api/admin/collections', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/admin/products', { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      if (colRes.ok) {
        const colData = await colRes.json();
        setCollections(colData.collections || []);
      }
      if (prodRes.ok) {
        const prodData = await prodRes.json();
        setProducts(prodData.products || []);
      }
    } catch {
      showToast('Error loading collections data', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user]);

  // Filtered collections
  const filteredCollections = useMemo(() => {
    if (!searchQuery.trim()) return collections;
    const q = searchQuery.toLowerCase();
    return collections.filter(
      (c) => c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q)
    );
  }, [collections, searchQuery]);

  // Open Create
  const handleOpenCreate = () => {
    setEditingCollection(null);
    setForm(BLANK_COLLECTION);
    setDrawerOpen(true);
  };

  // Open Edit
  const handleOpenEdit = (col: Collection) => {
    setEditingCollection(col);
    setForm({
      name: col.name,
      slug: col.slug,
      description: col.description || '',
      productIds: col.productIds || [],
      isActive: col.isActive ?? true,
    });
    setDrawerOpen(true);
  };

  // Name change (auto slug)
  const handleNameChange = (name: string) => {
    setForm((prev) => ({
      ...prev,
      name,
      slug:
        !editingCollection && (!prev.slug || prev.slug === prev.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'))
          ? name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
          : prev.slug,
    }));
  };

  // Toggle product in collection
  const handleToggleProduct = (productId: string) => {
    setForm((prev) => {
      const exists = prev.productIds.includes(productId);
      return {
        ...prev,
        productIds: exists
          ? prev.productIds.filter((id) => id !== productId)
          : [...prev.productIds, productId],
      };
    });
  };

  // Save Collection
  const handleSaveCollection = async () => {
    if (!user) return;
    if (!form.name.trim() || !form.slug.trim()) {
      showToast('Name and Slug are required', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const token = await user.getIdToken();
      const payload = {
        name: form.name.trim(),
        slug: form.slug.trim(),
        description: form.description || undefined,
        productIds: form.productIds,
        isActive: form.isActive,
      };

      if (editingCollection) {
        const res = await fetch(`/api/admin/collections/${editingCollection.id}`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error?.message || 'Failed to update collection');
        }
        showToast('Collection updated successfully', 'success');
      } else {
        const res = await fetch('/api/admin/collections', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error?.message || 'Failed to create collection');
        }
        showToast('Collection created successfully', 'success');
      }

      setDrawerOpen(false);
      fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error saving collection';
      showToast(msg, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Archive Collection
  const handleArchiveCollection = async () => {
    if (!user || !collectionToArchive) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/collections/${collectionToArchive.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ isActive: false }),
      });
      if (!res.ok) throw new Error('Failed to archive collection');
      showToast(`Collection "${collectionToArchive.name}" archived`, 'success');
      setShowArchiveConfirm(false);
      setCollectionToArchive(null);
      fetchData();
    } catch {
      showToast('Error archiving collection', 'error');
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line pb-4">
        <div>
          <h1 className="text-xl md:text-2xl font-display font-bold text-ink">
            Curated Collections
          </h1>
          <p className="text-xs text-ink/60">
            Create custom curated product groups (e.g. &quot;Anniversary Specials&quot;, &quot;Minimalist Wood Frames&quot;) for campaign landing pages and homepage blocks.
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenCreate}
          className="px-4 py-2 rounded-xl bg-gold hover:bg-gold-deep text-ink text-xs font-semibold transition-colors shadow-xs"
        >
          + Add Collection
        </button>
      </div>

      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-ink/40 text-xs">
            🔍
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search collections by name or slug..."
            className="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink placeholder:text-ink/40 focus:outline-none focus:border-gold"
          />
        </div>
      </div>

      {/* Collections Grid / List */}
      <div className="rounded-2xl border border-line bg-paper shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-3 animate-pulse">
            <div className="h-12 bg-field rounded-xl" />
            <div className="h-12 bg-field rounded-xl" />
          </div>
        ) : filteredCollections.length === 0 ? (
          <div className="p-12 text-center text-xs text-ink/50 space-y-3">
            <p>No collections found.</p>
            <button
              type="button"
              onClick={handleOpenCreate}
              className="px-3.5 py-1.5 rounded-xl bg-gold text-ink text-xs font-semibold"
            >
              Create First Collection
            </button>
          </div>
        ) : (
          <div className="divide-y divide-line">
            {filteredCollections.map((col) => (
              <div
                key={col.id}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-field/30 transition-colors"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-ink">{col.name}</span>
                    <StatusChip status={col.isActive ? 'published' : 'archived'} />
                  </div>
                  <div className="flex items-center gap-2 text-2xs text-ink/50 font-mono mt-0.5">
                    <span>/collections/{col.slug}</span>
                    <span>·</span>
                    <span>{col.productIds?.length || 0} product{(col.productIds?.length || 0) !== 1 ? 's' : ''}</span>
                  </div>
                  {col.description && (
                    <p className="text-2xs text-ink/70 mt-1 line-clamp-1">{col.description}</p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(col)}
                    className="px-3 py-1.5 rounded-lg bg-gold/10 hover:bg-gold/20 text-gold-deep text-2xs font-bold transition-colors"
                  >
                    Edit
                  </button>
                  {col.isActive && (
                    <button
                      type="button"
                      onClick={() => {
                        setCollectionToArchive(col);
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

      {/* Create / Edit Drawer */}
      <AdminDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={editingCollection ? `Edit: ${editingCollection.name}` : 'New Collection'}
        subtitle="Configure curated product list and campaign slug"
      >
        <div className="space-y-4">
          <FormField label="Collection Name" required>
            <input
              type="text"
              value={form.name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g. Anniversary Collection"
              className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:outline-none focus:border-gold"
            />
          </FormField>

          <FormField label="URL Slug" required hint="e.g. anniversary-collection">
            <input
              type="text"
              value={form.slug}
              onChange={(e) => setForm((prev) => ({ ...prev, slug: e.target.value }))}
              placeholder="anniversary-collection"
              className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink font-mono focus:outline-none focus:border-gold"
            />
          </FormField>

          <FormField label="Description">
            <textarea
              rows={2}
              value={form.description || ''}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="Handcrafted photo gifts to celebrate your timeless milestones..."
              className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:outline-none focus:border-gold"
            />
          </FormField>

          <div className="pt-2 border-t border-line space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-2xs font-bold text-ink uppercase tracking-wider">
                Select Products ({form.productIds.length} selected)
              </span>
            </div>

            <div className="max-h-60 overflow-y-auto border border-line rounded-xl divide-y divide-line bg-paper">
              {products.map((p) => {
                const isChecked = form.productIds.includes(p.id);
                return (
                  <label
                    key={p.id}
                    className={`flex items-center gap-3 p-2.5 cursor-pointer hover:bg-field transition-colors ${
                      isChecked ? 'bg-gold/5' : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleToggleProduct(p.id)}
                      className="rounded text-gold focus:ring-gold"
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-semibold text-ink block truncate">{p.title}</span>
                      <span className="text-2xs text-ink/50 font-mono">₹{p.basePrice} · /{p.slug}</span>
                    </div>
                  </label>
                );
              })}
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
              <span className="text-xs font-bold text-ink block">Collection Active</span>
              <span className="text-2xs text-ink/60">
                Visible on campaign links and collection landing pages.
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
              onClick={handleSaveCollection}
              disabled={isSaving}
              className="px-5 py-2 rounded-xl bg-gold hover:bg-gold-deep text-ink text-xs font-bold transition-colors disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : editingCollection ? 'Save Changes' : 'Create Collection'}
            </button>
          </div>
        </div>
      </AdminDrawer>

      {/* Archive Confirmation */}
      <ConfirmModal
        isOpen={showArchiveConfirm}
        onClose={() => setShowArchiveConfirm(false)}
        onConfirm={handleArchiveCollection}
        title="Archive Collection"
        message={`Are you sure you want to archive "${collectionToArchive?.name}"?`}
        confirmText="Archive Collection"
        variant="danger"
      />
    </div>
  );
}
