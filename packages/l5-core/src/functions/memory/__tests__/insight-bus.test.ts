import {
  recallInsights,
  formatInsightsForPrompt,
  type InsightRecord,
  type InsightSource,
} from '../insight-bus';
import type { AgentRole } from '../../../types/orchestration';

// ── helpers ──────────────────────────────────────────────────────────────────

function makeRecord(
  insight: string,
  origin: string,
  overrides: Partial<InsightRecord> = {},
): InsightRecord {
  return {
    insight,
    pii_level: 'none',
    origin,
    ...overrides,
  };
}

function staticSource(name: string, records: InsightRecord[]): InsightSource {
  return {
    name,
    read: async () => records,
  };
}

function throwingSource(name: string): InsightSource {
  return {
    name,
    read: async () => { throw new Error('DB unavailable'); },
  };
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('recallInsights', () => {
  it('merges records from multiple sources and applies limit', async () => {
    const s1 = staticSource('founder_memory', [
      makeRecord('인사이트 A', 'founder_memory'),
      makeRecord('인사이트 B', 'founder_memory'),
    ]);
    const s2 = staticSource('secondbrain', [
      makeRecord('인사이트 C', 'secondbrain'),
    ]);

    const result = await recallInsights({ sources: [s1, s2], limit: 3 });
    expect(result).toHaveLength(3);
    expect(result.map((r) => r.origin)).toEqual(['founder_memory', 'founder_memory', 'secondbrain']);
  });

  it('applies limit across merged results', async () => {
    const s1 = staticSource('founder_memory', [
      makeRecord('A', 'founder_memory'),
      makeRecord('B', 'founder_memory'),
      makeRecord('C', 'founder_memory'),
    ]);
    const s2 = staticSource('secondbrain', [
      makeRecord('D', 'secondbrain'),
    ]);

    const result = await recallInsights({ sources: [s1, s2], limit: 2 });
    expect(result).toHaveLength(2);
  });

  it('excludes pii_level high by default', async () => {
    const s = staticSource('founder_memory', [
      makeRecord('안전한 인사이트', 'founder_memory', { pii_level: 'none' }),
      makeRecord('민감한 인사이트', 'founder_memory', { pii_level: 'high' }),
      makeRecord('낮은 수준', 'founder_memory', { pii_level: 'low' }),
    ]);

    const result = await recallInsights({ sources: [s] });
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.pii_level !== 'high')).toBe(true);
  });

  it('includes pii_level high when excludePiiHigh is false', async () => {
    const s = staticSource('founder_memory', [
      makeRecord('고PII 인사이트', 'founder_memory', { pii_level: 'high' }),
    ]);

    const result = await recallInsights({ sources: [s], excludePiiHigh: false });
    expect(result).toHaveLength(1);
  });

  it('skips a throwing source and returns records from the rest (best-effort)', async () => {
    const bad = throwingSource('broken_source');
    const good = staticSource('founder_memory', [
      makeRecord('살아남은 인사이트', 'founder_memory'),
    ]);

    const result = await recallInsights({ sources: [bad, good] });
    expect(result).toHaveLength(1);
    expect(result[0].insight).toBe('살아남은 인사이트');
  });

  it('returns empty array when all sources throw', async () => {
    const result = await recallInsights({
      sources: [throwingSource('s1'), throwingSource('s2')],
    });
    expect(result).toHaveLength(0);
  });

  it('passes role filter through to the source read call', async () => {
    const capturedFilters: Array<{ role?: AgentRole; limit?: number }> = [];
    const source: InsightSource = {
      name: 'test',
      read: async (filter) => {
        capturedFilters.push(filter);
        return [];
      },
    };

    await recallInsights({ sources: [source], role: 'CMO', limit: 5 });
    expect(capturedFilters[0].role).toBe('CMO');
    expect(capturedFilters[0].limit).toBe(5);
  });
});

describe('formatInsightsForPrompt', () => {
  it('returns empty string for empty array', () => {
    expect(formatInsightsForPrompt([])).toBe('');
  });

  it('returns a Korean header with numbered entries', () => {
    const records: InsightRecord[] = [
      makeRecord('단순화가 핵심이다', 'founder_memory', {
        source_agent: 'CPO',
        phase: 'execution_build',
      }),
      makeRecord('고객 응답 속도가 중요하다', 'secondbrain'),
    ];

    const text = formatInsightsForPrompt(records);
    expect(text).toContain('[과거 인사이트');
    expect(text).toContain('단순화가 핵심이다');
    expect(text).toContain('CPO');
    expect(text).toContain('고객 응답 속도가 중요하다');
    expect(text).toContain('1.');
    expect(text).toContain('2.');
  });

  it('includes count in the header', () => {
    const records = [
      makeRecord('A', 'founder_memory'),
      makeRecord('B', 'founder_memory'),
    ];
    const text = formatInsightsForPrompt(records);
    expect(text).toContain('2개');
  });
});
