import { z } from 'zod';

/**
 * [ABE-25] Fully greenfield — no template/variable-substitution
 * mechanism existed before this. Every notification title/body in this
 * codebase (`NOTIFICATION_BY_STATUS`, the razorpay webhook's
 * `queueNotification` calls) is a fully-resolved string built inline by
 * its caller via JS template literals; this schema is the first place a
 * `{{variable}}` placeholder is a first-class stored concept. `key` is
 * the Firestore doc id (e.g. `order.paid`, `order.cancelled` — matching
 * the transition-key style `NOTIFICATION_BY_STATUS` already uses).
 * `variables` is a WHITELIST: `renderNotificationTemplate` only
 * substitutes a `{{name}}` placeholder when `name` appears here, so a
 * template can't be edited to leak an arbitrary field an admin didn't
 * explicitly opt into exposing.
 */
export const NotificationTemplateSchema = z.object({
  key: z.string().min(1),
  subject: z.string().min(1),
  body: z.string().min(1),
  variables: z.array(z.string().min(1)),
  updatedAt: z.date(),
  updatedBy: z.string().nullable(),
});

export type NotificationTemplate = z.infer<typeof NotificationTemplateSchema>;
