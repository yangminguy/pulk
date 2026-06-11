import { planNextPoll } from '../recovery-loop';
import type { RecoveryDecision } from '@l5/core/dist/functions/cto-native';

const NOW = '2026-06-10T09:00:00.000Z';
const NOW_MS = new Date(NOW).getTime();
const HOUR_MS = 60 * 60 * 1000;

function makeDecision(
  taskId: string,
  action: RecoveryDecision['action'],
  estimatedReadyAt?: string,
): RecoveryDecision {
  return {
    taskId,
    action,
    agent: 'claude-code',
    reason: 'test',
    estimatedReadyAt,
  };
}

describe('planNextPoll', () => {
  describe('empty decisions', () => {
    it('returns MAX_SLEEP_MS and empty readyTaskIds when decisions is empty', () => {
      const result = planNextPoll([], NOW);
      expect(result.sleepMs).toBe(HOUR_MS);
      expect(result.readyTaskIds).toEqual([]);
    });
  });

  describe('run / handoff actions', () => {
    it('returns sleepMs=0 and readyTaskIds when at least one run decision exists', () => {
      const decisions = [makeDecision('task-1', 'run')];
      const result = planNextPoll(decisions, NOW);
      expect(result.sleepMs).toBe(0);
      expect(result.readyTaskIds).toEqual(['task-1']);
    });

    it('returns sleepMs=0 for handoff action', () => {
      const decisions = [makeDecision('task-2', 'handoff')];
      const result = planNextPoll(decisions, NOW);
      expect(result.sleepMs).toBe(0);
      expect(result.readyTaskIds).toEqual(['task-2']);
    });

    it('collects multiple run/handoff task ids preserving input order', () => {
      const decisions = [
        makeDecision('task-1', 'run'),
        makeDecision('task-2', 'handoff'),
        makeDecision('task-3', 'wait'),
      ];
      const result = planNextPoll(decisions, NOW);
      expect(result.sleepMs).toBe(0);
      expect(result.readyTaskIds).toEqual(['task-1', 'task-2']);
    });

    it('ignores wait tasks when run tasks also present', () => {
      const later = new Date(NOW_MS + 30 * 60 * 1000).toISOString();
      const decisions = [
        makeDecision('task-wait', 'wait', later),
        makeDecision('task-run', 'run'),
      ];
      const result = planNextPoll(decisions, NOW);
      expect(result.sleepMs).toBe(0);
      expect(result.readyTaskIds).toContain('task-run');
      expect(result.readyTaskIds).not.toContain('task-wait');
    });
  });

  describe('all wait — sleepMs calculation', () => {
    it('sleeps until earliest estimatedReadyAt', () => {
      const plus30m = new Date(NOW_MS + 30 * 60 * 1000).toISOString();
      const plus45m = new Date(NOW_MS + 45 * 60 * 1000).toISOString();
      const decisions = [
        makeDecision('task-1', 'wait', plus45m),
        makeDecision('task-2', 'wait', plus30m),
      ];
      const result = planNextPoll(decisions, NOW);
      expect(result.readyTaskIds).toEqual([]);
      expect(result.sleepMs).toBe(30 * 60 * 1000);
    });

    it('caps sleepMs at 1 hour even if estimatedReadyAt is far future', () => {
      const plus2h = new Date(NOW_MS + 2 * HOUR_MS).toISOString();
      const decisions = [makeDecision('task-1', 'wait', plus2h)];
      const result = planNextPoll(decisions, NOW);
      expect(result.sleepMs).toBe(HOUR_MS);
    });

    it('returns MAX_SLEEP_MS when all wait and no estimatedReadyAt', () => {
      const decisions = [
        makeDecision('task-1', 'wait'),
        makeDecision('task-2', 'wait'),
      ];
      const result = planNextPoll(decisions, NOW);
      expect(result.sleepMs).toBe(HOUR_MS);
    });

    it('ignores estimatedReadyAt in the past', () => {
      const past = new Date(NOW_MS - 10 * 60 * 1000).toISOString();
      const future = new Date(NOW_MS + 20 * 60 * 1000).toISOString();
      const decisions = [
        makeDecision('task-1', 'wait', past),
        makeDecision('task-2', 'wait', future),
      ];
      const result = planNextPoll(decisions, NOW);
      expect(result.sleepMs).toBe(20 * 60 * 1000);
    });

    it('returns MAX_SLEEP_MS when all estimatedReadyAt are in the past', () => {
      const past = new Date(NOW_MS - 5 * 60 * 1000).toISOString();
      const decisions = [makeDecision('task-1', 'wait', past)];
      const result = planNextPoll(decisions, NOW);
      expect(result.sleepMs).toBe(HOUR_MS);
    });

    it('sleepMs is never negative', () => {
      // estimatedReadyAt exactly at now — diffMs=0
      const decisions = [makeDecision('task-1', 'wait', NOW)];
      const result = planNextPoll(decisions, NOW);
      expect(result.sleepMs).toBeGreaterThanOrEqual(0);
    });
  });
});
