import { z } from 'zod';

const SlideSchema = z.object({
  title: z.string(),
  content: z.string().optional(),
  layout: z.string().optional(),
  speakerNotes: z.string().optional(),
});

export const SlideDeckSpec = z.object({
  title: z.string(),
  author: z.string().optional(),
  date: z.string().optional(),
  slides: z.array(SlideSchema),
});

export type SlideDeckSpecType = z.infer<typeof SlideDeckSpec>;
