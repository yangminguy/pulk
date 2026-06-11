// 호랑이(Tiger) 수집기 — 수동 제보 소스.
// 정본 SPEC: docs/TIGER_SELF_IMPROVE_SPEC.md (§4.3).
//
// 사장→텔레그램/UI가 적재하는 jsonl 한 파일을 읽어 RawSignal{source:'manual_report'}로.
// 파일 없으면 [](cmo-strategy-watch의 "missing file → no-op" 관례).

import { promises as fs } from 'fs';
import { join } from 'path';
import type { RawSignal, TigerExecutiveRole } from '@l5/core';

const VALID_EXECS: ReadonlySet<string> = new Set([
  'CEO',
  'CMO',
  'CTO',
  'CFO',
  'CRO',
  'CPO',
  'COO',
]);

export interface ManualReportsCtx {
  /** state dir override(tests). 기본 HERMES_DIR/.omc/state. */
  stateDir?: string;
  /** 이 시각(ms) 이후 제보만. */
  sinceMs: number;
}

/**
 * 수동 제보 jsonl(.omc/state/tiger-manual-reports.jsonl)을 RawSignal[]로.
 * 각 줄: { tool_id, executive, repo?, message, detail?, occurred_at?, ref? }.
 * 파싱 실패한 줄은 조용히 건너뛴다(never-throw).
 */
export async function readManualReports(ctx: ManualReportsCtx): Promise<RawSignal[]> {
  const hermesDir = process.env.HERMES_DIR ?? process.cwd();
  const stateDir = ctx.stateDir ?? join(hermesDir, '.omc', 'state');
  const filePath = join(stateDir, 'tiger-manual-reports.jsonl');

  let raw: string;
  try {
    raw = await fs.readFile(filePath, 'utf-8');
  } catch {
    return []; // 파일 없음 → no-op.
  }

  const out: RawSignal[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      continue;
    }
    const tool_id = typeof obj.tool_id === 'string' ? obj.tool_id : undefined;
    const execStr = typeof obj.executive === 'string' ? obj.executive : undefined;
    const message = typeof obj.message === 'string' ? obj.message : undefined;
    if (!tool_id || !execStr || !message || !VALID_EXECS.has(execStr)) continue;

    const occurred_at =
      typeof obj.occurred_at === 'string' ? obj.occurred_at : new Date().toISOString();
    const occMs = Date.parse(occurred_at);
    if (Number.isFinite(occMs) && occMs < ctx.sinceMs) continue;

    out.push({
      source: 'manual_report',
      tool_id,
      executive: execStr as TigerExecutiveRole,
      repo: typeof obj.repo === 'string' ? obj.repo : 'pulk',
      kind: 'manual',
      message: message.slice(0, 300),
      detail: typeof obj.detail === 'string' ? obj.detail : undefined,
      occurred_at,
      ref: typeof obj.ref === 'string' ? obj.ref : undefined,
      pii_level: 'none',
    });
  }
  return out;
}
