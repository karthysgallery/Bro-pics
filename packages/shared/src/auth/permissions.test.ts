import { describe, it, expect } from 'vitest';
import { roleHasPermission, isValidRole, ROLES, PERMISSION_KEYS, ROLE_PERMISSIONS, type Role } from './permissions';

describe('ROLE_PERMISSIONS', () => {
  it('defines a permission list for every role', () => {
    for (const role of ROLES) {
      expect(ROLE_PERMISSIONS[role]).toBeDefined();
    }
  });

  it('only ever references known permission keys', () => {
    for (const role of ROLES) {
      for (const key of ROLE_PERMISSIONS[role]) {
        expect(PERMISSION_KEYS).toContain(key);
      }
    }
  });
});

describe('roleHasPermission', () => {
  it('grants super_admin every permission', () => {
    for (const key of PERMISSION_KEYS) {
      expect(roleHasPermission('super_admin', key)).toBe(true);
    }
  });

  it('denies admin team:manage specifically, per ABE-27\'s Super-Admin-only gating', () => {
    expect(roleHasPermission('admin', 'team:manage')).toBe(false);
    expect(roleHasPermission('super_admin', 'team:manage')).toBe(true);
  });

  it('grants admin everything else', () => {
    const nonTeamKeys = PERMISSION_KEYS.filter((k) => k !== 'team:manage');
    for (const key of nonTeamKeys) {
      expect(roleHasPermission('admin', key)).toBe(true);
    }
  });

  it('scopes staff to order/return/review/production/shipping/inventory operations', () => {
    expect(roleHasPermission('staff', 'orders:write')).toBe(true);
    expect(roleHasPermission('staff', 'returns:write')).toBe(true);
    expect(roleHasPermission('staff', 'reviews:moderate')).toBe(true);
    expect(roleHasPermission('staff', 'production:write')).toBe(true);
    expect(roleHasPermission('staff', 'shipping:write')).toBe(true);
    expect(roleHasPermission('staff', 'inventory:write')).toBe(true);
    expect(roleHasPermission('staff', 'refunds:execute')).toBe(false);
    expect(roleHasPermission('staff', 'catalogue:write')).toBe(false);
    expect(roleHasPermission('staff', 'settings:write')).toBe(false);
    expect(roleHasPermission('staff', 'team:manage')).toBe(false);
  });

  it('scopes catalogue_manager to catalogue and inventory writes', () => {
    expect(roleHasPermission('catalogue_manager', 'catalogue:read')).toBe(true);
    expect(roleHasPermission('catalogue_manager', 'catalogue:write')).toBe(true);
    expect(roleHasPermission('catalogue_manager', 'catalogue:publish')).toBe(true);
    expect(roleHasPermission('catalogue_manager', 'catalogue:delete')).toBe(true);
    expect(roleHasPermission('catalogue_manager', 'inventory:write')).toBe(true);
    expect(roleHasPermission('catalogue_manager', 'settings:read')).toBe(true);
    expect(roleHasPermission('catalogue_manager', 'orders:write')).toBe(false);
    expect(roleHasPermission('catalogue_manager', 'team:manage')).toBe(false);
  });

  it('scopes marketing_manager to coupons, reviews moderation, and merchandising', () => {
    expect(roleHasPermission('marketing_manager', 'coupons:write')).toBe(true);
    expect(roleHasPermission('marketing_manager', 'reviews:moderate')).toBe(true);
    expect(roleHasPermission('marketing_manager', 'catalogue:read')).toBe(true);
    expect(roleHasPermission('marketing_manager', 'settings:write')).toBe(true);
    expect(roleHasPermission('marketing_manager', 'analytics:read')).toBe(true);
    expect(roleHasPermission('marketing_manager', 'orders:write')).toBe(false);
    expect(roleHasPermission('marketing_manager', 'refunds:execute')).toBe(false);
  });

  it('scopes content_manager backwards-compatible alias', () => {
    expect(roleHasPermission('content_manager', 'content:write')).toBe(true);
    expect(roleHasPermission('content_manager', 'catalogue:read')).toBe(true);
    expect(roleHasPermission('content_manager', 'orders:write')).toBe(false);
    expect(roleHasPermission('content_manager', 'reviews:moderate')).toBe(false);
  });

  it('limits refunds:execute only to super_admin and admin', () => {
    expect(roleHasPermission('super_admin', 'refunds:execute')).toBe(true);
    expect(roleHasPermission('admin', 'refunds:execute')).toBe(true);
    expect(roleHasPermission('staff', 'refunds:execute')).toBe(false);
    expect(roleHasPermission('catalogue_manager', 'refunds:execute')).toBe(false);
    expect(roleHasPermission('marketing_manager', 'refunds:execute')).toBe(false);
  });
});

describe('isValidRole', () => {
  it('accepts every defined role', () => {
    for (const role of ROLES) {
      expect(isValidRole(role)).toBe(true);
    }
  });

  it('rejects an unknown string, and non-string values', () => {
    expect(isValidRole('owner')).toBe(false);
    expect(isValidRole(null)).toBe(false);
    expect(isValidRole(undefined)).toBe(false);
    expect(isValidRole(42)).toBe(false);
  });

  it('narrows the type on a true result (compile-time check via a Role-typed assignment)', () => {
    const value: unknown = 'staff';
    if (isValidRole(value)) {
      const role: Role = value;
      expect(role).toBe('staff');
    }
  });
});
