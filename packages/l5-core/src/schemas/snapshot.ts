import { z } from 'zod';

export const SnapshotSchema = z.object({
  title: z.string(),
  content: z.string(),
  theme: z.enum(['light', 'dark']).optional(),
});

export type Snapshot = z.infer<typeof SnapshotSchema>;
