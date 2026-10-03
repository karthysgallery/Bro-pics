'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useAuth } from '../../../lib/auth-context';
import { StatusChip } from '../../../components/admin/StatusChip';
import { SaveBar } from '../../../components/admin/AdminForm';
import { useToast } from '../../../components/ui/Toast';
import type { StockStatus } from '@bro-pics/shared';
import type { InventoryVariantItem } from '../../api/admin/inventory/route';

type FilterTab = 'all' | 'in_stock' | 'out_of_stock' | 'backorder';

export default function AdminInventoryPage() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [items, setItems] = useState<InventoryVariantItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<FilterTab>('all');

  // Staged modifications: key is variantId, value is new StockStatus
  const [stagedChanges, setStagedChanges] = useState<Record<string, { productId: string; stockStatus: StockStatus }>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);

  // Fetch inventory
  const fetchInventory = async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/inventory', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load inventory');
      const data = await res.json();
      setItems(data.items || []);
    } catch {
      showToast('Error loading inventory items', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInventory();
  }, [user]);

  // Handle single item stock change
  const handleStockChange = (productId: string, variantId: string, newStatus: StockStatus) => {
    setStagedChanges((prev) => ({
      ...prev,
      [variantId]: { productId, stockStatus: newStatus },
    }));
  };

  // Bulk set status for selected items
  const handleBulkSetStatus = (newStatus: StockStatus) => {
    if (selectedIds.size === 0) return;
    setStagedChanges((prev) => {
      const next = { ...prev };
      selectedIds.forEach((id) => {
        const item = items.find((i) => i.variantId === id);
        if (item) {
          next[id] = { productId: item.productId, stockStatus: newStatus };
        }
      });
      return next;
    });
    showToast(`Staged ${selectedIds.size} items as ${newStatus.replace('_', ' ')}`, 'info');
  };

  // Filtered Items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const currentStatus = stagedChanges[item.variantId]?.stockStatus || item.stockStatus;

      // Status filter
      if (activeTab !== 'all' && currentStatus !== activeTab) {
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          item.sku.toLowerCase().includes(q) ||
          item.productTitle.toLowerCase().includes(q) ||
          item.sizeLabel.toLowerCase().includes(q) ||
          item.frameColour.toLowerCase().includes(q)
        );
      }

      return true;
    });
  }, [items, stagedChanges, activeTab, searchQuery]);

  // Toggle selection
  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(new Set(filteredItems.map((i) => i.variantId)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const isAllSelected = filteredItems.length > 0 && filteredItems.every((i) => selectedIds.has(i.variantId));

  // Save changes to API
  const handleSaveAll = async () => {
    if (!user) return;
    const updates = Object.entries(stagedChanges).map(([variantId, data]) => ({
      productId: data.productId,
      variantId,
      stockStatus: data.stockStatus,
    }));

    if (updates.length === 0) return;

    setIsSaving(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/inventory/bulk-update', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ updates }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error?.message || 'Failed to update stock statuses');
      }

      showToast(`Updated stock status for ${updates.length} variants`, 'success');
      setStagedChanges({});
      setSelectedIds(new Set());
      fetchInventory();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error updating stock';
      showToast(msg, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const dirtyCount = Object.keys(stagedChanges).length;

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line pb-4">
        <div>
          <h1 className="text-xl md:text-2xl font-display font-bold text-ink">
            Inventory & Stock Control
          </h1>
          <p className="text-xs text-ink/60">
            Rapidly toggle stock availability across catalogue variants. Changes propagate instantly to storefront add-to-cart buttons.
          </p>
        </div>

        {dirtyCount > 0 && (
          <div className="flex items-center gap-2 bg-gold/10 border border-gold/30 px-3 py-1.5 rounded-xl text-xs font-semibold text-gold-deep">
            <span>⚡ {dirtyCount} unsaved change{dirtyCount > 1 ? 's' : ''}</span>
          </div>
        )}
      </div>

      {/* Tabs & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-1 border-b border-line sm:border-b-0">
          {[
            { key: 'all', label: 'All Items', count: items.length },
            {
              key: 'in_stock',
              label: 'In Stock',
              count: items.filter((i) => (stagedChanges[i.variantId]?.stockStatus || i.stockStatus) === 'in_stock').length,
            },
            {
              key: 'out_of_stock',
              label: 'Out of Stock',
              count: items.filter((i) => (stagedChanges[i.variantId]?.stockStatus || i.stockStatus) === 'out_of_stock').length,
            },
            {
              key: 'backorder',
              label: 'Backorder',
              count: items.filter((i) => (stagedChanges[i.variantId]?.stockStatus || i.stockStatus) === 'backorder').length,
            },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key as FilterTab)}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                activeTab === tab.key
                  ? 'bg-ink text-gold font-bold shadow-xs'
                  : 'text-ink/60 hover:text-ink hover:bg-field'
              }`}
            >
              {tab.label} <span className="opacity-70 text-2xs">({tab.count})</span>
            </button>
          ))}
        </div>

        <div className="relative flex-1 max-w-xs">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-ink/40 text-xs">
            🔍
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search SKU or product title..."
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-line bg-paper text-ink placeholder:text-ink/40 focus:outline-none focus:border-gold"
          />
        </div>
      </div>

      {/* Bulk Action Toolbar */}
      {selectedIds.size > 0 && (
        <div className="p-3 bg-ink text-paper rounded-xl flex items-center justify-between shadow-md animate-fadeIn">
          <span className="text-xs font-semibold pl-2">
            {selectedIds.size} variant{selectedIds.size > 1 ? 's' : ''} selected
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleBulkSetStatus('in_stock')}
              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-paper text-2xs font-bold rounded-lg transition-colors"
            >
              Mark In Stock
            </button>
            <button
              type="button"
              onClick={() => handleBulkSetStatus('out_of_stock')}
              className="px-3 py-1 bg-red-600 hover:bg-red-500 text-paper text-2xs font-bold rounded-lg transition-colors"
            >
              Mark Out of Stock
            </button>
            <button
              type="button"
              onClick={() => handleBulkSetStatus('backorder')}
              className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-paper text-2xs font-bold rounded-lg transition-colors"
            >
              Mark Backorder
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="px-2 py-1 text-paper/60 hover:text-paper text-2xs transition-colors ml-2"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-2xl border border-line bg-paper shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-3 animate-pulse">
            <div className="h-10 bg-field rounded-xl" />
            <div className="h-10 bg-field rounded-xl" />
            <div className="h-10 bg-field rounded-xl" />
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="p-12 text-center text-xs text-ink/50">
            No variants found matching the selected filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-field/70 border-b border-line text-2xs uppercase tracking-wider text-ink/60 font-semibold">
                  <th className="p-3 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={handleSelectAll}
                      className="rounded text-gold focus:ring-gold"
                    />
                  </th>
                  <th className="p-3">SKU</th>
                  <th className="p-3">Product Title</th>
                  <th className="p-3">Size & Colour</th>
                  <th className="p-3">Price</th>
                  <th className="p-3">Current Status</th>
                  <th className="p-3 text-right">Rapid Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filteredItems.map((item) => {
                  const staged = stagedChanges[item.variantId];
                  const currentStatus = staged ? staged.stockStatus : item.stockStatus;
                  const isModified = Boolean(staged);
                  const isSelected = selectedIds.has(item.variantId);

                  return (
                    <tr
                      key={item.variantId}
                      className={`hover:bg-field/30 transition-colors ${
                        isModified ? 'bg-gold/5' : ''
                      } ${isSelected ? 'bg-gold/10' : ''}`}
                    >
                      <td className="p-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelect(item.variantId)}
                          className="rounded text-gold focus:ring-gold"
                        />
                      </td>
                      <td className="p-3 font-mono font-bold text-ink">
                        {item.sku}
                      </td>
                      <td className="p-3">
                        <Link
                          href={`/admin/products/${item.productId}`}
                          className="font-semibold text-ink hover:text-gold transition-colors"
                        >
                          {item.productTitle}
                        </Link>
                      </td>
                      <td className="p-3 text-ink/70">
                        {item.sizeLabel} · {item.frameColour}
                      </td>
                      <td className="p-3 font-bold text-ink">
                        ₹{item.price}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <StatusChip status={currentStatus} />
                          {isModified && (
                            <span className="text-2xs font-semibold text-gold-deep bg-gold/10 px-1.5 py-0.5 rounded">
                              Modified
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-3 text-right">
                        <select
                          value={currentStatus}
                          onChange={(e) =>
                            handleStockChange(item.productId, item.variantId, e.target.value as StockStatus)
                          }
                          className="px-2.5 py-1 text-2xs font-semibold rounded-lg border border-line bg-paper text-ink focus:outline-none focus:border-gold"
                        >
                          <option value="in_stock">In Stock</option>
                          <option value="out_of_stock">Out of Stock</option>
                          <option value="backorder">Backorder</option>
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Floating Save Bar */}
      <SaveBar
        isDirty={dirtyCount > 0}
        isSaving={isSaving}
        onSave={handleSaveAll}
        onReset={() => setStagedChanges({})}
      />
    </div>
  );
}
