// M3: SecondBrain MCP Gateway — pure l5-core module.
//
// IO is fully isolated behind SecondBrainTransport so this file has zero
// direct network calls and can be tested with createInMemorySecondBrainTransport.
//
// Real transport implementation lives in plugin-orchestration/secondbrain-transport.ts.

import type { AgentRole } from '../../types/orchestration';
import type { InsightSource, InsightRecord, InsightWriteRequest } from './insight-bus';
import type { ExecutiveTool, ToolResult } from '../executive-runtime/tools/types';

// ── Transport contract ────────────────────────────────────────────────────────

export interface SecondBrainTransport {
  query(filter: {
    role?: AgentRole;
    limit?: number;
  }): Promise<Array<{
    insight: string;
    source_agent?: string;
    phase?: string;
    pii_level?: 'none' | 'low' | 'high';
  }>>;

  append(req: {
    insight: string;
    source_agent?: string;
    source_task_id?: string;
    phase?: string;
    pii_level?: 'none' | 'low' | 'high';
  }): Promise<{ ok: boolean; error?: string }>;
}

// ── InsightSource adapter ─────────────────────────────────────────────────────

/**
 * Wrap a SecondBrainTransport as an InsightSource named 'secondbrain'.
 * read  → transport.query, with origin='secondbrain' tagged on every record.
 * write → transport.append (CEO gate is enforced by the caller / proposeWrite).
 */
export function createSecondBrainSource(transport: SecondBrainTransport): InsightSource {
  return {
    name: 'secondbrain' as const,

    async read(filter: { role?: AgentRole; limit?: number }): Promise<InsightRecord[]> {
      const rows = await transport.query(filter);
      return rows.map((r) => ({
        insight: r.insight,
        source_agent: r.source_agent,
        pii_level: r.pii_level ?? 'none',
        phase: r.phase,
        origin: 'secondbrain',
      }));
    },

    async write(req: InsightWriteRequest): Promise<{ ok: boolean; error?: string }> {
      return transport.append({
        insight: req.insight,
        source_agent: req.source_agent,
        source_task_id: req.source_task_id,
        phase: req.phase,
        pii_level: req.pii_level,
      });
    },
  };
}

// ── Executive tools ───────────────────────────────────────────────────────────

/**
 * Create the two secondbrain executive tools (read + write-propose).
 *
 * - secondbrain.read   : allowed_roles 'all', permission 'read'
 *                        → queries the InsightSource and returns records.
 * - secondbrain.write  : allowed_roles 'all', permission 'write'
 *                        → does NOT append directly; calls proposeWrite so the
 *                          insight is queued for CEO review before it reaches
 *                          the real SecondBrain.
 */
export function createSecondBrainTools(opts: {
  source: InsightSource;
  /** CEO gate — routes the write request through the review queue instead of direct append. */
  proposeWrite: (req: InsightWriteRequest) => Promise<ToolResult>;
}): ExecutiveTool[] {
  const { source, proposeWrite } = opts;

  const readTool: ExecutiveTool = {
    name: 'secondbrain.read',
    description:
      '세컨드브레인에서 인사이트를 조회합니다. 전 임원 공용. ' +
      '인자: role(선택, AgentRole), limit(선택, 숫자).',
    parameters: {
      role: { type: 'string', description: 'AgentRole 필터 (선택)' },
      limit: { type: 'number', description: '최대 반환 수 (선택, 기본 10)' },
    },
    allowed_roles: 'all',
    permission: 'read',
    async run(args) {
      const role = typeof args.role === 'string' ? (args.role as AgentRole) : undefined;
      const limit = typeof args.limit === 'number' ? args.limit : 10;
      try {
        const records = await source.read({ role, limit });
        return { ok: true, data: records };
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
    },
  };

  const writeTool: ExecutiveTool = {
    name: 'secondbrain.write',
    description:
      '세컨드브레인에 인사이트 적립을 제안합니다. ' +
      '직접 저장이 아니라 CEO 검토 큐에 올라갑니다. ' +
      '인자: insight(필수), source_agent(선택), source_task_id(선택), ' +
      'phase(선택), pii_level("none"|"low"|"high", 기본 "none").',
    parameters: {
      insight: { type: 'string', description: '저장할 인사이트 텍스트 (필수)' },
      source_agent: { type: 'string', description: '출처 에이전트 (선택)' },
      source_task_id: { type: 'string', description: '출처 태스크 ID (선택)' },
      phase: { type: 'string', description: 'BPR 단계 (선택)' },
      pii_level: {
        type: 'string',
        enum: ['none', 'low', 'high'],
        description: 'PII 수준 (기본 "none")',
      },
    },
    allowed_roles: 'all',
    permission: 'write',
    async run(args) {
      if (typeof args.insight !== 'string' || args.insight.trim() === '') {
        return { ok: false, error: 'insight 인자가 필요합니다.' };
      }
      const pii = (['none', 'low', 'high'] as const).includes(args.pii_level as 'none' | 'low' | 'high')
        ? (args.pii_level as 'none' | 'low' | 'high')
        : 'none';
      const req: InsightWriteRequest = {
        insight: args.insight,
        source_agent: typeof args.source_agent === 'string' ? args.source_agent : undefined,
        source_task_id: typeof args.source_task_id === 'string' ? args.source_task_id : undefined,
        phase: typeof args.phase === 'string' ? args.phase : undefined,
        pii_level: pii,
      };
      // CEO gate: never append directly — route through proposeWrite.
      return proposeWrite(req);
    },
  };

  return [readTool, writeTool];
}

// ── In-memory transport (mock / test / env-not-set fallback) ─────────────────

/**
 * Lightweight in-memory transport for tests and environments where
 * SECONDBRAIN_MCP_URL is not set. All data lives in-process; no network calls.
 */
export function createInMemorySecondBrainTransport(
  seed: Array<{
    insight: string;
    source_agent?: string;
    phase?: string;
    pii_level?: 'none' | 'low' | 'high';
  }> = [],
): SecondBrainTransport {
  const store = [...seed];

  return {
    async query(filter) {
      let result = [...store];
      if (filter.limit) result = result.slice(0, filter.limit);
      return result;
    },

    async append(req) {
      store.push({
        insight: req.insight,
        source_agent: req.source_agent,
        phase: req.phase,
        pii_level: req.pii_level ?? 'none',
      });
      return { ok: true };
    },
  };
}
