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
export const ROLES = ['super_admin', 'admin', 'staff', 'content_manager', 'catalogue_manager'] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSION_KEYS = [
  'catalogue:read',
  'catalogue:write',
  'content:read',
  'content:write',
  'orders:read',
  'orders:write',
  'returns:read',
  'returns:write',
  'reviews:moderate',
  'coupons:write',
  'settings:write',
  'customers:read',
  // [ABE-26] Every other resource in this list has a read/write pair;
  // customers had only `:read` until this task needed a write action
  // (disabling an account) — added rather than repurposing `team:manage`,
  // which governs staff role grants, a different concern from customer
  // account management.
  'customers:write',
  'team:manage',
  'analytics:read',
] as const;
export type PermissionKey = (typeof PERMISSION_KEYS)[number];

/**
 * [ABE-01] The master plan's own §9.8 permission matrix isn't accessible
 * in this session — BroPics_Production_Implementation_Master_Plan.pdf is
 * gitignored and not present in this working directory; only the
 * original, shorter client spec PDF is ("Bro Pics.pdf", 9 pages, no
 * permission matrix). This mapping is inferred from
 * ADMIN_BACKEND_TASKS.md's own structure instead — a considered
 * inference, not a guess: each role's task cluster in that file maps
 * directly to the permission keys below.
 *
 * - staff: day-to-day fulfillment — order actions, returns, review
 *   moderation. Matches what already exists (the staff-advance/returns/
 *   reviews routes) exactly; nothing here narrows current staff access.
 * - content_manager / catalogue_manager: scoped to their own domain,
 *   read-only into the other's (a catalogue manager needs to SEE content
 *   context and vice versa, but not edit it).
 * - admin: everything except team:manage — ABE-27's own task text says
 *   team management needs "Super-Admin-only gating" explicitly.
 * - super_admin: everything, unconditionally.
 */
export const ROLE_PERMISSIONS: Record<Role, readonly PermissionKey[]> = {
  super_admin: [
    'catalogue:read',
    'catalogue:write',
    'content:read',
    'content:write',
    'orders:read',
    'orders:write',
    'returns:read',
    'returns:write',
    'reviews:moderate',
    'coupons:write',
    'settings:write',
    'customers:read',
    'customers:write',
    'team:manage',
    'analytics:read',
  ],
  admin: [
    'catalogue:read',
    'catalogue:write',
    'content:read',
    'content:write',
    'orders:read',
    'orders:write',
    'returns:read',
    'returns:write',
    'reviews:moderate',
    'coupons:write',
    'settings:write',
    'customers:read',
    'customers:write',
    'analytics:read',
  ],
  staff: ['orders:read', 'orders:write', 'returns:read', 'returns:write', 'reviews:moderate'],
  content_manager: ['content:read', 'content:write', 'catalogue:read'],
  catalogue_manager: ['catalogue:read', 'catalogue:write', 'content:read'],
};

export function roleHasPermission(role: Role, key: PermissionKey): boolean {
  return ROLE_PERMISSIONS[role].includes(key);
}

export function isValidRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}
