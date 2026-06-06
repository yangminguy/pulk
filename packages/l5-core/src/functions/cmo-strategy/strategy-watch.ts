// CMO Strategy Watch — self-improvement loop Phase B (judgment logic).
//
// Pure, NocoBase-free. Detects newly-added or edited Business-PT material in the
// Second Brain (biz brain) by diffing an inventory snapshot (source_id → hash),
// and produces a founder-facing summary. The Hermes daily task supplies the
// previous snapshot + the current inventory and acts on the result (🔔 approval
// queue item when hasChanges). No write-back, no auto code change — escalation to
// CTO is a separate, founder-approved step (Phase C).
//
// Design (docs/DECISIONS.md 2026-06-06): data layer is automatic; this function
// only *reports* change so the founder decides whether a structural CMO upgrade
// is warranted. It never classifies "big vs small" on its own.

/** One row of the biz brain inventory.jsonl (only fields we rely on). */
export interface PTInventoryEntry {
  source_id: string;
  title?: string;
  platform?: string;
  hash?: string;
  last_edited_time?: string;
}

/** source_id → content hash. */
export type PTSnapshot = Record<string, string>;

export interface CmoStrategyWatchResult {
  /** Entries present now but absent from the previous snapshot. */
  added: PTInventoryEntry[];
  /** Entries whose hash changed since the previous snapshot. */
  changed: PTInventoryEntry[];
  /** Fresh snapshot to persist for the next run. */
  snapshot: PTSnapshot;
  /** True when there is at least one added or changed entry. */
  hasChanges: boolean;
  /** Founder-facing Korean summary (empty when no changes). */
  summary: string;
}

const MAX_TITLES = 8;

function titleOf(e: PTInventoryEntry): string {
  return (e.title && e.title.trim()) || e.source_id;
}

/**
 * Diff the current biz-PT inventory against the previous snapshot.
 *
 * - An entry is `added` when its source_id is not in `previous`.
 * - An entry is `changed` when its hash differs from `previous[source_id]`.
 * - Entries with no `hash` are treated as present (snapshot stores '') and only
 *   counted as added/changed by source_id presence.
 * - Removed entries are intentionally ignored (we surface new knowledge, not loss).
 */
export function cmoStrategyWatch(
  previous: PTSnapshot,
  current: PTInventoryEntry[],
): CmoStrategyWatchResult {
  const prev = previous ?? {};
  const added: PTInventoryEntry[] = [];
  const changed: PTInventoryEntry[] = [];
  const snapshot: PTSnapshot = {};
  const seen = new Set<string>();

  for (const e of current) {
    if (!e || !e.source_id) continue;
    if (seen.has(e.source_id)) {
      // Duplicate source_id: keep the latest hash, do not double-count.
      snapshot[e.source_id] = e.hash ?? '';
      continue;
    }
    seen.add(e.source_id);
    const hash = e.hash ?? '';
    snapshot[e.source_id] = hash;

    if (!(e.source_id in prev)) {
      added.push(e);
    } else if (prev[e.source_id] !== hash) {
      changed.push(e);
    }
  }

  const hasChanges = added.length > 0 || changed.length > 0;
  return { added, changed, snapshot, hasChanges, summary: buildSummary(added, changed) };
}

function buildSummary(added: PTInventoryEntry[], changed: PTInventoryEntry[]): string {
  if (added.length === 0 && changed.length === 0) return '';
  const lines: string[] = [];
  lines.push(`📚 세컨브레인 비즈니스 PT 변화 — 새 자료 ${added.length}건, 수정 ${changed.length}건`);
  const titles = [...added, ...changed].slice(0, MAX_TITLES).map(e => `· ${titleOf(e)}`);
  lines.push(...titles);
  const extra = added.length + changed.length - titles.length;
  if (extra > 0) lines.push(`… 외 ${extra}건`);
  lines.push('');
  lines.push('CMO 작업 방식에 반영할 구조 변경이 필요하면 CTO에게 전송해 업그레이드를 요청하세요.');
  return lines.join('\n');
}

/**
 * Parse biz brain inventory.jsonl content (one JSON object per line) into
 * entries. Malformed lines are skipped (never throws). The Hermes task reads the
 * file and passes its contents here.
 */
export function parsePTInventory(jsonl: string): PTInventoryEntry[] {
  const out: PTInventoryEntry[] = [];
  for (const raw of jsonl.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    try {
      const o = JSON.parse(line);
      if (o && typeof o.source_id === 'string') {
        out.push({
          source_id: o.source_id,
          title: typeof o.title === 'string' ? o.title : undefined,
          platform: typeof o.platform === 'string' ? o.platform : undefined,
          hash: typeof o.hash === 'string' ? o.hash : undefined,
          last_edited_time: typeof o.last_edited_time === 'string' ? o.last_edited_time : undefined,
        });
      }
    } catch {
      // skip malformed line
    }
  }
  return out;
}
