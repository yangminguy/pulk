import { detectConflicts, aggregateTeamResult } from '../result-aggregator';
import type { TeamResultPacket } from '../types';

type PackageResult = TeamResultPacket['packageResults'][number];

function makePackage(
  overrides: Partial<PackageResult> & { packageId: string },
): PackageResult {
  return {
    packageId: overrides.packageId,
    mainAgent: overrides.mainAgent ?? 'claude-code',
    status: overrides.status ?? 'merge_ready',
    summary: overrides.summary ?? 'ok',
    changedFiles: overrides.changedFiles ?? [],
    checks: overrides.checks ?? {},
    risks: overrides.risks ?? [],
    recommendation: overrides.recommendation ?? 'merge_ready',
  };
}

describe('detectConflicts', () => {
  it('두 패키지가 같은 파일을 변경하면 conflict 1건을 만든다', () => {
    const conflicts = detectConflicts([
      { packageId: 'p1', changedFiles: ['a.ts', 'b.ts'] },
      { packageId: 'p2', changedFiles: ['b.ts', 'c.ts'] },
    ]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toEqual({
      files: ['b.ts'],
      packages: ['p1', 'p2'],
      reason: 'file overlap',
      resolution: 'manual_review',
    });
  });

  it('겹치는 파일이 없으면 conflict가 없다', () => {
    const conflicts = detectConflicts([
      { packageId: 'p1', changedFiles: ['a.ts'] },
      { packageId: 'p2', changedFiles: ['b.ts'] },
    ]);
    expect(conflicts).toHaveLength(0);
  });

  it('세 패키지 중 두 쌍이 겹치면 conflict가 쌍별로 생성된다', () => {
    const conflicts = detectConflicts([
      { packageId: 'p1', changedFiles: ['a.ts'] },
      { packageId: 'p2', changedFiles: ['a.ts'] },
      { packageId: 'p3', changedFiles: ['a.ts'] },
    ]);
    expect(conflicts).toHaveLength(3);
    expect(conflicts.map((c) => c.packages)).toEqual([
      ['p1', 'p2'],
      ['p1', 'p3'],
      ['p2', 'p3'],
    ]);
  });

  it('빈 입력이면 conflict가 없다', () => {
    expect(detectConflicts([])).toHaveLength(0);
  });
});

describe('aggregateTeamResult', () => {
  const base = { teamRunId: 't1', parentTaskId: 'task1' };

  it('전부 성공 + 충돌 없음 → passed / merge_ready', () => {
    const result = aggregateTeamResult({
      ...base,
      packageResults: [
        makePackage({ packageId: 'p1', changedFiles: ['a.ts'] }),
        makePackage({ packageId: 'p2', changedFiles: ['b.ts'] }),
      ],
    });
    expect(result.status).toBe('passed');
    expect(result.finalRecommendation).toBe('merge_ready');
    expect(result.conflicts).toHaveLength(0);
    expect(result.nextAction).toContain('병합');
  });

  it('일부 실패 일부 성공 → partial / retry_failed_package', () => {
    const result = aggregateTeamResult({
      ...base,
      packageResults: [
        makePackage({ packageId: 'p1', status: 'merge_ready' }),
        makePackage({
          packageId: 'p2',
          status: 'failed',
          recommendation: 'retry',
        }),
      ],
    });
    expect(result.status).toBe('partial');
    expect(result.finalRecommendation).toBe('retry_failed_package');
    expect(result.nextAction).toContain('p2');
  });

  it('전부 실패 → failed / retry_failed_package', () => {
    const result = aggregateTeamResult({
      ...base,
      packageResults: [
        makePackage({ packageId: 'p1', status: 'failed', recommendation: 'retry' }),
        makePackage({ packageId: 'p2', status: 'failed', recommendation: 'retry' }),
      ],
    });
    expect(result.status).toBe('failed');
    expect(result.finalRecommendation).toBe('retry_failed_package');
  });

  it('blocked 패키지가 있으면 → blocked', () => {
    const result = aggregateTeamResult({
      ...base,
      packageResults: [
        makePackage({ packageId: 'p1', status: 'merge_ready' }),
        makePackage({ packageId: 'p2', status: 'blocked', recommendation: 'discard' }),
      ],
    });
    expect(result.status).toBe('blocked');
    expect(result.finalRecommendation).toBe('retry_failed_package');
  });

  it('human_review 권고가 있으면 → needs_human_review', () => {
    const result = aggregateTeamResult({
      ...base,
      packageResults: [
        makePackage({ packageId: 'p1', status: 'merge_ready' }),
        makePackage({
          packageId: 'p2',
          status: 'passed',
          recommendation: 'human_review',
        }),
      ],
    });
    expect(result.status).toBe('needs_human_review');
  });

  it('충돌이 있으면 status와 무관하게 → manual_review', () => {
    const result = aggregateTeamResult({
      ...base,
      packageResults: [
        makePackage({ packageId: 'p1', changedFiles: ['shared.ts'] }),
        makePackage({ packageId: 'p2', changedFiles: ['shared.ts'] }),
      ],
    });
    expect(result.conflicts).toHaveLength(1);
    expect(result.finalRecommendation).toBe('manual_review');
    expect(result.status).toBe('passed');
    expect(result.nextAction).toContain('충돌');
  });

  it('깨끗하게 전부 merge_ready → merge_ready', () => {
    const result = aggregateTeamResult({
      ...base,
      packageResults: [
        makePackage({ packageId: 'p1', status: 'merge_ready', changedFiles: ['a.ts'] }),
      ],
    });
    expect(result.finalRecommendation).toBe('merge_ready');
  });

  it('finalChecks 미지정 시 기본 빈 객체', () => {
    const result = aggregateTeamResult({
      ...base,
      packageResults: [makePackage({ packageId: 'p1' })],
    });
    expect(result.finalChecks).toEqual({});
  });

  it('finalChecks를 전달하면 그대로 보존한다', () => {
    const result = aggregateTeamResult({
      ...base,
      packageResults: [makePackage({ packageId: 'p1' })],
      finalChecks: { typecheck: 'pass', build: 'pass' },
    });
    expect(result.finalChecks).toEqual({ typecheck: 'pass', build: 'pass' });
  });
});
