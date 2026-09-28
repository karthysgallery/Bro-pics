import { z } from 'zod';
import { isValidIndianPincode } from '../shipping/pincode-zones';

export const AddressTypeSchema = z.enum(['home', 'work', 'other']);

export const AddressSchema = z.object({
  id: z.string(),
  label: z.string().nullable(),
  line1: z.string().min(1),
  line2: z.string().nullable(),
  city: z.string().min(1),
  state: z.string().min(1),
  // [FE-35] A real 6-digit Indian pincode, not just "any 6 digits" — the
  // app is implicitly India-only (see `country` below). Reuses BE-21's
  // own `isValidIndianPincode` (first digit 1-8; 9 is reserved for army
  // postal service, never a deliverable civilian address) rather than a
  // second, looser `/^\d{6}$/` that could accept a pincode the delivery-
  // estimate check would then reject as invalid — a real inconsistency
  // this task's "check pincode validation... end to end" found: an
  // address like "000001" or "999999" previously saved successfully here.
  pincode: z.string().refine(isValidIndianPincode, 'Enter a valid 6-digit pincode'),
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
