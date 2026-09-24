import { z } from 'zod';
import { ROLES } from '../auth/permissions';

/**
 * [ABE-01] staff/{uid} — a Firestore mirror of each staff/admin account's
 * role, kept alongside (not instead of) the Firebase Auth custom claim
 * that actually gates access (custom claims aren't queryable — you can't
 * ask Firestore/Firebase "list every user with role X" without this).
 * Written by POST /api/admin/users/[uid]/role, the same route that sets
 * the custom claim, so the two never drift.
 */
export const StaffMirrorSchema = z.object({
  uid: z.string(),
  role: z.enum(ROLES),
  active: z.boolean(),
  invitedBy: z.string(),
  // Null until a login hook actually updates it — not wired yet (see
  // ABE-01's own PROJECT_STATUS.md note: needs a dedicated sign-in hook,
  // not a write on every authenticated request, which would be a
  // Firestore write per API call for a field that only needs
  // once-per-session granularity).
  lastLoginAt: z.date().nullable(),
  updatedAt: z.date(),
});

export type StaffMirror = z.infer<typeof StaffMirrorSchema>;
