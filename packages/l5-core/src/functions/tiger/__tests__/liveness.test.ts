// 호랑이 실시간 liveness 판정 단위테스트.
// 핵심: "진행 없음"만으로 장애 판정 금지 — heartbeat 살아있으면 정상 통과,
//   죽음+정지/failed/max초과일 때만 장애.

import {
  detectIncidents,
  WATCH_TARGET_REGISTRY,
  listWatchTargets,
  getWatchTarget,
  type WatchTarget,
  type WorkSnapshot,
} from '../liveness';

const NOW = '2026-06-11T12:00:00.000Z';
const NOW_MS = Date.parse(NOW);

// 테스트용 감시 대상: max 30분, heartbeat 정지 허용 5분.
const TARGET: WatchTarget = {
  id: 'test_target',
  label: '테스트 작업',
  owner: 'CMO',
  heartbeat: 'native_phase_run',
  expectedMaxMs: 30 * 60 * 1000,
  heartbeatStaleMs: 5 * 60 * 1000,
  repo_path_kind: 'pulk-relative',
  repo_path: 'packages/l5-core',
};
const PROC_TARGET: WatchTarget = {
  ...TARGET,
  id: 'test_proc',
  heartbeat: 'process',
};
const REGISTRY = [TARGET, PROC_TARGET];

function minsAgo(n: number): string {
  return new Date(NOW_MS - n * 60_000).toISOString();
}

function snap(over: Partial<WorkSnapshot> = {}): WorkSnapshot {
  return {
    target_id: 'test_target',
    work_id: 'w1',
    started_at: minsAgo(10),
    status: 'started',
    last_heartbeat_at: minsAgo(1),
    ...over,
  };
}

function run(snapshots: WorkSnapshot[]) {
  return detectIncidents({ snapshots, now: NOW, registry: REGISTRY });
}

describe('detectIncidents — liveness 판정', () => {
  it('로딩 중(heartbeat 1분 전 갱신, max 미초과) → 정상, 장애 아님', () => {
    const r = run([snap({ last_heartbeat_at: minsAgo(1) })]);
    expect(r.incidents).toHaveLength(0);
    expect(r.healthy).toBe(1);
    expect(r.evaluated).toBe(1);
  });

  it('진행 없음이지만 heartbeat가 아직 신선(정지 허용 내) → 정상 통과', () => {
    // 4분 전 heartbeat < 허용 5분 → "처리 중"으로 통과(진행 없음만으로 장애 금지).
    const r = run([snap({ last_heartbeat_at: minsAgo(4) })]);
    expect(r.incidents).toHaveLength(0);
    expect(r.healthy).toBe(1);
  });

  it('heartbeat 죽음(정지 허용 초과) + 진행정지 → stall 장애', () => {
    const r = run([snap({ last_heartbeat_at: minsAgo(8) })]);
    expect(r.incidents).toHaveLength(1);
    expect(r.incidents[0].kind).toBe('stall');
    expect(r.incidents[0].heartbeat_evidence).toContain('정지');
    expect(r.incidents[0].incident_key).toBe('test_target:w1');
    expect(r.incidents[0].owner).toBe('CMO');
  });

  it('status=failed → 즉시 장애(heartbeat 신선해도)', () => {
    const r = run([snap({ status: 'failed', last_heartbeat_at: minsAgo(0) })]);
    expect(r.incidents).toHaveLength(1);
    expect(r.incidents[0].kind).toBe('failed');
  });

  it('status=error/killed/crashed 모두 즉시 장애', () => {
    for (const s of ['error', 'killed', 'crashed', 'aborted']) {
      const r = run([snap({ status: s, last_heartbeat_at: minsAgo(0) })]);
      expect(r.incidents[0].kind).toBe('failed');
    }
  });

  it('기대 max 초과 → overrun 장애(heartbeat 살아있어도 무한 로딩 방지)', () => {
    // 시작 40분 전 > max 30분, heartbeat는 방금 → 그래도 overrun.
    const r = run([snap({ started_at: minsAgo(40), last_heartbeat_at: minsAgo(0) })]);
    expect(r.incidents).toHaveLength(1);
    expect(r.incidents[0].kind).toBe('overrun');
    expect(r.incidents[0].heartbeat_evidence).toContain('지연');
  });

  it('process heartbeat: 살아있으면 정상(진행 없어도)', () => {
    const r = run([
      snap({ target_id: 'test_proc', process_alive: true, last_heartbeat_at: minsAgo(20) }),
    ]);
    expect(r.incidents).toHaveLength(0);
    expect(r.healthy).toBe(1);
  });

  it('process heartbeat: 죽었으면 stall 장애', () => {
    const r = run([
      snap({ target_id: 'test_proc', process_alive: false, last_heartbeat_at: minsAgo(1) }),
    ]);
    expect(r.incidents).toHaveLength(1);
    expect(r.incidents[0].kind).toBe('stall');
    expect(r.incidents[0].heartbeat_evidence).toContain('프로세스 죽음');
  });

  it('정상 종료(done/completed) → 감시 종료, 장애 아님', () => {
    for (const s of ['done', 'completed', 'merged', 'passed']) {
      const r = run([snap({ status: s, last_heartbeat_at: minsAgo(60) })]);
      expect(r.incidents).toHaveLength(0);
      expect(r.healthy).toBe(1);
    }
  });

  it('레지스트리에 없는 target_id는 건너뛴다', () => {
    const r = run([snap({ target_id: 'unknown_xyz' })]);
    expect(r.evaluated).toBe(0);
    expect(r.skipped_unknown).toBe(1);
    expect(r.incidents).toHaveLength(0);
  });

  it('깨진 스냅샷(필드 누락)은 never-throw로 건너뛴다', () => {
    const bad = [
      { target_id: 'test_target' } as unknown as WorkSnapshot, // work_id 없음
      undefined as unknown as WorkSnapshot,
      snap({ last_heartbeat_at: minsAgo(8) }), // 정상 평가 → stall
    ];
    const r = detectIncidents({ snapshots: bad, now: NOW, registry: REGISTRY });
    expect(r.incidents).toHaveLength(1);
    expect(r.incidents[0].kind).toBe('stall');
  });

  it('빈 입력 → 빈 결과, never-throw', () => {
    expect(() => detectIncidents({ snapshots: [], now: NOW })).not.toThrow();
    const r = detectIncidents({ snapshots: [], now: NOW });
    expect(r.incidents).toHaveLength(0);
    expect(r.evaluated).toBe(0);
  });

  it('여러 작업 혼합: 정상 1 + stall 1 + failed 1 동시 집계', () => {
    const r = run([
      snap({ work_id: 'ok', last_heartbeat_at: minsAgo(1) }),
      snap({ work_id: 'stuck', last_heartbeat_at: minsAgo(8) }),
      snap({ work_id: 'broke', status: 'failed', last_heartbeat_at: minsAgo(0) }),
    ]);
    expect(r.evaluated).toBe(3);
    expect(r.healthy).toBe(1);
    expect(r.incidents).toHaveLength(2);
    const kinds = r.incidents.map((i) => i.kind).sort();
    expect(kinds).toEqual(['failed', 'stall']);
  });
});

describe('WATCH_TARGET_REGISTRY 무결성', () => {
  it('id 중복 없음 + 필수 필드 채워짐', () => {
    const ids = new Set<string>();
    for (const t of listWatchTargets()) {
      expect(ids.has(t.id)).toBe(false);
      ids.add(t.id);
      expect(t.label.length).toBeGreaterThan(0);
      expect(t.expectedMaxMs).toBeGreaterThan(0);
      expect(t.heartbeatStaleMs).toBeGreaterThan(0);
      // heartbeat 정지 허용은 기대 max보다 작아야 한다(논리 일관성).
      expect(t.heartbeatStaleMs).toBeLessThan(t.expectedMaxMs);
    }
    expect(ids.size).toBe(WATCH_TARGET_REGISTRY.length);
  });

  it('getWatchTarget 조회', () => {
    expect(getWatchTarget('cmo_key_content_report')?.owner).toBe('CMO');
    expect(getWatchTarget('cto_phase_run')?.owner).toBe('CTO');
    expect(getWatchTarget('nope')).toBeUndefined();
  });
});
