// thumbnail-ab-flow.ts — 썸네일 9개 A/B PRD의 통합 진입점.
// 플러그인(plugin-orchestration)이 호출하는 상위 flow: 도메인 함수(matrix/psychology/ab-test)를
// 조합해 "9개 기획안 세트 제안", "A/B 로테이션 계획", "라운드 평가(승자+신뢰도)"를 한 번에 제공한다.
// 순수 도메인(부작용 없음). LLM 주입(deps)·결정론 폴백은 하위 함수가 담당.

import {
  buildThumbnailMatrix9,
  analyzeThumbnailPsychology,
  type ThumbnailMatrixInput,
  type ThumbnailMatrixDeps,
  type ThumbnailMatrixCandidate,
  type ThumbnailPsychologyAnalysis,
} from './thumbnail-matrix';
import {
  buildSequentialRotationPlan,
  scoreAbTestResults,
  computeConfidenceLevel,
  type AbTestResultInput,
  type SequentialRotationSlot,
  type ScoreAbTestResultsOutput,
  type ConfidenceLevel,
} from './thumbnail-ab-test';

/** proposeThumbnailSet 결과 — 9개 후보 + 후보별 심리분석. */
export interface ProposeThumbnailSetResult {
  candidates: ThumbnailMatrixCandidate[];
  analyses: ThumbnailPsychologyAnalysis[];
  source: 'llm' | 'fallback';
}

/**
 * PRD Stage A+B: 9개 썸네일 매트릭스 후보를 만들고, 각 후보의 클릭 이유 심리분석까지 수행한다.
 * 사장님 승인(G1) 대상 세트. analyses[i]는 candidates[i]에 대응(candidate_id로도 매칭 가능).
 */
export async function proposeThumbnailSet(
  input: ThumbnailMatrixInput,
  deps: ThumbnailMatrixDeps = {},
): Promise<ProposeThumbnailSetResult> {
  const { candidates, source } = await buildThumbnailMatrix9(input, deps);
  const analyses: ThumbnailPsychologyAnalysis[] = [];
  for (const candidate of candidates) {
    const { analysis } = await analyzeThumbnailPsychology(candidate, {
      ...deps,
      title: input.title,
    });
    analyses.push(analysis);
  }
  return { candidates, analyses, source };
}

/** PRD §6.2: 선택한 후보들의 순차 A/B 로테이션 계획(후보당 기본 2일). */
export function planAbRotation(
  candidateIds: string[],
  daysPerCandidate = 2,
): SequentialRotationSlot[] {
  return buildSequentialRotationPlan(candidateIds, daysPerCandidate);
}

/** evaluateAbRound 결과 — 점수 랭킹 + 승자 + 신뢰도. */
export interface EvaluateAbRoundResult {
  scored: ScoreAbTestResultsOutput;
  winner: ScoreAbTestResultsOutput['winner'];
  confidence: ConfidenceLevel;
}

/**
 * PRD §6~9: 한 라운드의 기간별 성과를 받아 점수화(CTR+watch_time+avg_duration)하고
 * 승자와 신뢰도(confidence_level)를 함께 반환한다. CTR 단독 판단 금지는 scoreAbTestResults가 보장.
 */
export function evaluateAbRound(results: AbTestResultInput[]): EvaluateAbRoundResult {
  const scored = scoreAbTestResults(results);
  return {
    scored,
    winner: scored.winner,
    confidence: computeConfidenceLevel(results),
  };
}
