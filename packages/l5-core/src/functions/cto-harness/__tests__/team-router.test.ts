import {
  selectMainAgent,
  selectInternalOrchestrationMode,
  recommendedInternalRoles,
  canParallelize,
  decomposeLargePRDToPackages,
} from '../team-router';
import type { WorkPackageDomain } from '../types';

describe('selectMainAgent (PRD §3.3)', () => {
  it('ui 도메인이 포함되면 antigravity', () => {
    expect(selectMainAgent(['ui'])).toBe('antigravity');
    expect(selectMainAgent(['api', 'ui'])).toBe('antigravity');
  });

  it('test 도메인만 있으면 codex', () => {
    expect(selectMainAgent(['test'])).toBe('codex');
  });

  it('test + 다른 구현 도메인이 섞이면 claude-code', () => {
    expect(selectMainAgent(['test', 'api'])).toBe('claude-code');
  });

  it('구현 도메인(api/db/runner/harness/docs)은 claude-code', () => {
    const cases: WorkPackageDomain[][] = [
      ['api'],
      ['db'],
      ['runner'],
      ['harness'],
      ['docs'],
    ];
    for (const c of cases) {
      expect(selectMainAgent(c)).toBe('claude-code');
    }
  });

  it('빈 도메인은 claude-code 기본', () => {
    expect(selectMainAgent([])).toBe('claude-code');
  });
});

describe('selectInternalOrchestrationMode (PRD §6.1/§12 guardrail)', () => {
  it('C0/C1 → solo (내부 팀 금지)', () => {
    expect(selectInternalOrchestrationMode('C0')).toBe('solo');
    expect(selectInternalOrchestrationMode('C1')).toBe('solo');
  });

  it('C2 → solo_with_subagents', () => {
    expect(selectInternalOrchestrationMode('C2')).toBe('solo_with_subagents');
  });

  it('C3/C4 → internal_sequential_team', () => {
    expect(selectInternalOrchestrationMode('C3')).toBe('internal_sequential_team');
    expect(selectInternalOrchestrationMode('C4')).toBe('internal_sequential_team');
  });

  it('C5 + 다중 스코프 → internal_parallel_team', () => {
    expect(
      selectInternalOrchestrationMode('C5', { distinctFileScopes: 2 }),
    ).toBe('internal_parallel_team');
  });

  it('C5 + 단일 스코프 → internal_sequential_team', () => {
    expect(
      selectInternalOrchestrationMode('C5', { distinctFileScopes: 1 }),
    ).toBe('internal_sequential_team');
    // 스코프 옵션 미지정 시 기본 1 → 순차
    expect(selectInternalOrchestrationMode('C5')).toBe('internal_sequential_team');
  });
});

describe('recommendedInternalRoles', () => {
  it('solo 모드는 빈 배열', () => {
    expect(recommendedInternalRoles('claude-code', 'solo')).toEqual([]);
    expect(recommendedInternalRoles('codex', 'solo')).toEqual([]);
  });

  it('claude-code 내부 팀 역할', () => {
    expect(
      recommendedInternalRoles('claude-code', 'internal_sequential_team'),
    ).toEqual([
      'Context Scout',
      'Architect',
      'Implementer',
      'Self Verifier',
      'Handoff Writer',
    ]);
  });

  it('codex 리뷰 역할', () => {
    expect(
      recommendedInternalRoles('codex', 'internal_sequential_team'),
    ).toEqual([
      'Spec Checker',
      'Test Reviewer',
      'Risk Reviewer',
      'Regression Analyst',
      'Verdict Writer',
    ]);
  });

  it('antigravity UI 역할', () => {
    expect(
      recommendedInternalRoles('antigravity', 'internal_parallel_team'),
    ).toEqual([
      'UI Flow Reviewer',
      'Visual QA',
      'Playwright Scout',
      'Locator Reviewer',
      'UX Verdict Writer',
    ]);
  });
});

describe('canParallelize (PRD §9)', () => {
  it('db를 건드리면 차단', () => {
    const r = canParallelize(
      { allowedFiles: ['a/**'] },
      { allowedFiles: ['b/**'] },
      { touchesDb: true },
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toBeDefined();
  });

  it('auth를 건드리면 차단', () => {
    expect(
      canParallelize(
        { allowedFiles: ['a/**'] },
        { allowedFiles: ['b/**'] },
        { touchesAuth: true },
      ).ok,
    ).toBe(false);
  });

  it('deps를 건드리면 차단', () => {
    expect(
      canParallelize(
        { allowedFiles: ['a/**'] },
        { allowedFiles: ['b/**'] },
        { touchesDeps: true },
      ).ok,
    ).toBe(false);
  });

  it('파일 디렉토리 prefix가 겹치면 차단', () => {
    const r = canParallelize(
      { allowedFiles: ['src/api/**'] },
      { allowedFiles: ['src/api/users/**'] },
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('겹칠');
  });

  it('독립 디렉토리는 병렬 허용', () => {
    const r = canParallelize(
      { allowedFiles: ['src/api/**'] },
      { allowedFiles: ['src/ui/**'] },
    );
    expect(r.ok).toBe(true);
    expect(r.reason).toBeUndefined();
  });
});

describe('decomposeLargePRDToPackages (PRD §29)', () => {
  it('각 feature → 패키지 배열 + 필드 매핑', () => {
    const pkgs = decomposeLargePRDToPackages({
      parentTaskId: 'T1',
      parentPlanId: 'P1',
      features: [
        {
          objective: 'API 구현',
          domains: ['api'],
          allowedFiles: ['src/api/**'],
          complexity: 'C3',
          dependencies: ['x'],
        },
        {
          objective: 'UI 화면',
          domains: ['ui'],
          allowedFiles: ['src/ui/**'],
          complexity: 'C2',
        },
      ],
    });

    expect(pkgs).toHaveLength(2);

    const [api, ui] = pkgs;
    expect(api.packageId).toBe('T1-pkg-0');
    expect(api.parentTaskId).toBe('T1');
    expect(api.parentPlanId).toBe('P1');
    expect(api.assignedMainAgent).toBe('claude-code');
    expect(api.executionMode).toBe('internal_sequential_team');
    expect(api.orchestrationHint.useInternalTeam).toBe(true);
    expect(api.orchestrationHint.useSubAgents).toBe(true);
    expect(api.orchestrationHint.maxInternalSteps).toBe(5);
    expect(api.orchestrationHint.avoidOverEngineering).toBe(true);
    expect(api.orchestrationHint.reason).toBeTruthy();
    expect(api.outputContract).toBe('patch');
    expect(api.dependencies).toEqual(['x']);
    expect(api.riskLevel).toBe('D1');
    expect(api.verificationProfile.requiredChecks).toContain('typecheck');
    expect(api.verificationProfile.requiredChecks).toContain('boundary');

    expect(ui.packageId).toBe('T1-pkg-1');
    expect(ui.assignedMainAgent).toBe('antigravity');
    expect(ui.executionMode).toBe('solo_with_subagents');
    expect(ui.outputContract).toBe('ui_report');
    expect(ui.verificationProfile.requiredChecks).toContain('playwright');
  });

  it('C0/C1 feature는 team 금지 → solo 강제', () => {
    const pkgs = decomposeLargePRDToPackages({
      parentTaskId: 'T2',
      parentPlanId: 'P2',
      features: [
        {
          objective: '간단 수정',
          domains: ['api'],
          allowedFiles: ['src/api/**'],
          complexity: 'C1',
        },
        {
          objective: '아주 간단',
          domains: ['docs'],
          allowedFiles: ['docs/**'],
          complexity: 'C0',
        },
      ],
    });

    for (const p of pkgs) {
      expect(p.executionMode).toBe('solo');
      expect(p.orchestrationHint.useInternalTeam).toBe(false);
      expect(p.orchestrationHint.useSubAgents).toBe(false);
      expect(p.orchestrationHint.recommendedInternalRoles).toEqual([]);
      expect(p.orchestrationHint.maxInternalSteps).toBe(1);
    }
  });

  it('team/sub-agent 사용 시 reason 기본값 채움', () => {
    const [pkg] = decomposeLargePRDToPackages({
      parentTaskId: 'T3',
      parentPlanId: 'P3',
      features: [
        {
          objective: '대형 리팩터',
          domains: ['api', 'runner'],
          allowedFiles: ['src/api/**', 'src/runner/**'],
          complexity: 'C5',
        },
      ],
    });
    expect(pkg.executionMode).toBe('internal_parallel_team');
    expect(pkg.orchestrationHint.maxInternalSteps).toBe(8);
    expect(pkg.orchestrationHint.reason).toBeTruthy();
  });

  it('blockedFiles/riskLevel 기본값', () => {
    const [pkg] = decomposeLargePRDToPackages({
      parentTaskId: 'T4',
      parentPlanId: 'P4',
      features: [
        {
          objective: 'x',
          domains: ['api'],
          allowedFiles: ['src/api/**'],
          complexity: 'C2',
        },
      ],
    });
    expect(pkg.scope.blockedFiles).toEqual([]);
    expect(pkg.riskLevel).toBe('D1');
    expect(pkg.dependencies).toEqual([]);
  });
});
