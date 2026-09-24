import { z } from 'zod';

const MAX_ORDERS = 20;

export const BulkPrintFilesQuerySchema = z.object({
  orderIds: z
    .string()
    .min(1)
    .transform((raw) => raw.split(',').map((s) => s.trim()).filter(Boolean))
    .pipe(z.array(z.string().min(1)).min(1).max(MAX_ORDERS)),
});

export type BulkPrintFilesQuery = z.infer<typeof BulkPrintFilesQuerySchema>;
