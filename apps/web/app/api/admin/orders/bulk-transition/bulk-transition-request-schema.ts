import { z } from 'zod';

export const BulkTransitionBodySchema = z
  .object({
    orderIds: z.array(z.string().min(1)).min(1).max(100),
    toStatus: z.string().min(1),
    note: z.string().nullable().optional(),
  })
  .strict();

export type BulkTransitionBody = z.infer<typeof BulkTransitionBodySchema>;
