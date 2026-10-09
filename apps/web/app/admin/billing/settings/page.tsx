'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PAYMENT_METHODS, type BillingSettings } from '@bro-pics/shared';
import { useAdminApi } from '../../../../components/admin/template-builder/use-admin-api';
import { METHOD_LABEL, Notice, PageHeader, card, input, primaryButton, sectionTitle } from '../../../../components/admin/billing/ui';

/** Admin → Billing → Billing settings: what every invoice says, numbering, payment methods, staff discount limit. */
export default function BillingSettingsPage() {
  const api = useAdminApi();
  const [s, setS] = useState<BillingSettings | null>(null);
  const [gst, setGst] = useState<{ enabled: boolean; rate: number; gstin: string | null } | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    api<{ settings: BillingSettings; gst: typeof gst; canEdit: boolean }>('/api/admin/billing/settings')
      .then((r) => {
        setS(r.settings);
        setGst(r.gst);
        setCanEdit(r.canEdit);
      })
      .catch((e: Error) => setMsg({ ok: false, text: e.message }));
  }, [api]);
  if (!s) return <div className="p-8">{msg ? <Notice tone="error">{msg.text}</Notice> : <p className="text-xs text-ink/50">Loading…</p>}</div>;
  const set = <K extends keyof BillingSettings>(k: K, v: BillingSettings[K]) => setS({ ...s, [k]: v });
  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await api('/api/admin/billing/settings', { method: 'PUT', body: JSON.stringify(s) });
      setMsg({ ok: true, text: 'Saved. New invoices use these details.' });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Could not save.' });
    } finally {
      setSaving(false);
    }
  };
  const field = (k: keyof BillingSettings, label: string, props: { multiline?: boolean; placeholder?: string } = {}) => (
    <label className="block space-y-1">
      <span className="text-2xs font-semibold text-ink/60">{label}</span>
      {props.multiline ? (
        <textarea className={`${input} h-20 py-2`} disabled={!canEdit} value={String(s[k] ?? '')} placeholder={props.placeholder} onChange={(e) => set(k, e.target.value as never)} />
      ) : (
        <input className={input} disabled={!canEdit} value={String(s[k] ?? '')} placeholder={props.placeholder} onChange={(e) => set(k, e.target.value as never)} />
      )}
    </label>
  );
  return (
    <div className="mx-auto max-w-4xl space-y-5 p-6 pb-28 md:p-8">
      <PageHeader title="Billing settings">What every invoice (online and in store) says. Empty fields are simply left off the invoice.</PageHeader>
      {!canEdit && <Notice>Only the owner or an admin can change billing settings.</Notice>}
      {msg && <Notice tone={msg.ok ? 'success' : 'error'}>{msg.text}</Notice>}
      <section className={card}>
        <h2 className={sectionTitle}>Business details</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {field('businessName', 'Business name (printed large)')}
          {field('legalName', 'Legal name (optional)')}
          {field('phone', 'Phone')}
          {field('email', 'Email')}
        </div>
        {field('address', 'Address', { multiline: true })}
        <p className="text-2xs text-ink/55">
          GST: {gst?.enabled ? `on, ${gst.rate}%${gst.gstin ? `, GSTIN ${gst.gstin}` : ' — no GSTIN entered'}` : 'off'} · change it in <Link className="underline" href="/admin/settings">Store & GST settings</Link>. Prices include GST; invoices show the GST contained in the total.
        </p>
      </section>
      <section className={card}>
        <h2 className={sectionTitle}>Numbering</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {field('invoicePrefix', 'Invoice prefix', { placeholder: 'KG-INV' })}
          {field('creditNotePrefix', 'Credit note prefix', { placeholder: 'KG-CN' })}
        </div>
        <p className="text-2xs text-ink/55">
          Numbers look like {s.invoicePrefix}-2026-000001: prefix, financial year (April–March), then one sequence shared by online and in-store invoices. The sequence never restarts mid-year and changing the prefix can never repeat a number.
        </p>
      </section>
      <section className={card}>
        <h2 className={sectionTitle}>In-store payments and discounts</h2>
        <div className="flex flex-wrap gap-4">
          {PAYMENT_METHODS.map((m) => (
            <label key={m} className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                disabled={!canEdit}
                checked={s.paymentMethods.includes(m)}
                onChange={(e) => set('paymentMethods', e.target.checked ? [...s.paymentMethods, m] : s.paymentMethods.filter((x) => x !== m))}
                className="h-4 w-4 accent-[#14213D]"
              />
              {METHOD_LABEL[m]}
            </label>
          ))}
        </div>
        <label className="block max-w-xs space-y-1">
          <span className="text-2xs font-semibold text-ink/60">Largest discount staff may give (%)</span>
          <input className={input} type="number" min={0} max={100} disabled={!canEdit} value={s.maxStaffDiscountPercent} onChange={(e) => set('maxStaffDiscountPercent', Math.max(0, Math.min(100, Number(e.target.value) || 0)))} />
        </label>
        <p className="text-2xs text-ink/55">Owners and admins can give more; every discount is recorded in the audit log.</p>
      </section>
      <section className={card}>
        <h2 className={sectionTitle}>Invoice footer</h2>
        {field('footer', 'Printed at the bottom of every invoice', { multiline: true, placeholder: 'Exchange within 7 days with this bill. Thank you!' })}
      </section>
      {canEdit && (
        <button type="button" className={primaryButton} disabled={saving || s.paymentMethods.length === 0} onClick={() => void save()}>
          {saving ? 'Saving…' : 'Save billing settings'}
        </button>
      )}
    </div>
  );
}
