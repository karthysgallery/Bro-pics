'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '../../../lib/auth-context';
import { StatusChip } from '../../../components/admin/StatusChip';
import { useToast } from '../../../components/ui/Toast';

interface CustomerSummary {
  id: string;
  displayName?: string;
  email?: string;
  phone?: string;
  role?: string;
  createdAt?: unknown;
  orderCount?: number;
  totalSpent?: number;
}

function formatISTDate(dateVal: unknown): string {
  if (!dateVal) return '—';
  if (typeof dateVal === 'object' && '_seconds' in (dateVal as { _seconds: number })) {
    return new Date((dateVal as { _seconds: number })._seconds * 1000).toLocaleDateString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }
  const d = new Date(dateVal as string | number | Date);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function AdminCustomersDirectoryPage() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch customers
  const fetchCustomers = async (query = '') => {
    if (!user) return;
    const effectiveQuery = query.trim() || '+91';
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const url = `/api/admin/customers?q=${encodeURIComponent(effectiveQuery)}`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load customers');
      const data = await res.json();
      setCustomers(data.customers || []);
    } catch {
      showToast('Error searching customers', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, [user]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchCustomers(searchQuery);
  };

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line pb-4">
        <div>
          <h1 className="text-xl md:text-2xl font-display font-bold text-ink">
            Customer Directory
          </h1>
          <p className="text-xs text-ink/60">
            Search customer profiles by name, phone number, or email address. View order histories, saved addresses, and active coupons.
          </p>
        </div>
      </div>

      {/* Search Bar */}
      <form onSubmit={handleSearchSubmit} className="flex gap-2 max-w-md">
        <div className="relative flex-1">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-ink/40 text-xs">
            🔍
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, phone (+91...), or email..."
            className="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink placeholder:text-ink/40 focus:outline-none focus:border-gold"
          />
        </div>
        <button
          type="submit"
          className="px-4 py-2 rounded-xl bg-gold hover:bg-gold-deep text-ink text-xs font-bold transition-colors shrink-0 shadow-xs"
        >
          Search
        </button>
      </form>

      {/* Table */}
      <div className="rounded-2xl border border-line bg-paper shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-3 animate-pulse">
            <div className="h-10 bg-field rounded-xl" />
            <div className="h-10 bg-field rounded-xl" />
            <div className="h-10 bg-field rounded-xl" />
          </div>
        ) : customers.length === 0 ? (
          <div className="p-16 text-center text-xs text-ink/50 space-y-2">
            <span className="text-3xl block">👥</span>
            <p>No customers found matching your search.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-field/70 border-b border-line text-2xs uppercase tracking-wider text-ink/60 font-semibold">
                  <th className="p-3">Customer Name</th>
                  <th className="p-3">Phone Number</th>
                  <th className="p-3">Email Address</th>
                  <th className="p-3">Joined Date</th>
                  <th className="p-3">Role</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {customers.map((c) => (
                  <tr key={c.id} className="hover:bg-field/30 transition-colors">
                    <td className="p-3 font-semibold text-ink">
                      <Link
                        href={`/admin/customers/${c.id}`}
                        className="hover:text-gold hover:underline"
                      >
                        {c.displayName || 'Anonymous User'}
                      </Link>
                    </td>

                    <td className="p-3 font-mono text-ink/80">
                      {c.phone || '—'}
                    </td>

                    <td className="p-3 text-ink/80">
                      {c.email || '—'}
                    </td>

                    <td className="p-3 text-ink/60 font-mono text-2xs">
                      {formatISTDate(c.createdAt)}
                    </td>

                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-field border border-line">
                        {c.role || 'customer'}
                      </span>
                    </td>

                    <td className="p-3 text-right">
                      <Link
                        href={`/admin/customers/${c.id}`}
                        className="px-3 py-1.5 rounded-lg bg-gold/10 hover:bg-gold/20 text-gold-deep text-2xs font-bold transition-colors inline-block"
                      >
                        View Profile ↗
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
