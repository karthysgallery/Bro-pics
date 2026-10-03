'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../../../lib/auth-context';
import { MediaPickerModal } from '../../../../../components/admin/MediaPickerModal';
import { StatusChip } from '../../../../../components/admin/StatusChip';
import { FormField, SaveBar } from '../../../../../components/admin/AdminForm';
import { useToast } from '../../../../../components/ui/Toast';
import type { FrameTemplate, TextZone, ClipartOption, Variant, Product } from '@bro-pics/shared';

interface TemplateFormPageProps {
  params: Promise<{ id: string }> | { id: string };
}

function blankTextZone(): TextZone {
  return {
    fieldKey: `text_${Date.now().toString().slice(-4)}`,
    label: 'Custom Text',
    x: 0.1,
    y: 0.8,
    width: 0.8,
    height: 0.08,
    maxLength: 40,
    align: 'center',
    defaultColor: '#1A1815',
    minFontSizePx: 16,
    maxFontSizePx: 32,
    required: false,
  };
}

function blankClipartOption(): ClipartOption {
  return {
    id: `clipart_${Date.now().toString().slice(-4)}`,
    label: 'Heart Icon',
    assetUrl: '/clipart/heart.svg',
    x: 0.8,
    y: 0.08,
    width: 0.12,
    height: 0.12,
  };
}

export default function AdminTemplateFormPage({ params }: TemplateFormPageProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [productId, setProductId] = useState<string>('');

  useEffect(() => {
    Promise.resolve(params).then((resolved) => {
      if (resolved?.id) {
        setProductId(resolved.id);
      }
    });
  }, [params]);

  const [product, setProduct] = useState<Product | null>(null);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [selectedVariantId, setSelectedVariantId] = useState<string>('');
  const [templates, setTemplates] = useState<FrameTemplate[]>([]);
  const [currentTemplate, setCurrentTemplate] = useState<FrameTemplate | null>(null);

  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  // Template Form Fields
  const [mockupUrl, setMockupUrl] = useState('');
  const [maskUrl, setMaskUrl] = useState('');
  const [overlayUrl, setOverlayUrl] = useState('');
  const [textZones, setTextZones] = useState<TextZone[]>([]);
  const [clipartOptions, setClipartOptions] = useState<ClipartOption[]>([]);
  const [bleedMm, setBleedMm] = useState<number>(3);
  const [matInsetMm, setMatInsetMm] = useState<number>(0);

  // Media Picker Modal State
  const [mediaPickerTarget, setMediaPickerTarget] = useState<'mockup' | 'mask' | 'overlay' | { clipartIndex: number } | null>(null);

  // Test Render State
  const [testPhotoFile, setTestPhotoFile] = useState<File | null>(null);
  const [testRenderPreviewUrl, setTestRenderPreviewUrl] = useState<string | null>(null);
  const [sampleTextValues, setSampleTextValues] = useState<Record<string, string>>({});
  const [isTestingRender, setIsTestingRender] = useState(false);

  // Active Variant
  const activeVariant = useMemo(() => {
    return variants.find((v) => v.id === selectedVariantId) || null;
  }, [variants, selectedVariantId]);

  // Fetch product, variants & templates
  useEffect(() => {
    if (!user || !productId) return;

    user.getIdToken().then(async (token) => {
      try {
        // 1. Fetch Product
        const prodRes = await fetch(`/api/admin/products?id=${productId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (prodRes.ok) {
          const pData = await prodRes.json();
          const p = pData.products?.find((item: Product) => item.id === productId);
          if (p) setProduct(p);
        }

        // 2. Fetch Variants
        const varRes = await fetch(`/api/admin/products/${productId}/variants`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (varRes.ok) {
          const vData = await varRes.json();
          const vars: Variant[] = vData.variants || [];
          setVariants(vars);
          if (vars.length > 0) {
            setSelectedVariantId(vars[0].id);
          }
        }
      } catch {
        showToast('Error loading product details', 'error');
      } finally {
        setLoading(false);
      }
    });
  }, [productId, user]);

  // Fetch templates for selected variant
  const fetchTemplates = async () => {
    if (!selectedVariantId) return;
    try {
      const res = await fetch(`/api/frame-templates/${selectedVariantId}`);
      if (res.ok) {
        const list: FrameTemplate[] = await res.json();
        setTemplates(list);
        const current = list.find((t) => t.isCurrent) || list[0] || null;
        setCurrentTemplate(current);

        if (current) {
          setMockupUrl(current.mockupUrl || '');
          setMaskUrl(current.maskUrl || '');
          setOverlayUrl(current.overlayUrl || '');
          setTextZones(current.textZones || []);
          setClipartOptions(current.clipartOptions || []);
          setBleedMm(current.bleedMm ?? 3);
          setMatInsetMm(current.matInset ?? 0);
        } else {
          setMockupUrl('');
          setMaskUrl('');
          setOverlayUrl('');
          setTextZones([]);
          setClipartOptions([]);
          setBleedMm(3);
          setMatInsetMm(0);
        }
        setIsDirty(false);
      }
    } catch {
      showToast('Error loading frame templates', 'error');
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, [selectedVariantId]);

  // Update text zone
  const updateTextZone = (index: number, patch: Partial<TextZone>) => {
    setTextZones((prev) => prev.map((z, i) => (i === index ? { ...z, ...patch } : z)));
    setIsDirty(true);
  };

  // Update clipart
  const updateClipart = (index: number, patch: Partial<ClipartOption>) => {
    setClipartOptions((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
    setIsDirty(true);
  };

  // Save as New Version
  const handleSaveAsNewVersion = async () => {
    if (!user || !selectedVariantId) return;
    if (!mockupUrl.trim()) {
      showToast('Mockup image is required for the template', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const token = await user.getIdToken();
      const payload = {
        variantId: selectedVariantId,
        mockupUrl: mockupUrl.trim(),
        maskUrl: maskUrl.trim() || undefined,
        overlayUrl: overlayUrl.trim() || undefined,
        textZones,
        clipartOptions,
        bleedMm: Number(bleedMm) || 0,
        matInset: Number(matInsetMm) || 0,
        printableRects: [
          {
            x: 0,
            y: 0,
            width: 1,
            height: 1,
          },
        ],
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
        const errData = await res.json();
        throw new Error(errData.error?.message || 'Failed to create template version');
      }

      const data = await res.json();
      showToast(`Saved Frame Template version ${data.frameTemplate.version}!`, 'success');
      setIsDirty(false);
      fetchTemplates();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save template';
      showToast(msg, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Activate / Deactivate a specific version
  const handleToggleVersionActive = async (templateId: string, isCurrent: boolean) => {
    if (!user || !selectedVariantId) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/frame-templates/${templateId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          variantId: selectedVariantId,
          isCurrent: !isCurrent,
        }),
      });

      if (!res.ok) throw new Error('Failed to update template version status');
      showToast(!isCurrent ? 'Template version activated' : 'Template version deactivated', 'success');
      fetchTemplates();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error changing version status';
      showToast(msg, 'error');
    }
  };

  // Handle Media Selected from Modal
  const handleMediaSelected = (asset: { url: string }) => {
    if (mediaPickerTarget === 'mockup') {
      setMockupUrl(asset.url);
      setIsDirty(true);
    } else if (mediaPickerTarget === 'mask') {
      setMaskUrl(asset.url);
      setIsDirty(true);
    } else if (mediaPickerTarget === 'overlay') {
      setOverlayUrl(asset.url);
      setIsDirty(true);
    } else if (typeof mediaPickerTarget === 'object' && mediaPickerTarget !== null) {
      updateClipart(mediaPickerTarget.clipartIndex, { assetUrl: asset.url });
    }
  };

  // Perform Real Test Render via API
  const handleDownloadTestPrint = async () => {
    if (!user || !selectedVariantId) return;
    setIsTestingRender(true);

    try {
      const token = await user.getIdToken();
      let photoBlob: Blob | null = testPhotoFile;

      if (!photoBlob) {
        // Create a sample photo if none was uploaded
        if (typeof document !== 'undefined') {
          const c = document.createElement('canvas');
          c.width = 1200;
          c.height = 1600;
          const ctx = c.getContext('2d');
          if (ctx) {
            const grad = ctx.createLinearGradient(0, 0, 1200, 1600);
            grad.addColorStop(0, '#e0c3fc');
            grad.addColorStop(1, '#8ec5fc');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, 1200, 1600);
            ctx.fillStyle = '#2b2420';
            ctx.font = 'bold 54px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('SAMPLE PHOTO', 600, 750);
            ctx.font = '32px sans-serif';
            ctx.fillText('1200 × 1600 px', 600, 820);
          }
          if (typeof c.toBlob === 'function') {
            photoBlob = await new Promise<Blob | null>((resolve) => c.toBlob(resolve, 'image/jpeg', 0.95));
          }
        }
        if (!photoBlob) {
          photoBlob = new Blob(['sample-photo-data'], { type: 'image/jpeg' });
        }
      }

      if (!photoBlob) {
        throw new Error('Failed to prepare sample photo');
      }

      const formData = new FormData();
      formData.append('variantId', selectedVariantId);
      if (currentTemplate?.version) {
        formData.append('templateVersion', String(currentTemplate.version));
      }
      formData.append('photo', photoBlob, 'sample.jpg');
      formData.append('textFields', JSON.stringify(sampleTextValues));

      showToast('Rendering 300 DPI print file...', 'info');

      const res = await fetch('/api/admin/frame-templates/test-render', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error?.message || errData.error || `Test render failed (${res.status})`);
      }

      const printBlob = await res.blob();
      const url = URL.createObjectURL(printBlob);
      setTestRenderPreviewUrl(url);

      const a = document.createElement('a');
      a.download = `test-print-${activeVariant?.sku || 'variant'}-v${currentTemplate?.version || 1}.png`;
      a.href = url;
      a.click();

      showToast('300 DPI test print rendered & downloaded!', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Test render failed';
      showToast(msg, 'error');
    } finally {
      setIsTestingRender(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 space-y-4 animate-pulse">
        <div className="h-6 w-48 bg-field rounded-lg" />
        <div className="h-10 w-96 bg-field rounded-xl" />
        <div className="h-96 w-full bg-field rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line pb-4">
        <div>
          <div className="flex items-center gap-2 text-2xs text-ink/50 mb-1">
            <Link href="/admin/products" className="hover:text-gold transition-colors">Products</Link>
            <span>/</span>
            <Link href={`/admin/products/${productId}`} className="hover:text-gold transition-colors">
              {product?.title || productId}
            </Link>
            <span>/</span>
            <span className="text-ink font-semibold">Frame Template Builder</span>
          </div>
          <h1 className="text-xl md:text-2xl font-display font-bold text-ink">
            Visual Frame Template Builder
          </h1>
          <p className="text-xs text-ink/60">
            Configure visual frame overlays, coordinate text zones, and printable bleeds with immutable versioning.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label className="text-xs font-semibold text-ink">Select Variant:</label>
          <select
            value={selectedVariantId}
            onChange={(e) => setSelectedVariantId(e.target.value)}
            className="px-3 py-2 text-xs font-semibold rounded-xl border border-line bg-paper text-ink focus:outline-none focus:border-gold"
          >
            {variants.map((v) => (
              <option key={v.id} value={v.id}>
                {v.sku} ({v.sizeLabel} · {v.frameColour})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Builder Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Visual Canvas & Mockup Preview (5 Cols) */}
        <div className="lg:col-span-5 space-y-4 sticky top-6">
          <div className="rounded-2xl border border-line bg-paper p-4 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-ink uppercase tracking-wider">Live Mockup Canvas</span>
              {currentTemplate && (
                <StatusChip status={currentTemplate.isCurrent ? 'published' : 'archived'} />
              )}
            </div>

            {/* Canvas Container with normalized ratio */}
            <div
              className="relative w-full aspect-[3/4] bg-field/60 border border-line rounded-xl overflow-hidden shadow-inner flex items-center justify-center"
              style={{
                aspectRatio: activeVariant ? `${activeVariant.widthIn} / ${activeVariant.heightIn}` : '3 / 4',
              }}
            >
              {/* 1. Base Mockup / Sample Photo */}
              {mockupUrl ? (
                <img src={mockupUrl} alt="Frame Mockup" className="w-full h-full object-contain pointer-events-none" />
              ) : (
                <div className="text-center p-6 text-ink/40 text-xs">
                  <span className="text-3xl block mb-2">🖼️</span>
                  No mockup asset chosen yet
                </div>
              )}

              {/* 2. Text Zones Overlay */}
              {textZones.map((zone, idx) => (
                <div
                  key={zone.fieldKey || idx}
                  className="absolute border border-gold bg-gold/20 text-ink text-[10px] font-bold flex items-center justify-center pointer-events-none shadow-xs"
                  style={{
                    left: `${zone.x * 100}%`,
                    top: `${zone.y * 100}%`,
                    width: `${zone.width * 100}%`,
                    height: `${zone.height * 100}%`,
                    textAlign: zone.align || 'center',
                  }}
                >
                  <span className="truncate px-1">
                    {sampleTextValues[zone.fieldKey] || zone.label || zone.fieldKey}
                  </span>
                </div>
              ))}

              {/* 3. Clipart Overlay */}
              {clipartOptions.map((clip, idx) => (
                <div
                  key={clip.id || idx}
                  className="absolute border border-emerald-500 bg-emerald-500/20 flex items-center justify-center pointer-events-none"
                  style={{
                    left: `${clip.x * 100}%`,
                    top: `${clip.y * 100}%`,
                    width: `${clip.width * 100}%`,
                    height: `${clip.height * 100}%`,
                  }}
                >
                  {clip.assetUrl ? (
                    <img src={clip.assetUrl} alt={clip.label} className="w-full h-full object-contain" />
                  ) : (
                    <span className="text-2xs">✨</span>
                  )}
                </div>
              ))}
            </div>

            {/* Test Render & Download Action */}
            <div className="p-3.5 bg-field rounded-xl border border-line space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-2xs font-bold text-ink uppercase tracking-wider block">Server Test Render (300 DPI)</span>
                {testRenderPreviewUrl && (
                  <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                    ✓ Rendered
                  </span>
                )}
              </div>

              {/* Photo Upload for Test Render */}
              <div className="space-y-1">
                <label htmlFor="test-sample-photo" className="text-[11px] font-semibold text-ink/70 block">
                  Sample Photo (optional)
                </label>
                <input
                  id="test-sample-photo"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    setTestPhotoFile(file);
                  }}
                  className="w-full text-2xs text-ink/70 file:mr-2 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-2xs file:font-semibold file:bg-gold/20 file:text-ink hover:file:bg-gold/30"
                />
              </div>

              {/* Sample Text Inputs */}
              {textZones.length > 0 && (
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-ink/70 block">Sample Text Values</label>
                  {textZones.map((zone) => (
                    <input
                      key={zone.fieldKey}
                      type="text"
                      value={sampleTextValues[zone.fieldKey] || ''}
                      onChange={(e) =>
                        setSampleTextValues((prev) => ({ ...prev, [zone.fieldKey]: e.target.value }))
                      }
                      placeholder={`Sample: ${zone.label}`}
                      className="w-full px-2.5 py-1 text-2xs rounded-lg border border-line bg-paper text-ink"
                    />
                  ))}
                </div>
              )}

              {/* Rendered Preview if available */}
              {testRenderPreviewUrl && (
                <div className="p-2 border border-line rounded-lg bg-paper space-y-2">
                  <span className="text-[10px] font-bold text-ink/60 uppercase block">Last Output Preview</span>
                  <div className="relative aspect-[3/4] max-h-48 overflow-hidden rounded border border-line bg-black/5 flex items-center justify-center">
                    <img src={testRenderPreviewUrl} alt="Test Render Output" className="w-full h-full object-contain" />
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={handleDownloadTestPrint}
                disabled={isTestingRender}
                className="w-full py-2.5 rounded-xl bg-ink text-gold hover:bg-ink/90 disabled:opacity-50 text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-xs"
              >
                {isTestingRender ? (
                  <>
                    <span className="inline-block w-3.5 h-3.5 border-2 border-gold border-t-transparent rounded-full animate-spin" />
                    Rendering High-Res Test...
                  </>
                ) : (
                  '📥 Render & Download Test Print (300 DPI)'
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Template Configuration Tabs (7 Cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Section 1: Frame Asset Media */}
          <div className="rounded-2xl border border-line bg-paper p-6 shadow-xs space-y-4">
            <h2 className="text-xs font-bold text-ink uppercase tracking-wider">
              1. Layer Assets (Media Library)
            </h2>

            <div className="space-y-3">
              {/* Mockup */}
              <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-line bg-field">
                <div className="min-w-0">
                  <span className="text-xs font-bold text-ink block">Mockup Asset</span>
                  <span className="text-2xs text-ink/50 font-mono truncate block max-w-sm">
                    {mockupUrl || 'No image selected'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setMediaPickerTarget('mockup')}
                  className="px-3 py-1.5 rounded-lg bg-gold hover:bg-gold-deep text-ink text-xs font-semibold transition-colors shrink-0"
                >
                  Choose Media ↗
                </button>
              </div>

              {/* Mask */}
              <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-line bg-field">
                <div className="min-w-0">
                  <span className="text-xs font-bold text-ink block">SVG Mask (Optional)</span>
                  <span className="text-2xs text-ink/50 font-mono truncate block max-w-sm">
                    {maskUrl || 'No mask (uses standard rectangle photo slot)'}
                  </span>
                </div>
                <div className="flex gap-2">
                  {maskUrl && (
                    <button
                      type="button"
                      onClick={() => { setMaskUrl(''); setIsDirty(true); }}
                      className="text-2xs text-red-600 hover:underline"
                    >
                      Clear
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setMediaPickerTarget('mask')}
                    className="px-3 py-1.5 rounded-lg border border-line bg-paper hover:bg-field text-ink text-xs font-semibold transition-colors shrink-0"
                  >
                    Choose ↗
                  </button>
                </div>
              </div>

              {/* Overlay */}
              <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-line bg-field">
                <div className="min-w-0">
                  <span className="text-xs font-bold text-ink block">Foreground Overlay (Optional)</span>
                  <span className="text-2xs text-ink/50 font-mono truncate block max-w-sm">
                    {overlayUrl || 'No overlay (rendered directly over photo)'}
                  </span>
                </div>
                <div className="flex gap-2">
                  {overlayUrl && (
                    <button
                      type="button"
                      onClick={() => { setOverlayUrl(''); setIsDirty(true); }}
                      className="text-2xs text-red-600 hover:underline"
                    >
                      Clear
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setMediaPickerTarget('overlay')}
                    className="px-3 py-1.5 rounded-lg border border-line bg-paper hover:bg-field text-ink text-xs font-semibold transition-colors shrink-0"
                  >
                    Choose ↗
                  </button>
                </div>
              </div>

              {/* Bleed & Mat */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <FormField label="Print Bleed (mm)" hint="Industry standard 3mm">
                  <input
                    type="number"
                    step="0.5"
                    value={bleedMm}
                    onChange={(e) => { setBleedMm(Number(e.target.value)); setIsDirty(true); }}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:outline-none focus:border-gold"
                  />
                </FormField>
                <FormField label="Mat Inset (mm)" hint="Inner passe-partout border">
                  <input
                    type="number"
                    step="0.5"
                    value={matInsetMm}
                    onChange={(e) => { setMatInsetMm(Number(e.target.value)); setIsDirty(true); }}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:outline-none focus:border-gold"
                  />
                </FormField>
              </div>
            </div>
          </div>

          {/* Section 2: Text Personalization Zones */}
          <div className="rounded-2xl border border-line bg-paper p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold text-ink uppercase tracking-wider">
                2. Text Zones ({textZones.length})
              </h2>
              <button
                type="button"
                onClick={() => {
                  setTextZones((prev) => [...prev, blankTextZone()]);
                  setIsDirty(true);
                }}
                className="px-3 py-1.5 rounded-xl bg-gold/10 hover:bg-gold/20 text-gold-deep text-xs font-bold transition-colors"
              >
                + Add Text Zone
              </button>
            </div>

            {textZones.length === 0 ? (
              <p className="text-xs text-ink/50 italic p-4 text-center border border-dashed border-line rounded-xl">
                No text zones configured for this variant.
              </p>
            ) : (
              <div className="space-y-4">
                {textZones.map((zone, idx) => (
                  <div key={idx} className="p-4 rounded-xl border border-line bg-field/40 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-ink">Zone #{idx + 1}: {zone.label || zone.fieldKey}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setTextZones((prev) => prev.filter((_, i) => i !== idx));
                          setIsDirty(true);
                        }}
                        className="text-2xs text-red-600 hover:underline font-semibold"
                      >
                        Remove
                      </button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      <FormField label="Field Key" required>
                        <input
                          type="text"
                          value={zone.fieldKey}
                          onChange={(e) => updateTextZone(idx, { fieldKey: e.target.value })}
                          className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-line bg-paper text-ink font-mono"
                        />
                      </FormField>

                      <FormField label="Field Label" required>
                        <input
                          type="text"
                          value={zone.label}
                          onChange={(e) => updateTextZone(idx, { label: e.target.value })}
                          className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-line bg-paper text-ink"
                        />
                      </FormField>

                      <FormField label="Max Chars">
                        <input
                          type="number"
                          value={zone.maxLength}
                          onChange={(e) => updateTextZone(idx, { maxLength: Number(e.target.value) })}
                          className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-line bg-paper text-ink"
                        />
                      </FormField>

                      <FormField label="Text Align">
                        <select
                          value={zone.align || 'center'}
                          onChange={(e) => updateTextZone(idx, { align: e.target.value as 'left' | 'center' | 'right' })}
                          className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-line bg-paper text-ink"
                        >
                          <option value="left">Left</option>
                          <option value="center">Center</option>
                          <option value="right">Right</option>
                        </select>
                      </FormField>
                    </div>

                    {/* Normalized Coordinates */}
                    <div className="grid grid-cols-4 gap-2 pt-1 border-t border-line/50 text-2xs">
                      <div>
                        <label className="text-ink/60 block mb-0.5">X (0..1)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={zone.x}
                          onChange={(e) => updateTextZone(idx, { x: Number(e.target.value) })}
                          className="w-full px-2 py-1 rounded border border-line bg-paper text-ink font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-ink/60 block mb-0.5">Y (0..1)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={zone.y}
                          onChange={(e) => updateTextZone(idx, { y: Number(e.target.value) })}
                          className="w-full px-2 py-1 rounded border border-line bg-paper text-ink font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-ink/60 block mb-0.5">Width (0..1)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={zone.width}
                          onChange={(e) => updateTextZone(idx, { width: Number(e.target.value) })}
                          className="w-full px-2 py-1 rounded border border-line bg-paper text-ink font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-ink/60 block mb-0.5">Height (0..1)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={zone.height}
                          onChange={(e) => updateTextZone(idx, { height: Number(e.target.value) })}
                          className="w-full px-2 py-1 rounded border border-line bg-paper text-ink font-mono"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section 3: Version History & Activation */}
          <div className="rounded-2xl border border-line bg-paper p-6 shadow-xs space-y-4">
            <h2 className="text-xs font-bold text-ink uppercase tracking-wider">
              3. Version History & Activation
            </h2>

            <div className="divide-y divide-line border border-line rounded-xl overflow-hidden bg-field/30">
              {templates.length === 0 ? (
                <p className="p-4 text-xs text-ink/50 text-center italic">
                  No previous versions saved for this variant yet.
                </p>
              ) : (
                templates.map((tpl) => (
                  <div key={tpl.id} className="p-3.5 flex items-center justify-between hover:bg-field transition-colors">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-ink">Version {tpl.version}</span>
                        {tpl.isCurrent && (
                          <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-2xs font-bold">
                            Active (Current)
                          </span>
                        )}
                      </div>
                      <span className="text-2xs text-ink/50 font-mono">
                        {tpl.textZones?.length || 0} text zones · {tpl.clipartOptions?.length || 0} cliparts
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleToggleVersionActive(tpl.id, tpl.isCurrent)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                        tpl.isCurrent
                          ? 'border border-line text-ink/70 hover:bg-field'
                          : 'bg-gold hover:bg-gold-deep text-ink font-bold'
                      }`}
                    >
                      {tpl.isCurrent ? 'Deactivate' : 'Set as Current'}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Floating Save Bar */}
      <SaveBar
        isDirty={isDirty}
        isSaving={isSaving}
        onSave={handleSaveAsNewVersion}
        onReset={() => fetchTemplates()}
      />

      {/* Media Picker Modal */}
      <MediaPickerModal
        isOpen={Boolean(mediaPickerTarget)}
        onClose={() => setMediaPickerTarget(null)}
        onSelect={handleMediaSelected}
        allowedTypes={['image']}
      />
    </div>
  );
}
