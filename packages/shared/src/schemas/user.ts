import { z } from 'zod';

export const UserSchema = z.object({
  id: z.string(),
  phone: z.string().min(1),
  email: z.string().email().nullable(),
  displayName: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type User = z.infer<typeof UserSchema>;
