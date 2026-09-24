import { z } from 'zod';

const ScheduleBoundSchema = z
  .union([z.string().datetime(), z.null()])
  .optional()
  .transform((value) => (value ? new Date(value) : null));

export const CreateBannerBodySchema = z
  .object({
    title: z.string().min(1),
    subtitle: z.string().default(''),
    image: z.string().default(''),
    mobileImage: z.string().default(''),
    link: z.string().default(''),
    couponCode: z.string().nullable().default(null),
    startsAt: ScheduleBoundSchema,
    endsAt: ScheduleBoundSchema,
    isActive: z.boolean().default(true),
    sortOrder: z.number().int().nonnegative().default(0),
  })
  .strict();

export type CreateBannerBody = z.infer<typeof CreateBannerBodySchema>;

export const UpdateBannerBodySchema = CreateBannerBodySchema.partial();

export type UpdateBannerBody = z.infer<typeof UpdateBannerBodySchema>;

export const ReorderBannersBodySchema = z
  .object({
    orderedIds: z.array(z.string().min(1)).min(1),
  })
  .strict();

export type ReorderBannersBody = z.infer<typeof ReorderBannersBodySchema>;
