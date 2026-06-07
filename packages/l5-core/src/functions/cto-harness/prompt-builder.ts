// CTO Harness — Main Agent 프롬프트 빌더 (PRD §7.1 / §29).
//
// MainAgentWorkPackage를 받아, 메인 에이전트(claude-code / codex / antigravity)에게
// 전달할 9블록 프롬프트 문자열을 결정적으로 생성한다. 네트워크·I/O 없음, 순수 함수.
//
// 9블록:
//   1. ROLE
//   2. OBJECTIVE
//   3. SCOPE
//   4. ALLOWED FILES
//   5. BLOCKED FILES
//   6. INTERNAL AGENT TEAM INSTRUCTION
//   7. VERIFICATION REQUIREMENTS
//   8. OUTPUT CONTRACT
//   9. STOP CONDITIONS

import type { MainAgent, MainAgentWorkPackage } from './types';

/** 각 메인 에이전트의 한 줄 역할 설명 (ROLE 블록 헤더 문구). */
export const AGENT_ROLE_HEADERS: Record<MainAgent, string> = {
  'claude-code':
    'You are claude-code, the implementation main agent. Write production code to satisfy the objective.',
  codex:
    'You are codex, the verification main agent. Review and verify the implementation, do not introduce unrelated changes.',
  antigravity:
    'You are antigravity, the UI/QA main agent. Implement and visually verify UI behavior and accessibility.',
};

/** 메인 에이전트별 내부 팀 운영 안내 문구 (solo 모드가 아닐 때 사용). */
const AGENT_TEAM_GUIDANCE: Record<MainAgent, string> = {
  'claude-code':
    'When using internal sub-agents, split implementation by module and keep one reviewer pass before finishing.',
  codex:
    'When using internal sub-agents, assign one to re-derive expected behavior and one to challenge the diff adversarially.',
  antigravity:
    'When using internal sub-agents, separate UI implementation from QA/visual verification roles.',
};

// blockedFiles/allowedFiles 등 목록을 bullet 문자열로 렌더한다. 비면 '(none)'.
function renderList(items: readonly string[]): string {
  if (items.length === 0) return '  (none)';
  return items.map((item) => `  - ${item}`).join('\n');
}

/**
 * MainAgentWorkPackage로부터 9블록 메인 에이전트 프롬프트를 생성한다.
 * 모든 분기(에이전트별 ROLE, executionMode, 내부역할)는 결정적이다.
 */
export function buildMainAgentPrompt(pkg: MainAgentWorkPackage): string {
  const agent = pkg.assignedMainAgent;
  const roleHeader = AGENT_ROLE_HEADERS[agent];

  // 6) INTERNAL AGENT TEAM INSTRUCTION — solo면 단독 작업 안내, 아니면 팀 안내.
  const isSolo = pkg.executionMode === 'solo';
  const rolesLine =
    pkg.orchestrationHint.recommendedInternalRoles.length > 0
      ? pkg.orchestrationHint.recommendedInternalRoles.join(', ')
      : '(none)';

  let teamInstruction: string;
  if (isSolo) {
    teamInstruction = [
      `Execution mode: solo. Work alone without internal sub-agents or an internal team.`,
      `Do NOT spawn sub-agents. Keep the change minimal and focused.`,
    ].join('\n');
  } else {
    teamInstruction = [
      `Execution mode: ${pkg.executionMode}.`,
      `useSubAgents=${pkg.orchestrationHint.useSubAgents}, useInternalTeam=${pkg.orchestrationHint.useInternalTeam}.`,
      `Recommended internal roles: ${rolesLine}.`,
      `Max internal steps: ${pkg.orchestrationHint.maxInternalSteps}.`,
      `avoidOverEngineering=${pkg.orchestrationHint.avoidOverEngineering}.`,
      pkg.orchestrationHint.reason
        ? `Reason for team/sub-agents: ${pkg.orchestrationHint.reason}.`
        : `Reason for team/sub-agents: (not provided).`,
      AGENT_TEAM_GUIDANCE[agent],
    ].join('\n');
  }

  // 7) VERIFICATION REQUIREMENTS — requiredChecks 나열 + optionalChecks.
  const requiredChecksBlock =
    pkg.verificationProfile.requiredChecks.length > 0
      ? pkg.verificationProfile.requiredChecks.map((c) => `  - ${c} (required)`).join('\n')
      : '  (none)';
  const optionalChecksBlock =
    pkg.verificationProfile.optionalChecks.length > 0
      ? pkg.verificationProfile.optionalChecks.map((c) => `  - ${c} (optional)`).join('\n')
      : '  (none)';

  // 8) OUTPUT CONTRACT — PRD JSON 스키마.
  const outputContract = [
    'Return exactly one JSON object matching this schema (no prose outside the JSON):',
    '{',
    '  "status": "passed" | "failed" | "blocked" | "needs_approval" | "boundary_violation",',
    '  "summary": string,',
    '  "changedFiles": string[],',
    '  "checks": { "typecheck"?: "pass"|"fail"|"skipped", "lint"?: ..., "test"?: ..., "build"?: ..., "playwright"?: ..., "boundary"?: ... },',
    '  "risks": string[],',
    '  "nextAction": string,',
    '  "handoff": string',
    '}',
    `outputContract type: ${pkg.outputContract}.`,
  ].join('\n');

  // 9) STOP CONDITIONS — 5개.
  const stopConditions = [
    '  1. You must NOT modify any file listed under BLOCKED FILES.',
    '  2. You must NOT add, remove, or upgrade any dependency (package.json / lockfile).',
    '  3. You must NOT modify environment variables, secrets, or env/config files.',
    '  4. You must NOT run production, deploy, or release commands.',
    '  5. You must NOT exceed the declared SCOPE / ALLOWED FILES; stop and report instead.',
  ].join('\n');

  const blocks = [
    `# 1. ROLE`,
    roleHeader,
    ``,
    `# 2. OBJECTIVE`,
    pkg.objective,
    ``,
    `# 3. SCOPE`,
    `Included domains: ${
      pkg.scope.includedDomains.length > 0 ? pkg.scope.includedDomains.join(', ') : '(none)'
    }`,
    `Expected outputs:`,
    renderList(pkg.scope.expectedOutputs),
    `Acceptance criteria:`,
    renderList(pkg.acceptanceCriteria),
    `Risk level: ${pkg.riskLevel}`,
    ``,
    `# 4. ALLOWED FILES`,
    renderList(pkg.scope.allowedFiles),
    ``,
    `# 5. BLOCKED FILES`,
    renderList(pkg.scope.blockedFiles),
    ``,
    `# 6. INTERNAL AGENT TEAM INSTRUCTION`,
    teamInstruction,
    ``,
    `# 7. VERIFICATION REQUIREMENTS`,
    requiredChecksBlock,
    optionalChecksBlock,
    ``,
    `# 8. OUTPUT CONTRACT`,
    outputContract,
    ``,
    `# 9. STOP CONDITIONS`,
    stopConditions,
  ];

  return blocks.join('\n');
}
