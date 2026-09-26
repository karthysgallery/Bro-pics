import { z } from 'zod';
import { HomepageSectionTypeSchema } from '@bro-pics/shared';

const HeroSlideBodySchema = z.object({
  id: z.string().min(1),
  image: z.string().min(1),
  mobileImage: z.string().min(1),
  eyebrow: z.string().optional(),
  title: z.string().min(1),
  subtitle: z.string().optional(),
  ctaLabel: z.string().optional(),
  ctaLink: z.string().optional(),
  sortOrder: z.number().int().nonnegative(),
});

// ISO datetime string in, JS Date (or null) out — `HomepageSectionSchema`
// stores `startsAt`/`endsAt` as `Date | null`, but a JSON request body can
// only carry strings. Omitted or explicit null both mean "no bound".
const ScheduleBoundSchema = z
  .union([z.string().datetime(), z.null()])
  .optional()
  .transform((value) => (value ? new Date(value) : null));

/**
 * [ABE-17] Its own `.strict()` request-body schema, same reasoning as every
 * other admin write route this session (ABE-04, ABE-05, ABE-12): rejects
 * unknown fields, and stays independent of `HomepageSectionSchema`'s own
 * evolution on the read path. `id` and `previewToken` are excluded —
 * server-generated (`id`) or only settable via the dedicated
 * `preview-token` action route.
 */
export const CreateHomepageSectionBodySchema = z
  .object({
    type: HomepageSectionTypeSchema,
    title: z.string().min(1),
    subtitle: z.string().default(''),
    image: z.string().default(''),
    mobileImage: z.string().default(''),
    link: z.string().default(''),
    sortOrder: z.number().int().nonnegative().default(0),
    startsAt: ScheduleBoundSchema,
    endsAt: ScheduleBoundSchema,
    isActive: z.boolean().default(true),
    config: z.record(z.string(), z.unknown()).default({}),
    heroSlides: z.array(HeroSlideBodySchema).optional(),
  })
  .strict();

export type CreateHomepageSectionBody = z.infer<typeof CreateHomepageSectionBodySchema>;

export const UpdateHomepageSectionBodySchema = CreateHomepageSectionBodySchema.partial();

export type UpdateHomepageSectionBody = z.infer<typeof UpdateHomepageSectionBodySchema>;

export const ReorderHomepageSectionsBodySchema = z
  .object({
    orderedIds: z.array(z.string().min(1)).min(1),
  })
  .strict();

export type ReorderHomepageSectionsBody = z.infer<typeof ReorderHomepageSectionsBodySchema>;
