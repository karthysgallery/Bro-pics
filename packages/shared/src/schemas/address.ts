import { z } from 'zod';

export const AddressTypeSchema = z.enum(['home', 'work', 'other']);

export const AddressSchema = z.object({
  id: z.string(),
  label: z.string().nullable(),
  line1: z.string().min(1),
  line2: z.string().nullable(),
  city: z.string().min(1),
  state: z.string().min(1),
  // A real 6-digit Indian pincode, not just "non-empty" — the app is
  // implicitly India-only (see `country` below), so this is a concrete
  // format check rather than a generic postal-code pattern.
  pincode: z.string().regex(/^\d{6}$/, 'Enter a valid 6-digit pincode'),
  phone: z.string().min(1),
  isDefault: z.boolean(),
  // Additive fields — optional so an existing address doc without them
  // still parses. `type` is distinct from the free-text `label` above
  // (label might say "Mom's place"; type is the structured home/work/other
  // bucket the account UI groups and icons by).
  type: AddressTypeSchema.nullable().optional(),
  country: z.string().nullable().optional(),
  deliveryInstructions: z.string().nullable().optional(),
});

export type Address = z.infer<typeof AddressSchema>;
export type AddressType = z.infer<typeof AddressTypeSchema>;
