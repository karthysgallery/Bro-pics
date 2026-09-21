'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../../lib/auth-context';

const NAV = [
  { href: '/admin/products', label: 'Products' },
  { href: '/admin/categories', label: 'Categories' },
  { href: '/admin/orders', label: 'Orders' },
  { href: '/admin/returns', label: 'Returns' },
  { href: '/admin/reviews', label: 'Reviews' },
  { href: '/admin/homepage', label: 'Homepage' },
  { href: '/admin/roles', label: 'Roles' },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      setAuthorized(false);
      return;
    }
    user
      .getIdTokenResult()
      .then((result) => setAuthorized(result.claims.role === 'admin'))
      .catch(() => setAuthorized(false));
  }, [user, loading]);

  if (authorized === null) return null;
  if (!authorized) {
    return (
      <main className="max-w-md mx-auto p-6">
        <p className="text-brown-dark">You need admin access to view this page.</p>
      </main>
    );
  }

  return (
    <div className="max-w-7xl mx-auto flex flex-col md:flex-row gap-6 p-6">
      <aside className="md:w-56 flex-shrink-0">
        <h1 className="font-display text-xl text-brown-dark mb-4">Admin</h1>
        <nav className="flex md:flex-col gap-1 flex-wrap" aria-label="Admin navigation">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-lg px-3 py-2 text-sm transition-colors ${
                pathname?.startsWith(item.href)
                  ? 'bg-gradient-to-b from-brown-light to-brown text-cream'
                  : 'text-brown hover:bg-gold/10'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
