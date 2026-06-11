import { decideRecovery } from '../recovery';
import type { AgentPoolState, WaitingTask, DecideRecoveryInput } from '../types';

const NOW = '2026-06-10T09:00:00.000Z';
const LATER = '2026-06-10T10:00:00.000Z';
const EARLIER = '2026-06-10T08:00:00.000Z';

const baseTask: WaitingTask = {
  id: 'task-1',
  taskKind: 'implementation',
  primaryAgent: 'claude-code',
  reason: 'rate limited',
};

function input(task: WaitingTask, pools: AgentPoolState[]): DecideRecoveryInput {
  return { task, pools, nowIso: NOW };
}

describe('decideRecovery', () => {
  describe('action=run', () => {
    it('returns run when primary pool is available', () => {
      const pools: AgentPoolState[] = [
        { agent: 'claude-code', quotaStatus: 'available' },
      ];
      const result = decideRecovery(input(baseTask, pools));
      expect(result.action).toBe('run');
      expect(result.agent).toBe('claude-code');
      expect(result.taskId).toBe('task-1');
    });

    it('uses task.primaryModel when provided', () => {
      const task = { ...baseTask, primaryModel: 'claude-opus-4-8' } as WaitingTask;
      const pools: AgentPoolState[] = [{ agent: 'claude-code', quotaStatus: 'available' }];
      const result = decideRecovery(input(task, pools));
      expect(result.model).toBe('claude-opus-4-8');
    });

    it('derives model from modelForTask when primaryModel absent', () => {
      const pools: AgentPoolState[] = [{ agent: 'claude-code', quotaStatus: 'available' }];
      const result = decideRecovery(input(baseTask, pools));
      // implementation → claude-code → claude-sonnet-4-6
      expect(result.model).toBe('claude-sonnet-4-6');
    });
  });

  describe('action=handoff', () => {
    it('hands off to codex when claude-code is rate_limited and codex is available', () => {
      const pools: AgentPoolState[] = [
        { agent: 'claude-code', quotaStatus: 'rate_limited', nextRetryAt: LATER },
        { agent: 'codex', quotaStatus: 'available' },
      ];
      const result = decideRecovery(input(baseTask, pools));
      expect(result.action).toBe('handoff');
      expect(result.agent).toBe('codex');
    });

    it('hands off to codex when claude-code is exhausted', () => {
      const pools: AgentPoolState[] = [
        { agent: 'claude-code', quotaStatus: 'exhausted' },
        { agent: 'codex', quotaStatus: 'available' },
      ];
      const result = decideRecovery(input(baseTask, pools));
      expect(result.action).toBe('handoff');
      expect(result.agent).toBe('codex');
    });

    it('sets model via modelForTask for fallback agent', () => {
      const task: WaitingTask = { ...baseTask, taskKind: 'qa', primaryAgent: 'codex' };
      const pools: AgentPoolState[] = [
        { agent: 'codex', quotaStatus: 'rate_limited' },
        { agent: 'claude-code', quotaStatus: 'available' },
      ];
      const result = decideRecovery(input(task, pools));
      expect(result.action).toBe('handoff');
      expect(result.agent).toBe('claude-code');
      // claude-code + qa → no entry in MODEL_FOR → undefined
      expect(result.model).toBeUndefined();
    });

    it('hands off antigravity → claude-code when available', () => {
      const task: WaitingTask = { ...baseTask, primaryAgent: 'antigravity', taskKind: 'ui' };
      const pools: AgentPoolState[] = [
        { agent: 'antigravity', quotaStatus: 'rate_limited' },
        { agent: 'claude-code', quotaStatus: 'available' },
      ];
      const result = decideRecovery(input(task, pools));
      expect(result.action).toBe('handoff');
      expect(result.agent).toBe('claude-code');
    });
  });

  describe('action=wait', () => {
    it('returns wait when no pool is available', () => {
      const pools: AgentPoolState[] = [
        { agent: 'claude-code', quotaStatus: 'rate_limited', nextRetryAt: LATER },
        { agent: 'codex', quotaStatus: 'exhausted', nextRetryAt: LATER },
      ];
      const result = decideRecovery(input(baseTask, pools));
      expect(result.action).toBe('wait');
    });

    it('picks earliest future nextRetryAt across relevant pools', () => {
      const LATER2 = '2026-06-10T11:00:00.000Z';
      const pools: AgentPoolState[] = [
        { agent: 'claude-code', quotaStatus: 'rate_limited', nextRetryAt: LATER2 },
        { agent: 'codex', quotaStatus: 'exhausted', nextRetryAt: LATER },
      ];
      const result = decideRecovery(input(baseTask, pools));
      expect(result.estimatedReadyAt).toBe(LATER);
    });

    it('ignores nextRetryAt in the past', () => {
      const pools: AgentPoolState[] = [
        { agent: 'claude-code', quotaStatus: 'rate_limited', nextRetryAt: EARLIER },
        { agent: 'codex', quotaStatus: 'exhausted', nextRetryAt: LATER },
      ];
      const result = decideRecovery(input(baseTask, pools));
      expect(result.estimatedReadyAt).toBe(LATER);
    });

    it('sets estimatedReadyAt to undefined when no future retryAt exists', () => {
      const pools: AgentPoolState[] = [
        { agent: 'claude-code', quotaStatus: 'exhausted' },
        { agent: 'codex', quotaStatus: 'exhausted' },
      ];
      const result = decideRecovery(input(baseTask, pools));
      expect(result.action).toBe('wait');
      expect(result.estimatedReadyAt).toBeUndefined();
    });

    it('always populates reason', () => {
      const pools: AgentPoolState[] = [
        { agent: 'claude-code', quotaStatus: 'exhausted' },
      ];
      const result = decideRecovery(input(baseTask, pools));
      expect(typeof result.reason).toBe('string');
      expect(result.reason.length).toBeGreaterThan(0);
    });
  });

  describe('primary pool missing from pools array', () => {
    it('treats missing pool as exhausted and falls back', () => {
      // claude-code pool not in list → treated as exhausted; codex available
      const pools: AgentPoolState[] = [
        { agent: 'codex', quotaStatus: 'available' },
      ];
      const result = decideRecovery(input(baseTask, pools));
      expect(result.action).toBe('handoff');
      expect(result.agent).toBe('codex');
    });
  });
});
