import { z } from 'zod';
import { NotificationCategorySchema } from './notification';

// [BE-27] queued: waiting to be dispatched. sent: a real channel adapter
// (BE-28/29) delivered it. failed: a dispatch attempt errored but
// attempts remain. failed_permanent: attempts exhausted, needs a human.
// Mirrors PrintJobStatusSchema's shape (packages/shared/src/schemas/
// print-job.ts) — the same job-accounting pattern applied to a different
// domain, not the same module, since a notification's dedupe key and
// backoff schedule are independently owned by this domain.
export const NotificationOutboxStatusSchema = z.enum(['queued', 'sent', 'failed', 'failed_permanent']);
export type NotificationOutboxStatus = z.infer<typeof NotificationOutboxStatusSchema>;

// Only 'email' for now — the only channel with an adapter actually planned
// next (BE-28); SMS/WhatsApp (BE-29) add their own literal here once they
// exist, rather than a channel this queue can never dispatch today.
export const NotificationOutboxChannelSchema = z.enum(['email']);
export type NotificationOutboxChannel = z.infer<typeof NotificationOutboxChannelSchema>;

export const NotificationOutboxSchema = z.object({
  // Deterministic — see notificationOutboxId's own doc comment for the
  // dedupe-key reasoning.
  id: z.string(),
  userId: z.string(),
  channel: NotificationOutboxChannelSchema,
  category: NotificationCategorySchema,
  title: z.string().min(1),
  body: z.string().min(1),
  linkHref: z.string().nullable(),
  status: NotificationOutboxStatusSchema,
  attempts: z.number().int().nonnegative(),
  nextAttemptAt: z.date().optional(),
  lastError: z.string().nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type NotificationOutboxEntry = z.infer<typeof NotificationOutboxSchema>;
