import type { AgentTask } from '../../../types/orchestration';
import {
  collectBottlenecks,
  isHealthySignal,
  normalizeMessage,
  type RawSignal,
  type CollectBottlenecksInput,
} from '../collector';

const NOW = '2026-06-11T03:00:00.000Z';

function signal(over: Partial<RawSignal> = {}): RawSignal {
  return {
    source: 'tool_log',
    tool_id: 'cmo_slide_video_factory',
    executive: 'CMO',
    repo: '/Users/x/ai-slide-video-factory',
    kind: 'error',
    message: 'render failed',
    occurred_at: NOW,
    ...over,
  };
}

function task(over: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 't1',
    instruction_id: 'i1',
    assigned_agent: 'CTO',
    title: 'deploy hermes',
    rationale: 'because',
    expected_output: 'done',
    status: 'queued',
    approval_required: false,
    created_at: NOW,
    updated_at: NOW,
    ...over,
  };
}

function input(over: Partial<CollectBottlenecksInput> = {}): CollectBottlenecksInput {
  return { signals: [], agentTasks: [], now: NOW, ...over };
}

describe('normalizeMessage', () => {
  it('숫자/UUID/경로/타임스탬프를 플레이스홀더로 묶는다', () => {
    const a = normalizeMessage(
      'Render failed for job 12345 at /Users/x/outputs/a.json on 2026-06-11T03:00:00Z',
    );
    const b = normalizeMessage(
      'Render failed for job 99999 at /Users/y/outputs/b.json on 2026-06-10T01:02:03Z',
    );
    expect(a).toBe(b); // 변수부 제거 → 같은 근본원인
  });

  it('UUID를 통일한다', () => {
    const a = normalizeMessage('task 11111111-2222-3333-4444-555555555555 stalled');
    const b = normalizeMessage('task aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee stalled');
    expect(a).toBe(b);
  });
});

describe('collectBottlenecks — never-throw / 빈입력', () => {
  it('빈 입력은 빈 결과', () => {
    const r = collectBottlenecks(input());
    expect(r.total_signals).toBe(0);
    expect(r.candidates).toEqual([]);
    expect(r.by_executive).toEqual({});
    expect(r.dropped_pii).toBe(0);
    expect(r.collected_at).toBe(NOW);
  });

  it('null/형식깨진 입력에도 throw하지 않는다', () => {
    expect(() => collectBottlenecks(undefined as any)).not.toThrow();
    expect(() =>
      collectBottlenecks({ signals: null as any, agentTasks: null as any, now: NOW }),
    ).not.toThrow();
    const r = collectBottlenecks({
      signals: [null as any, { message: 123 } as any, signal()],
      agentTasks: [],
      now: NOW,
    });
    // 깨진 2건은 무시, total_signals은 합본 길이지만 candidate는 유효 1건만
    expect(r.candidates.length).toBe(1);
  });
});

describe('isHealthySignal — 정상 신호 판별', () => {
  it('metrics 없으면 정상으로 보지 않는다(기존 텍스트 신호)', () => {
    expect(isHealthySignal(signal())).toBe(false);
  });

  it('빈 warnings + fail_count 0 → 정상', () => {
    expect(isHealthySignal(signal({ metrics: { warnings: [], fail_count: 0 } }))).toBe(true);
  });

  it('경고가 있으면 정상 아님', () => {
    expect(
      isHealthySignal(signal({ metrics: { warnings: ['slow render'], fail_count: 0 } })),
    ).toBe(false);
  });

  it('실패 건수가 있으면 정상 아님', () => {
    expect(isHealthySignal(signal({ metrics: { warnings: [], fail_count: 2 } }))).toBe(false);
  });

  it('한 지표만 있어도(warnings 빈 배열) 정상으로 판별', () => {
    expect(isHealthySignal(signal({ metrics: { warnings: [] } }))).toBe(true);
    expect(isHealthySignal(signal({ metrics: { fail_count: 0 } }))).toBe(true);
  });

  it('metrics 객체가 비어(두 지표 모두 미제공) 있으면 판단 보류 → 정상 아님', () => {
    expect(isHealthySignal(signal({ metrics: {} }))).toBe(false);
  });
});

describe('collectBottlenecks — 정상 신호 오탐 방지', () => {
  it('빈 warnings/fail_count 0 신호는 후보에서 제외', () => {
    const r = collectBottlenecks(
      input({
        signals: [
          signal({ tool_id: 'ok', message: 'phase done', metrics: { warnings: [], fail_count: 0 } }),
        ],
      }),
    );
    expect(r.candidates.length).toBe(0);
  });

  it('정상 신호는 거르고 진짜 병목만 남긴다', () => {
    const r = collectBottlenecks(
      input({
        signals: [
          signal({ tool_id: 'ok', message: 'phase done', metrics: { warnings: [], fail_count: 0 } }),
          signal({ tool_id: 'bad', message: 'render crashed', metrics: { warnings: ['x'], fail_count: 3 } }),
        ],
      }),
    );
    expect(r.candidates.length).toBe(1);
    expect(r.candidates[0].tool_id).toBe('bad');
  });

  it('metrics 없는 기존 신호는 영향 없음(후보 유지)', () => {
    const r = collectBottlenecks(input({ signals: [signal()] }));
    expect(r.candidates.length).toBe(1);
  });
});

describe('collectBottlenecks — dedup/집계', () => {
  it('같은 근본원인 신호를 fingerprint로 묶는다', () => {
    const r = collectBottlenecks(
      input({
        signals: [
          signal({ message: 'render failed for job 1', occurred_at: '2026-06-11T01:00:00.000Z' }),
          signal({ message: 'render failed for job 2', occurred_at: '2026-06-11T02:00:00.000Z' }),
          signal({ message: 'render failed for job 3', occurred_at: '2026-06-11T02:30:00.000Z' }),
        ],
      }),
    );
    expect(r.candidates.length).toBe(1);
    expect(r.candidates[0].occurrences).toBe(3);
    expect(r.candidates[0].first_seen).toBe('2026-06-11T01:00:00.000Z');
    expect(r.candidates[0].last_seen).toBe('2026-06-11T02:30:00.000Z');
    expect(r.candidates[0].sources.length).toBe(3);
  });

  it('어댑터 제공 fingerprint를 우선한다', () => {
    const r = collectBottlenecks(
      input({
        signals: [
          signal({ message: '완전히 다른 메시지 A', fingerprint: 'shared-fp' }),
          signal({ message: '완전히 다른 메시지 B', fingerprint: 'shared-fp' }),
        ],
      }),
    );
    expect(r.candidates.length).toBe(1);
    expect(r.candidates[0].occurrences).toBe(2);
  });

  it('minOccurrences 미만은 제외(단 수동 제보는 예외)', () => {
    const r = collectBottlenecks(
      input({
        minOccurrences: 2,
        signals: [
          signal({ message: 'one-off error' }),
          signal({ message: 'manual note', source: 'manual_report', kind: 'manual' }),
        ],
      }),
    );
    const fps = r.candidates.map((c) => c.title);
    expect(fps).toContain('manual note'); // 수동은 항상 승격
    expect(fps).not.toContain('one-off error'); // 1건 < 2 → drop
  });
});

describe('collectBottlenecks — agentTasks 정규화', () => {
  it('blocked task를 stall 신호로 변환(blocker 우선)', () => {
    const r = collectBottlenecks(
      input({ agentTasks: [task({ status: 'blocked', blocker: 'waiting on api key' })] }),
    );
    expect(r.candidates.length).toBe(1);
    expect(r.candidates[0].kind).toBe('stall');
    expect(r.candidates[0].title).toBe('waiting on api key');
    expect(r.candidates[0].related_task_ids).toEqual(['t1']);
  });

  it('24h 초과 미완료 task는 overdue stall', () => {
    const r = collectBottlenecks(
      input({
        agentTasks: [task({ status: 'running', updated_at: '2026-06-09T00:00:00.000Z' })],
      }),
    );
    expect(r.candidates.length).toBe(1);
    expect(r.candidates[0].kind).toBe('stall');
    expect(r.candidates[0].title).toContain('overdue');
  });

  it('done/killed task는 제외', () => {
    const r = collectBottlenecks(
      input({
        agentTasks: [
          task({ id: 'd', status: 'done' }),
          task({ id: 'k', status: 'killed' }),
        ],
      }),
    );
    expect(r.candidates.length).toBe(0);
  });

  it('needs_review는 retry 신호', () => {
    const r = collectBottlenecks(input({ agentTasks: [task({ status: 'needs_review' })] }));
    expect(r.candidates[0].kind).toBe('retry');
  });

  it('정상 진행(queued/running, 비초과)은 신호 아님', () => {
    const r = collectBottlenecks(input({ agentTasks: [task({ status: 'queued' })] }));
    expect(r.candidates.length).toBe(0);
  });

  it('비핵심 role(RiskQA 등)은 제외', () => {
    const r = collectBottlenecks(
      input({ agentTasks: [task({ assigned_agent: 'RiskQA', status: 'blocked' })] }),
    );
    expect(r.candidates.length).toBe(0);
  });
});

describe('collectBottlenecks — priority_score(결정론)', () => {
  it('error/stall이 manual/bottleneck보다 baseline이 높다(동일 조건)', () => {
    const r = collectBottlenecks(
      input({
        signals: [
          signal({ tool_id: 'a', message: 'err', kind: 'error' }),
          signal({ tool_id: 'b', message: 'slow', kind: 'bottleneck' }),
        ],
      }),
    );
    const err = r.candidates.find((c) => c.tool_id === 'a')!;
    const slow = r.candidates.find((c) => c.tool_id === 'b')!;
    expect(err.priority_score).toBeGreaterThan(slow.priority_score);
  });

  it('occurrences가 많을수록 점수가 높다', () => {
    const many = collectBottlenecks(
      input({ signals: Array.from({ length: 8 }, () => signal({ message: 'same err' })) }),
    ).candidates[0];
    const one = collectBottlenecks(input({ signals: [signal({ message: 'same err' })] }))
      .candidates[0];
    expect(many.priority_score).toBeGreaterThan(one.priority_score);
  });

  it('candidates는 priority_score desc 정렬', () => {
    const r = collectBottlenecks(
      input({
        signals: [
          signal({ tool_id: 'low', message: 'slow thing', kind: 'bottleneck' }),
          signal({ tool_id: 'high', message: 'crash', kind: 'error' }),
        ],
      }),
    );
    for (let i = 1; i < r.candidates.length; i++) {
      expect(r.candidates[i - 1].priority_score).toBeGreaterThanOrEqual(
        r.candidates[i].priority_score,
      );
    }
  });

  it('score는 항상 0~100', () => {
    const r = collectBottlenecks(
      input({
        signals: Array.from({ length: 50 }, () =>
          signal({ message: 'mega err', kind: 'error', source: 'manual_report' }),
        ),
      }),
    );
    for (const c of r.candidates) {
      expect(c.priority_score).toBeGreaterThanOrEqual(0);
      expect(c.priority_score).toBeLessThanOrEqual(100);
    }
  });
});

describe('collectBottlenecks — PII 분리', () => {
  it('high PII detail은 마스킹하고 dropped_pii 카운트', () => {
    const r = collectBottlenecks(
      input({
        signals: [
          signal({
            message: 'customer error',
            detail: 'contact john@example.com or +1 415 555 1234',
            pii_level: 'high',
          }),
        ],
      }),
    );
    expect(r.dropped_pii).toBe(1);
    expect(r.candidates[0].max_pii_level).toBe('high');
    expect(r.candidates[0].sample_detail).toContain('[email]');
    expect(r.candidates[0].sample_detail).not.toContain('john@example.com');
  });

  it('low/none PII detail은 그대로', () => {
    const r = collectBottlenecks(
      input({ signals: [signal({ detail: 'stack trace line 1', pii_level: 'none' })] }),
    );
    expect(r.dropped_pii).toBe(0);
    expect(r.candidates[0].sample_detail).toBe('stack trace line 1');
  });

  it('그룹의 max_pii_level은 가장 높은 신호를 따른다', () => {
    const r = collectBottlenecks(
      input({
        signals: [
          signal({ message: 'same', detail: 'a', pii_level: 'none' }),
          signal({ message: 'same', detail: 'b', pii_level: 'high' }),
        ],
      }),
    );
    expect(r.candidates[0].max_pii_level).toBe('high');
  });
});

describe('collectBottlenecks — 집계 메타', () => {
  it('by_executive 카운트', () => {
    const r = collectBottlenecks(
      input({
        signals: [
          signal({ tool_id: 'a', executive: 'CMO', message: 'm1' }),
          signal({ tool_id: 'b', executive: 'CTO', message: 'm2' }),
          signal({ tool_id: 'c', executive: 'CTO', message: 'm3' }),
        ],
      }),
    );
    expect(r.by_executive).toEqual({ CMO: 1, CTO: 2 });
  });

  it('manual + native_phase_run 등 모든 source를 합본 처리', () => {
    const r = collectBottlenecks(
      input({
        signals: [
          signal({ tool_id: 'a', message: 'phase held', source: 'native_phase_run', kind: 'stall' }),
          signal({ tool_id: 'b', message: 'founder note', source: 'manual_report', kind: 'manual' }),
        ],
        agentTasks: [task({ status: 'blocked', blocker: 'x' })],
      }),
    );
    expect(r.total_signals).toBe(3);
    expect(r.candidates.length).toBe(3);
  });
});
