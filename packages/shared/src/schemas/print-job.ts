import { z } from 'zod';

// queued: waiting for a lease. leased: a worker has claimed it and is
// rendering. done: renderedFilePath is populated. failed: a lease attempt
// errored but attempts remain — nextAttemptAt gates the next retry.
// failed_permanent: attempts exhausted, needs a human.
export const PrintJobStatusSchema = z.enum(['queued', 'leased', 'done', 'failed', 'failed_permanent']);
export type PrintJobStatus = z.infer<typeof PrintJobStatusSchema>;

export const PrintJobSchema = z.object({
  // Deterministic {orderId}_{itemId} (see printJobId) so re-running the
  // job-creation step for an order that already has jobs is a no-op
  // instead of creating duplicates.
  id: z.string(),
  orderId: z.string(),
  itemId: z.string(),
  // Groups every slot's Customization doc for this item (a multi-slot
  // collage item has N Customization docs, one per slotIndex, all
  // sharing one personalizationId) — never a single customizationId,
  // since one print job renders the whole item, not one slot.
  personalizationId: z.string(),
  status: PrintJobStatusSchema,
  attempts: z.number().int().nonnegative(),
  // Set on creation and after every failed attempt; a lease is only
  // grantable once now >= nextAttemptAt. Absent once status is 'done' or
  // 'failed_permanent'.
  nextAttemptAt: z.date().optional(),
  leasedAt: z.date().optional(),
  leaseExpiresAt: z.date().optional(),
  renderedFilePath: z.string().optional(),
  lastError: z.string().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type PrintJob = z.infer<typeof PrintJobSchema>;
