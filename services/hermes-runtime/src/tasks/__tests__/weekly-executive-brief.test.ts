// test/red — spec: docs/specs/executive-weekly-brief-schedule-spec.md (AC-1 ~ AC-4)
// 순수 함수 + fake 포트만 사용 — NocoBase·Slack·네트워크 접근 없음 (FR-7, NFR-2).
import {
  getWeeklyBriefWindows,
  runWeeklyExecutiveBrief,
  type WeeklyExecutiveBriefDeps,
} from '../weekly-executive-brief.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** 로컬(KST) 자정 Date 헬퍼 — month는 1-based로 받는다. */
const localMidnight = (y: number, m: number, d: number) => new Date(y, m - 1, d, 0, 0, 0, 0);

// ---------------------------------------------------------------------------
// fake 포트 픽스처 (AC-2~AC-4 공용)
// ---------------------------------------------------------------------------

// 집계 spec의 ExecutiveBriefAgentSummary 형태 — @l5/core 미구현 상태에서도
// 구조적으로 호환되도록 로컬 픽스처로 둔다.
const prevSummaries = [
  { agent: 'CTO', completed: 1, inProgress: 2, blockedCount: 0, approvalWaitingCount: 0, blockers: [] },
];
const curSummaries = [
  { agent: 'CMO', completed: 3, inProgress: 1, blockedCount: 1, approvalWaitingCount: 0, blockers: ['b'] },
  { agent: 'CTO', completed: 2, inProgress: 0, blockedCount: 0, approvalWaitingCount: 1, blockers: [] },
];
const prevSnapshot = { __sentinel: 'prev-snapshot', completed: 1 };
const curSnapshot = { __sentinel: 'cur-snapshot', completed: 5 };
const deltaSentinel = { __sentinel: 'delta', completedDelta: 4 };
const formattedMessage = { __sentinel: 'block-kit' };

// now 고정: 2026-07-13(월) 09:00 로컬 — AC-1 ①과 동일 기준.
const FIXED_NOW = new Date(2026, 6, 13, 9, 0, 0, 0);

function makeDeps() {
  const logs: string[] = [];
  const fetchSummaries = jest.fn(async (start: Date, _end: Date) => {
    // previousWeek 창이면 prev, 아니면 cur — 호출 인자 자체는 AC-2에서 별도 검증.
    return start.getTime() < localMidnight(2026, 7, 6).getTime() ? prevSummaries : curSummaries;
  });
  const toSnapshot = jest.fn((s: unknown) => (s === prevSummaries ? prevSnapshot : curSnapshot));
  const calculateDelta = jest.fn(() => deltaSentinel);
  const format = jest.fn(() => formattedMessage);
  const send = jest.fn(async (_message: unknown) => undefined);
  const deps = {
    fetchSummaries,
    toSnapshot,
    calculateDelta,
    format,
    send,
    now: () => FIXED_NOW,
    log: (line: string) => logs.push(line),
  } as unknown as WeeklyExecutiveBriefDeps;
  return { deps, logs, fetchSummaries, toSnapshot, calculateDelta, format, send };
}

// ---------------------------------------------------------------------------
// AC-1: 주간 창 계산 (getWeeklyBriefWindows)
// ---------------------------------------------------------------------------

describe('getWeeklyBriefWindows (AC-1)', () => {
  it('① Monday 09:00 → currentWeek=[prev Mon 00:00, this Mon 00:00), previousWeek 그 전 7일', () => {
    const { currentWeek, previousWeek } = getWeeklyBriefWindows(new Date(2026, 6, 13, 9, 0, 0));
    expect(currentWeek.start).toEqual(localMidnight(2026, 7, 6));
    expect(currentWeek.end).toEqual(localMidnight(2026, 7, 13));
    expect(previousWeek.start).toEqual(localMidnight(2026, 6, 29));
    expect(previousWeek.end).toEqual(localMidnight(2026, 7, 6));
    // 로컬 자정, ms=0
    for (const d of [currentWeek.start, currentWeek.end, previousWeek.start, previousWeek.end]) {
      expect(d.getHours()).toBe(0);
      expect(d.getMinutes()).toBe(0);
      expect(d.getSeconds()).toBe(0);
      expect(d.getMilliseconds()).toBe(0);
    }
  });

  it('② 수요일 실행 → 같은 주 월요일 00:00이 boundary', () => {
    // 2026-07-15는 수요일 → boundary = 2026-07-13(월) 00:00
    const { currentWeek, previousWeek } = getWeeklyBriefWindows(new Date(2026, 6, 15, 14, 30, 0));
    expect(currentWeek.end).toEqual(localMidnight(2026, 7, 13));
    expect(currentWeek.start).toEqual(localMidnight(2026, 7, 6));
    expect(previousWeek.end).toEqual(localMidnight(2026, 7, 6));
    expect(previousWeek.start).toEqual(localMidnight(2026, 6, 29));
  });

  it('③ 월요일 00:00 정각 → boundary는 그날 00:00 (창이 미래로 새지 않음)', () => {
    const now = localMidnight(2026, 7, 13);
    const { currentWeek, previousWeek } = getWeeklyBriefWindows(now);
    expect(currentWeek.end).toEqual(localMidnight(2026, 7, 13));
    expect(currentWeek.start).toEqual(localMidnight(2026, 7, 6));
    expect(previousWeek.end).toEqual(localMidnight(2026, 7, 6));
    expect(previousWeek.start).toEqual(localMidnight(2026, 6, 29));
    expect(currentWeek.end.getTime()).toBeLessThanOrEqual(now.getTime());
  });

  it('④ 창 길이는 정확히 7일, 두 창은 boundary−7d에서 연속', () => {
    const { currentWeek, previousWeek } = getWeeklyBriefWindows(FIXED_NOW);
    expect(currentWeek.end.getTime() - currentWeek.start.getTime()).toBe(7 * DAY_MS);
    expect(previousWeek.end.getTime() - previousWeek.start.getTime()).toBe(7 * DAY_MS);
    expect(previousWeek.end.getTime()).toBe(currentWeek.start.getTime());
    expect(currentWeek.end.getTime()).toBe(previousWeek.end.getTime() + 7 * DAY_MS);
  });

  it('결정성: 같은 now → 같은 출력 (NFR-2)', () => {
    const a = getWeeklyBriefWindows(new Date(FIXED_NOW.getTime()));
    const b = getWeeklyBriefWindows(new Date(FIXED_NOW.getTime()));
    expect(a.currentWeek.start.getTime()).toBe(b.currentWeek.start.getTime());
    expect(a.currentWeek.end.getTime()).toBe(b.currentWeek.end.getTime());
    expect(a.previousWeek.start.getTime()).toBe(b.previousWeek.start.getTime());
    expect(a.previousWeek.end.getTime()).toBe(b.previousWeek.end.getTime());
  });
});

// ---------------------------------------------------------------------------
// AC-2: 파이프라인 순서·인자
// ---------------------------------------------------------------------------

describe('runWeeklyExecutiveBrief pipeline (AC-2)', () => {
  it('① fetchSummaries 2회 — 1회차 (previousWeek.start, end), 2회차 (currentWeek.start, end)', async () => {
    const { deps, fetchSummaries } = makeDeps();
    const result = await runWeeklyExecutiveBrief(deps);
    expect(fetchSummaries).toHaveBeenCalledTimes(2);
    expect(fetchSummaries).toHaveBeenNthCalledWith(
      1,
      result.previousWeek.start,
      result.previousWeek.end,
    );
    expect(fetchSummaries).toHaveBeenNthCalledWith(
      2,
      result.currentWeek.start,
      result.currentWeek.end,
    );
    // 창 값 자체도 FIXED_NOW 기준으로 정확해야 한다.
    expect(result.previousWeek.start).toEqual(localMidnight(2026, 6, 29));
    expect(result.currentWeek.end).toEqual(localMidnight(2026, 7, 13));
  });

  it('② calculateDelta 인자 순서는 (currentSnapshot, previousSnapshot)', async () => {
    const { deps, calculateDelta } = makeDeps();
    await runWeeklyExecutiveBrief(deps);
    expect(calculateDelta).toHaveBeenCalledTimes(1);
    expect(calculateDelta).toHaveBeenCalledWith(curSnapshot, prevSnapshot);
  });

  it('③ format 인자는 (currentWeek summaries, delta)', async () => {
    const { deps, format } = makeDeps();
    await runWeeklyExecutiveBrief(deps);
    expect(format).toHaveBeenCalledTimes(1);
    expect(format).toHaveBeenCalledWith(curSummaries, deltaSentinel);
  });

  it('④ send는 format 반환값으로 정확히 1회, sent=true / dryRun=false', async () => {
    const { deps, send } = makeDeps();
    const result = await runWeeklyExecutiveBrief(deps);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(formattedMessage);
    expect(result.sent).toBe(true);
    expect(result.dryRun).toBe(false);
    expect(result.agentCount).toBe(curSummaries.length);
    expect(result.delta).toBe(deltaSentinel);
  });
});

// ---------------------------------------------------------------------------
// AC-3: dry-run (send 미주입)
// ---------------------------------------------------------------------------

describe('runWeeklyExecutiveBrief dry-run (AC-3)', () => {
  it('send 미주입 → {sent:false, dryRun:true} + "발송 준비 완료" 로그 라인', async () => {
    const { deps, logs, fetchSummaries, format } = makeDeps();
    delete (deps as { send?: unknown }).send;

    const result = await runWeeklyExecutiveBrief(deps);
    expect(result.sent).toBe(false);
    expect(result.dryRun).toBe(true);
    expect(logs.some((line) => line.includes('발송 준비 완료'))).toBe(true);
    // 파이프라인 자체(집계~포맷)는 전부 수행된다.
    expect(fetchSummaries).toHaveBeenCalledTimes(2);
    expect(format).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// AC-4: fail-closed
// ---------------------------------------------------------------------------

describe('runWeeklyExecutiveBrief fail-closed (AC-4)', () => {
  it('① fetchSummaries reject → 동일 에러로 reject, 후속 단계 호출 0회', async () => {
    const { deps, fetchSummaries, calculateDelta, format, send } = makeDeps();
    const boom = new Error('nocobase down');
    fetchSummaries.mockRejectedValue(boom);

    await expect(runWeeklyExecutiveBrief(deps)).rejects.toBe(boom);
    expect(calculateDelta).not.toHaveBeenCalled();
    expect(format).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('② send reject → 동일 에러로 reject (부분 성공으로 처리하지 않음)', async () => {
    const { deps, send } = makeDeps();
    const boom = new Error('slack gateway 500');
    send.mockRejectedValue(boom);

    await expect(runWeeklyExecutiveBrief(deps)).rejects.toBe(boom);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
