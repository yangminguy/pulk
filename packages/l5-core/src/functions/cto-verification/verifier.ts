/**
 * Phase 17 — CTO Result Verification Gate
 *
 * ACR가 exit code 0으로 끝낸 phase의 결과가 실제로 expected_output을 충족했는지
 * 다시 평가한다. ACR runner는 git diff와 log tail을 callback으로 전달하므로
 * 이를 입력으로 받아 deterministic rule + 선택적 LLM 평가를 수행한다.
 *
 * Verdict semantics:
 *   - "pass":         결과가 expected_output을 충족했다고 판단됨 → task 'done'
 *   - "fail":         exit_code≠0 또는 명백한 에러/누락 → task 'needs_review' + retry 권장
 *   - "inconclusive": 판단 근거 부족 (LLM 미사용 + 신호 약함) → 'needs_review' but no retry
 */

import type { LLMClient } from '../ceo-orchestration/types';
import { completeJsonWithRetry } from '../llm-json';

export interface VerifyCTOPhaseInput {
  task_title: string;
  expected_output: string;
  diff_summary?: string;
  log_tail?: string;
  exit_code?: number;
  /**
   * Number of files changed (from `git diff --stat`). When the ACR runner reports
   * this, the verifier can fail a code phase that landed zero changes even though
   * the process exited 0. Falls back to parsing diff_summary when omitted.
   */
  changed_files?: number;
  /**
   * Number of *pre-existing* files modified (not newly created). When the ACR
   * runner reports this, the verifier can detect the "orphaned deliverable"
   * failure mode of an integrate phase: new files added but no existing entry
   * point touched, i.e. the work was never wired in. Omitted → graceful (the
   * weaker no-change rule still applies).
   */
  modified_existing_files?: number;
  /**
   * S6 — 계획 단계에서 정의된 측정 가능 완료 조건. 주어지면 LLM verifier가
   * regex 표면 신호 대신 조건별로 충족 여부를 판정한다.
   */
  acceptance_criteria?: string[];
}

// expected_output phrasing that implies the phase must produce code/file changes.
const CODE_SIGNAL = /\b(implement|fix|refactor|test)\b|구현|수정|리팩터|작성|코드|함수/i;

// expected_output phrasing for an integrate/wiring phase, whose whole point is to
// connect a new deliverable into existing entry points. A phase like this that
// changed nothing — or only added new files without touching any existing file —
// left the deliverable orphaned (the exact "built but not wired" failure mode).
const INTEGRATION_SIGNAL =
  /\b(integrate|integration|wir(?:e|ing)|register|barrel|orchestrator)\b|통합|배선|등록|배럴|진입점/i;

/**
 * True when a phase *name* denotes an integrate/wiring phase. The callback
 * handler uses this to run the orphan check on this phase's own completion
 * (phase_complete) rather than only at all_done. Matches the SOP phase name
 * "통합·배선" plus English/keyword variants.
 */
export function isIntegratePhaseName(phaseName?: string | null): boolean {
  return typeof phaseName === 'string' && /통합|배선|integrate|wir(?:e|ing)/i.test(phaseName);
}

/** Files changed: explicit count if given, else parsed from a `git diff --stat` summary. */
function countChangedFiles(input: VerifyCTOPhaseInput): number | undefined {
  if (typeof input.changed_files === 'number') return input.changed_files;
  const m = (input.diff_summary ?? '').match(/(\d+)\s+files?\s+changed/);
  return m ? parseInt(m[1]!, 10) : undefined;
}

export interface VerifyCTOPhaseResult {
  verdict: 'pass' | 'fail' | 'inconclusive';
  reason: string;
  retry_recommended: boolean;
  confidence: 'high' | 'medium' | 'low';
}

const ERROR_TOKENS = [
  '[ERROR]',
  '[REVIEW_BLOCKED]',
  '[BOUNDARY]',
  'Traceback (most recent call last)',
  'panic:',
  'fatal:',
];

/**
 * Deterministic verifier. No LLM call. Uses exit code + log/diff heuristics.
 */
export function verifyCTOPhaseDeterministic(
  input: VerifyCTOPhaseInput,
): VerifyCTOPhaseResult {
  // Hard fail: non-zero exit.
  if (typeof input.exit_code === 'number' && input.exit_code !== 0) {
    return {
      verdict: 'fail',
      reason: `Process exited with code ${input.exit_code}`,
      retry_recommended: true,
      confidence: 'high',
    };
  }

  const log = input.log_tail ?? '';
  const matchedError = ERROR_TOKENS.find((tok) => log.includes(tok));
  if (matchedError) {
    return {
      verdict: 'fail',
      reason: `Log contains ${matchedError}`,
      retry_recommended: true,
      confidence: 'high',
    };
  }

  const diff = (input.diff_summary ?? '').trim();

  // False-positive guard: a code-producing phase that changed zero files is a
  // real failure even on exit 0 (e.g. an "implement" phase whose diff_summary is
  // noise but changed_files=0). Code intent overrides the read-only hint below.
  const expectsCode = CODE_SIGNAL.test(input.expected_output ?? '');
  const changedFiles = countChangedFiles(input);
  const noChange = changedFiles === 0 || (changedFiles === undefined && !diff);
  if (expectsCode && noChange) {
    return {
      verdict: 'fail',
      reason: 'expected_output requires code changes but no files were changed',
      retry_recommended: true,
      confidence: 'high',
    };
  }

  // Integrate/wiring phase: the deliverable must be connected into existing
  // entry points. Two orphan signals fail it on exit 0:
  //   (a) nothing changed at all — nothing was wired;
  //   (b) files changed but no pre-existing file was modified — only new files
  //       were added, so the deliverable is still unreferenced.
  // (b) requires modified_existing_files from the runner; absent → skip (graceful).
  const expectsIntegration = INTEGRATION_SIGNAL.test(input.expected_output ?? '');
  if (expectsIntegration) {
    if (noChange) {
      return {
        verdict: 'fail',
        reason: 'integrate phase changed nothing — deliverable left unwired',
        retry_recommended: true,
        confidence: 'high',
      };
    }
    if (
      typeof input.modified_existing_files === 'number' &&
      input.modified_existing_files === 0 &&
      (changedFiles ?? 0) > 0
    ) {
      return {
        verdict: 'fail',
        reason:
          'integrate phase added new files but modified no existing entry point — deliverable is orphaned',
        retry_recommended: true,
        confidence: 'high',
      };
    }
  }

  // No diff at all may indicate the agent did nothing (unless expected_output
  // says read-only verification, which we can't detect deterministically).
  const readOnlyHint = /\b(read|review|inspect|verify|audit)\b/i.test(
    input.expected_output ?? '',
  );
  if (!diff && !readOnlyHint) {
    return {
      verdict: 'inconclusive',
      reason: 'No diff produced and expected_output suggests changes',
      retry_recommended: false,
      confidence: 'medium',
    };
  }

  return {
    verdict: 'pass',
    reason: diff
      ? `Exit 0 with ${diff.split('\n').length} diff lines and no error tokens`
      : 'Exit 0, no error tokens, read-only task',
    retry_recommended: false,
    confidence: diff ? 'high' : 'medium',
  };
}

interface LLMVerdictShape {
  verdict?: string;
  reason?: string;
  retry_recommended?: boolean;
  confidence?: string;
}

/**
 * LLM-augmented verifier. Falls back to deterministic on parse failure.
 */
export async function verifyCTOPhase(
  input: VerifyCTOPhaseInput,
  llm?: LLMClient,
): Promise<VerifyCTOPhaseResult> {
  const deterministic = verifyCTOPhaseDeterministic(input);
  // If exit code is non-zero, no point asking the LLM — deterministic fail wins.
  if (deterministic.verdict === 'fail' && deterministic.confidence === 'high') {
    return deterministic;
  }
  if (!llm) return deterministic;

  // S6 — acceptance criteria가 있으면 조건별 판정을, 없으면 기존 expected_output
  // 대비 판정을 요구한다. S4 — 파싱은 llm-json 재시도 경로로 강제한다.
  const hasCriteria = (input.acceptance_criteria?.length ?? 0) > 0;
  const system = hasCriteria
    ? 'You are a CTO QA verifier. Judge the work against EACH acceptance criterion using the git diff + log tail as evidence. The overall verdict is "pass" only if every criterion is met (or is clearly out of this phase\'s scope). Respond with a JSON object: {"verdict":"pass"|"fail"|"inconclusive","reason":string,"retry_recommended":boolean,"confidence":"high"|"medium"|"low","criteria":[{"criterion":string,"met":boolean|null,"evidence":string}]}. Do not include any other text.'
    : 'You are a CTO QA verifier. Given a phase task, expected output, and the resulting git diff + log tail, decide whether the work actually meets the expected output. Respond with a JSON object: {"verdict":"pass"|"fail"|"inconclusive","reason":string,"retry_recommended":boolean,"confidence":"high"|"medium"|"low"}. Do not include any other text.';

  const user = [
    `Task: ${input.task_title}`,
    `Expected output: ${input.expected_output}`,
    ...(hasCriteria
      ? [
          `Acceptance criteria:\n${input
            .acceptance_criteria!.map((c, i) => `${i + 1}. ${c}`)
            .join('\n')}`,
        ]
      : []),
    `Exit code: ${input.exit_code ?? 'n/a'}`,
    `Diff stat:\n${input.diff_summary || '(none)'}`,
    `Log tail:\n${input.log_tail || '(none)'}`,
  ].join('\n\n');

  const { value: parsed } = await completeJsonWithRetry<LLMVerdictShape>(llm, {
    system,
    user,
    trace_name: 'cto.verifyPhase',
    validate: (v) => {
      if (!v || typeof v !== 'object') return null;
      const o = v as LLMVerdictShape;
      if (o.verdict !== 'pass' && o.verdict !== 'fail' && o.verdict !== 'inconclusive') {
        return null;
      }
      return o;
    },
  });
  if (!parsed) return deterministic;

  const verdict = parsed.verdict as VerifyCTOPhaseResult['verdict'];
  const confidence: VerifyCTOPhaseResult['confidence'] =
    parsed.confidence === 'high' || parsed.confidence === 'medium' || parsed.confidence === 'low'
      ? parsed.confidence
      : 'medium';
  return {
    verdict,
    reason: typeof parsed.reason === 'string' ? parsed.reason : deterministic.reason,
    retry_recommended:
      typeof parsed.retry_recommended === 'boolean'
        ? parsed.retry_recommended
        : verdict === 'fail',
    confidence,
  };
}

/**
 * Deterministic orphan check for an integrate phase at its OWN completion
 * (phase_complete), not at all_done. Reuses verifyCTOPhaseDeterministic by
 * forcing the integration signal on, so an integrate phase that changed nothing
 * — or only added new files without touching an existing entry point — fails and
 * is retried. No LLM: judging an intermediate phase against the task's full
 * expected_output would false-fail; this judges only wiring, from the phase's own
 * file-change counts. Because each phase commits before its callback, the
 * changed_files/modified_existing_files reported here are this phase's diff alone.
 */
export function verifyIntegratePhase(input: VerifyCTOPhaseInput): VerifyCTOPhaseResult {
  return verifyCTOPhaseDeterministic({
    ...input,
    expected_output: `[integrate] 통합·배선: 신규 산출물을 기존 진입점에 등록·연결한다. ${input.expected_output ?? ''}`,
  });
}
