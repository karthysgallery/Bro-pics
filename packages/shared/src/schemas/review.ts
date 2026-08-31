import { z } from 'zod';

export const ReviewStatusSchema = z.enum(['pending', 'approved', 'rejected']);

export const ReviewSchema = z.object({
  id: z.string(),
  productId: z.string(),
  userId: z.string(),
  orderId: z.string().optional(),
  rating: z.number().int().min(1).max(5),
  title: z.string().min(1),
  body: z.string().min(1),
  media: z.array(z.string()),
  isVerified: z.boolean(),
  status: ReviewStatusSchema,
  createdAt: z.date(),
});

export type Review = z.infer<typeof ReviewSchema>;
export type ReviewStatus = z.infer<typeof ReviewStatusSchema>;
