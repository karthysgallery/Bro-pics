'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../../lib/auth-context';
import { PhoneSignIn } from '../auth/PhoneSignIn';
import { getAuth, signInWithCustomToken } from 'firebase/auth';
import { getFirebaseApp } from '../../lib/firebase-client';
import { getPaymentModeClient } from '../../lib/payment-mode-client';
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

function AdminNavIcon({ name, className = 'w-4 h-4' }: { name: string; className?: string }) {
  switch (name) {
    case 'dashboard':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
        </svg>
      );
    case 'products':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
      );
    case 'categories':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
      );
    case 'collections':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      );
    case 'templates':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 2v20M18 2v20M2 6h20M2 18h20" />
        </svg>
      );
    case 'inventory':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
          <line x1="12" y1="22.08" x2="12" y2="12" />
        </svg>
      );
    case 'media':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
      );
    case 'orders':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
          <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
          <path d="M9 12h6M9 16h6" />
        </svg>
      );
    case 'validation':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
          <path d="m9 11 2 2 4-4" />
        </svg>
      );
    case 'production':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="6 9 6 2 18 2 18 9" />
          <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
          <rect x="6" y="14" width="12" height="8" />
        </svg>
      );
    case 'qc':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      );
    case 'jobs':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
      );
    case 'returns':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="1 4 1 10 7 10" />
          <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
        </svg>
      );
    case 'shipping':
    case 'rates':
    case 'couriers':
    case 'shipments':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="1" y="3" width="15" height="13" />
          <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
          <circle cx="5.5" cy="18.5" r="2.5" />
          <circle cx="18.5" cy="18.5" r="2.5" />
        </svg>
      );
    case 'pincode':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
      );
    case 'customers':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case 'coupons':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
          <line x1="7" y1="7" x2="7.01" y2="7" />
        </svg>
      );
    case 'reviews':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      );
    case 'marketing':
    case 'merchandising':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      );
    case 'analytics':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="18" y1="20" x2="18" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" />
        </svg>
      );
    case 'settings':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      );
    case 'notifications':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      );
    case 'team':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      );
    case 'audit':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
      );
    default:
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
        </svg>
      );
  }
}

const NAV_GROUPS: NavGroup[] = [
  {
    group: 'Overview',
    items: [
      { label: 'Dashboard', href: '/admin', permission: 'analytics:read', icon: 'dashboard' },
    ],
  },
  {
    group: 'Catalogue',
    items: [
      { label: 'Products', href: '/admin/products', permission: 'catalogue:read', icon: 'products' },
      { label: 'Categories', href: '/admin/categories', permission: 'catalogue:read', icon: 'categories' },
      { label: 'Collections', href: '/admin/collections', permission: 'catalogue:read', icon: 'collections' },
      { label: 'Frame Templates', href: '/admin/frame-templates', permission: 'catalogue:read', icon: 'templates' },
      { label: 'Collage Templates', href: '/admin/personalization-templates', permission: 'catalogue:read', icon: 'templates' },
      { label: 'Inventory Matrix', href: '/admin/inventory', permission: 'catalogue:read', icon: 'inventory' },
      { label: 'Media Assets', href: '/admin/media', permission: 'catalogue:read', icon: 'media' },
    ],
  },
  {
    group: 'Operations',
    items: [
      { label: 'Orders Queue', href: '/admin/orders', permission: 'orders:read', icon: 'orders' },
      { label: 'Photo Validation', href: '/admin/orders/photo-validation', permission: 'orders:read', icon: 'validation' },
      { label: 'Production Board', href: '/admin/production', permission: 'orders:read', icon: 'production' },
      { label: 'QC Terminal', href: '/admin/production/qc', permission: 'production:write', icon: 'qc' },
      { label: 'Print Jobs (DLQ)', href: '/admin/production/jobs', permission: 'production:write', icon: 'jobs' },
      { label: 'Returns & Refunds', href: '/admin/returns', permission: 'returns:read', icon: 'returns' },
    ],
  },
  {
    group: 'Logistics',
    items: [
      { label: 'Pincode Coverage', href: '/admin/delivery/serviceability', permission: 'settings:read', icon: 'pincode' },
      { label: 'Shipping Rates', href: '/admin/delivery/rates', permission: 'shipping:write', icon: 'rates' },
      { label: 'Courier Partners', href: '/admin/delivery/couriers', permission: 'shipping:write', icon: 'couriers' },
      { label: 'Shipments Center', href: '/admin/delivery/shipments', permission: 'shipping:write', icon: 'shipments' },
    ],
  },
  {
    group: 'Customers',
    items: [
      { label: 'Customer Directory', href: '/admin/customers', permission: 'customers:read', icon: 'customers' },
    ],
  },
  {
    group: 'Marketing & Merchandising',
    items: [
      { label: 'Coupons', href: '/admin/coupons', permission: 'coupons:write', icon: 'coupons' },
      { label: 'Reviews', href: '/admin/reviews', permission: 'reviews:moderate', icon: 'reviews' },
      { label: 'Merchandising', href: '/admin/merchandising', permission: 'catalogue:write', icon: 'merchandising' },
    ],
  },
  {
    group: 'Intelligence',
    items: [
      { label: 'Analytics Reports', href: '/admin/analytics', permission: 'analytics:read', icon: 'analytics' },
    ],
  },
  {
    group: 'Configuration',
    items: [
      { label: 'Store & GST Settings', href: '/admin/settings', permission: 'settings:read', icon: 'settings' },
      { label: 'Notifications', href: '/admin/settings/notifications', permission: 'settings:read', icon: 'notifications' },
      { label: 'Team & Roles', href: '/admin/settings/team', permission: 'team:manage', icon: 'team' },
      { label: 'Audit Trail', href: '/admin/audit', permission: 'audit:read', icon: 'audit' },
    ],
  },
];

export function AdminShell({ children }: { children: ReactNode }) {
  const { user, loading, signOut } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const [role, setRole] = useState<Role | null>(null);
  // 'mock' while the payment provider is simulated — surfaced in the header so
  // staff never mistake test orders for real revenue.
  const [paymentMode, setPaymentMode] = useState<'mock' | 'razorpay' | null>(null);

  useEffect(() => {
    getPaymentModeClient().then(setPaymentMode);
  }, []);
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
        } else {
          setRole(null);
        }
      })
      .catch(() => setRole(null))
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

  const [devLoginLoading, setDevLoginLoading] = useState(false);
  const handleDevAdminLogin = async () => {
    setDevLoginLoading(true);
    try {
      const res = await fetch('/api/auth/dev-admin-token', { method: 'POST' });
      const { customToken } = await res.json();
      if (customToken) {
        const auth = getAuth(getFirebaseApp());
        await signInWithCustomToken(auth, customToken);
        setRole('super_admin');
        router.refresh();
      }
    } catch (e) {
      console.error('Dev login failed:', e);
    } finally {
      setDevLoginLoading(false);
    }
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
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-1 shadow-inner">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-slate-100">
              Access Restricted
            </h1>
            <p className="text-xs text-slate-400">
              You need staff or administrator authorization to view the backoffice suite.
            </p>
          </div>

          {process.env.NODE_ENV !== 'production' && (
            <button
              type="button"
              onClick={handleDevAdminLogin}
              disabled={devLoginLoading}
              className="w-full py-2.5 px-4 bg-amber-500/20 hover:bg-amber-500/30 active:scale-[0.98] text-amber-300 font-semibold text-xs rounded-xl border border-amber-500/40 transition-all flex items-center justify-center gap-2"
            >
              <span>{devLoginLoading ? 'Signing in…' : '⚡ Instant Sign-In as Super Admin (Dev Mode)'}</span>
            </button>
          )}

          <div className="bg-slate-950/70 rounded-xl p-4 border border-slate-800/80">
            <PhoneSignIn onSignedIn={() => { router.refresh(); }} />
          </div>

          <div className="rounded-xl bg-amber-950/20 border border-amber-800/30 p-3.5 text-2xs text-amber-300/80 space-y-1">
            <div className="font-semibold text-amber-400 flex items-center gap-1.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
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
          <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center justify-center mx-auto shadow-inner">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
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
      <header className="sticky top-0 z-30 h-14 sm:h-16 bg-paper border-b border-line px-4 md:px-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setSidebarOpen((v) => !v)}
            aria-label="Toggle admin sidebar"
            className="md:hidden p-2 rounded-lg text-ink hover:bg-tint transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>

          <Link href="/admin" className="flex items-center gap-2">
            <span className="font-display text-base sm:text-lg font-bold tracking-tight text-ink">KarthysGallery</span>
            <span className="px-2 py-0.5 rounded-full bg-ink text-gold text-2xs font-mono font-bold tracking-wider">
              ADMIN
            </span>
            {paymentMode === 'mock' && (
              <span
                title="Payments are simulated — orders placed now collect no money"
                className="inline-flex px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 text-2xs font-semibold"
              >
                TEST PAYMENTS
              </span>
            )}
          </Link>
        </div>

        {/* Global Search Bar */}
        <form onSubmit={handleGlobalSearch} className="flex-1 max-w-md hidden sm:block">
          <div className="relative">
            <span className="absolute inset-y-0 left-3 flex items-center text-ink/40 pointer-events-none">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
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
                className="absolute inset-y-0 right-3 text-ink/40 hover:text-ink flex items-center"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
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
            <span className="text-2xs text-gold-deep font-bold font-mono tracking-wider">
              {roleFormatted}
            </span>
          </div>

          <Link
            href="/"
            target="_blank"
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-line text-xs font-medium text-ink hover:bg-tint transition-colors"
            title="Open customer storefront in new tab"
          >
            <span>Live Store</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </Link>

          <button
            type="button"
            onClick={() => signOut()}
            className="px-2.5 py-1.5 rounded-lg text-ink/70 hover:text-alert hover:bg-red-50 text-xs font-medium transition-colors"
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
          className={`fixed inset-y-0 left-0 z-40 w-64 bg-paper border-r border-line transform transition-transform duration-200 ease-in-out md:static md:translate-x-0 pt-14 md:pt-0 flex flex-col ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="flex-1 overflow-y-auto p-3 space-y-4">
            {NAV_GROUPS.map((group) => {
              const visibleItems = group.items.filter((item) => {
                if (!item.permission) return true;
                return roleHasPermission(role, item.permission);
              });

              if (visibleItems.length === 0) return null;

              const isCollapsed = !!collapsedGroups[group.group];

              return (
                <div key={group.group} className="space-y-0.5">
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.group)}
                    className="w-full flex items-center justify-between px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-ink/40 hover:text-ink transition-colors"
                  >
                    <span>{group.group}</span>
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className={`text-ink/40 transition-transform ${isCollapsed ? '' : 'rotate-180'}`}
                      aria-hidden="true"
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
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
                            className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                              isActive
                                ? 'bg-ink text-gold font-semibold shadow-xs'
                                : 'text-ink/75 hover:bg-tint hover:text-ink'
                            }`}
                          >
                            <span className="shrink-0 opacity-80">
                              <AdminNavIcon name={item.icon} className="w-4 h-4" />
                            </span>
                            <span className="truncate">{item.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="p-3 border-t border-line bg-field/60 text-2xs text-ink/50 flex flex-col gap-0.5">
            <div className="flex items-center justify-between">
              <span className="font-medium">KarthysGallery Suite</span>
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
