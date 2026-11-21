import { z } from 'zod';

export const UpdateShippingBodySchema = z
  .object({
    trackingUrl: z.string().url().refine((v) => /^https:\/\//i.test(v), 'The tracking link must start with https://'),
  })
  .strict();

export type UpdateShippingBody = z.infer<typeof UpdateShippingBodySchema>;
