import { z } from 'zod';

export const UpdateOrderNotesBodySchema = z
  .object({
    notes: z.string().max(5000),
  })
  .strict();

export type UpdateOrderNotesBody = z.infer<typeof UpdateOrderNotesBodySchema>;
