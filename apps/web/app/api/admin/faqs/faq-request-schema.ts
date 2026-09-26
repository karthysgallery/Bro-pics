import { z } from 'zod';

export const CreateFaqBodySchema = z
  .object({
    section: z.string().min(1),
    question: z.string().min(1),
    answerHtml: z.string().min(1),
    sortOrder: z.number().int().nonnegative().default(0),
    isActive: z.boolean().default(true),
  })
  .strict();

export type CreateFaqBody = z.infer<typeof CreateFaqBodySchema>;

export const UpdateFaqBodySchema = CreateFaqBodySchema.partial();

export type UpdateFaqBody = z.infer<typeof UpdateFaqBodySchema>;

export const ReorderFaqsBodySchema = z
  .object({
    orderedIds: z.array(z.string().min(1)).min(1),
  })
  .strict();

export type ReorderFaqsBody = z.infer<typeof ReorderFaqsBodySchema>;
