import { z } from 'zod';

export const CreateTestimonialBodySchema = z
  .object({
    authorName: z.string().min(1),
    authorLocation: z.string().optional(),
    quote: z.string().min(1),
    photo: z.string().optional(),
    rating: z.number().int().min(1).max(5).optional(),
    isFeatured: z.boolean().default(false),
    isActive: z.boolean().default(true),
    sortOrder: z.number().int().nonnegative().default(0),
  })
  .strict();

export type CreateTestimonialBody = z.infer<typeof CreateTestimonialBodySchema>;

export const UpdateTestimonialBodySchema = CreateTestimonialBodySchema.partial();

export type UpdateTestimonialBody = z.infer<typeof UpdateTestimonialBodySchema>;

export const ReorderTestimonialsBodySchema = z
  .object({
    orderedIds: z.array(z.string().min(1)).min(1),
  })
  .strict();

export type ReorderTestimonialsBody = z.infer<typeof ReorderTestimonialsBodySchema>;
