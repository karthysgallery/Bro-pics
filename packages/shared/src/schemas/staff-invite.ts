import { z } from 'zod';
import { ROLES } from '../auth/permissions';

// [ABE-27] `id` is the invite token itself (the Firestore doc id) —
// a random string, not derivable from the invitee's identity, so knowing
// it is what proves the invite was actually received (no email/SMS send
// pipeline exists yet to deliver it automatically — see BE-28/29's still-
// unbuilt notification-outbox worker — so today the admin who creates an
// invite shares the link by hand; this schema and its accept endpoint are
// what let that link actually do something once shared).
export const StaffInviteStatusSchema = z.enum(['pending', 'accepted', 'revoked', 'expired']);

export const StaffInviteSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  role: z.enum(ROLES),
  status: StaffInviteStatusSchema,
  invitedBy: z.string(),
  createdAt: z.date(),
  expiresAt: z.date(),
  acceptedBy: z.string().nullable(),
  acceptedAt: z.date().nullable(),
});

export type StaffInvite = z.infer<typeof StaffInviteSchema>;
export type StaffInviteStatus = z.infer<typeof StaffInviteStatusSchema>;
