// M2: 양방향 인사이트 버스
//
// Pure module — no IO. All data access is via injected InsightSource instances.
// M3 (SecondBrain MCP) will add a 'secondbrain' source alongside 'founder_memory'.

import type { AgentRole } from '../../types/orchestration';

export type { AgentRole };

export interface InsightRecord {
  insight: string;
  source_agent?: string;
  source_task_id?: string;
  pii_level: 'none' | 'low' | 'high';
  phase?: string;
  /** Which source produced this record. */
  origin: 'founder_memory' | 'secondbrain' | string;
}

export interface InsightWriteRequest {
  insight: string;
  source_agent?: string;
  source_task_id?: string;
  pii_level: 'none' | 'low' | 'high';
  phase?: string;
}

export interface InsightSource {
  /** Logical name, e.g. 'founder_memory' or 'secondbrain'. */
  name: string;
  read(filter: { role?: AgentRole; limit?: number }): Promise<InsightRecord[]>;
  /** Optional — only write-capable sources implement this. */
  write?(req: InsightWriteRequest): Promise<{ ok: boolean; error?: string }>;
}

/**
 * Merge records from multiple sources.
 * - PII high records excluded by default (excludePiiHigh defaults to true).
 * - If a source throws, that source is skipped (best-effort); others are returned.
 * - limit caps the total across all sources.
 */
export async function recallInsights(opts: {
  role?: AgentRole;
  sources: InsightSource[];
  limit?: number;
  /** default true */
  excludePiiHigh?: boolean;
}): Promise<InsightRecord[]> {
  const { role, sources, limit = 20, excludePiiHigh = true } = opts;

  const results: InsightRecord[] = [];

  for (const source of sources) {
    try {
      const records = await source.read({ role, limit });
      for (const r of records) {
        if (excludePiiHigh && r.pii_level === 'high') continue;
        results.push(r);
      }
    } catch {
      // best-effort: skip failed source, continue with others
    }
  }

  return results.slice(0, limit);
}

/**
 * Format insight records into a Korean text block suitable for prepending
 * to executive / CEO prompts. Returns '' for an empty array.
 */
export function formatInsightsForPrompt(records: InsightRecord[]): string {
  if (records.length === 0) return '';

  const lines = records.map((r, i) => {
    const agent = r.source_agent ? ` [${r.source_agent}]` : '';
    const phase = r.phase ? ` (${r.phase})` : '';
    return `${i + 1}.${agent}${phase} ${r.insight}`;
  });

  return `[과거 인사이트 — ${records.length}개]\n${lines.join('\n')}`;
}
