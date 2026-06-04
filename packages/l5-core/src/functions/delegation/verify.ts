// M6 — verifyByRequester: the requesting executive (e.g. CMO) scores the target
// executive's work against the delegation's acceptance_criteria.
//
// Pure l5-core: prompt builder + verdict parser only. The plugin runs the LLM
// (claude-cli, MCP off) and feeds the verdict into runDelegationLoop. This is a
// CHECKLIST verification (short, fast) — not a full deliverable — so it does not
// re-run the heavy tool loop. See EXECUTIVE_DELEGATION_SPEC.md §3.3.

import type { AgentRole } from '../../types/orchestration';
import type { VerifyVerdict } from './loop';

export interface VerificationInput {
  /** Requesting executive who verifies (e.g. CMO). */
  from_agent: AgentRole;
  /** Target executive whose work is being checked (e.g. CTO). */
  to_agent: AgentRole;
  objective: string;
  acceptance_criteria: string[];
  /** The target executive's AgentOutput (or any serialisable result). */
  workOutput: unknown;
}

/** Max chars of the work output embedded in the prompt (keeps tokens bounded). */
const MAX_OUTPUT_CHARS = 6000;

export function buildVerificationPrompt(input: VerificationInput): {
  system: string;
  user: string;
} {
  const system =
    `당신은 ${input.from_agent} 임원입니다. 다른 임원(${input.to_agent})에게 위임한 작업의 ` +
    `결과가 수용 기준을 모두 충족하는지 엄격하게 검증합니다. ` +
    `반드시 JSON 한 개로만 답하십시오: {"pass": boolean, "feedback": string}. ` +
    `pass=false면 feedback에 무엇이 부족한지와 다음 라운드에서 고쳐야 할 구체적 지시를 적으십시오. ` +
    `pass=true면 feedback은 빈 문자열로 두십시오.`;

  const criteria =
    input.acceptance_criteria.length > 0
      ? input.acceptance_criteria.map((c, i) => `${i + 1}. ${c}`).join('\n')
      : '(수용 기준 없음 — 목표 충족 여부로 판단)';

  const outputStr =
    typeof input.workOutput === 'string'
      ? input.workOutput
      : JSON.stringify(input.workOutput, null, 2);

  const user =
    `# 위임 목표\n${input.objective}\n\n` +
    `# 수용 기준(모두 충족해야 pass)\n${criteria}\n\n` +
    `# ${input.to_agent} 산출물\n${(outputStr ?? '').slice(0, MAX_OUTPUT_CHARS)}\n\n` +
    `위 산출물이 모든 수용 기준을 충족합니까? JSON으로만 답하십시오.`;

  return { system, user };
}

/**
 * Parse the verifier's reply into a VerifyVerdict.
 * Conservative: any unparseable / ambiguous reply is treated as pass=false so the
 * loop never resolves on a malformed response.
 */
export function parseVerdict(text: string): VerifyVerdict {
  const head = (text ?? '').trim().slice(0, 200);
  const match = (text ?? '').match(/\{[\s\S]*\}/);
  if (!match) {
    return { pass: false, feedback: `검증 응답 파싱 실패(JSON 없음): ${head}` };
  }
  try {
    const obj = JSON.parse(match[0]) as { pass?: unknown; feedback?: unknown };
    const pass = obj.pass === true;
    const feedback = typeof obj.feedback === 'string' ? obj.feedback : '';
    return { pass, feedback: pass ? '' : feedback || '수용 기준 미충족(사유 미기재)' };
  } catch {
    return { pass: false, feedback: `검증 응답 파싱 실패(JSON 오류): ${head}` };
  }
}
