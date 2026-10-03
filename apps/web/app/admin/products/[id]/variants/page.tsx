'use client';

import { useEffect, useState, use, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../../../lib/auth-context';
import { AdminDrawer } from '../../../../../components/admin/AdminDrawer';
import { AdminModal } from '../../../../../components/admin/AdminModal';
import { StatusChip } from '../../../../../components/admin/StatusChip';
import { FormField, SaveBar } from '../../../../../components/admin/AdminForm';
import { useToast } from '../../../../../components/ui/Toast';
import type { Variant, StockStatus, Product } from '@bro-pics/shared';

interface VariantMatrixPageProps {
  params: Promise<{ id: string }>;
}

interface MatrixCell {
  sizeLabel: string;
  widthIn: number;
  heightIn: number;
  frameColour: string;
  variant?: Variant;
  // Local staged changes
  sku: string;
  price: number;
  compareAtPrice?: number;
  stockStatus: StockStatus;
  isActive: boolean;
  isCustomized?: boolean;
}

const DEFAULT_SIZES = [
  { label: '6x8 in', width: 6, height: 8 },
  { label: '8x12 in', width: 8, height: 12 },
  { label: '12x18 in', width: 12, height: 18 },
  { label: '16x24 in', width: 16, height: 24 },
];

const DEFAULT_COLOURS = ['Classic Black', 'Natural Teak', 'Antique Gold', 'White Matte'];

export default function VariantMatrixPage({ params }: VariantMatrixPageProps) {
  const { id: productId } = use(params);
  const router = useRouter();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [product, setProduct] = useState<Product | null>(null);
  const [existingVariants, setExistingVariants] = useState<Variant[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  // Matrix dimensions
  const [sizes, setSizes] = useState<{ label: string; width: number; height: number }[]>(DEFAULT_SIZES);
  const [colours, setColours] = useState<string[]>(DEFAULT_COLOURS);

  // Matrix data state: key is `${sizeLabel}::${frameColour}`
  const [matrixData, setMatrixData] = useState<Record<string, MatrixCell>>({});

  // Drawer & Modal states
  const [selectedCellKey, setSelectedCellKey] = useState<string | null>(null);
  const [showAddSizeModal, setShowAddSizeModal] = useState(false);
  const [showAddColourModal, setShowAddColourModal] = useState(false);
  const [showBulkPriceModal, setShowBulkPriceModal] = useState<{ type: 'row' | 'col'; target: string } | null>(null);

  // New dimension inputs
  const [newSizeLabel, setNewSizeLabel] = useState('');
  const [newSizeWidth, setNewSizeWidth] = useState(10);
  const [newSizeHeight, setNewSizeHeight] = useState(14);
  const [newColourName, setNewColourName] = useState('');
  const [bulkPriceValue, setBulkPriceValue] = useState(999);

  // Fetch product and variants
  useEffect(() => {
    if (!user) return;

    user.getIdToken().then((token) => {
      // 1. Fetch Product
      fetch(`/api/admin/products?id=${productId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => res.json())
        .then((data) => {
          const p = data.products?.find((item: Product) => item.id === productId);
          if (p) setProduct(p);
        })
        .catch(() => {});

      // 2. Fetch existing variants
      fetch(`/api/admin/products/${productId}/variants`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => res.json())
        .then((data) => {
          const fetchedVariants: Variant[] = data.variants || [];
          setExistingVariants(fetchedVariants);

          // Extract distinct sizes & colours from existing variants if any
          const extractedSizes: { label: string; width: number; height: number }[] = [];
          const extractedColours: string[] = [];

          fetchedVariants.forEach((v) => {
            if (!extractedSizes.some((s) => s.label === v.sizeLabel)) {
              extractedSizes.push({
                label: v.sizeLabel,
                width: v.widthIn,
                height: v.heightIn,
              });
            }
            if (!extractedColours.includes(v.frameColour)) {
              extractedColours.push(v.frameColour);
            }
          });

          const activeSizes = extractedSizes.length > 0 ? extractedSizes : DEFAULT_SIZES;
          const activeColours = extractedColours.length > 0 ? extractedColours : DEFAULT_COLOURS;

          setSizes(activeSizes);
          setColours(activeColours);

          // Build matrix map
          const initialMap: Record<string, MatrixCell> = {};
          activeSizes.forEach((s) => {
            activeColours.forEach((c) => {
              const key = `${s.label}::${c}`;
              const found = fetchedVariants.find((v) => v.sizeLabel === s.label && v.frameColour === c);
              if (found) {
                initialMap[key] = {
                  sizeLabel: s.label,
                  widthIn: s.width,
                  heightIn: s.height,
                  frameColour: c,
                  variant: found,
                  sku: found.sku,
                  price: found.price,
                  compareAtPrice: found.compareAtPrice,
                  stockStatus: found.stockStatus,
                  isActive: found.isActive,
                  isCustomized: false,
                };
              } else {
                // Default generated cell
                const slugPart = (product?.slug || productId).slice(0, 4).toUpperCase();
                const sizePart = s.label.replace(/[^0-9x]/gi, '').toUpperCase();
                const colPart = c.slice(0, 3).toUpperCase();
                initialMap[key] = {
                  sizeLabel: s.label,
                  widthIn: s.width,
                  heightIn: s.height,
                  frameColour: c,
                  sku: `BP-${slugPart}-${sizePart}-${colPart}`,
                  price: 999,
                  stockStatus: 'in_stock',
                  isActive: true,
                  isCustomized: false,
                };
              }
            });
          });

          setMatrixData(initialMap);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    });
  }, [productId, user]);

  const activeCell = selectedCellKey ? matrixData[selectedCellKey] : null;

  // Update a single cell in local matrix state
  const handleUpdateCell = (key: string, updates: Partial<MatrixCell>) => {
    setMatrixData((prev) => {
      const existing = prev[key];
      if (!existing) return prev;
      return {
        ...prev,
        [key]: {
          ...existing,
          ...updates,
          isCustomized: true,
        },
      };
    });
    setIsDirty(true);
  };

  // Bulk set price for a row (Size) or column (Colour)
  const handleApplyBulkPrice = () => {
    if (!showBulkPriceModal) return;
    const { type, target } = showBulkPriceModal;

    setMatrixData((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((key) => {
        const cell = next[key];
        if (type === 'row' && cell.sizeLabel === target) {
          next[key] = { ...cell, price: bulkPriceValue, isCustomized: true };
        } else if (type === 'col' && cell.frameColour === target) {
          next[key] = { ...cell, price: bulkPriceValue, isCustomized: true };
        }
      });
      return next;
    });

    setIsDirty(true);
    setShowBulkPriceModal(null);
    showToast(`Updated price to ₹${bulkPriceValue} for ${target}`, 'success');
  };

  // Add Size Row
  const handleAddSize = () => {
    if (!newSizeLabel.trim()) {
      showToast('Please enter a valid size label', 'error');
      return;
    }
    const newSize = {
      label: newSizeLabel.trim(),
      width: Number(newSizeWidth),
      height: Number(newSizeHeight),
    };

    setSizes((prev) => [...prev, newSize]);

    // Populate new matrix cells for this size
    setMatrixData((prev) => {
      const next = { ...prev };
      colours.forEach((c) => {
        const key = `${newSize.label}::${c}`;
        const slugPart = (product?.slug || productId).slice(0, 4).toUpperCase();
        const sizePart = newSize.label.replace(/[^0-9x]/gi, '').toUpperCase();
        const colPart = c.slice(0, 3).toUpperCase();
        next[key] = {
          sizeLabel: newSize.label,
          widthIn: newSize.width,
          heightIn: newSize.height,
          frameColour: c,
          sku: `BP-${slugPart}-${sizePart}-${colPart}`,
          price: 999,
          stockStatus: 'in_stock',
          isActive: true,
          isCustomized: true,
        };
      });
      return next;
    });

    setIsDirty(true);
    setShowAddSizeModal(false);
    setNewSizeLabel('');
    showToast(`Added size ${newSize.label}`, 'success');
  };

  // Add Colour Column
  const handleAddColour = () => {
    if (!newColourName.trim()) {
      showToast('Please enter a valid colour name', 'error');
      return;
    }
    const colName = newColourName.trim();
    setColours((prev) => [...prev, colName]);

    // Populate new matrix cells for this colour
    setMatrixData((prev) => {
      const next = { ...prev };
      sizes.forEach((s) => {
        const key = `${s.label}::${colName}`;
        const slugPart = (product?.slug || productId).slice(0, 4).toUpperCase();
        const sizePart = s.label.replace(/[^0-9x]/gi, '').toUpperCase();
        const colPart = colName.slice(0, 3).toUpperCase();
        next[key] = {
          sizeLabel: s.label,
          widthIn: s.width,
          heightIn: s.height,
          frameColour: colName,
          sku: `BP-${slugPart}-${sizePart}-${colPart}`,
          price: 999,
          stockStatus: 'in_stock',
          isActive: true,
          isCustomized: true,
        };
      });
      return next;
    });

    setIsDirty(true);
    setShowAddColourModal(false);
    setNewColourName('');
    showToast(`Added frame colour ${colName}`, 'success');
  };

  // Auto-generate SKUs
  const handleAutoGenerateSkus = () => {
    setMatrixData((prev) => {
      const next = { ...prev };
      const slugPart = (product?.slug || productId).slice(0, 4).toUpperCase();
      Object.keys(next).forEach((key) => {
        const cell = next[key];
        const sizePart = cell.sizeLabel.replace(/[^0-9x]/gi, '').toUpperCase() || 'STD';
        const colPart = cell.frameColour.slice(0, 3).toUpperCase();
        next[key] = {
          ...cell,
          sku: `BP-${slugPart}-${sizePart}-${colPart}`,
          isCustomized: true,
        };
      });
      return next;
    });
    setIsDirty(true);
    showToast('Auto-generated SKUs across matrix', 'info');
  };

  // Save all variants to server
  const handleSaveAll = async () => {
    if (!user) return;
    setIsSaving(true);

    try {
      const token = await user.getIdToken();
      const cellsToProcess = Object.values(matrixData);

      // Separate into existing variants to update and new variants to create
      const existingUpdates = cellsToProcess.filter((c) => c.variant?.id && c.isCustomized);
      const newToCreate = cellsToProcess.filter((c) => !c.variant?.id);

      // 1. Update existing variants via PATCH
      for (const item of existingUpdates) {
        if (!item.variant?.id) continue;
        await fetch(`/api/admin/products/${productId}/variants/${item.variant.id}`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sku: item.sku,
            price: item.price,
            compareAtPrice: item.compareAtPrice,
            stockStatus: item.stockStatus,
            isActive: item.isActive,
            sizeLabel: item.sizeLabel,
            widthIn: item.widthIn,
            heightIn: item.heightIn,
            frameColour: item.frameColour,
          }),
        });
      }

      // 2. Create new variants via POST /bulk
      if (newToCreate.length > 0) {
        const payload = {
          variants: newToCreate.map((item) => ({
            sku: item.sku,
            sizeLabel: item.sizeLabel,
            widthIn: item.widthIn,
            heightIn: item.heightIn,
            frameColour: item.frameColour,
            price: item.price,
            compareAtPrice: item.compareAtPrice,
            stockStatus: item.stockStatus,
            isActive: item.isActive,
            material: 'wood',
          })),
        };

        const res = await fetch(`/api/admin/products/${productId}/variants/bulk`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error?.message || errData.error || 'Failed to bulk create variants');
        }
      }

      showToast('Variants saved successfully', 'success');
      setIsDirty(false);
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save variants';
      showToast(msg, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 space-y-4 animate-pulse">
        <div className="h-6 w-48 bg-field rounded-lg" />
        <div className="h-10 w-96 bg-field rounded-xl" />
        <div className="h-64 w-full bg-field rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Header & Breadcrumbs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line pb-4">
        <div>
          <div className="flex items-center gap-2 text-2xs text-ink/50 mb-1">
            <Link href="/admin/products" className="hover:text-gold transition-colors">Products</Link>
            <span>/</span>
            <Link href={`/admin/products/${productId}`} className="hover:text-gold transition-colors">
              {product?.title || productId}
            </Link>
            <span>/</span>
            <span className="text-ink font-semibold">Variant Matrix</span>
          </div>
          <h1 className="text-xl md:text-2xl font-display font-bold text-ink">
            Size × Colour Matrix Editor
          </h1>
          <p className="text-xs text-ink/60">
            Configure SKUs, pricing, and live inventory across {sizes.length} sizes and {colours.length} frame colours.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleAutoGenerateSkus}
            className="px-3 py-1.5 rounded-xl border border-line bg-paper hover:bg-field text-ink text-xs font-semibold transition-colors"
          >
            Auto-Gen SKUs
          </button>
          <button
            type="button"
            onClick={() => setShowAddColourModal(true)}
            className="px-3 py-1.5 rounded-xl border border-line bg-paper hover:bg-field text-ink text-xs font-semibold transition-colors"
          >
            + Add Colour
          </button>
          <button
            type="button"
            onClick={() => setShowAddSizeModal(true)}
            className="px-3.5 py-1.5 rounded-xl bg-gold hover:bg-gold-deep text-ink text-xs font-semibold transition-colors shadow-xs"
          >
            + Add Size Row
          </button>
        </div>
      </div>

      {/* 2D Matrix Grid */}
      <div className="rounded-2xl border border-line bg-paper shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-field/70 border-b border-line text-2xs uppercase tracking-wider text-ink/60 font-semibold">
                <th className="p-3 sticky left-0 bg-field z-10 min-w-[160px] border-r border-line">
                  Size \ Colour
                </th>
                {colours.map((colour) => (
                  <th key={colour} className="p-3 min-w-[200px] border-r border-line last:border-r-0">
                    <div className="flex items-center justify-between">
                      <span>{colour}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setBulkPriceValue(999);
                          setShowBulkPriceModal({ type: 'col', target: colour });
                        }}
                        className="text-2xs text-gold hover:underline capitalize"
                      >
                        Set Price
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line text-xs">
              {sizes.map((size) => (
                <tr key={size.label} className="hover:bg-field/30 transition-colors">
                  {/* Row Header (Size) */}
                  <td className="p-3 sticky left-0 bg-paper font-semibold text-ink border-r border-line shadow-[2px_0_4px_rgba(0,0,0,0.02)]">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-bold text-xs">{size.label}</span>
                      <span className="text-2xs text-ink/40 font-mono">
                        {size.width}&quot; × {size.height}&quot; ({size.width * 300}×{size.height * 300}px)
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setBulkPriceValue(999);
                          setShowBulkPriceModal({ type: 'row', target: size.label });
                        }}
                        className="text-2xs text-gold hover:underline text-left mt-1"
                      >
                        Set Row Price
                      </button>
                    </div>
                  </td>

                  {/* Columns (Colours) */}
                  {colours.map((colour) => {
                    const key = `${size.label}::${colour}`;
                    const cell = matrixData[key] || {
                      sizeLabel: size.label,
                      widthIn: size.width,
                      heightIn: size.height,
                      frameColour: colour,
                      sku: `SKU-${size.label}-${colour}`,
                      price: 999,
                      stockStatus: 'in_stock',
                      isActive: true,
                    };

                    return (
                      <td
                        key={colour}
                        onClick={() => setSelectedCellKey(key)}
                        className={`p-3 border-r border-line last:border-r-0 cursor-pointer transition-all hover:bg-gold/5 ${
                          !cell.isActive ? 'opacity-50 bg-field/40' : ''
                        }`}
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-2xs text-ink/70 font-semibold truncate max-w-[120px]">
                              {cell.sku}
                            </span>
                            <StatusChip status={cell.stockStatus} />
                          </div>

                          <div className="flex items-baseline justify-between">
                            <div className="flex items-baseline gap-1">
                              <span className="text-sm font-bold text-ink">₹{cell.price}</span>
                              {cell.compareAtPrice && cell.compareAtPrice > cell.price && (
                                <span className="text-2xs line-through text-ink/40">₹{cell.compareAtPrice}</span>
                              )}
                            </div>
                            <span className="text-2xs text-gold hover:underline font-semibold">
                              Edit ↗
                            </span>
                          </div>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Cell Detail Drawer */}
      <AdminDrawer
        isOpen={Boolean(selectedCellKey)}
        onClose={() => setSelectedCellKey(null)}
        title={activeCell ? `${activeCell.sizeLabel} — ${activeCell.frameColour}` : 'Variant Details'}
        subtitle={activeCell?.sku}
      >
        {activeCell && selectedCellKey && (
          <div className="space-y-5">
            <FormField label="SKU Code" required hint="Unique stock keeping unit">
              <input
                type="text"
                value={activeCell.sku}
                onChange={(e) => handleUpdateCell(selectedCellKey, { sku: e.target.value })}
                className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink font-mono focus:outline-none focus:border-gold"
              />
            </FormField>

            <div className="grid grid-cols-2 gap-3">
              <FormField label="Selling Price (₹)" required>
                <input
                  type="number"
                  value={activeCell.price}
                  onChange={(e) => handleUpdateCell(selectedCellKey, { price: Number(e.target.value) || 0 })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink font-bold focus:outline-none focus:border-gold"
                />
              </FormField>

              <FormField label="Compare-at Price (₹)" hint="MSRP / Strike-through">
                <input
                  type="number"
                  value={activeCell.compareAtPrice || ''}
                  onChange={(e) =>
                    handleUpdateCell(selectedCellKey, {
                      compareAtPrice: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                  placeholder="Optional"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:outline-none focus:border-gold"
                />
              </FormField>
            </div>

            <FormField label="Stock Status" required>
              <select
                value={activeCell.stockStatus}
                onChange={(e) =>
                  handleUpdateCell(selectedCellKey, { stockStatus: e.target.value as StockStatus })
                }
                className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:outline-none focus:border-gold"
              >
                <option value="in_stock">In Stock</option>
                <option value="out_of_stock">Out of Stock</option>
                <option value="backorder">Backorder</option>
              </select>
            </FormField>

            <div className="p-3 rounded-xl border border-line bg-field space-y-1.5">
              <span className="text-2xs font-bold text-ink uppercase tracking-wider block">Print Specifications</span>
              <div className="text-2xs text-ink/70 space-y-1">
                <div className="flex justify-between">
                  <span>Aspect Ratio:</span>
                  <span className="font-mono font-semibold">{(activeCell.widthIn / activeCell.heightIn).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Print Resolution (300 DPI):</span>
                  <span className="font-mono font-semibold">{activeCell.widthIn * 300} × {activeCell.heightIn * 300} px</span>
                </div>
                <div className="flex justify-between">
                  <span>Min Upload Threshold:</span>
                  <span className="font-mono font-semibold">{Math.round(activeCell.widthIn * 150)} × {Math.round(activeCell.heightIn * 150)} px</span>
                </div>
              </div>
            </div>

            <label className="flex items-start gap-3 p-3 rounded-xl border border-line bg-field cursor-pointer">
              <input
                type="checkbox"
                checked={activeCell.isActive}
                onChange={(e) => handleUpdateCell(selectedCellKey, { isActive: e.target.checked })}
                className="mt-0.5 rounded text-gold focus:ring-gold"
              />
              <div>
                <span className="text-xs font-bold text-ink block">Variant Active</span>
                <span className="text-2xs text-ink/60">
                  When disabled, this size/colour combination is hidden on the storefront customizer.
                </span>
              </div>
            </label>
          </div>
        )}
      </AdminDrawer>

      {/* Add Size Modal */}
      <AdminModal
        isOpen={showAddSizeModal}
        onClose={() => setShowAddSizeModal(false)}
        title="Add Frame Size Row"
      >
        <div className="space-y-4">
          <FormField label="Size Label" required hint="e.g. 10x14 in, A4 Size">
            <input
              type="text"
              value={newSizeLabel}
              onChange={(e) => setNewSizeLabel(e.target.value)}
              placeholder="10x14 in"
              className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:outline-none focus:border-gold"
            />
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Width (Inches)" required>
              <input
                type="number"
                step="0.5"
                value={newSizeWidth}
                onChange={(e) => setNewSizeWidth(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:outline-none focus:border-gold"
              />
            </FormField>
            <FormField label="Height (Inches)" required>
              <input
                type="number"
                step="0.5"
                value={newSizeHeight}
                onChange={(e) => setNewSizeHeight(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:outline-none focus:border-gold"
              />
            </FormField>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowAddSizeModal(false)}
              className="px-3.5 py-2 rounded-xl border border-line text-xs font-semibold hover:bg-field"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAddSize}
              className="px-4 py-2 rounded-xl bg-gold hover:bg-gold-deep text-ink text-xs font-semibold"
            >
              Add Size Row
            </button>
          </div>
        </div>
      </AdminModal>

      {/* Add Colour Modal */}
      <AdminModal
        isOpen={showAddColourModal}
        onClose={() => setShowAddColourModal(false)}
        title="Add Frame Colour Column"
      >
        <div className="space-y-4">
          <FormField label="Colour Name" required hint="e.g. Walnut Brown, Rosewood">
            <input
              type="text"
              value={newColourName}
              onChange={(e) => setNewColourName(e.target.value)}
              placeholder="Walnut Brown"
              className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:outline-none focus:border-gold"
            />
          </FormField>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowAddColourModal(false)}
              className="px-3.5 py-2 rounded-xl border border-line text-xs font-semibold hover:bg-field"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAddColour}
              className="px-4 py-2 rounded-xl bg-gold hover:bg-gold-deep text-ink text-xs font-semibold"
            >
              Add Colour Column
            </button>
          </div>
        </div>
      </AdminModal>

      {/* Bulk Price Modal */}
      <AdminModal
        isOpen={Boolean(showBulkPriceModal)}
        onClose={() => setShowBulkPriceModal(null)}
        title={`Set Bulk Price for ${showBulkPriceModal?.target}`}
      >
        <div className="space-y-4">
          <FormField label="New Price (₹)" required>
            <input
              type="number"
              value={bulkPriceValue}
              onChange={(e) => setBulkPriceValue(Number(e.target.value))}
              className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink font-bold focus:outline-none focus:border-gold"
            />
          </FormField>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowBulkPriceModal(null)}
              className="px-3.5 py-2 rounded-xl border border-line text-xs font-semibold hover:bg-field"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApplyBulkPrice}
              className="px-4 py-2 rounded-xl bg-gold hover:bg-gold-deep text-ink text-xs font-semibold"
            >
              Apply to All {showBulkPriceModal?.type === 'row' ? 'Colours' : 'Sizes'}
            </button>
          </div>
        </div>
      </AdminModal>

      {/* Floating Save Bar */}
      <SaveBar
        isDirty={isDirty}
        isSaving={isSaving}
        onSave={handleSaveAll}
        onReset={() => {
          setIsDirty(false);
          router.refresh();
        }}
      />
    </div>
  );
}
