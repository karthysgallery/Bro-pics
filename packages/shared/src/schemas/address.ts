import { z } from 'zod';

export const AddressSchema = z.object({
  id: z.string(),
  label: z.string().nullable(),
  line1: z.string().min(1),
  line2: z.string().nullable(),
  city: z.string().min(1),
  state: z.string().min(1),
  pincode: z.string().min(1),
  phone: z.string().min(1),
  isDefault: z.boolean(),
});

export type Address = z.infer<typeof AddressSchema>;
