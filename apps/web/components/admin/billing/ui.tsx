'use client';

import { useCallback, type ReactNode } from 'react';
import { useAuth } from '../../../lib/auth-context';

/** Small shared pieces for the Billing / POS and WhatsApp admin pages (same look as the rest of the admin). */

export const card = 'space-y-3 rounded-2xl border border-line bg-paper p-5';
export const sectionTitle = 'text-xs font-bold uppercase tracking-wider text-ink';
export const input = 'h-10 w-full rounded-xl border border-line bg-paper px-3 text-sm text-ink outline-none focus:border-ink disabled:bg-field disabled:text-ink/50';
export const button = 'inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-line px-3.5 text-sm font-semibold text-ink hover:bg-field disabled:cursor-not-allowed disabled:opacity-40';
export const primaryButton = 'inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-ink px-4 text-sm font-semibold text-paper hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-40';

export function money(paise: number | null | undefined): string {
  if (paise === null || paise === undefined) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(paise / 100);
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
}

export function todayIST(): string {
  return new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
}

export function PageHeader({ title, children, actions }: { title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
      <div>
        <h1 className="font-display text-xl font-bold text-ink md:text-2xl">{title}</h1>
        {children && <p className="mt-0.5 max-w-3xl text-xs text-ink/60">{children}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-paper p-4">
      <p className="text-2xs font-bold uppercase tracking-wider text-ink/55">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold tabular-nums text-ink">{value}</p>
      {hint && <p className="mt-0.5 text-2xs text-ink/50">{hint}</p>}
    </div>
  );
}

const TONES: Record<string, string> = {
  paid: 'bg-emerald-50 text-emerald-800',
  sent: 'bg-emerald-50 text-emerald-800',
  delivered: 'bg-emerald-50 text-emerald-800',
  read: 'bg-emerald-100 text-emerald-900',
  opted_in: 'bg-emerald-50 text-emerald-800',
  completed: 'bg-emerald-50 text-emerald-800',
  pending: 'bg-amber-50 text-amber-800',
  queued: 'bg-amber-50 text-amber-800',
  scheduled: 'bg-amber-50 text-amber-800',
  sending: 'bg-amber-50 text-amber-800',
  draft: 'bg-field text-ink/70',
  not_sent: 'bg-field text-ink/60',
  skipped: 'bg-field text-ink/60',
  unknown: 'bg-field text-ink/60',
  partially_refunded: 'bg-orange-50 text-orange-800',
  partially_returned: 'bg-orange-50 text-orange-800',
  refunded: 'bg-orange-100 text-orange-900',
  returned: 'bg-orange-100 text-orange-900',
  failed: 'bg-red-50 text-alert',
  cancelled: 'bg-red-50 text-alert',
  opted_out: 'bg-red-50 text-alert',
};

export function Badge({ value, label }: { value: string; label?: string }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-bold uppercase tracking-wide ${TONES[value] ?? 'bg-field text-ink/70'}`}>{label ?? value.replace(/_/g, ' ')}</span>;
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'error' | 'success'; children: ReactNode }) {
  const cls = tone === 'error' ? 'bg-red-50 text-alert' : tone === 'success' ? 'bg-emerald-50 text-emerald-800' : 'bg-tint text-ink/80';
  return (
    <p role={tone === 'error' ? 'alert' : 'status'} className={`rounded-xl px-4 py-2.5 text-xs font-medium ${cls}`}>
      {children}
    </p>
  );
}

/**
 * Opens / downloads / prints an invoice PDF. The PDF route needs the staff
 * sign-in token, so the browser fetches it and opens the file locally.
 */
export function useInvoicePdf() {
  const { user } = useAuth();
  return useCallback(
    async (invoiceId: string, mode: 'open' | 'download' | 'print', invoiceNo?: string) => {
      if (!user) throw new Error('Sign in again to continue.');
      // The tab is opened now (in the click) so the browser does not block it.
      const win = mode === 'download' ? null : window.open('', '_blank');
      const res = await fetch(`/api/admin/billing/invoices/${encodeURIComponent(invoiceId)}/pdf`, { headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
      if (!res.ok) {
        win?.close();
        const body = await res.json().catch(() => null);
        throw new Error((body as { error?: string } | null)?.error ?? 'The PDF could not be opened.');
      }
      const url = URL.createObjectURL(await res.blob());
      if (mode === 'download') {
        const a = document.createElement('a');
        a.href = url;
        a.download = `${invoiceNo ?? invoiceId}.pdf`;
        a.click();
      } else if (win) {
        win.location.href = url;
        if (mode === 'print') win.addEventListener('load', () => win.print(), { once: true });
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    },
    [user]
  );
}

export const METHOD_LABEL: Record<string, string> = { cash: 'Cash', upi: 'UPI', card: 'Card', other: 'Other', online: 'Online' };
