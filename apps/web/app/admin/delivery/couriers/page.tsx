'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../../../lib/auth-context';
import { AdminModal } from '../../../../components/admin/AdminModal';
import { ConfirmDialog } from '../../../../components/ui/ConfirmDialog';
import { useToast } from '../../../../components/ui/Toast';
import { trackingUrlFromCouriers } from '../../../../lib/shipping/courier-tracking';

/*
 * Courier partners: the couriers the shop sends parcels with, and the address of each courier's tracking page.
 * When staff mark an order Shipped and type one of these couriers, the customer's order page and message get a
 * working tracking link built from that address.
 */

interface Courier {
  id: string;
  name: string;
  code: string;
  trackingUrlTemplate: string;
  isActive: boolean;
  defaultForZones?: string[];
  contactPhone?: string;
}

type Form = { name: string; code: string; trackingUrlTemplate: string; isActive: boolean; contactPhone: string };
const EMPTY: Form = { name: '', code: '', trackingUrlTemplate: '', isActive: true, contactPhone: '' };
const SAMPLE_AWB = '1234567890';

const input = 'w-full rounded-xl border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink/40 focus:border-gold focus:outline-none';

export default function CourierPartnersPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [suggestions, setSuggestions] = useState<Courier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Courier | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<Courier | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);

  const authed = useCallback(async (url: string, init: RequestInit = {}) => {
    const token = await user!.getIdToken();
    return fetch(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
  }, [user]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const res = await authed('/api/admin/delivery/couriers');
      if (!res.ok) throw new Error(res.status === 403 ? 'Your role cannot manage couriers.' : 'Couriers could not be loaded.');
      const body = (await res.json()) as { couriers?: Courier[]; suggestions?: Courier[] };
      setCouriers((body.couriers ?? []).sort((a, b) => a.name.localeCompare(b.name)));
      setSuggestions(body.suggestions ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couriers could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [user, authed]);

  useEffect(() => {
    void load();
  }, [load]);

  const openAdd = (from?: Courier) => {
    setEditing(null);
    setForm(from ? { name: from.name, code: from.code, trackingUrlTemplate: from.trackingUrlTemplate, isActive: true, contactPhone: '' } : EMPTY);
    setOpen(true);
  };
  const openEdit = (c: Courier) => {
    setEditing(c);
    setForm({ name: c.name, code: c.code, trackingUrlTemplate: c.trackingUrlTemplate, isActive: c.isActive, contactPhone: c.contactPhone ?? '' });
    setOpen(true);
  };

  const preview = trackingUrlFromCouriers([{ ...form, isActive: true }], form.code || form.name, SAMPLE_AWB);
  const templateProblem =
    form.trackingUrlTemplate && !form.trackingUrlTemplate.includes('{awb}')
      ? 'Put {awb} where the tracking number goes.'
      : form.trackingUrlTemplate && !preview
        ? 'Use the full https:// address of the tracking page.'
        : null;
  const canSave = form.name.trim() && form.code.trim() && form.trackingUrlTemplate.trim() && !templateProblem && !saving;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        code: form.code.trim().toUpperCase().replace(/\s+/g, ''),
        trackingUrlTemplate: form.trackingUrlTemplate.trim(),
        isActive: form.isActive,
        defaultForZones: editing?.defaultForZones ?? [],
        ...(form.contactPhone.trim() && { contactPhone: form.contactPhone.trim() }),
      };
      const res = await authed(editing ? `/api/admin/delivery/couriers/${editing.id}` : '/api/admin/delivery/couriers', {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? body?.message ?? 'The courier could not be saved.');
      }
      showToast(editing ? 'Courier saved' : 'Courier added', 'success');
      setOpen(false);
      void load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'The courier could not be saved.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!removing) return;
    setRemoveBusy(true);
    try {
      const res = await authed(`/api/admin/delivery/couriers/${removing.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('The courier could not be removed.');
      showToast('Courier removed', 'success');
      setRemoving(null);
      void load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'The courier could not be removed.', 'error');
    } finally {
      setRemoveBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6 md:px-8 md:py-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Courier partners</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink/60">
            The couriers you send parcels with. When you mark an order <span className="font-medium text-ink">Shipped</span> and
            type one of these names, the customer gets a tracking link that opens straight to their parcel.
          </p>
        </div>
        <button onClick={() => openAdd()} className="self-start rounded-full bg-gold px-4 py-2 text-sm font-semibold text-ink hover:bg-gold-deep sm:self-auto">
          Add courier
        </button>
      </header>

      {error ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-alert/40 bg-paper p-4 text-sm text-ink">
          <span>{error}</span>
          <button onClick={() => void load()} className="rounded-full border border-line px-3 py-1 text-xs font-semibold hover:bg-field">Try again</button>
        </div>
      ) : loading ? (
        <div className="space-y-2">{[0, 1].map((i) => <div key={i} className="h-20 animate-pulse rounded-card bg-tint" />)}</div>
      ) : (
        <>
          <section className="rounded-card border border-line bg-paper">
            <h2 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink sm:px-5">Your couriers</h2>
            {couriers.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-ink/60">No couriers saved yet. Add the ones you use, or pick from the list below.</p>
            ) : (
              <ul className="divide-y divide-line">
                {couriers.map((c) => (
                  <li key={c.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-ink">{c.name}</p>
                        <span className="rounded-md bg-tint px-1.5 py-0.5 font-mono text-[11px] text-ink/70">{c.code}</span>
                        {c.isActive ? (
                          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800">In use</span>
                        ) : (
                          <span className="rounded-full border border-line bg-field px-2 py-0.5 text-xs text-ink/60">Paused</span>
                        )}
                      </div>
                      <p className="mt-1 break-all text-xs text-ink/55">{c.trackingUrlTemplate}</p>
                      {c.contactPhone && <p className="mt-0.5 text-xs text-ink/55">Pickup contact: {c.contactPhone}</p>}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button onClick={() => openEdit(c)} className="rounded-full border border-line px-3.5 py-1.5 text-sm font-medium text-ink hover:bg-tint">Edit</button>
                      <button onClick={() => setRemoving(c)} className="rounded-full px-3 py-1.5 text-sm font-medium text-alert hover:bg-alert/10">Remove</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {suggestions.length > 0 && (
            <section className="rounded-card border border-dashed border-line bg-paper/60">
              <div className="border-b border-line px-4 py-3 sm:px-5">
                <h2 className="text-sm font-semibold text-ink">Common couriers</h2>
                <p className="text-xs text-ink/55">Not saved yet. Add the ones you use; you can change the details first.</p>
              </div>
              <ul className="divide-y divide-line">
                {suggestions.map((c) => (
                  <li key={c.code} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink">{c.name}</p>
                      <p className="truncate text-xs text-ink/50">{c.trackingUrlTemplate}</p>
                    </div>
                    <button onClick={() => openAdd(c)} className="shrink-0 rounded-full border border-line px-3.5 py-1.5 text-sm font-medium text-ink hover:bg-tint">Add</button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <AdminModal isOpen={open} onClose={() => setOpen(false)} title={editing ? `Edit ${editing.name}` : 'Add a courier'}>
        <form onSubmit={save} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
            <label className="block space-y-1">
              <span className="text-sm font-medium text-ink">Name</span>
              <input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Delhivery" required />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium text-ink">Short code</span>
              <input className={`${input} font-mono uppercase`} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="DELHIVERY" required />
            </label>
          </div>
          <label className="block space-y-1">
            <span className="text-sm font-medium text-ink">Tracking page address</span>
            <input className={`${input} font-mono text-xs`} value={form.trackingUrlTemplate} onChange={(e) => setForm({ ...form, trackingUrlTemplate: e.target.value })} placeholder="https://www.delhivery.com/track/package/{awb}" required />
            <span className={`block text-xs ${templateProblem ? 'text-alert' : 'text-ink/55'}`}>
              {templateProblem ?? 'Write {awb} where the tracking (AWB) number goes.'}
            </span>
          </label>
          {preview && (
            <p className="rounded-xl bg-field px-3 py-2 text-xs text-ink/70">
              Example for AWB {SAMPLE_AWB}:{' '}
              <a href={preview} target="_blank" rel="noreferrer" className="break-all text-gold-deep underline">{preview}</a>
            </p>
          )}
          <label className="block space-y-1">
            <span className="text-sm font-medium text-ink">Pickup contact phone <span className="font-normal text-ink/50">(optional)</span></span>
            <input className={input} value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} placeholder="+91 98xxx xxxxx" inputMode="tel" />
          </label>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="h-4 w-4 rounded border-line accent-[rgb(var(--color-gold))]" />
            In use (pause it to stop offering this courier)
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setOpen(false)} className="rounded-full border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-tint">Cancel</button>
            <button type="submit" disabled={!canSave} className="rounded-full bg-gold px-4 py-2 text-sm font-semibold text-ink hover:bg-gold-deep disabled:opacity-40">
              {saving ? 'Saving…' : editing ? 'Save courier' : 'Add courier'}
            </button>
          </div>
        </form>
      </AdminModal>

      <ConfirmDialog
        isOpen={removing !== null}
        title={removing ? `Remove ${removing.name}?` : 'Remove courier?'}
        message="Orders already shipped with this courier keep their tracking details. New orders won't get a link for it."
        confirmLabel="Remove courier"
        tone="danger"
        isLoading={removeBusy}
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
      />
    </div>
  );
}
