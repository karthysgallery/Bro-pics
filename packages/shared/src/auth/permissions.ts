/**
 * [ABE-01] Five roles, replacing the previous binary admin/staff claim.
 * `staff` is kept, not retired — the 2026-09-15 account/admin backend
 * spec explicitly flagged "retire vs keep the staff claim" as an open
 * decision for whoever picked up backend work next (this pass). Kept: the
 * master plan's own ABE-01 task names 'Staff' as one of five roles it
 * wants, which settles the question — the plan's intent was always to
 * keep it as a real tier, not retire it for lack of a dedicated UI
 * surface.
 */
export const ROLES = [
  'super_admin',
  'admin',
  'staff',
  'catalogue_manager',
  'marketing_manager',
  // content_manager kept as an alias for backwards compatibility with existing sessions
  'content_manager',
] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSION_KEYS = [
  'catalogue:read',
  'catalogue:write',
  'catalogue:publish',
  'catalogue:delete',
  'inventory:write',
  'orders:read',
  'orders:write',
  'orders:cancel',
  'production:write',
  'shipping:write',
  'returns:read',
  'returns:write',
  'refunds:execute',
  'customers:read',
  'customers:write',
  'coupons:write',
  'reviews:moderate',
  'settings:read',
  'settings:write',
  'team:manage',
  'analytics:read',
  'audit:read',
  // Backwards-compatible content keys for legacy routes
  'content:read',
  'content:write',
] as const;
export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export const ROLE_PERMISSIONS: Record<Role, readonly PermissionKey[]> = {
  super_admin: [
    'catalogue:read',
    'catalogue:write',
    'catalogue:publish',
    'catalogue:delete',
    'inventory:write',
    'orders:read',
    'orders:write',
    'orders:cancel',
    'production:write',
    'shipping:write',
    'returns:read',
    'returns:write',
    'refunds:execute',
    'customers:read',
    'customers:write',
    'coupons:write',
    'reviews:moderate',
    'settings:read',
    'settings:write',
    'team:manage',
    'analytics:read',
    'audit:read',
    'content:read',
    'content:write',
  ],
  admin: [
    'catalogue:read',
    'catalogue:write',
    'catalogue:publish',
    'catalogue:delete',
    'inventory:write',
    'orders:read',
    'orders:write',
    'orders:cancel',
    'production:write',
    'shipping:write',
    'returns:read',
    'returns:write',
    'refunds:execute',
    'customers:read',
    'customers:write',
    'coupons:write',
    'reviews:moderate',
    'settings:read',
    'settings:write',
    'analytics:read',
    'audit:read',
    'content:read',
    'content:write',
  ],
  staff: [
    'orders:read',
    'orders:write',
    'production:write',
    'shipping:write',
    'returns:read',
    'returns:write',
    'reviews:moderate',
    'inventory:write',
    'customers:read',
  ],
  catalogue_manager: [
    'catalogue:read',
    'catalogue:write',
    'catalogue:publish',
    'catalogue:delete',
    'inventory:write',
    'settings:read',
    'content:read',
  ],
  marketing_manager: [
    'coupons:write',
    'reviews:moderate',
    'catalogue:read',
    'settings:read',
    'settings:write',
    'analytics:read',
    'content:read',
    'content:write',
  ],
  content_manager: [
    'content:read',
    'content:write',
    'catalogue:read',
  ],
};

export function roleHasPermission(role: Role, key: PermissionKey): boolean {
  return ROLE_PERMISSIONS[role]?.includes(key) ?? false;
}

export function isValidRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}
