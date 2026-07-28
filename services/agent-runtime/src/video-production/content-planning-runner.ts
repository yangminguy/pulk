// content-planning-runner.ts — Phase 3: 콘텐츠 기획 스킬 체인 러너.
//
// 거대 committed 기획 TS(key-content-draft/report, pulling-*, title-*, thumbnail-*,
// content-production)의 "오케스트레이션" 역할을 스킬 체인으로 대체하는 얇은 러너.
// 프롬프트/판단은 content-planning/ 스킬(SKILL.md)이, 순서·검증·게이트 카드 수집은 이 러너가
// 맡는다. 브릿지(createSkillExecutor, contract content_planning_v1)로 각 스킬을 실행한다.
//
// ★ committed 기획 TS는 이 러너가 라이브로 증명되기 전까지 그대로 둔다(fallback). 이 파일은
//   "스킬 경로 배선"이며, 기존 TS의 프롬프트 strip/archive는 라이브 회귀 검증 후속 작업이다.

import type { BridgeSkillInput } from './skill-executor.js';
import type { ProductionArtifactEnvelope, VideoProductionRun } from './runner.js';

/** 기획 스킬 순서 + 각 스킬이 채우는 게이트 리포트 stage(state-machine 정본과 일치). */
export const CONTENT_PLANNING_CHAIN = [
  { skill_id: 'content-key-plan', gate_stage: 'key_content_plan_doc' },
  { skill_id: 'content-pulling-research', gate_stage: 'pulling_plan_doc' },
  { skill_id: 'content-title-develop', gate_stage: 'title_development' },
  { skill_id: 'content-thumbnail-develop', gate_stage: 'thumbnail_plan' },
  { skill_id: 'content-script-draft', gate_stage: 'script_draft' },
] as const;

export type ContentPlanningSkillId = (typeof CONTENT_PLANNING_CHAIN)[number]['skill_id'];

export interface ContentPlanningDeps {
  /** 브릿지 executeSkill(createSkillExecutor(io, { contract: 'content_planning_v1' })). */
  executeSkill(input: BridgeSkillInput): Promise<ProductionArtifactEnvelope[]>;
  onProgress?(event: {
    skill_id: ContentPlanningSkillId;
    status: 'running' | 'completed' | 'blocked' | 'failed';
    completed: number;
    total: number;
    error?: string;
  }): Promise<void> | void;
}

export interface ContentPlanningResult {
  artifacts: ProductionArtifactEnvelope[];
  /** 산출된 게이트 리포트 stage(중복 제거) — l5-core missingGateReports/advanceStatus 입력. */
  presentCardStages: string[];
  /** status가 blocked인 산출물(사장님 검토 필요). */
  blocked: Array<{ skill_id: string; gate_stage?: string; issues: string[] }>;
}

/**
 * 기획 스킬 체인을 순서대로 실행한다. 각 스킬은 이전 스킬의 아티팩트를 prior로 받는다.
 * status가 blocked인 스킬은 체인을 멈추지 않고(부분 진행 허용) blocked에 기록한다 —
 * 게이트 전진 여부는 호출부(l5-core 게이트 로직)가 presentCardStages로 판단한다.
 * skill_ids로 일부만 재실행(리비전 라우팅)할 수 있다.
 */
export async function runContentPlanning(
  input: {
    run: VideoProductionRun;
    context: Record<string, unknown>;
    prior_artifacts?: ProductionArtifactEnvelope[];
    skill_ids?: ContentPlanningSkillId[];
  },
  deps: ContentPlanningDeps,
): Promise<ContentPlanningResult> {
  const artifacts: ProductionArtifactEnvelope[] = [...(input.prior_artifacts ?? [])];
  const blocked: ContentPlanningResult['blocked'] = [];
  const chain = input.skill_ids
    ? CONTENT_PLANNING_CHAIN.filter((s) => input.skill_ids!.includes(s.skill_id))
    : CONTENT_PLANNING_CHAIN;
  const total = chain.length;

  for (const [index, step] of chain.entries()) {
    await deps.onProgress?.({ skill_id: step.skill_id, status: 'running', completed: index, total });
    let produced: ProductionArtifactEnvelope[];
    try {
      produced = await deps.executeSkill({
        run: input.run,
        skill_id: step.skill_id,
        context: input.context,
        prior_artifacts: [...artifacts],
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await deps.onProgress?.({ skill_id: step.skill_id, status: 'failed', completed: index, total, error: message });
      throw new Error(`${step.skill_id} failed: ${message}`);
    }

    artifacts.push(...produced);
    const anyBlocked = produced.filter((a) => a.status === 'blocked');
    if (anyBlocked.length > 0) {
      blocked.push({
        skill_id: step.skill_id,
        gate_stage: step.gate_stage,
        issues: anyBlocked.flatMap((a) => a.issues),
      });
      await deps.onProgress?.({ skill_id: step.skill_id, status: 'blocked', completed: index + 1, total });
    } else {
      await deps.onProgress?.({ skill_id: step.skill_id, status: 'completed', completed: index + 1, total });
    }
  }

  // 게이트 카드 stage 수집 — blocked가 아닌(=검토 가능한 리포트가 있는) 산출물의 gate_stage만.
  const presentCardStages = [
    ...new Set(
      artifacts
        .filter((a) => a.status !== 'blocked' && typeof a.gate_stage === 'string')
        .map((a) => a.gate_stage as string),
    ),
  ];

  return { artifacts, presentCardStages, blocked };
}
