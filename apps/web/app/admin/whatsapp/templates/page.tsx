'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAdminApi } from '../../../../components/admin/template-builder/use-admin-api';
import { Badge, Notice, PageHeader, button, card, dateTime, input, primaryButton, sectionTitle } from '../../../../components/admin/billing/ui';

interface Row {
  key: string;
  name: string;
  category: string;
  purpose: string;
  variables: string[];
  intendedUse: string;
  automatic: boolean;
  suggestedBody: string;
  recorded: { status: string; language: string; category: string; verifiedAt: string; verifiedBy: string; note: string | null } | null;
  categoryMatches: boolean | null;
}
interface Recorded {
  id: string;
  name: string;
  language: string;
  category: string;
  status: string;
  verifiedAt: string;
}
const STATUSES = ['not_submitted', 'in_review', 'approved', 'rejected', 'paused'];

/**
 * Admin → WhatsApp → Templates. What the shop sends, and what an administrator has recorded about each template after
 * looking at WhatsApp Manager. The website cannot ask Meta: "approved" here is a dated record made by a person.
 */
export default function WhatsAppTemplatesPage() {
  const api = useAdminApi();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [recorded, setRecorded] = useState<Recorded[]>([]);
  const [msg, setMsg] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const [form, setForm] = useState({ name: '', language: 'en', category: 'MARKETING', status: 'approved', note: '' });
  const [rate, setRate] = useState({ marketingPerMessageInr: '', checkedOn: '', source: '' });

  const load = useCallback(() => {
    api<{ templates: Row[]; recorded: Recorded[] }>('/api/admin/whatsapp/templates').then((r) => { setRows(r.templates); setRecorded(r.recorded); }).catch((e: Error) => setMsg({ tone: 'error', text: e.message }));
  }, [api]);
  useEffect(load, [load]);

  const save = async (body: typeof form) => {
    try {
      await api('/api/admin/whatsapp/templates', { method: 'PUT', body: JSON.stringify(body) });
      setMsg({ tone: 'success', text: `Recorded ${body.name} as ${body.status}.` });
      load();
    } catch (e) {
      setMsg({ tone: 'error', text: (e as Error).message });
    }
  };
  const savePricing = async () => {
    try {
      await api('/api/admin/whatsapp/pricing', { method: 'PUT', body: JSON.stringify({ marketingPerMessageInr: Number(rate.marketingPerMessageInr), checkedOn: rate.checkedOn, source: rate.source }) });
      setMsg({ tone: 'success', text: 'Rate saved. Campaign estimates now use it.' });
    } catch (e) {
      setMsg({ tone: 'error', text: (e as Error).message });
    }
  };
  const sel = `${input} pr-2`;
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6 md:p-8">
      <PageHeader title="WhatsApp templates">
        These are the messages the shop sends. Create each one in WhatsApp Manager first and wait for Meta’s review. Then record its status here after you have seen it with your own eyes: a campaign will not send with a template that is not recorded as approved.
      </PageHeader>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

      <section className="overflow-x-auto rounded-2xl border border-line bg-paper">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-line bg-field/60 text-left text-2xs uppercase tracking-wider text-ink/55"><th className="p-3">Template</th><th className="p-3">Category</th><th className="p-3">Variables</th><th className="p-3">Recorded status</th><th className="p-3" /></tr></thead>
          <tbody className="divide-y divide-line">
            {(rows ?? []).map((r) => (
              <tr key={r.key} className="align-top">
                <td className="p-3"><span className="font-mono text-xs font-semibold text-ink">{r.name}</span><span className="mt-1 block max-w-md text-xs text-ink/60">{r.intendedUse}</span><span className="mt-1 block max-w-md text-2xs text-ink/50">Suggested wording to submit: {r.suggestedBody}</span></td>
                <td className="p-3 text-xs">{r.category}<span className="block text-ink/50">{r.automatic ? 'sent automatically' : 'not automatic'}</span></td>
                <td className="p-3 text-xs">{r.variables.map((v, i) => <span key={v} className="block">{`{{${i + 1}}}`} {v}</span>)}</td>
                <td className="p-3 text-xs">{r.recorded ? <><Badge value={r.recorded.status === 'approved' ? 'paid' : r.recorded.status === 'rejected' || r.recorded.status === 'paused' ? 'failed' : 'draft'} label={r.recorded.status} /><span className="block text-ink/50">checked {dateTime(r.recorded.verifiedAt)}</span>{r.categoryMatches === false && <span className="block text-alert">Recorded as {r.recorded.category}, but the code sends it as {r.category}.</span>}</> : <span className="text-ink/50">Not recorded</span>}</td>
                <td className="p-3 text-right"><button type="button" className={button} onClick={() => setForm({ name: r.name, language: r.recorded?.language ?? 'en', category: r.category, status: r.recorded?.status ?? 'approved', note: '' })}>Record status…</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className={card}>
        <h2 className={sectionTitle}>Record a template status</h2>
        <p className="text-xs text-ink/60">Use this for your marketing templates too (the name is exactly as in WhatsApp Manager). Only administrators can record statuses.</p>
        <div className="grid gap-2 md:grid-cols-5">
          <input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="template_name" aria-label="Template name" />
          <input className={input} value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })} placeholder="en" aria-label="Language" />
          <select className={sel} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} aria-label="Category"><option>MARKETING</option><option>UTILITY</option><option>AUTHENTICATION</option></select>
          <select className={sel} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} aria-label="Status">{STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
          <button type="button" className={primaryButton} onClick={() => void save(form)}>Record</button>
        </div>
        {recorded.length > 0 && <p className="text-xs text-ink/60">Recorded: {recorded.map((r) => `${r.name} (${r.language}) ${r.status}`).join(' · ')}</p>}
      </section>

      <section className={card}>
        <h2 className={sectionTitle}>Marketing price used for cost estimates</h2>
        <p className="text-xs text-ink/60">The website holds no price list. Read the current per-message rate for marketing messages to India on Meta’s pricing page or in WhatsApp Manager, and type it with today’s date. Meta’s invoice is what counts.</p>
        <div className="grid gap-2 md:grid-cols-4">
          <input className={input} inputMode="decimal" value={rate.marketingPerMessageInr} onChange={(e) => setRate({ ...rate, marketingPerMessageInr: e.target.value })} placeholder="₹ per message" aria-label="Rupees per message" />
          <input className={input} value={rate.checkedOn} onChange={(e) => setRate({ ...rate, checkedOn: e.target.value })} placeholder="YYYY-MM-DD" aria-label="Date checked" />
          <input className={input} value={rate.source} onChange={(e) => setRate({ ...rate, source: e.target.value })} placeholder="Where you read it" aria-label="Source" />
          <button type="button" className={primaryButton} onClick={() => void savePricing()}>Save rate</button>
        </div>
      </section>
    </div>
  );
}
