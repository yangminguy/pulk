/**
 * Phase 18 — CTO Clarification Headless Handler
 *
 * ACR가 phase 실행 중 `clarifyingQuestions[]`를 생성해 L5에 보내면, CTO가 LLM으로
 * 답변을 합성한다. 위험 등급이 D4 이상이면 LLM에 묻지 않고 즉시 Founder escalate.
 *
 * Verdict semantics:
 *   - "answered":  D1-D3 + LLM 응답 확보 → ACR로 답변 회신
 *   - "escalate":  D4-D5 또는 LLM 실패/공백 → Founder 승인 대기 (needs_review)
 */
import type { LLMClient } from '../ceo-orchestration/types';

export interface AnswerClarificationInput {
  task_title: string;
  expected_output: string;
  risk_level: 'D1' | 'D2' | 'D3' | 'D4' | 'D5';
  questions: string[];
  context?: string;
}

export interface AnswerClarificationResult {
  verdict: 'answered' | 'escalate';
  answers: string[];
  reason: string;
}

const ESCALATE_LEVELS = new Set(['D4', 'D5']);

function escalateResult(reason: string, questions: string[]): AnswerClarificationResult {
  return {
    verdict: 'escalate',
    answers: questions.map(() => ''),
    reason,
  };
}

export async function answerClarifications(
  input: AnswerClarificationInput,
  llm?: LLMClient,
): Promise<AnswerClarificationResult> {
  const questions = (input.questions ?? []).filter((q) => typeof q === 'string' && q.trim().length > 0);
  if (questions.length === 0) {
    return { verdict: 'answered', answers: [], reason: 'no questions provided' };
  }

  if (ESCALATE_LEVELS.has(input.risk_level)) {
    return escalateResult(`risk ${input.risk_level} requires founder approval`, questions);
  }

  if (!llm) {
    return escalateResult('no LLM available for headless answer', questions);
  }

  const system =
    'You are a CTO answering clarification questions raised by an execution agent. ' +
    'Answer each question concisely and decisively so the agent can continue. ' +
    'Respond with a JSON object: {"answers": string[]} where answers.length matches questions.length. ' +
    'No prose, no markdown fences.';

  const user = [
    `Task: ${input.task_title}`,
    `Expected output: ${input.expected_output}`,
    `Risk level: ${input.risk_level}`,
    input.context ? `Context:\n${input.context}` : null,
    `Questions:\n${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  let raw: string;
  try {
    raw = await llm.complete({ system, user });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return escalateResult(`llm threw: ${msg}`, questions);
  }

  let parsed: { answers?: unknown } | null = null;
  try {
    const trimmed = raw.trim().replace(/^```json\s*|\s*```$/g, '');
    parsed = JSON.parse(trimmed);
  } catch {
    return escalateResult('llm output not parseable as json', questions);
  }

  const rawAnswers = Array.isArray(parsed?.answers) ? parsed!.answers : [];
  const answers = rawAnswers.map((a) => (typeof a === 'string' ? a.trim() : ''));

  if (answers.length !== questions.length || answers.some((a) => a.length === 0)) {
    return escalateResult(
      `llm returned ${answers.length}/${questions.length} valid answers`,
      questions,
    );
  }

  return {
    verdict: 'answered',
    answers,
    reason: `CTO answered ${answers.length} question(s) at risk ${input.risk_level}`,
  };
}
