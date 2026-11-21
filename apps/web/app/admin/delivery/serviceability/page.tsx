'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../../../lib/auth-context';
import { AdminModal } from '../../../../components/admin/AdminModal';
import { useToast } from '../../../../components/ui/Toast';

/*
 * PIN code list (Firestore `shippingServiceability`, one document per PIN). Optional. At checkout, when the
 * customer's PIN is in this list, the state they chose must match the state saved here (so the right delivery
 * charge and the free-delivery-in-home-state rule apply). PINs not in the list are checked against the built-in
 * India Post PIN ranges instead. Zone, delivery days and COD are kept for reference; checkout does not use them.
 */

interface PinRow {
  id: string;
  pincode: string;
  state: string;
  zone?: 'metro' | 'standard' | 'remote';
  etaMinDays?: number;
  etaMaxDays?: number;
  codAvailable?: boolean;
  updatedAt?: string;
}

interface ParsedRow {
  pincode: string;
  state: string;
  zone: 'metro' | 'standard' | 'remote';
  isServiceable: true;
  etaMinDays: number;
  etaMaxDays: number;
  codAvailable: boolean;
}

/** Reads "pincode,state[,zone,minDays,maxDays,cod]" lines; a header line is skipped. */
function parseCsv(text: string): { rows: ParsedRow[]; problems: string[] } {
  const rows: ParsedRow[] = [];
  const problems: string[] = [];
  const seen = new Set<string>();
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    if (i === 0 && /pin/i.test(line)) return;
    const [pincode = '', state = '', zone = '', min = '', max = '', cod = ''] = line.split(',').map((s) => s.trim().replace(/^"|"$/g, ''));
    if (!/^[1-8]\d{5}$/.test(pincode)) return void problems.push(`Line ${i + 1}: "${pincode}" is not a 6-digit PIN`);
    if (!state) return void problems.push(`Line ${i + 1}: state is missing`);
    if (seen.has(pincode)) return void problems.push(`Line ${i + 1}: ${pincode} appears twice`);
    seen.add(pincode);
    const etaMinDays = Math.min(30, Math.max(1, parseInt(min, 10) || 3));
    rows.push({
      pincode,
      state,
      zone: zone === 'metro' || zone === 'remote' ? zone : 'standard',
      isServiceable: true,
      etaMinDays,
      etaMaxDays: Math.min(30, Math.max(etaMinDays, parseInt(max, 10) || 5)),
      codAvailable: /^(true|yes|1|y)$/i.test(cod),
    });
  });
  return { rows, problems };
}

export default function PinCodeListPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [rows, setRows] = useState<PinRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [csv, setCsv] = useState('');
  const [importing, setImporting] = useState(false);
  const [rejected, setRejected] = useState<Array<{ pincode: string; state: string; reason: string }>>([]);

  const load = useCallback(async (q: string) => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/delivery/serviceability?search=${encodeURIComponent(q)}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(res.status === 403 ? 'Your role cannot see the PIN code list.' : 'The PIN code list could not be loaded.');
      const body = (await res.json()) as { serviceability?: PinRow[]; total?: number };
      setRows(body.serviceability ?? []);
      setTotal(body.total ?? 0);
      setApplied(q);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The PIN code list could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load('');
  }, [load]);

  const parsed = useMemo(() => parseCsv(csv), [csv]);

  const runImport = async () => {
    if (!user || parsed.rows.length === 0 || parsed.problems.length > 0) return;
    setImporting(true);
    setRejected([]);
    try {
      const token = await user.getIdToken();
      for (let i = 0; i < parsed.rows.length; i += 1000) {
        const res = await fetch('/api/admin/delivery/serviceability/import', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: parsed.rows.slice(i, i + 1000) }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          const bad = body?.error?.details?.rejected;
          if (Array.isArray(bad)) setRejected(bad);
          throw new Error(body?.error?.message ?? 'The list could not be saved.');
        }
      }
      showToast(`${parsed.rows.length} PIN code${parsed.rows.length === 1 ? '' : 's'} saved`, 'success');
      setImportOpen(false);
      setCsv('');
      void load('');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'The list could not be saved.', 'error');
    } finally {
      setImporting(false);
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setCsv(await file.text());
  };

  const isPinSearch = /^\d{6}$/.test(applied);

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6 md:px-8 md:py-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">PIN code list</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink/60">Which state each PIN code belongs to, for checking addresses at checkout.</p>
        </div>
        <button onClick={() => { setRejected([]); setImportOpen(true); }} className="self-start rounded-full bg-gold px-4 py-2 text-sm font-semibold text-ink hover:bg-gold-deep sm:self-auto">
          Import PIN codes
        </button>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-card border border-line bg-paper p-4 sm:col-span-1">
          <p className="text-xs text-ink/60">PIN codes in your list</p>
          <p className="mt-1 font-display text-2xl font-bold text-ink tabular-nums">{loading && !rows.length ? '…' : total.toLocaleString('en-IN')}</p>
        </div>
        <div className="rounded-card border border-line bg-paper p-4 text-sm text-ink/75 sm:col-span-2">
          <p className="font-semibold text-ink">How checkout uses it</p>
          <ul className="mt-1.5 list-disc space-y-1 pl-4">
            <li>If the customer&apos;s PIN is in this list, the state on their address must match it. If it doesn&apos;t, they are asked to correct the address.</li>
            <li>PINs that are not in the list are checked against India Post&apos;s PIN ranges, so the list is optional.</li>
            <li>Zone, delivery days and COD are saved for your reference only.</li>
          </ul>
        </div>
      </section>

      <form
        onSubmit={(e) => { e.preventDefault(); void load(search.trim()); }}
        className="flex gap-2"
      >
        <label className="relative flex-1">
          <span className="sr-only">Find a PIN code or state</span>
          <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            inputMode="search"
            placeholder="Check a PIN code (e.g. 600028) or type a state"
            className="w-full rounded-full border border-line bg-paper py-2 pl-9 pr-3 text-sm text-ink placeholder:text-ink/40 focus:border-gold focus:outline-none"
          />
        </label>
        <button type="submit" className="rounded-full border border-line bg-paper px-4 py-2 text-sm font-semibold text-ink hover:bg-tint">Find</button>
        {applied && (
          <button type="button" onClick={() => { setSearch(''); void load(''); }} className="rounded-full px-3 py-2 text-sm text-ink/60 hover:text-ink">Clear</button>
        )}
      </form>

      {error ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-alert/40 bg-paper p-4 text-sm text-ink">
          <span>{error}</span>
          <button onClick={() => void load(applied)} className="rounded-full border border-line px-3 py-1 text-xs font-semibold hover:bg-field">Try again</button>
        </div>
      ) : loading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded-card bg-tint" />)}</div>
      ) : rows.length === 0 ? (
        <div className="rounded-card border border-dashed border-line bg-paper px-6 py-10 text-center">
          {isPinSearch ? (
            <>
              <p className="font-semibold text-ink">{applied} is not in your list.</p>
              <p className="mt-1 text-sm text-ink/60">Checkout will check it against India Post&apos;s PIN ranges, so customers can still order.</p>
            </>
          ) : applied ? (
            <p className="font-semibold text-ink">No PIN codes match &ldquo;{applied}&rdquo;.</p>
          ) : (
            <>
              <p className="font-semibold text-ink">Your list is empty, and that&apos;s fine.</p>
              <p className="mt-1 text-sm text-ink/60">Checkout uses India Post&apos;s PIN ranges for every address. Import a list only if you want exact PIN-to-state checks.</p>
            </>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-card border border-line bg-paper">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead>
                <tr className="border-b border-line bg-field/60 text-xs text-ink/55">
                  <th className="px-4 py-3 font-medium">PIN code</th>
                  <th className="px-4 py-3 font-medium">State</th>
                  <th className="px-4 py-3 font-medium">Zone</th>
                  <th className="px-4 py-3 font-medium">Delivery days</th>
                  <th className="px-4 py-3 font-medium">COD</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-field/40">
                    <td className="px-4 py-2.5 font-mono font-semibold text-ink">{r.pincode}</td>
                    <td className="px-4 py-2.5 text-ink">{r.state}</td>
                    <td className="px-4 py-2.5 capitalize text-ink/75">{r.zone ?? '—'}</td>
                    <td className="px-4 py-2.5 text-ink/75 tabular-nums">{r.etaMinDays && r.etaMaxDays ? `${r.etaMinDays}–${r.etaMaxDays}` : '—'}</td>
                    <td className="px-4 py-2.5 text-ink/75">{r.codAvailable ? 'Yes' : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!applied && total > rows.length && (
            <p className="border-t border-line px-4 py-2.5 text-xs text-ink/55">Showing the first {rows.length.toLocaleString('en-IN')} of {total.toLocaleString('en-IN')}. Search to find any PIN.</p>
          )}
        </div>
      )}

      <AdminModal isOpen={importOpen} onClose={() => setImportOpen(false)} title="Import PIN codes">
        <div className="space-y-4 text-sm">
          <p className="text-ink/70">
            One PIN per line: <span className="font-mono text-ink">pincode,state</span>. You can add zone, minimum days, maximum days and COD after it.
            A PIN that is already in the list is updated.
          </p>
          <pre className="overflow-x-auto rounded-xl bg-field px-3 py-2 font-mono text-xs text-ink/80">pincode,state,zone,minDays,maxDays,cod{'\n'}600028,Tamil Nadu,metro,2,4,yes{'\n'}625001,Tamil Nadu,standard,3,5,yes</pre>
          <label className="block">
            <span className="mb-1 block font-medium text-ink">Choose a CSV file</span>
            <input type="file" accept=".csv,text/csv,text/plain" onChange={(e) => void onFile(e.target.files?.[0])} className="block w-full text-sm text-ink file:mr-3 file:rounded-full file:border file:border-line file:bg-paper file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink" />
          </label>
          <label className="block">
            <span className="mb-1 block font-medium text-ink">or paste the lines</span>
            <textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={6} className="w-full rounded-xl border border-line bg-paper px-3 py-2 font-mono text-xs text-ink focus:border-gold focus:outline-none" placeholder="600028,Tamil Nadu" />
          </label>

          {csv.trim() && (
            <div className={`rounded-xl px-3 py-2 text-xs ${parsed.problems.length ? 'bg-alert/10 text-ink' : 'bg-emerald-50 text-emerald-900'}`}>
              {parsed.problems.length ? (
                <>
                  <p className="font-semibold">Fix these lines first:</p>
                  <ul className="mt-1 list-disc pl-4">{parsed.problems.slice(0, 8).map((p) => <li key={p}>{p}</li>)}</ul>
                  {parsed.problems.length > 8 && <p className="mt-1">…and {parsed.problems.length - 8} more.</p>}
                </>
              ) : (
                <p>{parsed.rows.length} PIN code{parsed.rows.length === 1 ? '' : 's'} ready to save.</p>
              )}
            </div>
          )}

          {rejected.length > 0 && (
            <div className="rounded-xl bg-alert/10 px-3 py-2 text-xs text-ink">
              <p className="font-semibold">Nothing was saved. These rows have the wrong state:</p>
              <ul className="mt-1 list-disc pl-4">{rejected.slice(0, 10).map((r) => <li key={r.pincode}>{r.pincode} &ldquo;{r.state}&rdquo;: {r.reason}</li>)}</ul>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setImportOpen(false)} className="rounded-full border border-line px-4 py-2 font-medium text-ink hover:bg-tint">Cancel</button>
            <button
              type="button"
              onClick={() => void runImport()}
              disabled={importing || parsed.rows.length === 0 || parsed.problems.length > 0}
              className="rounded-full bg-gold px-4 py-2 font-semibold text-ink hover:bg-gold-deep disabled:opacity-40"
            >
              {importing ? 'Saving…' : `Save ${parsed.rows.length || ''} PIN code${parsed.rows.length === 1 ? '' : 's'}`.replace('  ', ' ')}
            </button>
          </div>
        </div>
      </AdminModal>
    </div>
  );
}
