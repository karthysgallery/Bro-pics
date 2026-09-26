import { z } from 'zod';

export const QcBodySchema = z
  .object({
    result: z.enum(['pass', 'fail']),
    // Required on a FAIL (a rejected item needs a reason staff can act
    // on), optional on a PASS.
    reason: z.string().min(1).optional(),
  })
  .strict()
  .refine((v) => v.result === 'pass' || !!v.reason, {
    message: 'reason is required when result is "fail"',
    path: ['reason'],
  });

export type QcBody = z.infer<typeof QcBodySchema>;
