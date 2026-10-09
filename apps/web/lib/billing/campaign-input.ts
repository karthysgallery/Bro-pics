import { z } from 'zod';
import { CampaignAudienceSchema, CampaignSchema } from '@bro-pics/shared';

/** What the campaign form sends (create and edit). */
export const CampaignInputSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    template: CampaignSchema.shape.template,
    language: CampaignSchema.shape.language,
    bodyParams: CampaignSchema.shape.bodyParams,
    previewText: CampaignSchema.shape.previewText,
    audience: CampaignAudienceSchema,
    scheduledAt: z.string().datetime().nullable(),
  })
  .strict();
