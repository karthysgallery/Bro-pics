import { z } from 'zod';
import { ROLES } from '@bro-pics/shared';

export const CreateStaffInviteBodySchema = z
  .object({
    email: z.string().email(),
    role: z.enum(ROLES),
  })
  .strict();

export type CreateStaffInviteBody = z.infer<typeof CreateStaffInviteBodySchema>;

export const AcceptStaffInviteBodySchema = z
  .object({
    token: z.string().min(1),
  })
  .strict();

export type AcceptStaffInviteBody = z.infer<typeof AcceptStaffInviteBodySchema>;
