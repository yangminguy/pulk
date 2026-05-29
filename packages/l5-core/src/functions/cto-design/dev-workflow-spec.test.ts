import {
  DEV_WORKFLOW_TEMPLATES,
  buildDevWorkflowSystemPrompt,
  validateDevWorkflowPhases,
  buildDeterministicDevPhases,
  classifyTask,
} from './dev-workflow-spec';

// ---------------------------------------------------------------------------
// Helpers — valid phase lists per class
// ---------------------------------------------------------------------------

const VALID_FEATURE_PHASES = () => [
  {
    kind: 'research',
    name: '오픈소스 조사',
    runtime: 'claude',
    read_only: true,
    acceptance_criteria: ['후보 비교표', '채택 근거'],
    verifier_hint: '비교표 확인',
  },
  {
    kind: 'spec',
    name: '스펙 작성',
    runtime: 'claude',
    read_only: true,
    dependsOn: ['research'],
    acceptance_criteria: ['요구사항 명세', '측정 가능한 criteria', '영향 파일 목록'],
    verifier_hint: 'spec 산출물 존재 확인',
  },
  {
    kind: 'test',
    name: '실패 테스트 작성',
    runtime: 'codex',
    read_only: false,
    dependsOn: ['spec'],
    acceptance_criteria: ['실패 테스트 추가', 'red 확인'],
    verifier_hint: '신규 테스트 fail 확인',
  },
  {
    kind: 'implement',
    name: '구현',
    runtime: 'codex',
    read_only: false,
    dependsOn: ['test'],
    acceptance_criteria: ['테스트 pass', '회귀 없음'],
    verifier_hint: 'pnpm test green',
  },
  {
    kind: 'review',
    name: '리뷰',
    runtime: 'claude',
    read_only: true,
    dependsOn: ['implement'],
    acceptance_criteria: ['LGTM 또는 fix list'],
    verifier_hint: '리뷰 코멘트 명시',
  },
  {
    kind: 'commit',
    name: '커밋',
    runtime: 'claude',
    read_only: false,
    dependsOn: ['review'],
    acceptance_criteria: ['atomic commit 메시지', '1개 commit 추가'],
    verifier_hint: 'git log 1개 commit',
  },
];

const VALID_SMALL_FIX_PHASES = () => [
  {
    kind: 'repro',
    name: '재현 테스트 작성',
    runtime: 'codex',
    read_only: false,
    acceptance_criteria: ['재현 테스트 추가', 'red 확인'],
    verifier_hint: '재현 테스트 fail 확인',
  },
  {
    kind: 'fix',
    name: '버그 수정',
    runtime: 'codex',
    read_only: false,
    dependsOn: ['repro'],
    acceptance_criteria: ['재현 테스트 green', '회귀 없음'],
    verifier_hint: '재현 테스트 green 확인',
  },
  {
    kind: 'regress',
    name: '회귀 확인',
    runtime: 'claude',
    read_only: true,
    dependsOn: ['fix'],
    acceptance_criteria: ['전체 테스트 green'],
    verifier_hint: 'pnpm test green',
  },
  {
    kind: 'commit',
    name: '커밋',
    runtime: 'claude',
    read_only: false,
    dependsOn: ['regress'],
    acceptance_criteria: ['atomic commit', '1개 commit'],
    verifier_hint: 'git log 확인',
  },
];

// ---------------------------------------------------------------------------
// DEV_WORKFLOW_TEMPLATES
// ---------------------------------------------------------------------------

describe('DEV_WORKFLOW_TEMPLATES', () => {
  it('FEATURE has 6 stages in canonical order', () => {
    const kinds = DEV_WORKFLOW_TEMPLATES.FEATURE.map((t) => t.kind);
    expect(kinds).toEqual(['research', 'spec', 'test', 'implement', 'review', 'commit']);
  });

  it('SMALL_FIX has 4 stages: repro → fix → regress → commit', () => {
    const kinds = DEV_WORKFLOW_TEMPLATES.SMALL_FIX.map((t) => t.kind);
    expect(kinds).toEqual(['repro', 'fix', 'regress', 'commit']);
  });

  it('BIG_CHANGE has 6 stages starting with rfc', () => {
    const kinds = DEV_WORKFLOW_TEMPLATES.BIG_CHANGE.map((t) => t.kind);
    expect(kinds).toEqual(['rfc', 'spec', 'test', 'implement', 'review', 'commit']);
  });

  it('OPS has 4 stages: backup → implement → smoke → commit', () => {
    const kinds = DEV_WORKFLOW_TEMPLATES.OPS.map((t) => t.kind);
    expect(kinds).toEqual(['backup', 'implement', 'smoke', 'commit']);
  });

  it('RESEARCH has 1 stage: research', () => {
    const kinds = DEV_WORKFLOW_TEMPLATES.RESEARCH.map((t) => t.kind);
    expect(kinds).toEqual(['research']);
  });

  it('REFACTOR has 4 stages: regress → refactor → regress → commit', () => {
    const kinds = DEV_WORKFLOW_TEMPLATES.REFACTOR.map((t) => t.kind);
    expect(kinds).toEqual(['regress', 'refactor', 'regress', 'commit']);
  });

  it('FEATURE: research and spec are read-only (claude)', () => {
    const research = DEV_WORKFLOW_TEMPLATES.FEATURE.find((t) => t.kind === 'research')!;
    const spec = DEV_WORKFLOW_TEMPLATES.FEATURE.find((t) => t.kind === 'spec')!;
    expect(research.runtime).toBe('claude');
    expect(research.read_only).toBe(true);
    expect(spec.runtime).toBe('claude');
    expect(spec.read_only).toBe(true);
  });

  it('FEATURE: declares correct dependsOn chain', () => {
    const byIdx = DEV_WORKFLOW_TEMPLATES.FEATURE;
    expect(byIdx[0].dependsOn).toBeUndefined();      // research
    expect(byIdx[1].dependsOn).toEqual(['research']); // spec
    expect(byIdx[2].dependsOn).toEqual(['spec']);     // test
    expect(byIdx[3].dependsOn).toEqual(['test']);     // implement
    expect(byIdx[4].dependsOn).toEqual(['implement']); // review
    expect(byIdx[5].dependsOn).toEqual(['review']);   // commit
  });
});

// ---------------------------------------------------------------------------
// buildDevWorkflowSystemPrompt
// ---------------------------------------------------------------------------

describe('buildDevWorkflowSystemPrompt', () => {
  it('FEATURE prompt mentions all 6 stages and task info', () => {
    const prompt = buildDevWorkflowSystemPrompt('login flow refactor', 'CSRF 노출 위험', 'FEATURE');
    expect(prompt).toMatch(/시니어 개발자/);
    for (const kind of ['research', 'spec', 'test', 'implement', 'review', 'commit']) {
      expect(prompt).toContain(kind);
    }
    expect(prompt).toContain('login flow refactor');
    expect(prompt).toContain('CSRF 노출 위험');
    expect(prompt).toContain('clarifying_questions');
    expect(prompt).toContain('FEATURE');
  });

  it('SMALL_FIX prompt mentions repro, fix, regress, commit', () => {
    const prompt = buildDevWorkflowSystemPrompt('null pointer crash', '결제 흐름 버그', 'SMALL_FIX');
    for (const kind of ['repro', 'fix', 'regress', 'commit']) {
      expect(prompt).toContain(kind);
    }
    expect(prompt).toContain('SMALL_FIX');
    // must NOT mention research, rfc, refactor in SMALL_FIX phases
    expect(prompt).not.toContain('kind="rfc"');
  });

  it('BIG_CHANGE prompt mentions rfc', () => {
    const prompt = buildDevWorkflowSystemPrompt('전체 DB 마이그레이션', '스키마 전면 교체', 'BIG_CHANGE');
    expect(prompt).toContain('rfc');
    expect(prompt).toContain('BIG_CHANGE');
  });

  it('RESEARCH prompt mentions research phase only', () => {
    const prompt = buildDevWorkflowSystemPrompt('auth 라이브러리 조사', '보안 강화', 'RESEARCH');
    expect(prompt).toContain('research');
    expect(prompt).toContain('RESEARCH');
  });

  it('defaults to FEATURE when taskClass is omitted', () => {
    const prompt = buildDevWorkflowSystemPrompt('some task', 'some reason');
    expect(prompt).toContain('FEATURE');
    expect(prompt).toContain('research');
  });
});

// ---------------------------------------------------------------------------
// validateDevWorkflowPhases — FEATURE class
// ---------------------------------------------------------------------------

describe('validateDevWorkflowPhases (FEATURE)', () => {
  it('accepts a well-formed 6-stage FEATURE phase list', () => {
    const result = validateDevWorkflowPhases(VALID_FEATURE_PHASES(), 'FEATURE');
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects a 5-stage list (missing research)', () => {
    const phases = VALID_FEATURE_PHASES().slice(1); // drop research
    const result = validateDevWorkflowPhases(phases, 'FEATURE');
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => /exactly 6 stages/.test(e))).toBe(true);
  });

  it('rejects when order is wrong (implement before test)', () => {
    const phases = VALID_FEATURE_PHASES();
    const [res, spec, test, impl, review, commit] = phases;
    const reordered = [res, spec, impl, test, review, commit];
    const result = validateDevWorkflowPhases(reordered, 'FEATURE');
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => /expected kind="test"/.test(e))).toBe(true);
  });

  it('rejects when dependsOn is missing on a phase that requires it', () => {
    const phases = VALID_FEATURE_PHASES();
    delete (phases[3] as { dependsOn?: unknown }).dependsOn; // implement needs test
    const result = validateDevWorkflowPhases(phases, 'FEATURE');
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => /dependsOn/.test(e))).toBe(true);
  });

  it('rejects when runtime is wrong for a phase', () => {
    const phases = VALID_FEATURE_PHASES();
    phases[0].runtime = 'codex'; // research should be claude
    const result = validateDevWorkflowPhases(phases, 'FEATURE');
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => /runtime must be "claude"/.test(e))).toBe(true);
  });

  it('rejects when phases is not an array', () => {
    const result = validateDevWorkflowPhases(undefined, 'FEATURE');
    expect(result.ok).toBe(false);
  });

  it('defaults to FEATURE validation when taskClass is omitted', () => {
    const result = validateDevWorkflowPhases(VALID_FEATURE_PHASES());
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateDevWorkflowPhases — SMALL_FIX class
// ---------------------------------------------------------------------------

describe('validateDevWorkflowPhases (SMALL_FIX)', () => {
  it('accepts a well-formed 4-stage SMALL_FIX phase list', () => {
    const result = validateDevWorkflowPhases(VALID_SMALL_FIX_PHASES(), 'SMALL_FIX');
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects wrong count', () => {
    const phases = VALID_SMALL_FIX_PHASES().slice(0, 3);
    const result = validateDevWorkflowPhases(phases, 'SMALL_FIX');
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => /exactly 4 stages/.test(e))).toBe(true);
  });

  it('rejects wrong order (fix before repro)', () => {
    const [repro, fix, regress, commit] = VALID_SMALL_FIX_PHASES();
    const result = validateDevWorkflowPhases([fix, repro, regress, commit], 'SMALL_FIX');
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => /expected kind="repro"/.test(e))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateDevWorkflowPhases — other classes
// ---------------------------------------------------------------------------

describe('validateDevWorkflowPhases (other classes)', () => {
  it('RESEARCH: single research phase passes', () => {
    const phases = [
      {
        kind: 'research',
        name: '조사 및 비교',
        runtime: 'claude',
        read_only: true,
        acceptance_criteria: ['후보 비교표'],
        verifier_hint: '비교표 확인',
      },
    ];
    const result = validateDevWorkflowPhases(phases, 'RESEARCH');
    expect(result.ok).toBe(true);
  });

  it('OPS: rejects if backup is missing', () => {
    const phases = [
      { kind: 'implement', name: '운영 실행', runtime: 'codex', read_only: false, acceptance_criteria: ['x'], verifier_hint: 'y' },
      { kind: 'smoke',     name: '스모크',    runtime: 'claude', read_only: true,  dependsOn: ['implement'], acceptance_criteria: ['x'], verifier_hint: 'y' },
      { kind: 'commit',    name: '커밋',      runtime: 'claude', read_only: false, dependsOn: ['smoke'],     acceptance_criteria: ['x'], verifier_hint: 'y' },
    ];
    const result = validateDevWorkflowPhases(phases, 'OPS');
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buildDeterministicDevPhases
// ---------------------------------------------------------------------------

describe('buildDeterministicDevPhases', () => {
  it('FEATURE returns 6 phases that pass FEATURE validation', () => {
    const phases = buildDeterministicDevPhases('sample task', 'FEATURE');
    expect(phases).toHaveLength(6);
    const validation = validateDevWorkflowPhases(phases, 'FEATURE');
    expect(validation.ok).toBe(true);
  });

  it('SMALL_FIX returns 4 phases: repro → fix → regress → commit', () => {
    const phases = buildDeterministicDevPhases('null pointer crash', 'SMALL_FIX');
    expect(phases).toHaveLength(4);
    expect(phases.map((p) => p.kind)).toEqual(['repro', 'fix', 'regress', 'commit']);
    const validation = validateDevWorkflowPhases(phases, 'SMALL_FIX');
    expect(validation.ok).toBe(true);
  });

  it('RESEARCH returns 1 phase', () => {
    const phases = buildDeterministicDevPhases('auth 라이브러리 조사', 'RESEARCH');
    expect(phases).toHaveLength(1);
    expect(phases[0].kind).toBe('research');
  });

  it('REFACTOR returns 4 phases: regress → refactor → regress → commit', () => {
    const phases = buildDeterministicDevPhases('코드 정리', 'REFACTOR');
    expect(phases).toHaveLength(4);
    expect(phases.map((p) => p.kind)).toEqual(['regress', 'refactor', 'regress', 'commit']);
  });

  it('embeds the task title into each prompt_packet', () => {
    const phases = buildDeterministicDevPhases('sample task', 'FEATURE');
    for (const p of phases) {
      expect(p.prompt_packet).toContain('sample task');
    }
  });

  it('keeps read-only phases at D1 and mutating phases at D2', () => {
    const phases = buildDeterministicDevPhases('sample task', 'FEATURE');
    const byKind = Object.fromEntries(phases.map((p) => [p.kind, p]));
    expect(byKind['research'].risk_level).toBe('D1');
    expect(byKind['spec'].risk_level).toBe('D1');
    expect(byKind['review'].risk_level).toBe('D1');
    expect(byKind['test'].risk_level).toBe('D2');
    expect(byKind['implement'].risk_level).toBe('D2');
    expect(byKind['commit'].risk_level).toBe('D2');
  });

  it('defaults to FEATURE when taskClass is omitted', () => {
    const phases = buildDeterministicDevPhases('sample task');
    expect(phases).toHaveLength(6);
    expect(phases[0].kind).toBe('research');
  });
});

// ---------------------------------------------------------------------------
// classifyTask
// ---------------------------------------------------------------------------

describe('classifyTask', () => {
  it('fix/bug keywords → SMALL_FIX', () => {
    expect(classifyTask('fix null crash', '결제 버그')).toBe('SMALL_FIX');
    expect(classifyTask('hotfix login bug', '')).toBe('SMALL_FIX');
    expect(classifyTask('bug 수정', '에러 발생')).toBe('SMALL_FIX');
  });

  it('refactor keywords → REFACTOR', () => {
    expect(classifyTask('리팩터링 auth module', '')).toBe('REFACTOR');
    expect(classifyTask('refactor payment service', '')).toBe('REFACTOR');
  });

  it('research/조사/비교 keywords → RESEARCH', () => {
    expect(classifyTask('auth 라이브러리 조사', '')).toBe('RESEARCH');
    expect(classifyTask('research state management options', '')).toBe('RESEARCH');
    expect(classifyTask('라이브러리 비교', '3가지 후보')).toBe('RESEARCH');
  });

  it('deploy/infra/launchd/migration keywords → OPS', () => {
    expect(classifyTask('launchd 데몬 배포', '')).toBe('OPS');
    expect(classifyTask('DB 마이그레이션 실행', '')).toBe('OPS');
    expect(classifyTask('infra 설정 변경', '')).toBe('OPS');
    expect(classifyTask('rollback 계획 수립', '')).toBe('OPS');
  });

  it('generic task → FEATURE', () => {
    expect(classifyTask('새 대시보드 추가', '매출 시각화')).toBe('FEATURE');
    expect(classifyTask('알림 기능 구현', '')).toBe('FEATURE');
  });

  it('escalation: SMALL_FIX + 3 indicators → FEATURE', () => {
    expect(
      classifyTask('fix minor crash', '버그', {
        estimatedLines: 300,  // > 200
        impactedModules: 5,   // > 3
        newDependencies: true, // yes
        schemaChange: false,
        apiBreaking: false,
      }),
    ).toBe('FEATURE');
  });

  it('escalation: SMALL_FIX + 2 indicators → stays SMALL_FIX', () => {
    expect(
      classifyTask('fix minor crash', '버그', {
        estimatedLines: 300,  // > 200
        impactedModules: 2,   // not > 3
        newDependencies: true, // yes
      }),
    ).toBe('SMALL_FIX');
  });

  it('escalation: FEATURE + 3 indicators → BIG_CHANGE', () => {
    expect(
      classifyTask('새 기능 추가', '확장 필요', {
        estimatedLines: 500,
        impactedModules: 6,
        newDependencies: true,
        schemaChange: false,
        apiBreaking: false,
      }),
    ).toBe('BIG_CHANGE');
  });

  it('escalation: FEATURE + 2 indicators → stays FEATURE', () => {
    expect(
      classifyTask('새 기능 추가', '확장 필요', {
        estimatedLines: 500,
        impactedModules: 1,
        newDependencies: false,
        schemaChange: false,
        apiBreaking: false,
      }),
    ).toBe('FEATURE');
  });
});
