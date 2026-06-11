import { buildMainAgentPrompt, AGENT_ROLE_HEADERS } from '../prompt-builder';
import type { MainAgent, MainAgentWorkPackage } from '../types';

// 테스트용 기본 Work Package 팩토리. overrides로 분기별 케이스를 만든다.
function makePackage(overrides: Partial<MainAgentWorkPackage> = {}): MainAgentWorkPackage {
  return {
    packageId: 'pkg-1',
    parentTaskId: 'task-1',
    parentPlanId: 'plan-1',
    assignedMainAgent: 'claude-code',
    objective: 'Implement the login API endpoint.',
    scope: {
      includedDomains: ['api'],
      allowedFiles: ['src/api/login.ts', 'src/api/__tests__/login.test.ts'],
      blockedFiles: ['package.json', '.env'],
      expectedOutputs: ['login.ts patch', 'login.test.ts patch'],
    },
    orchestrationHint: {
      useSubAgents: false,
      useInternalTeam: false,
      recommendedInternalRoles: [],
      maxInternalSteps: 1,
      avoidOverEngineering: true,
      reason: undefined,
    },
    executionMode: 'solo',
    verificationProfile: {
      requiredChecks: ['typecheck', 'test'],
      optionalChecks: ['lint'],
    },
    acceptanceCriteria: ['Returns 200 on valid credentials'],
    outputContract: 'patch',
    dependencies: [],
    riskLevel: 'D1',
    ...overrides,
  };
}

const BLOCK_HEADERS = [
  '# 1. ROLE',
  '# 2. OBJECTIVE',
  '# 3. SCOPE',
  '# 4. ALLOWED FILES',
  '# 5. BLOCKED FILES',
  '# 6. INTERNAL AGENT TEAM INSTRUCTION',
  '# 7. VERIFICATION REQUIREMENTS',
  '# 8. OUTPUT CONTRACT',
  '# 9. STOP CONDITIONS',
];

describe('buildMainAgentPrompt', () => {
  it('9개 블록 헤더를 모두 포함한다', () => {
    const out = buildMainAgentPrompt(makePackage());
    for (const header of BLOCK_HEADERS) {
      expect(out).toContain(header);
    }
  });

  it('allowedFiles 내용이 프롬프트에 들어간다', () => {
    const out = buildMainAgentPrompt(makePackage());
    expect(out).toContain('src/api/login.ts');
    expect(out).toContain('src/api/__tests__/login.test.ts');
  });

  it('blockedFiles 내용이 프롬프트에 들어간다', () => {
    const out = buildMainAgentPrompt(makePackage());
    expect(out).toContain('package.json');
    expect(out).toContain('.env');
  });

  it('objective와 acceptance criteria가 들어간다', () => {
    const out = buildMainAgentPrompt(makePackage());
    expect(out).toContain('Implement the login API endpoint.');
    expect(out).toContain('Returns 200 on valid credentials');
  });

  it('requiredChecks가 (required) 표기로 나열된다', () => {
    const out = buildMainAgentPrompt(makePackage());
    expect(out).toContain('typecheck (required)');
    expect(out).toContain('test (required)');
    expect(out).toContain('lint (optional)');
  });

  it('OUTPUT CONTRACT가 JSON 스키마 필드를 포함한다', () => {
    const out = buildMainAgentPrompt(makePackage());
    for (const field of [
      '"status"',
      '"summary"',
      '"changedFiles"',
      '"checks"',
      '"risks"',
      '"nextAction"',
      '"handoff"',
    ]) {
      expect(out).toContain(field);
    }
  });

  it('STOP CONDITIONS 5개(blocked/dependency/env/production/scope)를 포함한다', () => {
    const out = buildMainAgentPrompt(makePackage());
    expect(out).toMatch(/BLOCKED FILES/);
    expect(out).toContain('add, remove, or upgrade any dependency');
    expect(out).toContain('environment variables');
    expect(out).toContain('production, deploy, or release');
    expect(out).toContain('exceed the declared SCOPE');
    // 5개의 번호 매겨진 stop condition 라인이 있어야 한다.
    expect(out).toMatch(/  1\. /);
    expect(out).toMatch(/  5\. /);
  });

  it('solo 모드면 solo 안내와 sub-agent 금지 문구가 들어간다', () => {
    const out = buildMainAgentPrompt(makePackage({ executionMode: 'solo' }));
    expect(out).toContain('Execution mode: solo');
    expect(out).toContain('Do NOT spawn sub-agents');
  });

  it('팀 모드면 executionMode와 추천 내부역할이 반영된다', () => {
    const out = buildMainAgentPrompt(
      makePackage({
        executionMode: 'internal_parallel_team',
        orchestrationHint: {
          useSubAgents: true,
          useInternalTeam: true,
          recommendedInternalRoles: ['implementer', 'reviewer'],
          maxInternalSteps: 4,
          avoidOverEngineering: true,
          reason: 'high complexity multi-module change',
        },
      }),
    );
    expect(out).toContain('Execution mode: internal_parallel_team');
    expect(out).toContain('implementer, reviewer');
    expect(out).toContain('Max internal steps: 4');
    expect(out).toContain('high complexity multi-module change');
    expect(out).not.toContain('Do NOT spawn sub-agents');
  });

  it('팀 모드에서 reason이 없으면 not provided로 표기된다', () => {
    const out = buildMainAgentPrompt(
      makePackage({
        executionMode: 'solo_with_subagents',
        orchestrationHint: {
          useSubAgents: true,
          useInternalTeam: false,
          recommendedInternalRoles: ['implementer'],
          maxInternalSteps: 2,
          avoidOverEngineering: true,
          reason: undefined,
        },
      }),
    );
    expect(out).toContain('Reason for team/sub-agents: (not provided).');
  });

  describe('에이전트별 ROLE 문구 분기', () => {
    const agents: MainAgent[] = ['claude-code', 'codex', 'antigravity'];

    it.each(agents)('%s ROLE 헤더가 프롬프트에 들어간다', (agent) => {
      const out = buildMainAgentPrompt(makePackage({ assignedMainAgent: agent }));
      expect(out).toContain(AGENT_ROLE_HEADERS[agent]);
    });

    it('claude-code는 implementation 역할', () => {
      const out = buildMainAgentPrompt(makePackage({ assignedMainAgent: 'claude-code' }));
      expect(out).toContain('implementation main agent');
    });

    it('codex는 verification 역할', () => {
      const out = buildMainAgentPrompt(makePackage({ assignedMainAgent: 'codex' }));
      expect(out).toContain('verification main agent');
    });

    it('antigravity는 UI/QA 역할', () => {
      const out = buildMainAgentPrompt(makePackage({ assignedMainAgent: 'antigravity' }));
      expect(out).toContain('UI/QA main agent');
    });
  });

  it('팀 모드 내부 안내 문구가 에이전트별로 분기된다', () => {
    const teamHint = {
      useSubAgents: true,
      useInternalTeam: true,
      recommendedInternalRoles: ['a', 'b'],
      maxInternalSteps: 3,
      avoidOverEngineering: true,
      reason: 'r',
    };
    const claude = buildMainAgentPrompt(
      makePackage({ assignedMainAgent: 'claude-code', executionMode: 'internal_sequential_team', orchestrationHint: teamHint }),
    );
    const codex = buildMainAgentPrompt(
      makePackage({ assignedMainAgent: 'codex', executionMode: 'internal_sequential_team', orchestrationHint: teamHint }),
    );
    const anti = buildMainAgentPrompt(
      makePackage({ assignedMainAgent: 'antigravity', executionMode: 'internal_sequential_team', orchestrationHint: teamHint }),
    );
    expect(claude).toContain('split implementation by module');
    expect(codex).toContain('challenge the diff adversarially');
    expect(anti).toContain('separate UI implementation from QA');
  });

  it('동일 입력에 대해 결정적(같은 문자열)으로 생성한다', () => {
    const pkg = makePackage();
    expect(buildMainAgentPrompt(pkg)).toBe(buildMainAgentPrompt(pkg));
  });
});

describe('AGENT_ROLE_HEADERS', () => {
  it('3종 메인 에이전트 키를 모두 가진다', () => {
    expect(Object.keys(AGENT_ROLE_HEADERS).sort()).toEqual(
      ['antigravity', 'claude-code', 'codex'],
    );
  });
});
