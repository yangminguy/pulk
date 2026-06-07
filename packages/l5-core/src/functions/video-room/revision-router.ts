// revision-router.ts — Revision Router (PRD §16.15).
// Pure TypeScript, no NocoBase dependency.
//
// Maps ScriptQaReport.revision_requests strings to RevisionTarget enum values.
// Keywords are matched as substrings (case-insensitive) so minor phrasing
// differences in the revision_request text still route correctly.
//
// Mapping table (PRD §16.15):
//   시장맥락부족    → market_research_agent
//   타깃언어부족    → voc_research_agent
//   근거부족        → claim_verification_agent
//   듣고싶은말아님  → audience_fit_validator
//   재료부족        → script_material_pack_builder
//   세트논리        → cmo_strategy_agent
//   도입부약함      → intro_writer
//   파트약함        → logic_block_writer_a/b/c (all three)
//   연결어색        → script_integrator
//   말투안맞음      → founder_voice_agent
//   전략불일치      → cmo_script_qa_agent

import type { ScriptQaReport } from './types';
import { RevisionTarget } from './types';

// ── Keyword → targets mapping ───────────────────────────────────────────────

interface RoutingRule {
  keywords: string[];
  targets: RevisionTarget[];
}

const ROUTING_RULES: RoutingRule[] = [
  {
    keywords: ['시장맥락', '시장 맥락'],
    targets: [RevisionTarget.MarketResearchAgent],
  },
  {
    keywords: ['타깃언어', '타깃 언어'],
    targets: [RevisionTarget.VocResearchAgent],
  },
  {
    keywords: ['근거부족', '근거 부족'],
    targets: [RevisionTarget.ClaimVerificationAgent],
  },
  {
    keywords: ['듣고싶은말', '듣고 싶은 말'],
    targets: [RevisionTarget.AudienceFitValidator],
  },
  {
    keywords: ['재료부족', '재료 부족'],
    targets: [RevisionTarget.ScriptMaterialPackBuilder],
  },
  {
    keywords: ['세트논리', '세트 논리'],
    targets: [RevisionTarget.CmoStrategyAgent],
  },
  {
    keywords: ['도입부약함', '도입부 약함'],
    targets: [RevisionTarget.IntroWriter],
  },
  {
    keywords: ['파트약함', '파트 약함'],
    targets: [
      RevisionTarget.LogicBlockWriterA,
      RevisionTarget.LogicBlockWriterB,
      RevisionTarget.LogicBlockWriterC,
    ],
  },
  {
    keywords: ['연결어색', '연결 어색'],
    targets: [RevisionTarget.ScriptIntegrator],
  },
  {
    keywords: ['말투안맞음', '말투 안맞음', '말투 안 맞음'],
    targets: [RevisionTarget.FounderVoiceAgent],
  },
  {
    keywords: ['전략불일치', '전략 불일치'],
    targets: [RevisionTarget.CmoScriptQaAgent],
  },
];

// ── Core function ───────────────────────────────────────────────────────────

/**
 * Given a ScriptQaReport, inspect revision_requests and return the unique set
 * of RevisionTarget values that should receive the revision task.
 *
 * Returns an empty array when revision_requests is empty (overall_pass=true path).
 */
export function routeRevision(report: ScriptQaReport): RevisionTarget[] {
  const seen = new Set<RevisionTarget>();

  for (const request of report.revision_requests) {
    const lower = request.toLowerCase();
    for (const rule of ROUTING_RULES) {
      if (rule.keywords.some((kw) => lower.includes(kw.toLowerCase()))) {
        for (const target of rule.targets) {
          seen.add(target);
        }
      }
    }
  }

  return Array.from(seen);
}
