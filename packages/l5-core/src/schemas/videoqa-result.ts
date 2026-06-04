import { z } from 'zod';

export const VideoQAAnswerSchema = z.object({
  question_id: z.string().min(1),
  question: z.string().min(1),
  answer: z.string().min(1),
  timestamp_start: z.number().nonnegative(),
  timestamp_end: z.number().nonnegative(),
  confidence: z.number().min(0).max(1),
}).refine(
  (d) => d.timestamp_end >= d.timestamp_start,
  { message: 'timestamp_end must be >= timestamp_start' },
);

export type VideoQAAnswer = z.infer<typeof VideoQAAnswerSchema>;

export const CheckName = z.enum([
  'format_schema',
  'temporal_grounding',
  'contextual_relevance',
  'factual_consistency',
  'completeness',
  'robustness',
  'guardrail_safety',
]);

export type CheckName = z.infer<typeof CheckName>;

export const CheckResultSchema = z.object({
  check: CheckName,
  passed: z.boolean(),
  score: z.number().min(0).max(100),
  reason: z.string().optional(),
});

export type CheckResult = z.infer<typeof CheckResultSchema>;

export const EvalReportSchema = z.object({
  overall_score: z.number().min(0).max(100),
  passed: z.boolean(),
  checks: z.array(CheckResultSchema).length(7),
  evaluated_at: z.string(),
  sample_count: z.number().int().positive(),
});

export type EvalReport = z.infer<typeof EvalReportSchema>;
