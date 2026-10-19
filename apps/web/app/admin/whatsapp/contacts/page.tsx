'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../../../lib/auth-context';
import { useAdminApi } from '../../../../components/admin/template-builder/use-admin-api';
import { Badge, Notice, PageHeader, card, dateTime, input, button, primaryButton, sectionTitle } from '../../../../components/admin/billing/ui';

interface PlanSummary {
  strategy: string;
  counts: Record<string, number>;
  headerProblems: string[];
  sample: Array<{ line: number; action: string; phone: string; warnings: string[] }>;
  issues: Array<{ line: number; field: string; message: string }>;
  reportCsv: string;
}
interface Contact {
  id: string;
  name: string;
  phone: string;
  city: string | null;
  origin: string | null;
  tags: string[];
  marketing: { status: string; at: string | null; source: string | null };
  onlineOrders: number;
  posPurchases: number;
}

const STRATEGIES = [
  { value: 'skip_existing', label: 'Skip numbers already in the list (safest)' },
  { value: 'fill_empty', label: 'Fill only the empty details of existing customers' },
  { value: 'update_details', label: 'Update the details of existing customers from the file' },
];
const MAX_BYTES = 1_000_000;

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/** Admin → WhatsApp → Contacts: import a customer list, see every customer's marketing status, record opt-outs. */
export default function WhatsAppContactsPage() {
  const api = useAdminApi();
  const { user } = useAuth();
  const [csv, setCsv] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [strategy, setStrategy] = useState('skip_existing');
  const [plan, setPlan] = useState<PlanSummary | null>(null);
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'success' | 'info'; text: string } | null>(null);
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('');

  const loadContacts = useCallback(() => {
    const p = new URLSearchParams({ ...(q.trim() && { q: q.trim() }), ...(filter && { consent: filter }) });
    api<{ customers: Contact[]; total: number }>(`/api/admin/whatsapp/contacts?${p}`).then((r) => { setContacts(r.customers); setTotal(r.total); }).catch((e: Error) => setMessage({ tone: 'error', text: e.message }));
  }, [api, q, filter]);
  useEffect(() => {
    const t = setTimeout(loadContacts, 250);
    return () => clearTimeout(t);
  }, [loadContacts]);

  const downloadTemplate = async () => {
    if (!user) return;
    const token = await user.getIdToken();
    const res = await fetch('/api/admin/whatsapp/contacts/template', { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) download('karthys-contacts-template.csv', await res.text());
  };

  const pick = async (file: File | undefined) => {
    setPlan(null);
    setUnderstood(false);
    setMessage(null);
    if (!file) return;
    if (file.size > MAX_BYTES) return setMessage({ tone: 'error', text: 'This file is larger than 1 MB. Split it into smaller files.' });
    if (!/\.csv$/i.test(file.name)) return setMessage({ tone: 'error', text: 'Save the sheet as CSV from Excel (File → Save As → CSV) and choose that file.' });
    setCsv(await file.text());
    setFileName(file.name);
  };

  const preview = async () => {
    if (!csv) return;
    setBusy(true);
    setMessage(null);
    try {
      const r = await api<{ plan: PlanSummary }>('/api/admin/whatsapp/contacts/import', { method: 'POST', body: JSON.stringify({ csv, strategy }) });
      setPlan(r.plan);
      setUnderstood(false);
    } catch (e) {
      setPlan(null);
      setMessage({ tone: 'error', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const runImport = async () => {
    if (!csv || !plan) return;
    setBusy(true);
    try {
      const r = await api<{ created: number; updated: number; skipped: number; plan: PlanSummary }>('/api/admin/whatsapp/contacts/import', {
        method: 'POST',
        body: JSON.stringify({ csv, strategy, commit: true, expect: { create: plan.counts.create, update: plan.counts.update } }),
      });
      setMessage({ tone: 'success', text: `Imported: ${r.created} added, ${r.updated} updated, ${r.skipped} left as they were. Nobody was given marketing permission by this import unless the file proved it.` });
      setPlan(r.plan);
      setCsv(null);
      setFileName('');
      loadContacts();
    } catch (e) {
      setMessage({ tone: 'error', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const optOut = async (c: Contact) => {
    if (!window.confirm(`Record that ${c.name} does not want marketing messages? They will be left out of every campaign.`)) return;
    try {
      await api(`/api/admin/whatsapp/contacts/${c.id}/consent`, { method: 'PUT', body: JSON.stringify({ marketing: 'opted_out', source: 'recorded by staff' }) });
      loadContacts();
    } catch (e) {
      setMessage({ tone: 'error', text: (e as Error).message });
    }
  };
  const optIn = async (c: Contact) => {
    const source = window.prompt('Where did they agree? (for example: signed sheet, phone call recorded on…)');
    if (!source) return;
    const evidence = window.prompt('Evidence or reference (form number, sheet and row, call date). Required.');
    if (!evidence) return;
    try {
      await api(`/api/admin/whatsapp/contacts/${c.id}/consent`, { method: 'PUT', body: JSON.stringify({ marketing: 'opted_in', source, evidence }) });
      loadContacts();
    } catch (e) {
      setMessage({ tone: 'error', text: (e as Error).message });
    }
  };

  const c = plan?.counts;
  const canImport = Boolean(plan && !plan.headerProblems.length && c && c.create + c.update > 0 && understood && !busy);
  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6 md:p-8">
      <PageHeader title="WhatsApp contacts">
        Import your customer list and see who has agreed to marketing. A phone number alone is not permission: imported contacts are kept as <strong>consent unknown</strong> and are never sent offers unless the file records when, where and how they agreed.
      </PageHeader>
      {message && <Notice tone={message.tone}>{message.text}</Notice>}

      <section className={card}>
        <h2 className={sectionTitle}>Import contacts</h2>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-ink/70">
          <li>Download the template and fill it from your sheet (save as CSV).</li>
          <li>Choose the file and press Preview. Nothing is saved yet.</li>
          <li>Read the summary, then confirm the import.</li>
        </ol>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={button} onClick={downloadTemplate}>Download CSV template</button>
          <input type="file" accept=".csv,text/csv" aria-label="Choose a CSV file" onChange={(e) => pick(e.target.files?.[0])} className="text-sm" />
        </div>
        <div className="grid gap-2 sm:grid-cols-[2fr_1fr]">
          <select className={`${input} pr-2`} value={strategy} onChange={(e) => { setStrategy(e.target.value); setPlan(null); }} aria-label="If a number already exists">
            {STRATEGIES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <button type="button" className={primaryButton} disabled={!csv || busy} onClick={preview}>{busy && !plan ? 'Checking…' : 'Preview import'}</button>
        </div>
        {fileName && <p className="text-xs text-ink/60">File: {fileName}</p>}

        {plan && (
          <div className="space-y-3 rounded-xl border border-line p-4 text-sm" data-testid="import-plan">
            {plan.headerProblems.length > 0 && <Notice tone="error">{plan.headerProblems.join(' ')}</Notice>}
            {c && (
              <dl className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
                {[['Rows in file', c.rowsInFile], ['Will be added', c.create], ['Will be updated', c.update], ['Unchanged', c.unchanged], ['Skipped (already exist)', c.skipExisting], ['Duplicates in file', c.duplicateInFile], ['Rows with problems', c.invalid], ['Opted-out kept', c.suppressedKept], ['Marketing: agreed (with evidence)', c.consentOptedIn], ['Marketing: unknown', c.consentUnknown], ['Marketing: opted out', c.consentOptedOut]].map(([label, value]) => (
                  <div key={label as string}><dt className="text-xs text-ink/60">{label}</dt><dd className="font-semibold text-ink">{value as number}</dd></div>
                ))}
              </dl>
            )}
            {plan.issues.length > 0 && (
              <details>
                <summary className="cursor-pointer font-semibold text-alert">{plan.issues.length} row problem(s): these rows will not be imported</summary>
                <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs">
                  {plan.issues.slice(0, 30).map((i, n) => <li key={n}>Line {i.line}, {i.field}: {i.message}</li>)}
                </ul>
              </details>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className={button} onClick={() => download('import-report.csv', plan.reportCsv)}>Download safe report</button>
              <span className="text-xs text-ink/60">The report lists line numbers, hidden numbers (last 4 digits) and reasons. No names or emails.</span>
            </div>
            {c && c.create + c.update > 0 && (
              <>
                <label className="flex items-start gap-2 text-xs text-ink">
                  <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} className="mt-0.5" />
                  I understand this adds customers to my list only. It does not give anyone permission for marketing: those still need to agree before they get offers.
                </label>
                <button type="button" className={primaryButton} disabled={!canImport} onClick={runImport}>{busy ? 'Importing…' : `Import ${c.create + c.update} contact(s)`}</button>
              </>
            )}
          </div>
        )}
      </section>

      <section className={card}>
        <h2 className={sectionTitle}>Customers ({total})</h2>
        <div className="grid gap-2 sm:grid-cols-[2fr_1fr]">
          <input className={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, number or tag" aria-label="Search customers" />
          <select className={`${input} pr-2`} value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Marketing status">
            <option value="">Any marketing status</option><option value="opted_in">Agreed to marketing</option><option value="unknown">Not asked / unknown</option><option value="opted_out">Opted out</option>
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead><tr className="text-xs uppercase text-ink/50"><th className="py-2 pr-3">Name</th><th className="pr-3">Mobile</th><th className="pr-3">City</th><th className="pr-3">Orders</th><th className="pr-3">Marketing</th><th /></tr></thead>
            <tbody>
              {(contacts ?? []).map((x) => (
                <tr key={x.id} className="border-t border-line">
                  <td className="py-2 pr-3">{x.name}{x.tags.length > 0 && <span className="ml-2 text-xs text-ink/50">{x.tags.join(', ')}</span>}</td>
                  <td className="pr-3 font-mono text-xs">{x.phone}</td>
                  <td className="pr-3">{x.city ?? '—'}</td>
                  <td className="pr-3">{x.onlineOrders + x.posPurchases}</td>
                  <td className="pr-3"><Badge value={x.marketing.status === 'opted_in' ? 'paid' : x.marketing.status === 'opted_out' ? 'failed' : 'draft'} label={x.marketing.status === 'opted_in' ? 'Agreed' : x.marketing.status === 'opted_out' ? 'Opted out' : 'Unknown'} /> <span className="text-xs text-ink/50">{x.marketing.at ? dateTime(x.marketing.at) : ''}</span></td>
                  <td className="space-x-2 text-right">
                    {x.marketing.status !== 'opted_out' && <button type="button" className="text-xs underline" onClick={() => optOut(x)}>Record opt-out</button>}
                    {x.marketing.status === 'unknown' && <button type="button" className="text-xs underline" onClick={() => optIn(x)}>Record agreement…</button>}
                  </td>
                </tr>
              ))}
              {contacts?.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-ink/50">No customers yet. Import a list above.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
