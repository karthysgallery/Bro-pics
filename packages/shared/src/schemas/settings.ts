import { z } from 'zod';

// Stored as a single document at settings/global, validated directly by
// this schema (no valueJson wrapper — Firestore documents are already
// structured, unlike the relational key/value_json table this replaces).
export const SettingsSchema = z.object({
  gstin: z.string().optional(),
  gstEnabled: z.boolean(),
  taxRate: z.number().nonnegative(),
  freeShippingThreshold: z.number().int().nonnegative(),
  flatShippingCharge: z.number().int().nonnegative(),
  processingDays: z.number().int().nonnegative(),
  supportPhone: z.string(),
  announcementBar: z.object({
    text: z.string(),
    link: z.string().optional(),
    isActive: z.boolean(),
  }),
});

export type Settings = z.infer<typeof SettingsSchema>;
