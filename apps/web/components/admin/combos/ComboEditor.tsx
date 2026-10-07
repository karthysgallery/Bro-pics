'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { comboSavings, type Combo, type Product, type Variant } from '@bro-pics/shared';
import { useAuth } from '../../../lib/auth-context';
import { formatPaise } from '../../../lib/format-price';
import { useToast } from '../../ui/Toast';
import { FormField } from '../AdminForm';
import { MediaPickerModal } from '../MediaPickerModal';
import { StatusChip } from '../StatusChip';
import { BLANK_COMBO, bodyFromForm, formFromCombo, newItemId, paiseToRupees, rupeesToPaise, slugify, type ComboFormState } from './combo-form';

interface Problem {
  itemId?: string;
  message: string;
}

interface ItemDetail {
  productTitle: string | null;
  variantLabel: string | null;
  variantPrice: number | null;
}

const inputClass = 'w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:outline-none focus:border-gold';

/** Create or edit one combo: its details, price, cover, and which frames it contains. */
export function ComboEditor({ comboId }: { comboId: string | null }) {
  const router = useRouter();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [form, setForm] = useState<ComboFormState>(BLANK_COMBO);
  const [loading, setLoading] = useState(comboId !== null);
  const [saving, setSaving] = useState(false);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [details, setDetails] = useState<Record<string, ItemDetail>>({});
  const [products, setProducts] = useState<Product[]>([]);
  const [variantsByProduct, setVariantsByProduct] = useState<Record<string, Variant[]>>({});
  const [pickerOpen, setPickerOpen] = useState(false);

  const call = useCallback(
    async (path: string, init: RequestInit = {}) => {
      if (!user) throw new Error('Your session has ended. Sign in again to continue.');
      const token = await user.getIdToken();
      const res = await fetch(path, {
        ...init,
        headers: { ...(typeof init.body === 'string' && { 'Content-Type': 'application/json' }), Authorization: `Bearer ${token}` },
      });
      const body = await res.json().catch(() => null);
      return { ok: res.ok, status: res.status, body };
    },
    [user]
  );

  const set = <K extends keyof ComboFormState>(key: K, value: ComboFormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  // The product list (for the picker) and, when editing, the combo itself.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const list = await call('/api/admin/products');
      if (!cancelled && list.ok) setProducts((list.body?.products as Product[]) ?? []);
      if (comboId) {
        const res = await call(`/api/admin/combos/${comboId}`);
        if (cancelled) return;
        if (!res.ok) {
          showToast('Could not load this combo', 'error');
        } else {
          setForm(formFromCombo(res.body.combo as Combo));
          setProblems((res.body.problems as Problem[]) ?? []);
          const next: Record<string, ItemDetail> = {};
          for (const item of res.body.items as Array<{ id: string; productTitle: string | null; variantLabel: string | null; variantPrice: number | null }>) {
            next[item.id] = { productTitle: item.productTitle, variantLabel: item.variantLabel, variantPrice: item.variantPrice };
          }
          setDetails(next);
        }
        setLoading(false);
      }
    })().catch(() => setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, comboId]);

  const loadVariants = useCallback(
    async (productId: string): Promise<Variant[]> => {
      if (variantsByProduct[productId]) return variantsByProduct[productId]!;
      const res = await call(`/api/admin/products/${productId}/variants`);
      const variants = res.ok ? ((res.body?.variants as Variant[]) ?? []).filter((v) => v.isActive) : [];
      setVariantsByProduct((prev) => ({ ...prev, [productId]: variants }));
      return variants;
    },
    [call, variantsByProduct]
  );

  // Items already in the combo need their sizes loaded for the dropdowns.
  useEffect(() => {
    for (const productId of new Set(form.items.map((i) => i.productId).filter(Boolean))) void loadVariants(productId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.items.map((i) => i.productId).join(',')]);

  const variantPrice = (productId: string, variantId: string) => variantsByProduct[productId]?.find((v) => v.id === variantId)?.price ?? null;

  const totalWorth = useMemo(() => {
    let sum = 0;
    for (const item of form.items) {
      const price = variantPrice(item.productId, item.variantId);
      if (price === null) return null;
      sum += price * item.quantity;
    }
    return form.items.length ? sum : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.items, variantsByProduct]);

  const frameCount = form.items.reduce((n, i) => n + i.quantity, 0);
  const pricePaise = rupeesToPaise(form.price);
  const mrpPaise = rupeesToPaise(form.mrp);
  const savings = pricePaise && mrpPaise ? comboSavings({ price: pricePaise, mrp: mrpPaise }) : null;

  const updateItem = (index: number, patch: Partial<ComboFormState['items'][number]>) =>
    setForm((f) => ({ ...f, items: f.items.map((item, i) => (i === index ? { ...item, ...patch } : item)) }));

  const addItem = () => setForm((f) => ({ ...f, items: [...f.items, { id: newItemId('frame', f.items.map((i) => i.id)), productId: '', variantId: '', quantity: 1 }] }));

  const chooseProduct = async (index: number, productId: string) => {
    updateItem(index, { productId, variantId: '' });
    const variants = await loadVariants(productId);
    const first = variants.find((v) => v.stockStatus === 'in_stock') ?? variants[0];
    if (first) {
      // The first size picked names the item, so its web address reads like "a4-1".
      setForm((f) => {
        const taken = f.items.filter((_, i) => i !== index).map((i) => i.id);
        return { ...f, items: f.items.map((item, i) => (i === index ? { ...item, variantId: first.id, id: item.variantId ? item.id : newItemId(first.sizeLabel, taken) } : item)) };
      });
    }
  };

  const save = async (status?: Combo['status']) => {
    const built = bodyFromForm(form);
    if (!built.ok) {
      showToast(built.error, 'error');
      return;
    }
    setSaving(true);
    setProblems([]);
    try {
      const body = { ...built.body, ...(status && { status }) };
      const res = comboId
        ? await call(`/api/admin/combos/${comboId}`, { method: 'PATCH', body: JSON.stringify(body) })
        : await call('/api/admin/combos', { method: 'POST', body: JSON.stringify(body) });
      if (!res.ok) {
        const error = res.body?.error;
        const found = error?.details?.problems as Problem[] | undefined;
        if (found?.length) setProblems(found);
        showToast(typeof error === 'string' ? error : (error?.message ?? 'Could not save the combo'), 'error');
        return;
      }
      const saved = res.body.combo as Combo;
      showToast(status === 'published' ? 'Combo published' : 'Combo saved', 'success');
      if (!comboId) router.replace(`/admin/combos/${saved.id}`);
      else setForm(formFromCombo(saved));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8 animate-pulse"><div className="h-64 rounded-2xl bg-field" /></div>;
  }

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6 pb-28">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <div>
          <Link href="/admin/combos" className="text-2xs text-ink/55 hover:text-ink">‹ All combos</Link>
          <h1 className="mt-1 flex items-center gap-2 text-xl font-display font-bold text-ink">
            {comboId ? form.name || 'Combo' : 'New combo'}
            {comboId && <StatusChip status={form.status} />}
          </h1>
        </div>
        {comboId && form.status === 'published' && form.slug && (
          <a href={`/combo/${form.slug}`} target="_blank" rel="noreferrer" className="px-3 py-1.5 rounded-lg border border-line text-xs font-semibold text-ink hover:bg-field">View live</a>
        )}
      </div>

      {problems.length > 0 && (
        <div role="alert" className="rounded-2xl border border-alert/40 bg-alert/10 p-4 text-xs text-ink">
          <p className="font-bold">This combo can&apos;t be published yet</p>
          <ul className="mt-1 list-disc pl-5 space-y-0.5">
            {problems.map((p, i) => <li key={i}>{p.message}</li>)}
          </ul>
        </div>
      )}

      <section className="rounded-2xl border border-line bg-paper p-5 space-y-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-ink">Details</h2>
        <FormField label="Name" required>
          <input
            className={inputClass}
            value={form.name}
            placeholder="e.g. Triple 9 Combo – 10 Frames"
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value, slug: f.slugEdited ? f.slug : slugify(e.target.value) }))}
          />
        </FormField>
        <FormField label="Web address" required hint={`/combo/${form.slug || '…'}`}>
          <input className={`${inputClass} font-mono`} value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: slugify(e.target.value), slugEdited: true }))} />
        </FormField>
        <FormField label="Description" hint="Shown on the combo page">
          <textarea rows={4} className={inputClass} value={form.description} onChange={(e) => set('description', e.target.value)} />
        </FormField>
        <div className="grid sm:grid-cols-[auto_1fr] gap-4 items-start">
          <div className="h-28 w-36 overflow-hidden rounded-xl border border-line bg-field flex items-center justify-center text-2xs text-ink/50">
            {form.coverImageUrl ? <img src={form.coverImageUrl} alt="" className="h-full w-full object-cover" /> : 'No cover yet'}
          </div>
          <div className="space-y-2">
            <FormField label="Cover image" hint="Shown on the combo page and in lists">
              <div className="flex gap-2">
                <button type="button" onClick={() => setPickerOpen(true)} className="px-3 py-2 rounded-xl bg-gold text-ink text-xs font-semibold hover:bg-gold-deep">
                  {form.coverImageUrl ? 'Change image' : 'Choose image'}
                </button>
                {form.coverImageUrl && <button type="button" onClick={() => set('coverImageUrl', '')} className="px-3 py-2 rounded-xl border border-line text-xs">Remove</button>}
              </div>
            </FormField>
            <FormField label="Image description" hint="For screen readers and search">
              <input className={inputClass} value={form.coverImageAlt} onChange={(e) => set('coverImageAlt', e.target.value)} />
            </FormField>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <FormField label="Badge" hint="Optional, e.g. Best value">
            <input className={inputClass} maxLength={30} value={form.badge} onChange={(e) => set('badge', e.target.value)} />
          </FormField>
          <FormField label="Order in lists" hint="Lower comes first">
            <input className={inputClass} inputMode="numeric" value={form.sortOrder} onChange={(e) => set('sortOrder', e.target.value)} />
          </FormField>
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-paper p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-ink">Included frames ({frameCount})</h2>
          <button type="button" onClick={addItem} className="px-3 py-1.5 rounded-xl bg-gold text-ink text-xs font-semibold hover:bg-gold-deep">+ Add product</button>
        </div>
        <p className="text-2xs text-ink/60">Each product and size you add can appear several times. Customers personalize every copy on its own, with that product&apos;s own editor.</p>

        {form.items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line p-6 text-center text-xs text-ink/55">No frames yet. Add the products this combo contains.</p>
        ) : (
          <ul className="space-y-3">
            {form.items.map((item, index) => {
              const variants = variantsByProduct[item.productId] ?? [];
              const itemProblems = problems.filter((p) => p.itemId === item.id);
              const known = details[item.id];
              return (
                <li key={item.id} className="rounded-xl border border-line p-3 space-y-3">
                  <div className="grid gap-3 sm:grid-cols-[1fr_1fr_90px_auto] items-end">
                    <FormField label="Product">
                      <select className={inputClass} value={item.productId} onChange={(e) => void chooseProduct(index, e.target.value)}>
                        <option value="">Choose a product…</option>
                        {item.productId && !products.some((p) => p.id === item.productId) && <option value={item.productId}>{known?.productTitle ?? item.productId}</option>}
                        {products.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                      </select>
                    </FormField>
                    <FormField label="Size and finish">
                      <select className={inputClass} value={item.variantId} disabled={!item.productId} onChange={(e) => updateItem(index, { variantId: e.target.value })}>
                        <option value="">{item.productId ? 'Choose a size…' : '—'}</option>
                        {item.variantId && !variants.some((v) => v.id === item.variantId) && <option value={item.variantId}>{known?.variantLabel ?? item.variantId}</option>}
                        {variants.map((v) => <option key={v.id} value={v.id}>{v.sizeLabel} · {v.frameColour} · {formatPaise(v.price)}{v.stockStatus !== 'in_stock' ? ' (out of stock)' : ''}</option>)}
                      </select>
                    </FormField>
                    <FormField label="How many">
                      <input className={inputClass} type="number" min={1} max={30} value={item.quantity} onChange={(e) => updateItem(index, { quantity: Math.min(30, Math.max(1, Number.parseInt(e.target.value, 10) || 1)) })} />
                    </FormField>
                    <button type="button" onClick={() => setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== index) }))} className="h-9 px-3 rounded-xl border border-line text-xs text-ink/70 hover:text-alert" aria-label={`Remove item ${index + 1}`}>
                      Remove
                    </button>
                  </div>
                  <FormField label="Heading on the combo page" hint="Optional; defaults to the product name">
                    <input className={inputClass} maxLength={60} value={item.label ?? ''} placeholder="e.g. Small frame" onChange={(e) => updateItem(index, { label: e.target.value })} />
                  </FormField>
                  {itemProblems.map((p, i) => <p key={i} className="text-2xs font-medium text-alert">{p.message}</p>)}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-line bg-paper p-5 space-y-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-ink">Price</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <FormField label="Combo price (₹)" required hint="What the customer pays for everything">
            <input className={inputClass} inputMode="decimal" value={form.price} onChange={(e) => set('price', e.target.value)} />
          </FormField>
          <FormField label="MRP (₹)" required hint="Crossed out on the page">
            <div className="flex gap-2">
              <input className={inputClass} inputMode="decimal" value={form.mrp} onChange={(e) => set('mrp', e.target.value)} />
              <button type="button" disabled={totalWorth === null} onClick={() => totalWorth !== null && set('mrp', paiseToRupees(totalWorth))} className="shrink-0 px-3 rounded-xl border border-line text-2xs font-semibold disabled:opacity-40">
                Use total worth
              </button>
            </div>
          </FormField>
        </div>
        <p className="text-xs text-ink/70">
          {totalWorth !== null && <>The frames sold separately: <strong>{formatPaise(totalWorth)}</strong>. </>}
          {savings && savings.amount > 0 ? <>Customers see <strong>{savings.percent}% off</strong> (save {formatPaise(savings.amount)}).</> : 'Set an MRP above the price to show a saving.'}
        </p>
        <label className="flex items-start gap-3 rounded-xl border border-line bg-field p-3 cursor-pointer">
          <input type="checkbox" className="mt-0.5" checked={form.couponsAllowed} onChange={(e) => set('couponsAllowed', e.target.checked)} />
          <span>
            <span className="block text-xs font-bold text-ink">Allow coupon codes on this combo</span>
            <span className="text-2xs text-ink/60">Off by default, since a combo is already discounted.</span>
          </span>
        </label>
      </section>

      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-line bg-paper/95 backdrop-blur px-4 py-3 flex flex-wrap items-center justify-end gap-2 md:left-64">
        {comboId && form.status === 'published' && (
          <button type="button" disabled={saving} onClick={() => void save('draft')} className="px-4 py-2 rounded-xl border border-line text-xs font-semibold hover:bg-field disabled:opacity-50">Unpublish</button>
        )}
        {comboId && form.status !== 'archived' && (
          <button type="button" disabled={saving} onClick={() => void save('archived')} className="px-4 py-2 rounded-xl border border-line text-xs font-semibold hover:bg-field disabled:opacity-50">Archive</button>
        )}
        <button type="button" disabled={saving} onClick={() => void save()} className="px-4 py-2 rounded-xl border border-ink text-ink text-xs font-semibold hover:bg-field disabled:opacity-50">
          {saving ? 'Saving…' : comboId ? 'Save changes' : 'Create draft'}
        </button>
        {comboId && form.status !== 'published' && (
          <button type="button" disabled={saving} onClick={() => void save('published')} className="px-5 py-2 rounded-xl bg-gold hover:bg-gold-deep text-ink text-xs font-bold disabled:opacity-50">Publish</button>
        )}
      </div>

      <MediaPickerModal
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        allowedTypes={['image']}
        title="Choose the cover image"
        onSelect={(asset) => {
          set('coverImageUrl', asset.url);
          if (!form.coverImageAlt && asset.alt) set('coverImageAlt', asset.alt);
          setPickerOpen(false);
        }}
      />
    </div>
  );
}
