import { z } from 'zod';

export const CreateNotificationTemplateBodySchema = z
  .object({
    key: z.string().min(1),
    subject: z.string().min(1),
    body: z.string().min(1),
    variables: z.array(z.string().min(1)).default([]),
  })
  .strict();

export type CreateNotificationTemplateBody = z.infer<typeof CreateNotificationTemplateBodySchema>;

export const UpdateNotificationTemplateBodySchema = CreateNotificationTemplateBodySchema.omit({ key: true }).partial();

export type UpdateNotificationTemplateBody = z.infer<typeof UpdateNotificationTemplateBodySchema>;

export const PreviewNotificationTemplateBodySchema = z
  .object({
    values: z.record(z.string(), z.string()).default({}),
  })
  .strict();

export type PreviewNotificationTemplateBody = z.infer<typeof PreviewNotificationTemplateBodySchema>;
