import { z } from 'zod';

export const cardSchema = z.object({
  id: z.string(),
  content: z.string(),
  order: z.number(),
});

export const sceneSchema = z.object({
  id: z.string(),
  title: z.string(),
  cards: z.array(cardSchema),
});

export const scriptPlanSchema = z.object({
  id: z.string(),
  title: z.string(),
  scenes: z.array(sceneSchema),
});

export type Card = z.infer<typeof cardSchema>;
export type Scene = z.infer<typeof sceneSchema>;
export type ScriptPlan = z.infer<typeof scriptPlanSchema>;
