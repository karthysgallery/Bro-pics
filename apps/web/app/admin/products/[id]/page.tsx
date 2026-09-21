'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import type { Product } from '@bro-pics/shared';
import { getFirebaseApp } from '../../../../lib/firebase-client';

interface ProductFormPageProps {
  params: Promise<{ id: string }>;
}

type FormState = {
  title: string;
  slug: string;
  categoryId: string;
  shortDesc: string;
  basePrice: string;
  photoSlots: string;
  badges: string;
  highlights: string;
  isActive: boolean;
  isFeatured: boolean;
  allowsTextPersonalization: boolean;
};

const BLANK_FORM: FormState = {
  title: '',
  slug: '',
  categoryId: '',
  shortDesc: '',
  basePrice: '',
  photoSlots: '1',
  badges: '',
  highlights: '',
  isActive: true,
  isFeatured: false,
  allowsTextPersonalization: false,
};

function productToForm(product: Product): FormState {
  return {
    title: product.title,
    slug: product.slug,
    categoryId: product.categoryId,
    shortDesc: product.shortDesc,
    basePrice: String(product.basePrice / 100),
    photoSlots: String(product.photoSlots),
    badges: product.badges.join(', '),
    highlights: product.highlights.join('\n'),
    isActive: product.isActive,
    isFeatured: product.isFeatured,
    allowsTextPersonalization: product.allowsTextPersonalization,
  };
}

export default function AdminProductFormPage({ params }: ProductFormPageProps) {
  const [productId, setProductId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(BLANK_FORM);
  const [loading, setLoading] = useState(true);
  const [saveNote, setSaveNote] = useState<string | null>(null);

  useEffect(() => {
    params.then((p) => setProductId(p.id));
  }, [params]);

  useEffect(() => {
    if (!productId) return;
    if (productId === 'new') {
      setForm(BLANK_FORM);
      setLoading(false);
      return;
    }
    const db = getFirestore(getFirebaseApp());
    getDoc(doc(db, 'products', productId)).then((snapshot) => {
      if (snapshot.exists()) setForm(productToForm(snapshot.data() as Product));
      setLoading(false);
    });
  }, [productId]);

  const isNew = productId === 'new';

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = () => {
    // Not yet connected to a backend write path — see the backend
    // requirements doc (docs/superpowers/specs). Products are currently
    // only ever written by the seed script; this form is fully built and
    // clickable, but Save/Create/Delete only update local state.
    setSaveNote(isNew ? 'Product created (locally only — not yet saved to the catalog).' : 'Changes saved (locally only — not yet persisted).');
  };

  const handleDelete = () => {
    setSaveNote('Product deleted (locally only — not yet removed from the catalog).');
  };

  if (loading) return <p>Loading…</p>;

  return (
    <div className="max-w-2xl flex flex-col gap-4">
      <Link href="/admin/products" className="text-sm text-brown/60 hover:text-brown-dark w-fit">
        ← Back to products
      </Link>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl text-brown-dark">{isNew ? 'New Product' : 'Edit Product'}</h1>
        {!isNew && (
          <Link href={`/admin/products/${productId}/template`} className="text-sm underline text-brown">
            Edit personalization template →
          </Link>
        )}
      </div>

      <div className="rounded-lg bg-gold/10 border border-gold/30 px-4 py-3 text-sm text-brown/80">
        Not yet connected to the backend — there is currently no product write API. This form is fully
        functional in the UI; see the backend requirements doc for what's needed to make Save/Create/Delete real.
      </div>

      <label htmlFor="p-title" className="text-sm text-brown/70">Title</label>
      <input id="p-title" value={form.title} onChange={(e) => update('title', e.target.value)} className="rounded-lg border border-gold/30 px-3 py-2" />

      <label htmlFor="p-slug" className="text-sm text-brown/70">Slug</label>
      <input id="p-slug" value={form.slug} onChange={(e) => update('slug', e.target.value)} className="rounded-lg border border-gold/30 px-3 py-2" />

      <label htmlFor="p-category" className="text-sm text-brown/70">Category ID</label>
      <input id="p-category" value={form.categoryId} onChange={(e) => update('categoryId', e.target.value)} className="rounded-lg border border-gold/30 px-3 py-2" />

      <label htmlFor="p-short-desc" className="text-sm text-brown/70">Short description</label>
      <textarea id="p-short-desc" value={form.shortDesc} onChange={(e) => update('shortDesc', e.target.value)} className="rounded-lg border border-gold/30 px-3 py-2" />

      <label htmlFor="p-price" className="text-sm text-brown/70">Base price (₹)</label>
      <input id="p-price" type="number" value={form.basePrice} onChange={(e) => update('basePrice', e.target.value)} className="rounded-lg border border-gold/30 px-3 py-2 w-40" />

      <label htmlFor="p-photo-slots" className="text-sm text-brown/70">Photo slots</label>
      <input id="p-photo-slots" type="number" min={1} value={form.photoSlots} onChange={(e) => update('photoSlots', e.target.value)} className="rounded-lg border border-gold/30 px-3 py-2 w-40" />

      <label htmlFor="p-badges" className="text-sm text-brown/70">Badges (comma-separated)</label>
      <input id="p-badges" value={form.badges} onChange={(e) => update('badges', e.target.value)} className="rounded-lg border border-gold/30 px-3 py-2" />

      <label htmlFor="p-highlights" className="text-sm text-brown/70">Highlights (one per line)</label>
      <textarea id="p-highlights" rows={4} value={form.highlights} onChange={(e) => update('highlights', e.target.value)} className="rounded-lg border border-gold/30 px-3 py-2" />

      <label className="flex items-center gap-2 text-sm text-brown/80">
        <input type="checkbox" checked={form.isActive} onChange={(e) => update('isActive', e.target.checked)} />
        Active
      </label>
      <label className="flex items-center gap-2 text-sm text-brown/80">
        <input type="checkbox" checked={form.isFeatured} onChange={(e) => update('isFeatured', e.target.checked)} />
        Featured
      </label>
      <label className="flex items-center gap-2 text-sm text-brown/80">
        <input type="checkbox" checked={form.allowsTextPersonalization} onChange={(e) => update('allowsTextPersonalization', e.target.checked)} />
        Allows text personalization
      </label>

      <div className="flex gap-3 pt-2">
        <button onClick={handleSave} className="rounded-full bg-gradient-to-b from-brown-light to-brown text-cream px-6 py-2">
          {isNew ? 'Create product' : 'Save changes'}
        </button>
        {!isNew && (
          <button onClick={handleDelete} className="rounded-full border border-red-400 text-red-600 px-6 py-2">
            Delete
          </button>
        )}
      </div>
      {saveNote && <p className="text-sm text-brown/70">{saveNote}</p>}
    </div>
  );
}
