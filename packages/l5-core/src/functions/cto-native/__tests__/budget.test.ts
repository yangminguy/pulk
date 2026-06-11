import { applyPoolOutcome, DEFAULT_BACKOFF_MINUTES } from '../budget';
import type { AgentPoolState } from '../types';

const NOW = '2026-06-10T09:00:00.000Z';

describe('applyPoolOutcome', () => {
  it('exhausted → 해당 agent를 exhausted + nextRetryAt(백오프)', () => {
    const pools: AgentPoolState[] = [{ agent: 'claude-code', quotaStatus: 'available' }];
    const next = applyPoolOutcome(pools, 'claude-code', 'exhausted', NOW);
    const p = next.find((x) => x.agent === 'claude-code')!;
    expect(p.quotaStatus).toBe('exhausted');
    expect(p.nextRetryAt).toBe(
      new Date(new Date(NOW).getTime() + DEFAULT_BACKOFF_MINUTES * 60_000).toISOString(),
    );
  });

  it('ok → 해당 agent available 복원 + nextRetryAt 제거', () => {
    const pools: AgentPoolState[] = [
      { agent: 'codex', quotaStatus: 'exhausted', nextRetryAt: NOW },
    ];
    const next = applyPoolOutcome(pools, 'codex', 'ok', NOW);
    const p = next.find((x) => x.agent === 'codex')!;
    expect(p.quotaStatus).toBe('available');
    expect(p.nextRetryAt).toBeUndefined();
  });

  it('다른 agent는 변경하지 않음', () => {
    const pools: AgentPoolState[] = [
      { agent: 'claude-code', quotaStatus: 'available' },
      { agent: 'codex', quotaStatus: 'available' },
    ];
    const next = applyPoolOutcome(pools, 'claude-code', 'exhausted', NOW);
    expect(next.find((x) => x.agent === 'codex')!.quotaStatus).toBe('available');
  });

  it('pools에 없던 agent면 추가', () => {
    const next = applyPoolOutcome([], 'antigravity', 'exhausted', NOW);
    expect(next).toHaveLength(1);
    expect(next[0].agent).toBe('antigravity');
    expect(next[0].quotaStatus).toBe('exhausted');
  });

  it('입력 배열 불변(immutable)', () => {
    const pools: AgentPoolState[] = [{ agent: 'claude-code', quotaStatus: 'available' }];
    applyPoolOutcome(pools, 'claude-code', 'exhausted', NOW);
    expect(pools[0].quotaStatus).toBe('available');
  });

  it('커스텀 백오프 분 적용', () => {
    const next = applyPoolOutcome([], 'codex', 'exhausted', NOW, 60);
    expect(next[0].nextRetryAt).toBe(
      new Date(new Date(NOW).getTime() + 60 * 60_000).toISOString(),
    );
  });
});
