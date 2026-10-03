'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '../../../lib/auth-context';
import { formatPaise } from '../../../lib/format-price';
import { DataTable, type Column, type BulkAction } from '../../../components/admin/DataTable';
import { StatusChip } from '../../../components/admin/StatusChip';
import { useToast } from '../../../components/ui/Toast';
import type { Product } from '@bro-pics/shared';

export default function AdminProductsPage() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'draft' | 'archived'>('all');
  const [search, setSearch] = useState('');

  const fetchProducts = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (search.trim()) params.set('q', search.trim());

      const res = await fetch(`/api/admin/products?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error('Failed to load products');
      const data = await res.json();
      setProducts(data.products || []);
    } catch (err: any) {
      showToast(err.message || 'Could not fetch product catalog', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, [user, statusFilter, search]);

  const handleBulkStatusChange = async (selected: Product[], newStatus: 'published' | 'archived') => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      await Promise.all(
        selected.map((p) =>
          fetch(`/api/admin/products/${p.id}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ status: newStatus }),
          })
        )
      );

      showToast(`Updated ${selected.length} products to ${newStatus}`, 'success');
      fetchProducts();
    } catch (err: any) {
      showToast(err.message || 'Failed to update products in bulk', 'error');
    }
  };

  const bulkActions: BulkAction<Product>[] = [
    {
      label: 'Publish Selected',
      onClick: (rows) => handleBulkStatusChange(rows, 'published'),
    },
    {
      label: 'Archive Selected',
      variant: 'danger',
      onClick: (rows) => handleBulkStatusChange(rows, 'archived'),
    },
  ];

  const columns: Column<Product>[] = [
    {
      key: 'title',
      header: 'Product',
      sortable: true,
      render: (p) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-tint overflow-hidden border border-line flex-shrink-0">
            {p.primaryImageUrl ? (
              <img src={p.primaryImageUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xs text-ink/30">🖼️</div>
            )}
          </div>
          <div>
            <Link
              href={`/admin/products/${p.id}`}
              className="font-semibold text-ink hover:text-gold hover:underline transition-colors block"
            >
              {p.title}
            </Link>
            <span className="text-2xs text-ink/40 font-mono">{p.slug}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (p) => <StatusChip status={p.status || (p.isActive ? 'published' : 'draft')} size="sm" />,
    },
    {
      key: 'minPrice',
      header: 'Price Range',
      sortable: true,
      render: (p) => (
        <span className="font-medium text-ink">
          {p.minPrice === p.maxPrice || p.maxPrice === 0
            ? formatPaise(p.minPrice)
            : `${formatPaise(p.minPrice)} – ${formatPaise(p.maxPrice)}`}
        </span>
      ),
    },
    {
      key: 'photoSlots',
      header: 'Slots',
      render: (p) => <span className="text-ink/70">{p.photoSlots} {p.photoSlots === 1 ? 'photo' : 'photos'}</span>,
    },
    {
      key: 'inStock',
      header: 'Stock',
      render: (p) => (
        <StatusChip status={p.inStock ? 'in_stock' : 'out_of_stock'} size="sm" />
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (p) => (
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/products/${p.id}`}
            className="px-2.5 py-1 rounded-lg border border-line bg-paper text-ink hover:bg-tint font-medium text-2xs transition-colors"
          >
            Edit
          </Link>
          <Link
            href={`/admin/products/${p.id}/template`}
            className="px-2.5 py-1 rounded-lg border border-line bg-paper text-gold-deep hover:bg-tint font-medium text-2xs transition-colors"
          >
            Template
          </Link>
          <Link
            href={`/product/${p.slug}`}
            target="_blank"
            className="p-1 text-ink/40 hover:text-ink text-xs transition-colors"
            title="View on live store"
          >
            ↗
          </Link>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Products Catalogue</h1>
          <p className="text-xs text-ink/60 mt-0.5">
            Manage personalized photo frames, variant pricing, templates, and inventory
          </p>
        </div>

        <Link
          href="/admin/products/new"
          className="self-start sm:self-auto px-4 py-2 rounded-xl bg-gold hover:bg-gold-deep text-ink font-semibold text-xs transition-colors shadow-xs"
        >
          + Create Product
        </Link>
      </div>

      {/* Status Filter Tabs */}
      <div className="flex items-center gap-1 p-1 rounded-xl bg-paper border border-line w-fit">
        {(['all', 'published', 'draft', 'archived'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setStatusFilter(tab)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
              statusFilter === tab
                ? 'bg-ink text-gold font-semibold shadow-xs'
                : 'text-ink/60 hover:text-ink'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Products Table */}
      <DataTable
        data={products}
        columns={columns}
        keyExtractor={(p) => p.id}
        loading={loading}
        selectable
        bulkActions={bulkActions}
        searchPlaceholder="Filter products by title, slug, description…"
        searchValue={search}
        onSearchChange={setSearch}
        exportFilename="bropics-products.csv"
      />
    </div>
  );
}
