import { z } from 'zod';
import { NotificationPreferencesSchema } from './notification';

export const GenderSchema = z.enum(['male', 'female', 'other', 'prefer_not_to_say']);

export const UserSchema = z.object({
  id: z.string(),
  phone: z.string().min(1),
  email: z.string().email().nullable(),
  displayName: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  // Additive profile fields — all optional so an existing user doc without
  // them still parses. firstName/lastName sit alongside displayName rather
  // than replacing it (existing code that reads displayName keeps working
  // unchanged); the profile UI derives displayName from them on save.
  firstName: z.string().nullable().optional(),
  lastName: z.string().nullable().optional(),
  photoUrl: z.string().nullable().optional(),
  // ISO date string (e.g. '1990-05-14'), not a Firestore Timestamp — a
  // date of birth has no time-of-day or timezone component to carry.
  dob: z.string().nullable().optional(),
  gender: GenderSchema.nullable().optional(),
  // Marketing-category toggles only — owner-writable already (users/{uid}
  // is `allow write: if isOwner(userId)`), so this is read/written directly
  // by the client, no new API route needed. Transactional categories are
  // never represented here at all (they're always on).
  notificationPreferences: NotificationPreferencesSchema.nullable().optional(),
  // [ABE-26] Denormalized on `payment.captured` (functions/src/webhooks/
  // razorpay.ts), the same "only once payment is real" convention every
  // other post-payment counter in that file already follows (e.g.
  // Product.salesCount). All optional/nullable, not defaulted, so every
  // pre-existing User object literal in tests/seed data still typechecks,
  // and a customer who has never paid simply never gets these fields.
  totalSpent: z.number().int().nonnegative().optional(),
  orderCount: z.number().int().nonnegative().optional(),
  lastOrderAt: z.string().nullable().optional(),
  // [ABE-26] Set via POST /api/admin/customers/[uid]/disable, mirroring
  // the Firebase Auth `disabled` flag onto Firestore so it's queryable
  // (the auth record itself isn't). Absent/false means active, same
  // "absent means the default" convention every other boolean flag added
  // to an existing schema this session uses.
  disabled: z.boolean().optional(),
});

export type User = z.infer<typeof UserSchema>;
export type Gender = z.infer<typeof GenderSchema>;
