import { z } from 'zod';

export const DownloadTypeSchema = z.enum(['original', 'preview', 'print']);
export type DownloadType = z.infer<typeof DownloadTypeSchema>;
