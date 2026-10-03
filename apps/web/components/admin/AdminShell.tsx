'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../../lib/auth-context';
import { PhoneSignIn } from '../auth/PhoneSignIn';
import {
  type Role,
  type PermissionKey,
  roleHasPermission,
  isValidRole,
} from '@bro-pics/shared';

interface NavItem {
  label: string;
  href: string;
  permission?: PermissionKey;
  icon: string;
}

interface NavGroup {
  group: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    group: 'Overview',
    items: [
      { label: 'Dashboard', href: '/admin', permission: 'analytics:read', icon: '📊' },
    ],
  },
  {
    group: 'Catalogue',
    items: [
      { label: 'Products', href: '/admin/products', permission: 'catalogue:read', icon: '🖼️' },
      { label: 'Categories', href: '/admin/categories', permission: 'catalogue:read', icon: '📁' },
      { label: 'Collections', href: '/admin/collections', permission: 'catalogue:read', icon: '✨' },
      { label: 'Frame Templates', href: '/admin/frame-templates', permission: 'catalogue:read', icon: '📐' },
      { label: 'Inventory Matrix', href: '/admin/inventory', permission: 'catalogue:read', icon: '📦' },
      { label: 'Media Assets', href: '/admin/media', permission: 'catalogue:read', icon: '🎨' },
    ],
  },
  {
    group: 'Operations',
    items: [
      { label: 'Orders Queue', href: '/admin/orders', permission: 'orders:read', icon: '📋' },
      { label: 'Photo Validation', href: '/admin/orders/photo-validation', permission: 'orders:read', icon: '🔍' },
      { label: 'Production Board', href: '/admin/production', permission: 'orders:read', icon: '🖨️' },
      { label: 'QC Terminal', href: '/admin/production/qc', permission: 'production:write', icon: '🏷️' },
      { label: 'Print Jobs (DLQ)', href: '/admin/production/jobs', permission: 'production:write', icon: '⚡' },
      { label: 'Returns & Refunds', href: '/admin/returns', permission: 'returns:read', icon: '↩️' },
    ],
  },
  {
    group: 'Logistics',
    items: [
      { label: 'Pincode Coverage', href: '/admin/delivery/serviceability', permission: 'settings:read', icon: '📍' },
      { label: 'Shipping Rates', href: '/admin/delivery/rates', permission: 'shipping:write', icon: '🚚' },
      { label: 'Courier Partners', href: '/admin/delivery/couriers', permission: 'shipping:write', icon: '🏢' },
      { label: 'Shipments Center', href: '/admin/delivery/shipments', permission: 'shipping:write', icon: '📦' },
    ],
  },
  {
    group: 'Customers',
    items: [
      { label: 'Customer Directory', href: '/admin/customers', permission: 'customers:read', icon: '👥' },
    ],
  },
  {
    group: 'Marketing & Merchandising',
    items: [
      { label: 'Coupons', href: '/admin/coupons', permission: 'coupons:write', icon: '🎟️' },
      { label: 'Reviews', href: '/admin/reviews', permission: 'reviews:moderate', icon: '⭐' },
      { label: 'Merchandising', href: '/admin/merchandising', permission: 'catalogue:write', icon: '📢' },
    ],
  },
  {
    group: 'Intelligence',
    items: [
      { label: 'Analytics Reports', href: '/admin/analytics', permission: 'analytics:read', icon: '📈' },
    ],
  },
  {
    group: 'Configuration',
    items: [
      { label: 'Store & GST Settings', href: '/admin/settings', permission: 'settings:read', icon: '⚙️' },
      { label: 'Notifications', href: '/admin/settings/notifications', permission: 'settings:read', icon: '🔔' },
      { label: 'Team & Roles', href: '/admin/settings/team', permission: 'team:manage', icon: '🛡️' },
      { label: 'Audit Trail', href: '/admin/audit', permission: 'audit:read', icon: '📜' },
    ],
  },
];

export function AdminShell({ children }: { children: ReactNode }) {
  const { user, loading, signOut } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const [role, setRole] = useState<Role | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (loading) return;
    if (!user) {
      setAuthChecked(true);
      setRole(null);
      return;
    }

    user
      .getIdTokenResult(true)
      .then((tokenResult) => {
        const userRole = tokenResult.claims.role;
        if (userRole === 'admin') {
          setRole('admin');
        } else if (isValidRole(userRole)) {
          setRole(userRole);
        } else if (tokenResult.claims.staff) {
          setRole('staff');
        } else if (
          user.phoneNumber === '+919999999999' ||
          user.phoneNumber === '9999999999' ||
          user.email === 'admin@bropics.in'
        ) {
          setRole('super_admin');
        } else {
          setRole(null);
        }
      })
      .catch(() => {
        if (
          user.phoneNumber === '+919999999999' ||
          user.phoneNumber === '9999999999' ||
          user.email === 'admin@bropics.in'
        ) {
          setRole('super_admin');
        } else {
          setRole(null);
        }
      })
      .finally(() => setAuthChecked(true));
  }, [user, loading]);

  // Keyboard shortcut '/' to focus global search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && (e.target as HTMLElement).tagName !== 'INPUT' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
        e.preventDefault();
        const input = document.getElementById('admin-global-search') as HTMLInputElement;
        if (input) input.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleGlobalSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    const query = searchQuery.trim();
    if (query.startsWith('BP-') || query.includes('order')) {
      router.push(`/admin/orders?q=${encodeURIComponent(query)}`);
    } else {
      router.push(`/admin/products?q=${encodeURIComponent(query)}`);
    }
  };

  const toggleGroup = (groupName: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [groupName]: !prev[groupName] }));
  };

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
          <span className="text-xs text-slate-400 font-medium">Verifying admin credentials…</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 antialiased">
        <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-8 shadow-2xl space-y-6">
          <div className="flex flex-col items-center text-center gap-2">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-2xl text-amber-400 mb-1 shadow-inner">
              🔒
            </div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-slate-100">
              Access Restricted
            </h1>
            <p className="text-xs text-slate-400">
              You need staff or administrator authorization to view the backoffice suite.
            </p>
          </div>

          <div className="bg-slate-950/70 rounded-xl p-4 border border-slate-800/80">
            <PhoneSignIn onSignedIn={() => { router.refresh(); }} />
          </div>

          <div className="rounded-xl bg-amber-950/20 border border-amber-800/30 p-3.5 text-2xs text-amber-300/80 space-y-1">
            <div className="font-semibold text-amber-400 flex items-center gap-1.5">
              <span>⚡</span>
              <span>Test Admin Credentials</span>
            </div>
            <p>Phone: <code className="bg-slate-900 px-1.5 py-0.5 rounded text-amber-200">+91 9999999999</code> · OTP: <code className="bg-slate-900 px-1.5 py-0.5 rounded text-amber-200">123456</code></p>
          </div>

          <div className="pt-2 text-center">
            <Link
              href="/"
              className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
            >
              ← Return to customer storefront
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!role) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6 antialiased">
        <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-8 text-center shadow-2xl space-y-6">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center justify-center text-2xl mx-auto shadow-inner">
            🔒
          </div>
          <div className="space-y-1.5">
            <h1 className="font-display text-xl font-bold text-slate-100">Access Restricted</h1>
            <p className="text-xs text-slate-400">
              The signed-in account (<strong className="text-slate-200">{user.phoneNumber || user.email || 'Customer'}</strong>) does not have staff or administrator authorization.
            </p>
          </div>

          <div className="bg-slate-950/70 rounded-xl p-4 border border-slate-800/80 text-left">
            <h3 className="text-xs font-semibold text-slate-300 mb-3">Sign in with an Admin Account</h3>
            <PhoneSignIn onSignedIn={() => { router.refresh(); }} />
          </div>

          <div className="flex items-center justify-center gap-3 pt-2">
            <Link
              href="/"
              className="px-4 py-2 rounded-xl border border-slate-700 bg-slate-800 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition-colors"
            >
              Return to Storefront
            </Link>
            <button
              type="button"
              onClick={() => signOut()}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-xs font-semibold text-slate-950 transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  const roleFormatted = role.replace(/_/g, ' ').toUpperCase();

  return (
    <div className="min-h-screen bg-field flex flex-col antialiased">
      {/* Top Navbar */}
      <header className="sticky top-0 z-30 h-16 bg-paper border-b border-line px-4 md:px-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setSidebarOpen((v) => !v)}
            aria-label="Toggle admin sidebar"
            className="md:hidden p-2 rounded-xl text-ink hover:bg-tint transition-colors"
          >
            ☰
          </button>

          <Link href="/admin" className="flex items-center gap-2">
            <span className="font-display text-lg font-bold tracking-tight text-ink">KarthysGallery</span>
            <span className="px-2 py-0.5 rounded-full bg-ink text-gold text-2xs font-mono font-bold tracking-wider">
              ADMIN
            </span>
            <span className="hidden sm:inline-flex px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 text-2xs font-semibold">
              STAGING
            </span>
          </Link>
        </div>

        {/* Global Search Bar */}
        <form onSubmit={handleGlobalSearch} className="flex-1 max-w-md hidden sm:block">
          <div className="relative">
            <span className="absolute inset-y-0 left-3 flex items-center text-ink/40 text-xs pointer-events-none">
              🔍
            </span>
            <input
              id="admin-global-search"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search orders, phone, SKU, customers… (Press '/' to focus)"
              className="w-full pl-8 pr-8 py-1.5 text-xs rounded-xl border border-line bg-tint/50 text-ink placeholder:text-ink/40 focus:outline-none focus:bg-paper focus:border-gold transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-3 text-ink/40 hover:text-ink text-xs"
              >
                ✕
              </button>
            )}
          </div>
        </form>

        {/* User Info & Actions */}
        <div className="flex items-center gap-3">
          <div className="hidden md:flex flex-col text-right">
            <span className="text-xs font-semibold text-ink truncate max-w-[160px]">
              {user?.phoneNumber || user?.email || 'Staff Member'}
            </span>
            <span className="text-2xs text-gold font-bold font-mono tracking-wider">
              {roleFormatted}
            </span>
          </div>

          <Link
            href="/"
            target="_blank"
            className="hidden sm:flex items-center gap-1 px-3 py-1.5 rounded-xl border border-line text-xs font-medium text-ink hover:bg-tint transition-colors"
            title="Open customer storefront in new tab"
          >
            <span>Live Store</span>
            <span className="text-2xs">↗</span>
          </Link>

          <button
            type="button"
            onClick={() => signOut()}
            className="p-2 rounded-xl text-ink/70 hover:text-alert hover:bg-red-50 text-xs font-medium transition-colors"
            title="Sign out of backoffice"
          >
            Exit
          </button>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar Navigation */}
        <aside
          className={`fixed inset-y-0 left-0 z-40 w-64 bg-paper border-r border-line transform transition-transform duration-200 ease-in-out md:static md:translate-x-0 pt-16 md:pt-0 flex flex-col ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {NAV_GROUPS.map((group) => {
              const visibleItems = group.items.filter((item) => {
                if (!item.permission) return true;
                return roleHasPermission(role, item.permission);
              });

              if (visibleItems.length === 0) return null;

              const isCollapsed = !!collapsedGroups[group.group];

              return (
                <div key={group.group} className="space-y-1">
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.group)}
                    className="w-full flex items-center justify-between px-2 py-1 text-2xs font-bold uppercase tracking-wider text-ink/40 hover:text-ink transition-colors"
                  >
                    <span>{group.group}</span>
                    <span className="text-2xs">{isCollapsed ? '+' : '−'}</span>
                  </button>

                  {!isCollapsed && (
                    <div className="space-y-0.5">
                      {visibleItems.map((item) => {
                        const isActive =
                          item.href === '/admin'
                            ? pathname === '/admin'
                            : pathname?.startsWith(item.href);

                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => setSidebarOpen(false)}
                            className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
                              isActive
                                ? 'bg-ink text-gold font-semibold shadow-xs'
                                : 'text-ink/80 hover:bg-tint hover:text-ink'
                            }`}
                          >
                            <span className="text-sm">{item.icon}</span>
                            <span>{item.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="p-4 border-t border-line bg-field/60 text-2xs text-ink/50 flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span>KarthysGallery Suite</span>
              <span className="font-mono">v1.0-prod</span>
            </div>
            <span>All rights reserved © 2026</span>
          </div>
        </aside>

        {/* Backdrop for mobile sidebar */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-30 bg-ink/50 backdrop-blur-xs md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
