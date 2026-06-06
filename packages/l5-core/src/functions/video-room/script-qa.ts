// script-qa.ts — CMO Script QA evaluator.
// Pure TypeScript, no NocoBase dependency.
// PRD §6 (evaluateScriptQa) — scoring + overall_pass logic.
//
// Pass thresholds (PRD §6):
//   strategy_fit_score  >= 80
//   audience_fit_score  >= 80
//   voice_fit_score     >= 75
//   sales_logic_score   >= 80
//   fact_safety_score   >= 90
// overall_pass = true only when ALL five thresholds are met.

import type { ScriptQaReport, ConsumerStageEn } from './types';

// ── Input contract ──────────────────────────────────────────────────────────

export interface ScriptQaInput {
  strategy_fit_score: number;
  audience_fit_score: number;
  voice_fit_score: number;
  sales_logic_score: number;
  fact_safety_score: number;
  desire_stage_coverage: Record<ConsumerStageEn, boolean>;
  logic_block_alignment: string[];
  missing_parts: string[];
  revision_requests: string[];
}

// ── Pass thresholds ─────────────────────────────────────────────────────────

export const SCRIPT_QA_THRESHOLDS = {
  strategy_fit: 80,
  audience_fit: 80,
  voice_fit: 75,
  sales_logic: 80,
  fact_safety: 90,
} as const;

// ── Core function ───────────────────────────────────────────────────────────

export function evaluateScriptQa(input: ScriptQaInput): ScriptQaReport {
  const overall_pass =
    input.strategy_fit_score >= SCRIPT_QA_THRESHOLDS.strategy_fit &&
    input.audience_fit_score >= SCRIPT_QA_THRESHOLDS.audience_fit &&
    input.voice_fit_score >= SCRIPT_QA_THRESHOLDS.voice_fit &&
    input.sales_logic_score >= SCRIPT_QA_THRESHOLDS.sales_logic &&
    input.fact_safety_score >= SCRIPT_QA_THRESHOLDS.fact_safety;

  return {
    strategy_fit_score: input.strategy_fit_score,
    audience_fit_score: input.audience_fit_score,
    voice_fit_score: input.voice_fit_score,
    sales_logic_score: input.sales_logic_score,
    fact_safety_score: input.fact_safety_score,
    desire_stage_coverage: input.desire_stage_coverage,
    logic_block_alignment: input.logic_block_alignment,
    missing_parts: input.missing_parts,
    revision_requests: input.revision_requests,
    overall_pass,
  };
}
