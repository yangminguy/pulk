// test/red — spec: docs/specs/executive-brief-aggregation-spec.md (AC-1 ~ AC-7)
// 단위 테스트는 기본 fetcher(createNocoBaseTaskFetcher)를 절대 실행하지 않는다 (NFR-3).
import {
  aggregateExecutiveBriefData,
  getExecutiveBriefData,
  toWeeklySnapshot,
  type ExecutiveBriefTaskRow,
  type ExecutiveBriefAgentSummary,
} from '../executive-brief';

const row = (partial: Partial<ExecutiveBriefTaskRow>): ExecutiveBriefTaskRow => ({
  status: 'running',
  ...partial,
});

describe('executive-brief aggregation', () => {
  // AC-1: assigned_agent별 그룹핑 + agent 오름차순 정렬 + null → UNASSIGNED
  it('AC-1: groups by assigned_agent, sorts ascending, null goes to UNASSIGNED', () => {
    const rows: ExecutiveBriefTaskRow[] = [
      row({ assigned_agent: 'CTO' }),
      row({ assigned_agent: 'CEO' }),
      row({ assigned_agent: 'CMO' }),
      row({ assigned_agent: 'CTO' }),
    ];
    const result = aggregateExecutiveBriefData(rows);
    expect(result.map((s) => s.agent)).toEqual(['CEO', 'CMO', 'CTO']);

    const withNull = aggregateExecutiveBriefData([...rows, row({ assigned_agent: null })]);
    expect(withNull.map((s) => s.agent)).toEqual(['CEO', 'CMO', 'CTO', 'UNASSIGNED']);
  });

  // AC-2: 상태 버킷 — status 6종 각 1건 → completed 1 / inProgress 3 / blocked 1, killed 미포함
  it('AC-2: status buckets — killed is counted nowhere', () => {
    const statuses = ['queued', 'running', 'blocked', 'needs_review', 'done', 'killed'] as const;
    const rows = statuses.map((status) => row({ assigned_agent: 'CTO', status }));
    const [cto] = aggregateExecutiveBriefData(rows);
    expect(cto.agent).toBe('CTO');
    expect(cto.completed).toBe(1);
    expect(cto.inProgress).toBe(3); // running + queued + needs_review
    expect(cto.blockedCount).toBe(1);
    // 총합 5 = 6 − killed
    expect(cto.completed + cto.inProgress + cto.blockedCount).toBe(5);
  });

  // AC-3: approvalWaiting — approval_required=true 이고 status ∉ {done, killed}
  it('AC-3: approvalWaitingCount counts only open approval_required rows', () => {
    const rows: ExecutiveBriefTaskRow[] = [
      row({ assigned_agent: 'CTO', status: 'running', approval_required: true }),
      row({ assigned_agent: 'CTO', status: 'done', approval_required: true }),
      row({ assigned_agent: 'CTO', status: 'killed', approval_required: true }),
      row({ assigned_agent: 'CTO', status: 'running', approval_required: false }),
      row({ assigned_agent: 'CTO', status: 'running', approval_required: null }),
      row({ assigned_agent: 'CTO', status: 'running' }), // 필드 부재
    ];
    const [cto] = aggregateExecutiveBriefData(rows);
    expect(cto.approvalWaitingCount).toBe(1);
  });

  // AC-4: blocker 필터링 — 공백/빈값 제외, 중복 제거, 순서 유지, 비-blocked status 포함
  it('AC-4: blockers filters null/empty/whitespace, dedupes, keeps order, includes non-blocked rows', () => {
    const rows: ExecutiveBriefTaskRow[] = [
      row({ assigned_agent: 'CTO', status: 'blocked', blocker: null }),
      row({ assigned_agent: 'CTO', status: 'blocked', blocker: undefined }),
      row({ assigned_agent: 'CTO', status: 'blocked', blocker: '' }),
      row({ assigned_agent: 'CTO', status: 'blocked', blocker: '   ' }),
      row({ assigned_agent: 'CTO', status: 'blocked', blocker: '실제 블로커' }),
      row({ assigned_agent: 'CTO', status: 'blocked', blocker: '실제 블로커' }),
      row({ assigned_agent: 'CTO', status: 'running', blocker: '비-blocked 블로커' }),
    ];
    const [cto] = aggregateExecutiveBriefData(rows);
    expect(cto.blockers).toEqual(['실제 블로커', '비-blocked 블로커']);
    // blockers.length !== blockedCount 가능(정의) — 여기선 blockedCount 6, blockers 2
    expect(cto.blockedCount).toBe(6);
  });

  // AC-5: 빈 입력 → [] + 입력 불변성
  it('AC-5: empty input returns [] and input is not mutated', () => {
    expect(aggregateExecutiveBriefData([])).toEqual([]);

    const rows: ExecutiveBriefTaskRow[] = [
      row({ assigned_agent: ' CEO ', status: 'done', blocker: ' foo ' }),
      row({ assigned_agent: null, status: 'blocked', blocker: 'bar' }),
    ];
    const snapshot = JSON.parse(JSON.stringify(rows));
    aggregateExecutiveBriefData(rows);
    expect(rows).toEqual(snapshot);
  });

  // AC-6b: 정규화 — agent trim으로 동일 그룹, blocker trim으로 중복 수렴
  it('AC-6b: trims assigned_agent and blocker for grouping/dedup', () => {
    const rows: ExecutiveBriefTaskRow[] = [
      row({ assigned_agent: ' CEO ', status: 'done', blocker: 'foo' }),
      row({ assigned_agent: 'CEO', status: 'running', blocker: ' foo ' }),
      row({ assigned_agent: '   ', status: 'queued' }), // trim 후 빈 문자열 → UNASSIGNED
    ];
    const result = aggregateExecutiveBriefData(rows);
    expect(result.map((s) => s.agent)).toEqual(['CEO', 'UNASSIGNED']);
    const ceo = result[0];
    expect(ceo.completed).toBe(1);
    expect(ceo.inProgress).toBe(1);
    expect(ceo.blockers).toEqual(['foo']);
  });
});

describe('getExecutiveBriefData (delegation, fake fetcher only)', () => {
  const start = new Date('2026-07-06T00:00:00.000Z');
  const end = new Date('2026-07-13T00:00:00.000Z');

  // AC-6a: fetcher가 (startDate, endDate)로 정확히 1회 호출
  it('AC-6a: calls injected fetcher exactly once with (startDate, endDate)', async () => {
    const fetcher = jest.fn().mockResolvedValue([]);
    await getExecutiveBriefData(start, end, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(start, end);
  });

  // AC-6b(위임): fetcher 반환 row의 집계 == aggregateExecutiveBriefData 직접 호출
  it('AC-6: result deep-equals direct aggregateExecutiveBriefData call', async () => {
    const rows: ExecutiveBriefTaskRow[] = [
      row({ assigned_agent: 'CEO', status: 'done' }),
      row({ assigned_agent: 'CTO', status: 'blocked', blocker: 'x' }),
      row({ assigned_agent: 'CTO', status: 'running', approval_required: true }),
    ];
    const result = await getExecutiveBriefData(start, end, async () => rows);
    expect(result).toEqual(aggregateExecutiveBriefData(rows));
  });

  // AC-6c: fetcher reject 시 동일 에러로 전파 (fail-closed)
  it('AC-6: propagates fetcher rejection unchanged', async () => {
    const boom = new Error('nocobase down');
    await expect(
      getExecutiveBriefData(start, end, async () => {
        throw boom;
      }),
    ).rejects.toBe(boom);
  });

  // AC-6d: startDate >= endDate → RangeError + fetcher 미호출
  it('AC-6: throws RangeError when startDate >= endDate, fetcher not called', async () => {
    const fetcher = jest.fn().mockResolvedValue([]);
    await expect(getExecutiveBriefData(end, start, fetcher)).rejects.toBeInstanceOf(RangeError);
    await expect(getExecutiveBriefData(start, start, fetcher)).rejects.toBeInstanceOf(RangeError);
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('toWeeklySnapshot', () => {
  // AC-7: 전사 합산 + blockers 중복 제거 + 정확한 필드명
  it('AC-7: sums across agents, dedupes blockers, exact field names', () => {
    const summaries: ExecutiveBriefAgentSummary[] = [
      {
        agent: 'CEO',
        completed: 2,
        inProgress: 1,
        blockedCount: 1,
        blockers: ['a', 'b'],
        approvalWaitingCount: 1,
      },
      {
        agent: 'CTO',
        completed: 3,
        inProgress: 4,
        blockedCount: 2,
        blockers: ['b', 'c'],
        approvalWaitingCount: 0,
      },
    ];
    const snapshot = toWeeklySnapshot(summaries);
    expect(snapshot).toEqual({
      completed: 5,
      inProgress: 5,
      blocked: 3,
      blockers: ['a', 'b', 'c'],
    });
    // 필드명 정확성 (여분 필드 없음)
    expect(Object.keys(snapshot).sort()).toEqual(['blocked', 'blockers', 'completed', 'inProgress']);
  });
});
