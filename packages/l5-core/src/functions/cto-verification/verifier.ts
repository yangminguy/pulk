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
}

// expected_output phrasing that implies the phase must produce code/file changes.
const CODE_SIGNAL = /\b(implement|fix|refactor|test)\b|구현|수정|리팩터|작성|코드|함수/i;

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

  const system =
    'You are a CTO QA verifier. Given a phase task, expected output, and the resulting git diff + log tail, decide whether the work actually meets the expected output. Respond with a JSON object: {"verdict":"pass"|"fail"|"inconclusive","reason":string,"retry_recommended":boolean,"confidence":"high"|"medium"|"low"}. Do not include any other text.';

  const user = [
    `Task: ${input.task_title}`,
    `Expected output: ${input.expected_output}`,
    `Exit code: ${input.exit_code ?? 'n/a'}`,
    `Diff stat:\n${input.diff_summary || '(none)'}`,
    `Log tail:\n${input.log_tail || '(none)'}`,
  ].join('\n\n');

  let raw: string;
  try {
    raw = await llm.complete({ system, user });
  } catch {
    return deterministic;
  }

  try {
    const trimmed = raw.trim().replace(/^```json\s*|\s*```$/g, '');
    const parsed = JSON.parse(trimmed) as LLMVerdictShape;
    const verdict: VerifyCTOPhaseResult['verdict'] =
      parsed.verdict === 'pass' || parsed.verdict === 'fail' || parsed.verdict === 'inconclusive'
        ? parsed.verdict
        : deterministic.verdict;
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
  } catch {
    return deterministic;
  }
}
