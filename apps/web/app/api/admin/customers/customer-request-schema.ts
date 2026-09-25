import { z } from 'zod';

export const DisableCustomerBodySchema = z
  .object({
    disabled: z.boolean(),
  })
  .strict();

export type DisableCustomerBody = z.infer<typeof DisableCustomerBodySchema>;
