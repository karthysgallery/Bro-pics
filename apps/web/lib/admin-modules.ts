import { roleHasPermission, type PermissionKey, type Role } from '@bro-pics/shared';

/**
 * The admin is organised as modules. The dashboard (/admin) shows one card per module; inside a module the sidebar
 * lists only that module's pages. Every admin page belongs to exactly one module (pages not listed here still work by
 * their address — they simply have no menu entry).
 */
export interface AdminPage {
  label: string;
  href: string;
  permission?: PermissionKey;
  icon: string;
  /** Optional sub-heading inside the module sidebar. */
  group?: string;
}

export interface AdminModule {
  id: string;
  title: string;
  /** One line on the dashboard card: what you do here. */
  description: string;
  icon: string;
  pages: AdminPage[];
}

export const ADMIN_MODULES: AdminModule[] = [
  {
    id: 'orders',
    title: 'Orders & Production',
    description: 'New orders, photo checks, printing, packing and returns.',
    icon: 'orders',
    pages: [
      { label: 'Orders', href: '/admin/orders', permission: 'orders:read', icon: 'orders' },
      { label: 'Photo checks', href: '/admin/orders/photo-validation', permission: 'orders:read', icon: 'validation' },
      { label: 'Production board', href: '/admin/production', permission: 'orders:read', icon: 'production' },
      { label: 'Quality check', href: '/admin/production/qc', permission: 'production:write', icon: 'qc' },
      { label: 'Print jobs', href: '/admin/production/jobs', permission: 'production:write', icon: 'jobs' },
      { label: 'Returns & refunds', href: '/admin/returns', permission: 'returns:read', icon: 'returns' },
    ],
  },
  {
    id: 'catalogue',
    title: 'Catalogue',
    description: 'Products, collage designs, categories, frame models and stock.',
    icon: 'products',
    pages: [
      { label: 'Products', href: '/admin/products', permission: 'catalogue:read', icon: 'products' },
      { label: 'Collage designs', href: '/admin/personalization-templates', permission: 'catalogue:read', icon: 'templates' },
      { label: 'Categories', href: '/admin/categories', permission: 'catalogue:read', icon: 'categories' },
      { label: 'Collections', href: '/admin/collections', permission: 'catalogue:read', icon: 'collections' },
      { label: 'Combo offers', href: '/admin/combos', permission: 'catalogue:read', icon: 'collections' },
      { label: 'Frame models', href: '/admin/frame-models', permission: 'catalogue:read', icon: 'frame' },
      { label: 'Stock', href: '/admin/inventory', permission: 'catalogue:read', icon: 'inventory' },
      { label: 'Media library', href: '/admin/media', permission: 'catalogue:read', icon: 'media' },
      { label: 'Old frame templates', href: '/admin/frame-templates', permission: 'catalogue:read', icon: 'templates', group: 'Older tools' },
    ],
  },
  {
    id: 'billing',
    title: 'Shop Billing',
    description: 'Counter bills, GST invoices, offline sales and billing reports.',
    icon: 'billing',
    pages: [
      { label: 'New bill', href: '/admin/billing/new', permission: 'billing:create', icon: 'billing' },
      { label: 'Bills & invoices', href: '/admin/billing/invoices', permission: 'billing:view', icon: 'billing' },
      { label: 'Offline sales', href: '/admin/billing/pos-sales', permission: 'billing:view', icon: 'analytics' },
      { label: 'Billing customers', href: '/admin/billing/customers', permission: 'billing:view', icon: 'customers' },
      { label: 'Billing reports', href: '/admin/billing/reports', permission: 'billing:reports', icon: 'analytics' },
      { label: 'WhatsApp invoices', href: '/admin/billing/whatsapp', permission: 'billing:view', icon: 'notifications' },
      { label: 'Billing settings', href: '/admin/billing/settings', permission: 'billing:view', icon: 'settings' },
    ],
  },
  {
    id: 'customers',
    title: 'Customers & WhatsApp',
    description: 'Customer list, WhatsApp contacts, campaigns and message history.',
    icon: 'customers',
    pages: [
      { label: 'Customers', href: '/admin/customers', permission: 'customers:read', icon: 'customers' },
      { label: 'WhatsApp contacts', href: '/admin/whatsapp/contacts', permission: 'customers:read', icon: 'notifications' },
      { label: 'WhatsApp campaigns', href: '/admin/marketing/whatsapp', permission: 'marketing:whatsapp', icon: 'notifications' },
      { label: 'WhatsApp templates', href: '/admin/whatsapp/templates', permission: 'whatsapp:logs', icon: 'notifications' },
      { label: 'Message history', href: '/admin/whatsapp/messages', permission: 'whatsapp:logs', icon: 'notifications' },
    ],
  },
  {
    id: 'delivery',
    title: 'Delivery',
    description: 'Shipments, courier partners and the PIN codes you deliver to.',
    icon: 'shipments',
    pages: [
      { label: 'Shipments', href: '/admin/delivery/shipments', permission: 'shipping:write', icon: 'shipments' },
      { label: 'Courier partners', href: '/admin/delivery/couriers', permission: 'shipping:write', icon: 'couriers' },
      { label: 'PIN code coverage', href: '/admin/delivery/serviceability', permission: 'settings:read', icon: 'pincode' },
    ],
  },
  {
    id: 'website',
    title: 'Website',
    description: 'Home page, pages, menus, wording, colours and videos.',
    icon: 'homepage',
    pages: [
      { label: 'Home page', href: '/admin/homepage', permission: 'content:read', icon: 'homepage' },
      { label: 'Pages', href: '/admin/pages', permission: 'content:read', icon: 'pages' },
      { label: 'Header & footer', href: '/admin/navigation', permission: 'settings:write', icon: 'pages' },
      { label: 'Site wording', href: '/admin/site-text', permission: 'settings:write', icon: 'pages' },
      { label: 'Look & feel', href: '/admin/appearance', permission: 'settings:write', icon: 'theme' },
      { label: 'Festival themes', href: '/admin/themes', permission: 'settings:write', icon: 'theme' },
      { label: 'Videos', href: '/admin/videos', permission: 'content:read', icon: 'videos' },
    ],
  },
  {
    id: 'marketing',
    title: 'Marketing & Google',
    description: 'Google search ranking, coupons, reviews and featured products.',
    icon: 'marketing',
    pages: [
      { label: 'Google & SEO', href: '/admin/seo', permission: 'catalogue:read', icon: 'analytics' },
      { label: 'Coupons', href: '/admin/coupons', permission: 'coupons:write', icon: 'coupons' },
      { label: 'Reviews', href: '/admin/reviews', permission: 'reviews:moderate', icon: 'reviews' },
      { label: 'Featured products', href: '/admin/merchandising', permission: 'catalogue:write', icon: 'merchandising' },
    ],
  },
  {
    id: 'reports',
    title: 'Reports',
    description: 'Sales, products and customer reports, and what the site costs to run.',
    icon: 'analytics',
    pages: [
      { label: 'Sales & analytics', href: '/admin/analytics', permission: 'analytics:read', icon: 'analytics' },
      { label: 'Running costs', href: '/admin/running-costs', permission: 'audit:read', icon: 'costs' },
    ],
  },
  {
    id: 'settings',
    title: 'Settings & Security',
    description: 'Shop details, GST, shipping charges, staff, alerts and sign-in security.',
    icon: 'settings',
    pages: [
      { label: 'Shop, GST & shipping', href: '/admin/settings', permission: 'settings:read', icon: 'settings' },
      { label: 'Notifications', href: '/admin/settings/notifications', permission: 'settings:read', icon: 'notifications' },
      { label: 'Team & roles', href: '/admin/settings/team', permission: 'team:manage', icon: 'team' },
      { label: 'Activity log', href: '/admin/audit', permission: 'audit:read', icon: 'audit' },
      { label: 'My sign-in & security', href: '/admin/security', icon: 'settings' },
    ],
  },
];

export function pageAllowed(role: Role, page: AdminPage): boolean {
  return !page.permission || roleHasPermission(role, page.permission);
}

/** Modules this role can open (a module with no allowed page is hidden). */
export function visibleModules(role: Role): Array<AdminModule & { pages: AdminPage[] }> {
  return ADMIN_MODULES.map((m) => ({ ...m, pages: m.pages.filter((p) => pageAllowed(role, p)) })).filter((m) => m.pages.length > 0);
}

/** The module a page address belongs to: the module whose page address matches it most specifically. */
export function moduleForPath(pathname: string | null | undefined): AdminModule | null {
  if (!pathname || pathname === '/admin' || pathname === '/admin/') return null;
  let best: { module: AdminModule; length: number } | null = null;
  for (const module of ADMIN_MODULES) {
    for (const page of module.pages) {
      const base = page.href.split('?')[0];
      if ((pathname === base || pathname.startsWith(base + '/')) && (!best || base.length > best.length)) best = { module, length: base.length };
    }
  }
  return best?.module ?? null;
}

/** The page inside a module that the address is on (most specific match), for highlighting the sidebar. */
export function activePageHref(module: AdminModule, pathname: string): string | null {
  let best: string | null = null;
  for (const page of module.pages) {
    const base = page.href.split('?')[0];
    if ((pathname === base || pathname.startsWith(base + '/')) && (!best || base.length > best.length)) best = base;
  }
  return best;
}
