// 호랑이(Tiger) 수집기 — I/O 어댑터.
// 정본 SPEC: docs/TIGER_SELF_IMPROVE_SPEC.md (§4 I/O 어댑터).
//
// 책임: l5-core 레지스트리를 순회하며 각 도구 repo의 error_sources glob을 읽어
//   RawSignal[]로 변환한다. 도메인 판단은 일절 없음(l5-core collectBottlenecks가 담당).
//   cmo-strategy-watch 패턴: 경로 부재/파싱 실패는 throw하지 않고 [] + errors 누적.

import { promises as fs } from 'fs';
import { join } from 'path';
import {
  listImprovementTargets,
  resolveRepoAbsPath,
  type ImprovementTargetEntry,
  type RawSignal,
  type TigerExecutiveRole,
} from '@l5/core';

/** 핵심 7개 임원만 신호 출처. 그 외 owner의 도구는 수집에서 조용히 건너뛴다. */
const TIGER_EXECS: ReadonlySet<string> = new Set([
  'CEO',
  'CMO',
  'CTO',
  'CFO',
  'CRO',
  'CPO',
  'COO',
]);

function toExecutive(owner: string): TigerExecutiveRole | undefined {
  return TIGER_EXECS.has(owner) ? (owner as TigerExecutiveRole) : undefined;
}

/** 한 줄 로그를 RawSignal로 매핑. jsonl({level|kind|message}) 또는 평문 한 줄 모두 수용. */
function lineToSignal(
  line: string,
  entry: ImprovementTargetEntry,
  exec: TigerExecutiveRole,
  repoAbs: string,
  file: string,
  lineNo: number,
  since: number,
): RawSignal | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  let message = trimmed;
  let kind: RawSignal['kind'] = 'error';
  let occurred_at = new Date().toISOString();
  let detail: string | undefined;
  let metrics: RawSignal['metrics'];

  // jsonl 시도.
  if (trimmed.startsWith('{')) {
    try {
      const obj = JSON.parse(trimmed) as Record<string, unknown>;
      const level = String(obj.level ?? obj.severity ?? '').toLowerCase();
      const rawKind = String(obj.kind ?? '').toLowerCase();
      // error/warn 레벨 또는 retry/stall/bottleneck kind만 신호로 삼는다.
      const isError = level === 'error' || level === 'warn' || level === 'fatal';
      const knownKind = ['retry', 'stall', 'bottleneck', 'error'].includes(rawKind);
      if (!isError && !knownKind) return null;
      kind = (knownKind ? rawKind : 'error') as RawSignal['kind'];
      message = String(obj.message ?? obj.msg ?? obj.error ?? trimmed).slice(0, 300);
      detail = typeof obj.stack === 'string' ? obj.stack : undefined;
      if (typeof obj.time === 'string') occurred_at = obj.time;
      else if (typeof obj.timestamp === 'string') occurred_at = obj.timestamp;
      // 구조화 메트릭 전달: collector가 정상 신호(빈 warnings + fail_count 0)를 가려낸다.
      const failCount = obj.fail_count ?? obj.failCount;
      if (Array.isArray(obj.warnings) || typeof failCount === 'number') {
        metrics = {
          warnings: Array.isArray(obj.warnings) ? obj.warnings : undefined,
          fail_count: typeof failCount === 'number' ? failCount : undefined,
        };
      }
    } catch {
      // 평문으로 폴백.
      if (!/error|fail|exception|warn|timeout/i.test(trimmed)) return null;
      message = trimmed.slice(0, 300);
    }
  } else {
    // 평문: 에러성 키워드가 있는 줄만.
    if (!/error|fail|exception|warn|timeout/i.test(trimmed)) return null;
    message = trimmed.slice(0, 300);
  }

  // since 윈도우(파싱 가능할 때만 적용).
  const occMs = Date.parse(occurred_at);
  if (Number.isFinite(occMs) && occMs < since) return null;

  return {
    source: 'tool_log',
    tool_id: entry.id,
    executive: exec,
    repo: repoAbs,
    kind,
    message,
    detail,
    occurred_at,
    ref: `${file}:${lineNo}`,
    pii_level: 'none',
    metrics,
  };
}

/** repo 기준 상대 glob 패턴들을 절대경로로 풀어 매칭되는 파일 목록을 반환. graceful. */
async function resolveGlobFiles(repoAbs: string, patterns: string[]): Promise<string[]> {
  const files: string[] = [];
  const globFn = (fs as unknown as { glob?: (p: string, o?: unknown) => AsyncIterable<string> })
    .glob;
  for (const pattern of patterns) {
    try {
      if (globFn) {
        for await (const m of globFn(pattern, { cwd: repoAbs })) {
          files.push(join(repoAbs, m));
        }
      }
    } catch {
      // 패턴 매칭 실패 → 조용히 건너뛴다.
    }
  }
  return files;
}

export interface LogCollectCtx {
  /** 이 시각(ms epoch) 이후 신호만. 마지막 수집 스냅샷 윈도우. */
  sinceMs: number;
  /** repo_path_kind='pulk-relative' 해석용 루트. */
  pulkRoot: string;
  /** 한 파일에서 읽을 최대 줄 수(토큰/메모리 보호). 기본 2000. */
  maxLinesPerFile?: number;
}

export interface LogCollectOutput {
  signals: RawSignal[];
  /** 도구별 비치명 오류(관측용). 절대 throw하지 않는다. */
  errors: string[];
  /** 신호를 만들어낸(또는 시도한) 도구 수. */
  toolsScanned: number;
}

/**
 * 레지스트리 전체를 순회하며 error_sources glob을 읽어 RawSignal[] 수집.
 * manual_intake 도구라도 error_sources가 있으면 읽는다(있는 로그는 활용). 없으면 건너뜀.
 * 어떤 도구가 실패해도 다음 도구로 계속(무인 자율).
 */
export async function collectToolLogs(ctx: LogCollectCtx): Promise<LogCollectOutput> {
  const signals: RawSignal[] = [];
  const errors: string[] = [];
  const maxLines = ctx.maxLinesPerFile ?? 2000;
  let toolsScanned = 0;

  for (const entry of listImprovementTargets()) {
    const exec = toExecutive(entry.owner);
    if (!exec) continue; // 비핵심 임원 도구는 조용히 건너뜀.
    if (!entry.error_sources || entry.error_sources.length === 0) continue; // 로그 없음 → skip.

    toolsScanned += 1;
    let repoAbs: string;
    try {
      repoAbs = resolveRepoAbsPath(entry, ctx.pulkRoot);
    } catch (err) {
      errors.push(`${entry.id}: resolve repo failed: ${(err as Error).message}`);
      continue;
    }

    let files: string[] = [];
    try {
      files = await resolveGlobFiles(repoAbs, entry.error_sources);
    } catch (err) {
      errors.push(`${entry.id}: glob failed: ${(err as Error).message}`);
      continue;
    }

    for (const file of files) {
      let content: string;
      try {
        content = await fs.readFile(file, 'utf-8');
      } catch {
        continue; // 파일 사라짐/권한 → 조용히 건너뜀.
      }
      const lines = content.split('\n').slice(-maxLines); // tail만.
      const offset = content.split('\n').length - lines.length;
      lines.forEach((line, idx) => {
        const sig = lineToSignal(
          line,
          entry,
          exec,
          repoAbs,
          file,
          offset + idx + 1,
          ctx.sinceMs,
        );
        if (sig) signals.push(sig);
      });
    }
  }

  return { signals, errors, toolsScanned };
}
