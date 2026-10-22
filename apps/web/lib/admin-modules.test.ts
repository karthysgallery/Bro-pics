import { describe, it, expect } from 'vitest';
import { readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ADMIN_MODULES, moduleForPath, activePageHref, visibleModules } from './admin-modules';

const ADMIN_DIR = join(__dirname, '..', 'app', 'admin');

/** Every admin page address that has its own page.tsx (dynamic [id] pages are reached from their list page). */
function adminPages(dir = ADMIN_DIR, base = '/admin'): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (!statSync(full).isDirectory() || name.startsWith('[')) continue;
    if (existsSync(join(full, 'page.tsx'))) out.push(`${base}/${name}`);
    out.push(...adminPages(full, `${base}/${name}`));
  }
  return out;
}

// Pages deliberately left out of the menu (they still work by address).
const NOT_IN_MENU = new Set([
  '/admin/delivery/rates', // only says "Shipping rates have moved" (to Shop, GST & shipping)
  '/admin/roles', // older copy of Team & roles
]);

describe('admin modules', () => {
  it('every menu link opens a page that exists', () => {
    const pages = new Set(adminPages());
    for (const m of ADMIN_MODULES) for (const p of m.pages) expect(pages.has(p.href.split('?')[0]), p.href).toBe(true);
  });

  it('every admin page belongs to a module (so its sidebar shows), except the deliberate exceptions', () => {
    const orphans = adminPages().filter((p) => !NOT_IN_MENU.has(p) && !moduleForPath(p));
    expect(orphans).toEqual([]);
  });

  it('no page is listed twice', () => {
    const hrefs = ADMIN_MODULES.flatMap((m) => m.pages.map((p) => p.href));
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it('finds the module and page for deeper addresses, choosing the most specific match', () => {
    expect(moduleForPath('/admin')).toBeNull();
    expect(moduleForPath('/admin/products/abc123')?.id).toBe('catalogue');
    expect(moduleForPath('/admin/products/bulk')?.id).toBe('catalogue');
    expect(moduleForPath('/admin/orders/photo-validation')?.id).toBe('orders');
    expect(activePageHref(moduleForPath('/admin/orders/photo-validation')!, '/admin/orders/photo-validation')).toBe('/admin/orders/photo-validation');
    expect(activePageHref(moduleForPath('/admin/orders/BP-1')!, '/admin/orders/BP-1')).toBe('/admin/orders');
    expect(moduleForPath('/admin/settings/team')?.id).toBe('settings');
    expect(moduleForPath('/admin/productsx')).toBeNull();
  });

  it('roles only see the modules and pages they may use', () => {
    const staff = visibleModules('staff');
    expect(staff.map((m) => m.id)).toContain('orders');
    expect(staff.map((m) => m.id)).not.toContain('website');
    expect(staff.find((m) => m.id === 'settings')?.pages.map((p) => p.href)).toEqual(['/admin/security']);
    expect(visibleModules('super_admin')).toHaveLength(ADMIN_MODULES.length);
  });
});
