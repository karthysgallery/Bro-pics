import { z } from 'zod';
import { ReturnStatusSchema } from './return';

// [BE-19] History entries for a return, mirroring OrderEvent's shape for
// orders/{id}/events — written to returns/{id}/events on every staff
// status change, not just the terminal refunded one.
export const ReturnEventSchema = z.object({
  id: z.string(),
  status: ReturnStatusSchema,
  staffNote: z.string().nullable(),
  createdAt: z.string(),
  createdBy: z.string(),
});

export type ReturnEvent = z.infer<typeof ReturnEventSchema>;
