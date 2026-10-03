'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../../lib/auth-context';
import { StatusChip } from '../../../components/admin/StatusChip';
import type { FrameTemplate, Product, Variant } from '@bro-pics/shared';

interface PrintableRect {
  slotIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  widthMm: number;
  heightMm: number;
  zIndex?: number;
  maskUrl?: string;
}

interface TextZone {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontFamily: string;
  fontSize: number;
  color: string;
  alignment: 'left' | 'center' | 'right';
  maxChars?: number;
  placeholder?: string;
  multiline?: boolean;
}

export default function FrameTemplatesPage() {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [variants, setVariants] = useState<Variant[]>([]);
  const [selectedVariantId, setSelectedVariantId] = useState<string>('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Template editor state
  const [templateId, setTemplateId] = useState<string>('');
  const [version, setVersion] = useState<number>(1);
  const [isCurrent, setIsCurrent] = useState<boolean>(true);
  const [mockupUrl, setMockupUrl] = useState<string>('/placeholders/mockups/wood-frame-mockup.png');
  const [maskUrl, setMaskUrl] = useState<string>('');
  const [bleedMm, setBleedMm] = useState<number>(3);
  const [matInset, setMatInset] = useState<number>(0);
  const [slots, setSlots] = useState<PrintableRect[]>([
    { slotIndex: 0, x: 10, y: 10, width: 80, height: 80, widthMm: 200, heightMm: 300, zIndex: 1 },
  ]);
  const [textZones, setTextZones] = useState<TextZone[]>([]);
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number | null>(0);
  const [selectedTextZoneId, setSelectedTextZoneId] = useState<string | null>(null);

  // Test Render result
  const [testRenderUrl, setTestRenderUrl] = useState<string | null>(null);

  // Load products on mount
  useEffect(() => {
    async function loadProducts() {
      if (!user) return;
      setLoading(true);
      try {
        const token = await user.getIdToken();
        const res = await fetch('/api/admin/products', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const json = await res.json();
          const prods = json.products || [];
          setProducts(prods);
          if (prods.length > 0) {
            setSelectedProductId(prods[0].id);
          }
        }
      } catch (err) {
        console.error('Failed to load products', err);
      } finally {
        setLoading(false);
      }
    }
    loadProducts();
  }, [user]);

  // Load variants when product changes
  useEffect(() => {
    async function loadVariants() {
      if (!selectedProductId || !user) return;
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/admin/products/${selectedProductId}/variants`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const json = await res.json();
          const vars = json.variants || [];
          setVariants(vars);
          if (vars.length > 0) {
            setSelectedVariantId(vars[0].id);
          } else {
            setSelectedVariantId('');
          }
        }
      } catch (err) {
        console.error('Failed to load variants', err);
      }
    }
    loadVariants();
  }, [selectedProductId, user]);

  // Load active template for variant
  useEffect(() => {
    async function loadTemplate() {
      if (!selectedVariantId || !user) return;
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/admin/products/${selectedProductId}/variants`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        // Look up frame template for this variant
        // In default state, initialize reasonable template defaults
        const currentVar = variants.find((v) => v.id === selectedVariantId);
        const wMm = currentVar?.widthIn ? Math.round(currentVar.widthIn * 25.4) : 200;
        const hMm = currentVar?.heightIn ? Math.round(currentVar.heightIn * 25.4) : 300;

        setSlots([
          {
            slotIndex: 0,
            x: 10,
            y: 10,
            width: 80,
            height: 80,
            widthMm: Math.round(wMm * 0.8),
            heightMm: Math.round(hMm * 0.8),
            zIndex: 1,
          },
        ]);
        setTestRenderUrl(null);
      } catch (err) {
        console.error('Failed to load template', err);
      }
    }
    loadTemplate();
  }, [selectedVariantId]);

  // Add new photo slot
  const handleAddSlot = () => {
    const nextIdx = slots.length;
    setSlots([
      ...slots,
      {
        slotIndex: nextIdx,
        x: 15 + nextIdx * 5,
        y: 15 + nextIdx * 5,
        width: 40,
        height: 40,
        widthMm: 100,
        heightMm: 100,
        zIndex: nextIdx + 1,
      },
    ]);
    setSelectedSlotIndex(nextIdx);
    setSelectedTextZoneId(null);
  };

  // Remove photo slot
  const handleRemoveSlot = (idx: number) => {
    const updated = slots.filter((_, i) => i !== idx).map((s, i) => ({ ...s, slotIndex: i }));
    setSlots(updated);
    setSelectedSlotIndex(updated.length > 0 ? 0 : null);
  };

  // Update selected slot
  const handleUpdateSlot = (key: keyof PrintableRect, val: any) => {
    if (selectedSlotIndex === null) return;
    setSlots((prev) =>
      prev.map((s, idx) => (idx === selectedSlotIndex ? { ...s, [key]: val } : s))
    );
  };

  // Add Text Zone
  const handleAddTextZone = () => {
    const id = `text_${Date.now()}`;
    const newZone: TextZone = {
      id,
      x: 20,
      y: 80,
      width: 60,
      height: 10,
      fontFamily: 'Inter',
      fontSize: 24,
      color: '#000000',
      alignment: 'center',
      placeholder: 'Personalized Title',
      maxChars: 40,
    };
    setTextZones([...textZones, newZone]);
    setSelectedTextZoneId(id);
    setSelectedSlotIndex(null);
  };

  // Remove Text Zone
  const handleRemoveTextZone = (id: string) => {
    setTextZones((prev) => prev.filter((t) => t.id !== id));
    setSelectedTextZoneId(null);
  };

  // Update selected text zone
  const handleUpdateTextZone = (key: keyof TextZone, val: any) => {
    if (!selectedTextZoneId) return;
    setTextZones((prev) =>
      prev.map((t) => (t.id === selectedTextZoneId ? { ...t, [key]: val } : t))
    );
  };

  // Run Test Render (calls backend Sharp compositor)
  const handleTestRender = async () => {
    if (!user || !selectedVariantId) return;
    setTesting(true);
    setMessage(null);
    try {
      const token = await user.getIdToken();
      // Form multi-part request or JSON payload
      const formData = new FormData();
      formData.append('variantId', selectedVariantId);
      formData.append('mockupUrl', mockupUrl);
      if (maskUrl) formData.append('maskUrl', maskUrl);
      formData.append('bleedMm', String(bleedMm));
      formData.append('matInset', String(matInset));
      formData.append('printableRects', JSON.stringify(slots));
      formData.append('textZones', JSON.stringify(textZones));

      const res = await fetch('/api/admin/frame-templates/test-render', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || `Test render failed with HTTP ${res.status}`);
      }

      const blob = await res.blob();
      const previewUrl = URL.createObjectURL(blob);
      setTestRenderUrl(previewUrl);
      setMessage({ type: 'success', text: '300 DPI Test Render generated successfully!' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Test render failed' });
    } finally {
      setTesting(false);
    }
  };

  // Save new template version
  const handleSaveVersion = async () => {
    if (!user || !selectedVariantId) return;
    setSaving(true);
    setMessage(null);
    try {
      const token = await user.getIdToken();
      const payload = {
        variantId: selectedVariantId,
        mockupUrl,
        maskUrl: maskUrl || null,
        bleedMm,
        matInset,
        printableRects: slots,
        textZones,
        clipartOptions: [],
      };

      const res = await fetch('/api/admin/frame-templates', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || `Save failed with HTTP ${res.status}`);
      }

      const json = await res.json();
      setVersion(json.frameTemplate.version);
      setMessage({
        type: 'success',
        text: `Template Version ${json.frameTemplate.version} published and activated!`,
      });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to save template version' });
    } finally {
      setSaving(false);
    }
  };

  const currentVariant = variants.find((v) => v.id === selectedVariantId);
  const currentSlot = selectedSlotIndex !== null ? slots[selectedSlotIndex] : null;
  const currentZone = selectedTextZoneId ? textZones.find((t) => t.id === selectedTextZoneId) : null;

  return (
    <div className="space-y-6 pb-16">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-cream">Frame Templates Canvas</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gold/10 text-gold border border-gold/30">
              v{version} (Active)
            </span>
          </div>
          <p className="text-sm text-sand/70 mt-1">
            Visual slot layout, normalized geometry, DPI calculations, and 300 DPI test-render engine.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleTestRender}
            disabled={testing || !selectedVariantId}
            className="px-4 py-2 rounded-xl text-sm font-medium bg-charcoal hover:bg-tint border border-line text-cream flex items-center gap-2 transition disabled:opacity-50"
          >
            {testing ? (
              <span className="animate-spin inline-block w-4 h-4 border-2 border-gold border-t-transparent rounded-full" />
            ) : (
              <span>⚡</span>
            )}
            Run Test Render
          </button>
          <button
            onClick={handleSaveVersion}
            disabled={saving || !selectedVariantId}
            className="px-4 py-2 rounded-xl text-sm font-semibold bg-gold text-void hover:brightness-110 transition shadow-lg shadow-gold/10 flex items-center gap-2 disabled:opacity-50"
          >
            {saving ? (
              <span className="animate-spin inline-block w-4 h-4 border-2 border-void border-t-transparent rounded-full" />
            ) : (
              <span>💾</span>
            )}
            Publish New Version
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`p-4 rounded-xl border text-sm flex items-center justify-between ${
            message.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
              : 'bg-rose-950/40 border-rose-800/60 text-rose-300'
          }`}
        >
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="text-xs opacity-70 hover:opacity-100">
            Dismiss
          </button>
        </div>
      )}

      {/* Product & Variant Pickers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-2xl bg-paper border border-line">
        <div>
          <label className="block text-xs font-semibold text-sand uppercase tracking-wider mb-2">
            Select Product
          </label>
          <select
            value={selectedProductId}
            onChange={(e) => setSelectedProductId(e.target.value)}
            className="w-full bg-void border border-line rounded-xl px-3 py-2 text-sm text-cream focus:border-gold focus:outline-none"
          >
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title} ({p.status})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-sand uppercase tracking-wider mb-2">
            Select Frame Variant (Size × Colour)
          </label>
          <select
            value={selectedVariantId}
            onChange={(e) => setSelectedVariantId(e.target.value)}
            className="w-full bg-void border border-line rounded-xl px-3 py-2 text-sm text-cream focus:border-gold focus:outline-none"
            disabled={variants.length === 0}
          >
            {variants.map((v) => (
              <option key={v.id} value={v.id}>
                {v.sizeLabel} — {v.frameColour} (SKU: {v.sku})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Canvas Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Visual Interactive Canvas (8 cols) */}
        <div className="lg:col-span-8 space-y-4">
          <div className="p-6 rounded-2xl bg-paper border border-line flex flex-col items-center justify-center min-h-[480px]">
            <div className="w-full flex items-center justify-between mb-4">
              <span className="text-xs text-sand font-mono uppercase">
                Interactive Canvas Preview ({currentVariant?.sizeLabel || 'Standard'})
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleAddSlot}
                  className="px-3 py-1 text-xs rounded-lg bg-tint border border-line hover:border-gold text-cream transition"
                >
                  + Add Slot
                </button>
                <button
                  onClick={handleAddTextZone}
                  className="px-3 py-1 text-xs rounded-lg bg-tint border border-line hover:border-gold text-cream transition"
                >
                  + Add Text Zone
                </button>
              </div>
            </div>

            {/* Simulated Frame Canvas Container */}
            <div
              className="relative w-full max-w-[420px] aspect-[3/4] bg-void border-8 border-stone-800 rounded-lg shadow-2xl overflow-hidden cursor-crosshair select-none"
              style={{
                boxShadow: 'inset 0 0 20px rgba(0,0,0,0.8), 0 20px 40px rgba(0,0,0,0.6)',
              }}
            >
              {/* Mat Inset Simulation */}
              <div
                className="absolute inset-4 bg-[#f8f6f0] shadow-inner transition-all flex items-center justify-center"
                style={{
                  border: `${matInset}px solid #e2ded5`,
                }}
              >
                {/* Photo Slots Overlay */}
                {slots.map((slot, idx) => {
                  const isSelected = selectedSlotIndex === idx;
                  return (
                    <div
                      key={idx}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedSlotIndex(idx);
                        setSelectedTextZoneId(null);
                      }}
                      className={`absolute border-2 transition-all flex flex-col items-center justify-center rounded cursor-pointer ${
                        isSelected
                          ? 'border-gold bg-gold/20 shadow-lg ring-2 ring-gold/40'
                          : 'border-dashed border-charcoal/60 bg-tint/30 hover:border-sand'
                      }`}
                      style={{
                        left: `${slot.x}%`,
                        top: `${slot.y}%`,
                        width: `${slot.width}%`,
                        height: `${slot.height}%`,
                        zIndex: slot.zIndex || 1,
                      }}
                    >
                      <span className="text-xs font-bold text-void bg-gold px-1.5 py-0.5 rounded shadow">
                        Slot #{slot.slotIndex + 1}
                      </span>
                      <span className="text-[10px] text-sand font-mono mt-1">
                        {slot.widthMm} × {slot.heightMm} mm
                      </span>
                    </div>
                  );
                })}

                {/* Text Zones Overlay */}
                {textZones.map((tz) => {
                  const isSelected = selectedTextZoneId === tz.id;
                  return (
                    <div
                      key={tz.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedTextZoneId(tz.id);
                        setSelectedSlotIndex(null);
                      }}
                      className={`absolute border-2 transition-all flex items-center justify-center rounded cursor-pointer px-2 ${
                        isSelected
                          ? 'border-amber-400 bg-amber-400/20 ring-2 ring-amber-400/40'
                          : 'border-dashed border-amber-600/40 bg-amber-950/20 hover:border-amber-400'
                      }`}
                      style={{
                        left: `${tz.x}%`,
                        top: `${tz.y}%`,
                        width: `${tz.width}%`,
                        height: `${tz.height}%`,
                        color: tz.color,
                        fontFamily: tz.fontFamily,
                        fontSize: `${tz.fontSize}px`,
                        textAlign: tz.alignment,
                      }}
                    >
                      <span className="text-[11px] truncate">{tz.placeholder || 'Text Zone'}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs text-sand/60 mt-4">
              <span>Bleed: {bleedMm}mm</span>
              <span>•</span>
              <span>Slots: {slots.length}</span>
              <span>•</span>
              <span>Text Zones: {textZones.length}</span>
            </div>
          </div>

          {/* Test Render Live Preview Box */}
          {testRenderUrl && (
            <div className="p-6 rounded-2xl bg-paper border border-emerald-900/60 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  Live 300 DPI Render Proof
                </span>
                <a
                  href={testRenderUrl}
                  download={`template-proof-v${version}.png`}
                  className="text-xs text-gold hover:underline"
                >
                  Download Full Res PNG ↓
                </a>
              </div>
              <div className="bg-void p-3 rounded-xl border border-line flex justify-center">
                <img
                  src={testRenderUrl}
                  alt="Test render output"
                  className="max-h-64 object-contain rounded shadow-lg"
                />
              </div>
            </div>
          )}
        </div>

        {/* Property Inspector Panel (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          {/* Slot Inspector */}
          {currentSlot && (
            <div className="p-5 rounded-2xl bg-paper border border-line space-y-4">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <h3 className="text-sm font-semibold text-cream">
                  Slot #{currentSlot.slotIndex + 1} Properties
                </h3>
                <button
                  onClick={() => handleRemoveSlot(selectedSlotIndex!)}
                  className="text-xs text-rose-400 hover:text-rose-300 transition"
                >
                  Delete Slot
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-sand/70 mb-1">X Position (%)</label>
                  <input
                    type="number"
                    value={currentSlot.x}
                    onChange={(e) => handleUpdateSlot('x', parseFloat(e.target.value) || 0)}
                    className="w-full bg-void border border-line rounded-lg px-2.5 py-1.5 text-xs text-cream focus:border-gold focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-sand/70 mb-1">Y Position (%)</label>
                  <input
                    type="number"
                    value={currentSlot.y}
                    onChange={(e) => handleUpdateSlot('y', parseFloat(e.target.value) || 0)}
                    className="w-full bg-void border border-line rounded-lg px-2.5 py-1.5 text-xs text-cream focus:border-gold focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-sand/70 mb-1">Width (%)</label>
                  <input
                    type="number"
                    value={currentSlot.width}
                    onChange={(e) => handleUpdateSlot('width', parseFloat(e.target.value) || 0)}
                    className="w-full bg-void border border-line rounded-lg px-2.5 py-1.5 text-xs text-cream focus:border-gold focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-sand/70 mb-1">Height (%)</label>
                  <input
                    type="number"
                    value={currentSlot.height}
                    onChange={(e) => handleUpdateSlot('height', parseFloat(e.target.value) || 0)}
                    className="w-full bg-void border border-line rounded-lg px-2.5 py-1.5 text-xs text-cream focus:border-gold focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-line">
                <div>
                  <label className="block text-[11px] text-sand/70 mb-1">Width (mm)</label>
                  <input
                    type="number"
                    value={currentSlot.widthMm}
                    onChange={(e) => handleUpdateSlot('widthMm', parseFloat(e.target.value) || 0)}
                    className="w-full bg-void border border-line rounded-lg px-2.5 py-1.5 text-xs text-cream focus:border-gold focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-sand/70 mb-1">Height (mm)</label>
                  <input
                    type="number"
                    value={currentSlot.heightMm}
                    onChange={(e) => handleUpdateSlot('heightMm', parseFloat(e.target.value) || 0)}
                    className="w-full bg-void border border-line rounded-lg px-2.5 py-1.5 text-xs text-cream focus:border-gold focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-sand/70 mb-1">Mask Asset URL (Optional)</label>
                <input
                  type="text"
                  placeholder="https://.../mask.png"
                  value={currentSlot.maskUrl || ''}
                  onChange={(e) => handleUpdateSlot('maskUrl', e.target.value)}
                  className="w-full bg-void border border-line rounded-lg px-2.5 py-1.5 text-xs text-cream focus:border-gold focus:outline-none font-mono"
                />
              </div>
            </div>
          )}

          {/* Text Zone Inspector */}
          {currentZone && (
            <div className="p-5 rounded-2xl bg-paper border border-line space-y-4">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <h3 className="text-sm font-semibold text-cream">Text Zone Properties</h3>
                <button
                  onClick={() => handleRemoveTextZone(currentZone.id)}
                  className="text-xs text-rose-400 hover:text-rose-300 transition"
                >
                  Delete Zone
                </button>
              </div>

              <div>
                <label className="block text-[11px] text-sand/70 mb-1">Placeholder Text</label>
                <input
                  type="text"
                  value={currentZone.placeholder || ''}
                  onChange={(e) => handleUpdateTextZone('placeholder', e.target.value)}
                  className="w-full bg-void border border-line rounded-lg px-2.5 py-1.5 text-xs text-cream focus:border-gold focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-sand/70 mb-1">Font Family</label>
                  <select
                    value={currentZone.fontFamily}
                    onChange={(e) => handleUpdateTextZone('fontFamily', e.target.value)}
                    className="w-full bg-void border border-line rounded-lg px-2 py-1.5 text-xs text-cream focus:border-gold focus:outline-none"
                  >
                    <option value="Inter">Inter (Sans)</option>
                    <option value="Playfair Display">Playfair Display (Serif)</option>
                    <option value="Cinzel">Cinzel (Luxury Serif)</option>
                    <option value="Caveat">Caveat (Handwritten)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-sand/70 mb-1">Font Size (pt)</label>
                  <input
                    type="number"
                    value={currentZone.fontSize}
                    onChange={(e) => handleUpdateTextZone('fontSize', parseInt(e.target.value, 10) || 16)}
                    className="w-full bg-void border border-line rounded-lg px-2.5 py-1.5 text-xs text-cream focus:border-gold focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-sand/70 mb-1">Max Characters</label>
                  <input
                    type="number"
                    value={currentZone.maxChars || 40}
                    onChange={(e) => handleUpdateTextZone('maxChars', parseInt(e.target.value, 10) || 40)}
                    className="w-full bg-void border border-line rounded-lg px-2.5 py-1.5 text-xs text-cream focus:border-gold focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-sand/70 mb-1">Text Alignment</label>
                  <select
                    value={currentZone.alignment}
                    onChange={(e) => handleUpdateTextZone('alignment', e.target.value as any)}
                    className="w-full bg-void border border-line rounded-lg px-2 py-1.5 text-xs text-cream focus:border-gold focus:outline-none"
                  >
                    <option value="left">Left</option>
                    <option value="center">Center</option>
                    <option value="right">Right</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Global Frame & Mat Parameters */}
          <div className="p-5 rounded-2xl bg-paper border border-line space-y-4">
            <h3 className="text-sm font-semibold text-cream border-b border-line pb-3">
              Frame Physical Bounds
            </h3>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-sand/70 mb-1">Bleed Margin (mm)</label>
                <input
                  type="number"
                  value={bleedMm}
                  onChange={(e) => setBleedMm(parseFloat(e.target.value) || 0)}
                  className="w-full bg-void border border-line rounded-lg px-2.5 py-1.5 text-xs text-cream focus:border-gold focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] text-sand/70 mb-1">Mat Inset (px)</label>
                <input
                  type="number"
                  value={matInset}
                  onChange={(e) => setMatInset(parseInt(e.target.value, 10) || 0)}
                  className="w-full bg-void border border-line rounded-lg px-2.5 py-1.5 text-xs text-cream focus:border-gold focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] text-sand/70 mb-1">Mockup Overlay Asset</label>
              <input
                type="text"
                value={mockupUrl}
                onChange={(e) => setMockupUrl(e.target.value)}
                className="w-full bg-void border border-line rounded-lg px-2.5 py-1.5 text-xs text-cream focus:border-gold focus:outline-none font-mono"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
