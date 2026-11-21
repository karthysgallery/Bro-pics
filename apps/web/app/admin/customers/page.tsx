'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '../../../lib/auth-context';
import { formatPaise } from '../../../lib/format-price';

interface CustomerSummary {
  id: string;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
  createdAt: string | null;
  orderCount: number;
  totalSpent: number;
  lastOrderAt: string | null;
  disabled: boolean;
}

function day(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' });
}

export default function AdminCustomersPage() {
  const { user } = useAuth();
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [applied, setApplied] = useState('');

  const load = useCallback(async (q: string) => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/customers${q ? `?q=${encodeURIComponent(q)}` : ''}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(res.status === 403 ? 'Your role cannot see customers.' : 'Customers could not be loaded.');
      const body = (await res.json()) as { customers?: CustomerSummary[] };
      setCustomers(body.customers ?? []);
      setApplied(q);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Customers could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load('');
  }, [load]);

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6 md:px-8 md:py-8">
      <header>
        <h1 className="font-display text-2xl font-bold text-ink">Customers</h1>
        <p className="mt-1 text-sm text-ink/60">Find a customer by name, phone number or email, then open their profile to see every order.</p>
      </header>

      <form onSubmit={(e) => { e.preventDefault(); void load(query.trim()); }} className="flex gap-2">
        <label className="relative flex-1">
          <span className="sr-only">Search customers</span>
          <svg className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink/40" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, 10-digit phone or email" className="w-full rounded-full border border-line bg-paper py-2.5 pl-10 pr-4 text-sm text-ink placeholder:text-ink/40 focus:border-gold focus:outline-none" />
        </label>
        <button type="submit" className="rounded-full bg-gold px-5 py-2 text-sm font-semibold text-ink hover:bg-gold-deep">Search</button>
        {applied && <button type="button" onClick={() => { setQuery(''); void load(''); }} className="rounded-full px-3 py-2 text-sm text-ink/60 hover:text-ink">Clear</button>}
      </form>

      <p className="text-sm text-ink/60" aria-live="polite">
        {loading ? 'Loading…' : applied ? `${customers.length} match${customers.length === 1 ? '' : 'es'} for “${applied}”` : 'Newest accounts'}
      </p>

      {error ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-alert/40 bg-paper p-4 text-sm text-ink">
          <span>{error}</span>
          <button onClick={() => void load(applied)} className="rounded-full border border-line px-3 py-1 text-xs font-semibold hover:bg-field">Try again</button>
        </div>
      ) : loading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-14 animate-pulse rounded-card bg-tint" />)}</div>
      ) : customers.length === 0 ? (
        <div className="rounded-card border border-dashed border-line bg-paper px-6 py-12 text-center">
          <p className="font-semibold text-ink">{applied ? 'No customer matches that search.' : 'No customers yet.'}</p>
          {applied && <p className="mt-1 text-sm text-ink/60">Names match from the start (e.g. “Pri” finds Priya). Phone and email must be complete.</p>}
        </div>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-paper">
          <li className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_6rem_7rem_7rem] gap-4 bg-field/60 px-4 py-2.5 text-xs text-ink/55 md:grid">
            <span>Customer</span><span>Contact</span><span className="text-right">Orders</span><span className="text-right">Spent</span><span>Joined</span>
          </li>
          {customers.map((c) => (
            <li key={c.id}>
              <Link href={`/admin/customers/${c.id}`} className="grid gap-1 px-4 py-3 hover:bg-field/40 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_6rem_7rem_7rem] md:items-center md:gap-4">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-medium text-ink">{c.displayName || 'No name yet'}</span>
                  {c.role && c.role !== 'customer' && <span className="shrink-0 rounded-full bg-tint px-2 py-0.5 text-[11px] text-ink/70">{c.role.replace(/_/g, ' ')}</span>}
                  {c.disabled && <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-[11px] text-red-700">Blocked</span>}
                </span>
                <span className="min-w-0 truncate text-sm text-ink/70">{c.phone ?? ''}{c.email ? ` · ${c.email}` : ''}</span>
                <span className="text-sm text-ink tabular-nums md:text-right"><span className="text-ink/50 md:hidden">Orders: </span>{c.orderCount}</span>
                <span className="text-sm text-ink tabular-nums md:text-right"><span className="text-ink/50 md:hidden">Spent: </span>{formatPaise(c.totalSpent)}</span>
                <span className="text-sm text-ink/60"><span className="md:hidden">Joined </span>{day(c.createdAt)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
