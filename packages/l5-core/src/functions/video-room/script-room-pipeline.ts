// script-room-pipeline.ts — E2E orchestration: Research → Brief.
//
// runScriptRoomToBrief calls every builder in the specified order,
// reusing existing pure functions. No Date / randomUUID calls here —
// all id/timestamp values must be injected via input.
//
// Gate enforcement:
//   - Research Gate (1) failure → throws immediately (조사 선행 강제).
//   - Empty ScriptMaterialPack → throws (조사/재료표 선행 필요).

import { buildMarketResearchPack, type BuildMarketResearchPackInput } from './market-research';
import { buildVoiceOfCustomerPack } from './voc-research';
import { buildClaimEvidenceReport, type BuildClaimEvidenceReportInput } from './claim-verification';
import { evaluateAudienceFit, type AudienceFitInput } from './audience-fit';
import { evaluateResearchGate } from './research-gate';
import { buildScriptMaterialPack } from './script-material-pack';
import { buildCmoVideoStrategyBrief, type StrategyBriefInput } from './strategy-brief';
import { buildIntro30s } from './intro-writer';
import { writeLogicBlockPart } from './logic-block-writers';
import { integrateScript } from './script-integrator';
import { transformToFounderVoice, type VoiceSource } from './founder-voice';
import { evaluateScriptQa, type ScriptQaInput } from './script-qa';
import { buildVideoExecutionBrief } from './video-execution-brief';

import type {
  VoiceOfCustomerPack,
  ClaimEvidenceReport,
  VideoExecutionBrief,
  ScriptQaReport,
  ConsumerStageEn,
  PreferredAssetType,
} from './types';

// ── Sub-input shapes ─────────────────────────────────────────────────────────

export interface PipelineMarketResearchInput
  extends Omit<BuildMarketResearchPackInput, 'viewtrap_references'> {}

export interface PipelineClaimInput extends BuildClaimEvidenceReportInput {}

export interface PipelineAudienceFitInput extends AudienceFitInput {}

export interface PipelineQaInput extends ScriptQaInput {}

// ── Top-level input ──────────────────────────────────────────────────────────

export interface RunScriptRoomToBriefInput {
  /** Injected ids — pipeline never generates ids or timestamps. */
  content_card_id: string;
  content_type: 'key' | 'pulling';
  title: string;

  // ── Step 1–3: Research packs (raw input, builder called internally) ────────
  market_research: PipelineMarketResearchInput;
  voc: Partial<VoiceOfCustomerPack>;
  claim: PipelineClaimInput;

  // ── Step 4: Audience fit scores ────────────────────────────────────────────
  audience_fit: PipelineAudienceFitInput;

  // ── Step 6: ScriptMaterialPack context ────────────────────────────────────
  topic: string;
  target_viewer: string;

  // ── Step 7: Strategy brief channel context ─────────────────────────────────
  strategy_input: Omit<StrategyBriefInput, 'script_material_pack' | 'audience_fit_report' | 'content_id' | 'content_type'>;

  // ── Step 9–10: Founder voice sources (may be empty) ───────────────────────
  voice_sources?: VoiceSource[];

  // ── Step 11: Script QA scores (caller-injected, no LLM here) ──────────────
  qa_input: PipelineQaInput;

  // ── Optional pass-through fields for VideoExecutionBrief ──────────────────
  source_pack_ids?: {
    market_research_pack_id?: string;
    voc_pack_id?: string;
    claim_evidence_report_id?: string;
    script_material_pack_id?: string;
  };
  used_insights?: {
    thumbnail?: string[];
    script?: string[];
    founder_voice?: string[];
  };
  asset_requests?: {
    need: string;
    preferred_asset_type: PreferredAssetType;
    reason: string;
  }[];
  constraints?: {
    tone?: string;
    avoid?: string[];
    format?: 'youtube_16_9' | 'shorts_9_16';
  };
}

// ── Output ───────────────────────────────────────────────────────────────────

export interface ScriptRoomToBriefResult {
  brief: VideoExecutionBrief;
  qa: ScriptQaReport;
}

// ── Main orchestrator ─────────────────────────────────────────────────────────

/**
 * runScriptRoomToBrief — pure E2E pipeline from research to VideoExecutionBrief.
 *
 * Order of calls:
 *   1. buildMarketResearchPack
 *   2. buildVoiceOfCustomerPack
 *   3. buildClaimEvidenceReport
 *   4. evaluateAudienceFit
 *   5. evaluateResearchGate  → throws if Gate 1 fails
 *   6. buildScriptMaterialPack → throws if empty
 *   7. buildCmoVideoStrategyBrief
 *   8. buildIntro30s
 *   9. writeLogicBlockPart (for each logic_block)
 *  10. integrateScript
 *  11. transformToFounderVoice
 *  12. evaluateScriptQa
 *  13. buildVideoExecutionBrief
 *
 * Throws for:
 *   - Research Gate (1) failure (message includes gate reasons)
 *   - Empty ScriptMaterialPack (re-thrown from buildCmoVideoStrategyBrief)
 *   - Any downstream builder validation error
 *
 * All id/timestamp values must be injected by the caller; this function
 * never calls Date or randomUUID.
 */
export function runScriptRoomToBrief(
  input: RunScriptRoomToBriefInput,
): ScriptRoomToBriefResult {
  // ── Step 1: Market Research Pack ──────────────────────────────────────────
  const marketResearchPack = buildMarketResearchPack(input.market_research);

  // ── Step 2: Voice of Customer Pack ───────────────────────────────────────
  const vocPack = buildVoiceOfCustomerPack(input.voc);

  // ── Step 3: Claim Evidence Report ────────────────────────────────────────
  const claimReport = buildClaimEvidenceReport(input.claim);

  // ── Step 4: Audience Fit ─────────────────────────────────────────────────
  const audienceFit = evaluateAudienceFit(input.audience_fit);

  // ── Step 5: Research Gate (1) ─────────────────────────────────────────────
  const gateResult = evaluateResearchGate({
    market: marketResearchPack,
    voc: vocPack,
    claim: claimReport,
    audienceFit,
  });

  if (!gateResult.passed) {
    throw new Error(
      `Research Gate(1) 미통과 — 조사 선행 필요: ${gateResult.reasons.join('; ')}`,
    );
  }

  // ── Step 6: Script Material Pack ─────────────────────────────────────────
  // buildCmoVideoStrategyBrief will throw if the pack is empty (test-7),
  // but we also need the pack for intro-writer and logic-block-writers.
  const scriptMaterialPack = buildScriptMaterialPack({
    topic: input.topic,
    target_viewer: input.target_viewer,
    market_research: marketResearchPack,
    voc: vocPack,
    claim_evidence: claimReport,
    audience_fit: audienceFit,
  });

  // ── Step 7: CMO Video Strategy Brief ─────────────────────────────────────
  const strategyBrief = buildCmoVideoStrategyBrief({
    content_id: input.content_card_id,
    content_type: input.content_type,
    channel_context: input.strategy_input.channel_context,
    script_material_pack: scriptMaterialPack,
    audience_fit_report: audienceFit,
  });

  // ── Step 8: Intro 30s ─────────────────────────────────────────────────────
  const intro30s = buildIntro30s({
    brief: strategyBrief,
    materials: scriptMaterialPack,
    voc: vocPack,
  });

  // ── Step 9: Logic Block Parts (one per block) ─────────────────────────────
  const sharedContext = {
    brief: strategyBrief,
    materials: scriptMaterialPack,
    voc: vocPack,
    claims: claimReport,
  };

  const scriptParts = strategyBrief.logic_blocks.map((block) =>
    writeLogicBlockPart({ block, shared: sharedContext }),
  );

  // ── Step 10: Integrate Script ─────────────────────────────────────────────
  const integrated = integrateScript({
    intro: intro30s,
    parts: scriptParts,
    brief: strategyBrief,
  });

  // ── Step 11: Founder Voice ────────────────────────────────────────────────
  const voiceMatched = transformToFounderVoice({
    script: integrated,
    voiceSources: input.voice_sources ?? [],
  });

  // ── Step 12: Script QA ────────────────────────────────────────────────────
  const qa = evaluateScriptQa(input.qa_input);

  // ── Step 13: VideoExecutionBrief ──────────────────────────────────────────
  const brief = buildVideoExecutionBrief({
    content_card_id: input.content_card_id,
    content_type: input.content_type,
    title: input.title,
    strategy_brief: strategyBrief,
    voice_matched_script: voiceMatched,
    intro_30s: intro30s.script,
    source_pack_ids: input.source_pack_ids,
    used_insights: input.used_insights,
    asset_requests: input.asset_requests,
    constraints: input.constraints,
  });

  return { brief, qa };
}
