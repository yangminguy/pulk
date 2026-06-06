import {
  planTeamRun,
  shouldRunAsTeam,
  buildTeamResultFromRuns,
  type TeamFeatureInput,
  type RunResultInput,
} from '../team-orchestrator';

const REPO = '/repo/pulk';

function feature(overrides: Partial<TeamFeatureInput> & { objective: string }): TeamFeatureInput {
  return {
    domains: ['api'],
    allowedFiles: ['packages/core/**'],
    complexity: 'C2',
    ...overrides,
  };
}

describe('shouldRunAsTeam', () => {
  it('단일 feature는 항상 solo', () => {
    expect(shouldRunAsTeam([feature({ objective: 'a', complexity: 'C5' })])).toBe(false);
  });

  it('전부 C0/C1이면 팀 금지(가드레일)', () => {
    expect(
      shouldRunAsTeam([
        feature({ objective: 'a', complexity: 'C1' }),
        feature({ objective: 'b', complexity: 'C0' }),
      ]),
    ).toBe(false);
  });

  it('feature 2개 이상 + 복잡도 C2 이상이면 팀', () => {
    expect(
      shouldRunAsTeam([
        feature({ objective: 'a', complexity: 'C2' }),
        feature({ objective: 'b', complexity: 'C3' }),
      ]),
    ).toBe(true);
  });
});

describe('planTeamRun', () => {
  it('단일 feature → solo, run 1개, ACR §9.1 요청 형식', () => {
    const plan = planTeamRun({
      parentTaskId: 't1',
      parentPlanId: 'plan1',
      repoPath: REPO,
      features: [
        feature({
          objective: 'add api endpoint',
          domains: ['api'],
          allowedFiles: ['apps/web/src/**'],
          complexity: 'C2',
          acceptanceCriteria: ['endpoint returns 200'],
        }),
      ],
    });

    expect(plan.kind).toBe('solo');
    expect(plan.runs).toHaveLength(1);

    const req = plan.runs[0]!.request;
    expect(req.task_id).toBe('t1-pkg-0');
    expect(req.repo_path).toBe(REPO);
    expect(req.base_branch).toBe('main');
    expect(req.agent).toBe('claude-code');
    expect(req.complexity).toBe('C2');
    expect(req.mode).toBe('implement_verify');
    expect(req.acceptance_criteria).toEqual(['endpoint returns 200']);
    expect(req.allowed_files).toEqual(['apps/web/src/**']);
    // DEFAULT_BLOCKED 가 항상 병합됨.
    expect(req.blocked_files).toContain('.env');
    expect(req.blocked_files).toContain('**/pnpm-lock.yaml');
    // 프롬프트는 9블록 구조.
    expect(plan.runs[0]!.prompt).toContain('# 1. ROLE');
    expect(plan.runs[0]!.prompt).toContain('# 9. STOP CONDITIONS');
  });

  it('다중 feature(C2+) → team, run N개, ui 도메인은 antigravity', () => {
    const plan = planTeamRun({
      parentTaskId: 't2',
      parentPlanId: 'plan2',
      repoPath: REPO,
      baseBranch: 'develop',
      features: [
        feature({ objective: 'api work', domains: ['api'], allowedFiles: ['packages/api/**'], complexity: 'C3' }),
        feature({ objective: 'ui work', domains: ['ui'], allowedFiles: ['apps/web/ui/**'], complexity: 'C2' }),
      ],
    });

    expect(plan.kind).toBe('team');
    expect(plan.runs).toHaveLength(2);
    expect(plan.runs[0]!.request.agent).toBe('claude-code');
    expect(plan.runs[1]!.request.agent).toBe('antigravity');
    expect(plan.runs[0]!.request.base_branch).toBe('develop');
  });
});

describe('buildTeamResultFromRuns', () => {
  function result(overrides: Partial<RunResultInput> & { packageId: string }): RunResultInput {
    return {
      mainAgent: 'claude-code',
      status: 'passed',
      ...overrides,
    };
  }

  it('모든 패키지 통과 + 충돌 없음 → merge_ready', () => {
    const packet = buildTeamResultFromRuns({
      teamRunId: 'team1',
      parentTaskId: 't2',
      results: [
        result({ packageId: 'p0', status: 'passed', changedFiles: ['a.ts'] }),
        result({ packageId: 'p1', status: 'passed', changedFiles: ['b.ts'] }),
      ],
    });

    expect(packet.status).toBe('passed');
    expect(packet.finalRecommendation).toBe('merge_ready');
    expect(packet.conflicts).toHaveLength(0);
  });

  it('파일 충돌이 있으면 manual_review', () => {
    const packet = buildTeamResultFromRuns({
      teamRunId: 'team1',
      parentTaskId: 't2',
      results: [
        result({ packageId: 'p0', status: 'passed', changedFiles: ['shared.ts'] }),
        result({ packageId: 'p1', status: 'passed', changedFiles: ['shared.ts'] }),
      ],
    });

    expect(packet.conflicts).toHaveLength(1);
    expect(packet.finalRecommendation).toBe('manual_review');
  });

  it('blocked 상태 패키지 → status blocked, recommendation 기본값 discard', () => {
    const packet = buildTeamResultFromRuns({
      teamRunId: 'team1',
      parentTaskId: 't2',
      results: [
        result({ packageId: 'p0', status: 'passed', changedFiles: ['a.ts'] }),
        result({ packageId: 'p1', status: 'blocked', changedFiles: ['b.ts'] }),
      ],
    });

    expect(packet.status).toBe('blocked');
    expect(packet.packageResults[1]!.recommendation).toBe('discard');
  });
});
