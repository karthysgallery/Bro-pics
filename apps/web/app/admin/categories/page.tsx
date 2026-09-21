'use client';

import { useEffect, useState } from 'react';
import { getFirestore, collection, getDocs, orderBy, query } from 'firebase/firestore';
import type { Category } from '@bro-pics/shared';
import { getFirebaseApp } from '../../../lib/firebase-client';

type FormState = { name: string; slug: string; sortOrder: string; isActive: boolean };

const BLANK_FORM: FormState = { name: '', slug: '', sortOrder: '0', isActive: true };

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [form, setForm] = useState<FormState>(BLANK_FORM);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    const db = getFirestore(getFirebaseApp());
    getDocs(query(collection(db, 'categories'), orderBy('sortOrder'))).then((snapshot) => {
      setCategories(snapshot.docs.map((d) => d.data() as Category));
    });
  }, []);

  const startEdit = (category: Category) => {
    setEditingId(category.id);
    setShowNewForm(false);
    setForm({ name: category.name, slug: category.slug, sortOrder: String(category.sortOrder), isActive: category.isActive });
  };

  const startNew = () => {
    setEditingId(null);
    setShowNewForm(true);
    setForm(BLANK_FORM);
  };

  const handleSave = () => {
    // No category write API exists today — see the backend requirements
    // doc. This form is fully built and clickable, note only.
    setNote(editingId ? 'Category updated (locally only — not yet persisted).' : 'Category created (locally only — not yet persisted).');
    setEditingId(null);
    setShowNewForm(false);
  };

  const handleDelete = (categoryId: string) => {
    setCategories((prev) => (prev ? prev.filter((c) => c.id !== categoryId) : prev));
    setNote('Category deleted (locally only — not yet persisted).');
  };

  const form_ = (
    <div className="rounded-xl border border-gold/30 p-4 flex flex-col gap-3">
      <label htmlFor="c-name" className="text-sm text-brown/70">Name</label>
      <input id="c-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="rounded-lg border border-gold/30 px-3 py-2" />

      <label htmlFor="c-slug" className="text-sm text-brown/70">Slug</label>
      <input id="c-slug" value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} className="rounded-lg border border-gold/30 px-3 py-2" />

      <label htmlFor="c-sort" className="text-sm text-brown/70">Sort order</label>
      <input id="c-sort" type="number" value={form.sortOrder} onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))} className="rounded-lg border border-gold/30 px-3 py-2 w-32" />

      <label className="flex items-center gap-2 text-sm text-brown/80">
        <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} />
        Active
      </label>

      <div className="flex gap-3">
        <button onClick={handleSave} className="rounded-full bg-gradient-to-b from-brown-light to-brown text-cream px-5 py-2 text-sm w-fit">
          {editingId ? 'Save changes' : 'Create category'}
        </button>
        <button
          onClick={() => {
            setEditingId(null);
            setShowNewForm(false);
          }}
          className="rounded-full border border-brown/30 text-brown px-5 py-2 text-sm w-fit"
        >
          Cancel
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl text-brown-dark">Categories</h1>
        {!showNewForm && (
          <button onClick={startNew} className="rounded-full bg-gradient-to-b from-brown-light to-brown text-cream px-4 py-2 text-sm">
            + New category
          </button>
        )}
      </div>

      <div className="rounded-lg bg-gold/10 border border-gold/30 px-4 py-3 text-sm text-brown/80">
        Not yet connected to the backend — there is currently no category write API. See the backend requirements doc.
      </div>

      {showNewForm && form_}

      {categories === null ? (
        <p>Loading…</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {categories.map((category) =>
            editingId === category.id ? (
              <li key={category.id}>{form_}</li>
            ) : (
              <li key={category.id} className="rounded-xl border border-gold/30 p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium text-brown-dark">{category.name}</p>
                  <p className="text-sm text-brown/60">
                    /{category.slug} · sort {category.sortOrder} · {category.isActive ? 'active' : 'inactive'}
                  </p>
                </div>
                <div className="flex gap-3 text-sm">
                  <button onClick={() => startEdit(category)} className="underline text-brown">
                    Edit
                  </button>
                  <button onClick={() => handleDelete(category.id)} className="underline text-brown">
                    Delete
                  </button>
                </div>
              </li>
            )
          )}
        </ul>
      )}
      {note && <p className="text-sm text-brown/70">{note}</p>}
    </div>
  );
}
