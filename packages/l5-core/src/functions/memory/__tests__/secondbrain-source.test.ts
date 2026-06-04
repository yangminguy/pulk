// M3: SecondBrain source tests
//
// Uses createInMemorySecondBrainTransport — no network, no IO.

import {
  createSecondBrainSource,
  createSecondBrainTools,
  createInMemorySecondBrainTransport,
} from '../secondbrain-source';
import { recallInsights } from '../insight-bus';
import type { InsightWriteRequest } from '../insight-bus';
import type { ToolResult } from '../../executive-runtime/tools/types';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeTransport(seed = [
  { insight: '고객 응답 속도가 중요하다', source_agent: 'CMO', phase: 'pmf', pii_level: 'none' as const },
  { insight: '민감한 고객 PII 데이터', pii_level: 'high' as const },
]) {
  return createInMemorySecondBrainTransport(seed);
}

// ── 1) read maps to InsightRecord with origin='secondbrain' ───────────────────

describe('createSecondBrainSource', () => {
  it('read returns InsightRecord with origin=secondbrain', async () => {
    const transport = makeTransport();
    const source = createSecondBrainSource(transport);

    const records = await source.read({});
    expect(records).toHaveLength(2);
    expect(records[0].origin).toBe('secondbrain');
    expect(records[0].insight).toBe('고객 응답 속도가 중요하다');
    expect(records[0].source_agent).toBe('CMO');
    expect(records[0].phase).toBe('pmf');
    expect(records[0].pii_level).toBe('none');
  });

  it('read respects limit via transport.query', async () => {
    const transport = makeTransport();
    const source = createSecondBrainSource(transport);
    const records = await source.read({ limit: 1 });
    expect(records).toHaveLength(1);
  });

  it('read tags origin=secondbrain on all records', async () => {
    const transport = createInMemorySecondBrainTransport([
      { insight: 'A', pii_level: 'none' },
      { insight: 'B', pii_level: 'low' },
    ]);
    const source = createSecondBrainSource(transport);
    const records = await source.read({});
    expect(records.every((r) => r.origin === 'secondbrain')).toBe(true);
  });

  it('write calls transport.append', async () => {
    const transport = makeTransport([]);
    const source = createSecondBrainSource(transport);

    const req: InsightWriteRequest = {
      insight: '새 인사이트',
      source_agent: 'CPO',
      pii_level: 'none',
    };
    const result = await source.write!(req);
    expect(result.ok).toBe(true);

    // Verify it was appended
    const records = await source.read({});
    expect(records).toHaveLength(1);
    expect(records[0].insight).toBe('새 인사이트');
  });
});

// ── 2) write tool calls proposeWrite, not transport.append directly ───────────

describe('createSecondBrainTools', () => {
  it('read tool returns ToolResult with records', async () => {
    const transport = makeTransport();
    const source = createSecondBrainSource(transport);
    const proposeCalls: InsightWriteRequest[] = [];
    const proposeWrite = async (req: InsightWriteRequest): Promise<ToolResult> => {
      proposeCalls.push(req);
      return { ok: true, data: { queued: true } };
    };

    const [readTool] = createSecondBrainTools({ source, proposeWrite });
    const result = await readTool.run({});
    expect(result.ok).toBe(true);
    expect(Array.isArray((result.data as any))).toBe(true);
  });

  it('read tool passes limit to source.read', async () => {
    const transport = makeTransport();
    const source = createSecondBrainSource(transport);
    const [readTool] = createSecondBrainTools({
      source,
      proposeWrite: async () => ({ ok: true }),
    });
    const result = await readTool.run({ limit: 1 });
    expect(result.ok).toBe(true);
    expect((result.data as any[]).length).toBe(1);
  });

  it('write tool calls proposeWrite (not transport.append)', async () => {
    const transport = makeTransport([]);
    const source = createSecondBrainSource(transport);
    const proposeCalls: InsightWriteRequest[] = [];
    const proposeWrite = async (req: InsightWriteRequest): Promise<ToolResult> => {
      proposeCalls.push(req);
      return { ok: true, data: { queued: true } };
    };

    const [, writeTool] = createSecondBrainTools({ source, proposeWrite });
    const result = await writeTool.run({
      insight: '테스트 인사이트',
      source_agent: 'CTO',
      pii_level: 'none',
    });

    expect(result.ok).toBe(true);
    // proposeWrite was called
    expect(proposeCalls).toHaveLength(1);
    expect(proposeCalls[0].insight).toBe('테스트 인사이트');
    expect(proposeCalls[0].source_agent).toBe('CTO');

    // transport.append was NOT called directly (store still empty)
    const records = await source.read({});
    expect(records).toHaveLength(0);
  });

  it('write tool returns error for missing insight', async () => {
    const transport = makeTransport([]);
    const source = createSecondBrainSource(transport);
    const [, writeTool] = createSecondBrainTools({
      source,
      proposeWrite: async () => ({ ok: true }),
    });
    const result = await writeTool.run({});
    expect(result.ok).toBe(false);
    expect(result.error).toContain('insight');
  });

  it('write tool defaults pii_level to none for unknown values', async () => {
    const transport = makeTransport([]);
    const source = createSecondBrainSource(transport);
    const proposeCalls: InsightWriteRequest[] = [];
    const [, writeTool] = createSecondBrainTools({
      source,
      proposeWrite: async (req) => { proposeCalls.push(req); return { ok: true }; },
    });
    await writeTool.run({ insight: '테스트', pii_level: 'unknown_value' });
    expect(proposeCalls[0].pii_level).toBe('none');
  });
});

// ── 3) recallInsights merges founder_memory + secondbrain, PII high excluded ──

describe('recallInsights with secondbrain source', () => {
  it('merges founder_memory and secondbrain records', async () => {
    const founderSource = {
      name: 'founder_memory' as const,
      read: async () => [
        { insight: '파운더 메모리 인사이트', pii_level: 'none' as const, origin: 'founder_memory' },
      ],
    };

    const sbTransport = createInMemorySecondBrainTransport([
      { insight: '세컨드브레인 인사이트', pii_level: 'none' },
    ]);
    const sbSource = createSecondBrainSource(sbTransport);

    const records = await recallInsights({ sources: [founderSource, sbSource] });
    expect(records).toHaveLength(2);
    expect(records.map((r) => r.origin)).toContain('founder_memory');
    expect(records.map((r) => r.origin)).toContain('secondbrain');
  });

  it('excludes pii_level high from secondbrain by default', async () => {
    const sbTransport = createInMemorySecondBrainTransport([
      { insight: '일반 인사이트', pii_level: 'none' },
      { insight: '고PII 인사이트', pii_level: 'high' },
    ]);
    const sbSource = createSecondBrainSource(sbTransport);

    const records = await recallInsights({ sources: [sbSource] });
    expect(records).toHaveLength(1);
    expect(records[0].insight).toBe('일반 인사이트');
  });

  it('skips secondbrain source on error, returns founder_memory records', async () => {
    const founderSource = {
      name: 'founder_memory' as const,
      read: async () => [
        { insight: '파운더 인사이트', pii_level: 'none' as const, origin: 'founder_memory' },
      ],
    };
    const throwingTransport: import('../secondbrain-source').SecondBrainTransport = {
      query: async () => { throw new Error('MCP unreachable'); },
      append: async () => ({ ok: false, error: 'unreachable' }),
    };
    const sbSource = createSecondBrainSource(throwingTransport);

    const records = await recallInsights({ sources: [founderSource, sbSource] });
    expect(records).toHaveLength(1);
    expect(records[0].origin).toBe('founder_memory');
  });
});
