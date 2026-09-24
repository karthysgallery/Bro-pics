import { z } from 'zod';

export const UpdateShippingBodySchema = z
  .object({
    trackingUrl: z.string().url(),
  })
  .strict();

export type UpdateShippingBody = z.infer<typeof UpdateShippingBodySchema>;
