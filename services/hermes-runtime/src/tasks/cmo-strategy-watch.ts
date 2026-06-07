// cmo-strategy-watch — self-improvement loop Phase B (daily watcher).
// Runs once a day (09:05 via launchd, after self-learning). Risk level: D1
// (read-only inventory read + state-file write + one founder-facing card + alert).
//
// Responsibilities:
//   1. Read the Second Brain biz inventory.jsonl (source_id + content hash).
//   2. Diff it against the last snapshot via l5-core cmoStrategyWatch (pure logic).
//   3. First run only: establish a silent baseline (the biz brain already holds
//      ~1000 entries — alerting on all of them would be useless noise).
//   4. When new/changed business-PT material appears: create ONE CTO tool-request
//      card (source_ref `secondbrain-watch:<date>`) so the founder sees it on the
//      🔔 Tool Requests surface and can press [CTO에게 전송] (Phase C), and send a
//      Telegram alert. No code is changed here — escalation is founder-gated.
//   5. No changes → silent skip. Never throws (all I/O guarded, offline-safe).
//
// Domain judgment lives in l5-core (cmoStrategyWatch/parsePTInventory); this file
// is wiring + I/O only (CLAUDE.md: hermes does배선만).

import { promises as fs } from 'fs';
import { join, resolve } from 'path';
import type { AgentTask } from '@l5/core';
import { parsePTInventory, cmoStrategyWatch, type PTSnapshot } from '@l5/core';
import { createTelegramClient } from '../notifier/telegram.js';
import type { TelegramClient } from '../notifier/telegram.js';

// A CTO tool-request card payload (the runner supplies id/instruction_id/timestamps).
export type ToolRequestPayload = Omit<
  AgentTask,
  'id' | 'instruction_id' | 'created_at' | 'updated_at'
>;

export interface CmoStrategyWatchDeps {
  /** Creates the founder-facing CTO tool-request card. Returns the new card id. */
  createToolRequest: (payload: ToolRequestPayload) => Promise<string>;
  /** Telegram client (defaults to env-configured client). */
  telegram?: TelegramClient;
  /** Override the biz inventory.jsonl path (tests). */
  inventoryPath?: string;
  /** Override the state dir for the snapshot/discovery files (tests). */
  stateDir?: string;
}

export interface CmoStrategyWatchResult {
  run_at: string;
  /** True on the very first run (baseline established, no card/alert). */
  baseline: boolean;
  entries_scanned: number;
  added: number;
  changed: number;
  card_created: string | null;
  notification_sent: boolean;
  errors: string[];
}

interface ResolvedPaths {
  inventoryPath: string;
  stateDir: string;
  snapshotPath: string;
  discoveryPath: string;
}

function resolvePaths(deps: CmoStrategyWatchDeps): ResolvedPaths {
  // Second Brain is a local project; biz brain inventory lives under it.
  const sbDir = process.env.SECONDBRAIN_DIR ?? '/Users/wonminyang/세컨 브레인';
  const brain = process.env.SECONDBRAIN_BRAIN ?? 'biz';
  const inventoryPath =
    deps.inventoryPath ?? resolve(sbDir, 'brains', brain, 'memory', 'inventory.jsonl');

  const hermesDir = process.env.HERMES_DIR ?? process.cwd();
  const stateDir = deps.stateDir ?? join(hermesDir, '.omc', 'state');
  return {
    inventoryPath,
    stateDir,
    snapshotPath: join(stateDir, 'cmo-strategy-snapshot.json'),
    discoveryPath: join(stateDir, 'cmo-strategy-discovery.json'),
  };
}

async function loadSnapshot(snapshotPath: string): Promise<PTSnapshot> {
  try {
    const raw = await fs.readFile(snapshotPath, 'utf-8');
    const parsed = JSON.parse(raw) as PTSnapshot;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function saveSnapshot(
  snapshot: PTSnapshot,
  stateDir: string,
  snapshotPath: string,
): Promise<void> {
  await fs.mkdir(stateDir, { recursive: true });
  await fs.writeFile(snapshotPath, JSON.stringify(snapshot, null, 2), 'utf-8');
}

export async function runCmoStrategyWatch(
  deps: CmoStrategyWatchDeps,
): Promise<CmoStrategyWatchResult> {
  const paths = resolvePaths(deps);
  const runAt = new Date().toISOString();
  const date = runAt.slice(0, 10);
  const errors: string[] = [];

  const base: CmoStrategyWatchResult = {
    run_at: runAt,
    baseline: false,
    entries_scanned: 0,
    added: 0,
    changed: 0,
    card_created: null,
    notification_sent: false,
    errors,
  };

  // 1. Read inventory (graceful: missing file → no-op, never throws).
  let jsonl = '';
  try {
    jsonl = await fs.readFile(paths.inventoryPath, 'utf-8');
  } catch (err) {
    errors.push(`inventory read failed: ${(err as Error).message}`);
    console.log(`[cmo-strategy-watch] ${date}: inventory not readable, skipping.`);
    return base;
  }

  const current = parsePTInventory(jsonl);
  const prev = await loadSnapshot(paths.snapshotPath);
  const wasEmpty = Object.keys(prev).length === 0;

  const watch = cmoStrategyWatch(prev, current);
  base.entries_scanned = current.length;
  base.added = watch.added.length;
  base.changed = watch.changed.length;

  // Persist the fresh snapshot regardless of what we do next.
  try {
    await saveSnapshot(watch.snapshot, paths.stateDir, paths.snapshotPath);
  } catch (err) {
    errors.push(`snapshot save failed: ${(err as Error).message}`);
  }

  // 3. First run: establish baseline silently (no card, no alert).
  if (wasEmpty) {
    console.log(
      `[cmo-strategy-watch] ${date}: baseline established (${current.length} entries). No alert on first run.`,
    );
    return { ...base, baseline: true };
  }

  // 5. No changes → silent skip.
  if (!watch.hasChanges) {
    console.log(`[cmo-strategy-watch] ${date}: no biz-PT changes across ${current.length} entries.`);
    return base;
  }

  // 4. Changes detected → create ONE founder-facing CTO tool-request card.
  // The snapshot already advanced, so each change is reported exactly once.
  const title = `[세컨브레인] 비즈니스 PT 변화 — 새 자료 ${watch.added.length}건, 수정 ${watch.changed.length}건`;
  let cardId: string | null = null;
  try {
    cardId = await deps.createToolRequest({
      assigned_agent: 'CTO',
      title,
      rationale: watch.summary,
      expected_output:
        '세컨브레인 PT 변화에 맞춰 CMO 운영 방식(단계/산출물/쿼리 카테고리/게이트)을 ' +
        '업그레이드할 필요가 있는지 검토하고, 필요 시 자가수정 task로 진행한다.',
      status: 'queued',
      approval_required: false,
      risk_level: 'D2',
      phase: 'scale_automation',
      source_ref: `secondbrain-watch:${date}`,
    });
    base.card_created = cardId;
    console.log(`[cmo-strategy-watch] ${date}: created tool-request card ${cardId}.`);
  } catch (err) {
    errors.push(`card create failed: ${(err as Error).message}`);
    console.error('[cmo-strategy-watch] card create failed:', (err as Error).message);
  }

  // Discovery record for any UI that wants to render the raw diff.
  try {
    await fs.mkdir(paths.stateDir, { recursive: true });
    await fs.writeFile(
      paths.discoveryPath,
      JSON.stringify(
        {
          date,
          generated_at: runAt,
          added: watch.added,
          changed: watch.changed,
          card_id: cardId,
        },
        null,
        2,
      ),
      'utf-8',
    );
  } catch (err) {
    errors.push(`discovery write failed: ${(err as Error).message}`);
  }

  // Telegram alert (D1 — internal observation; the actual code change stays gated).
  const tg = deps.telegram ?? createTelegramClient();
  const result = await tg.send({
    title,
    body:
      watch.summary +
      (cardId ? `\n\n🔔 Tool Requests에서 [CTO에게 전송]으로 업그레이드를 요청할 수 있어요.` : ''),
    level: 'info',
    dedupKey: `cmo-strategy-watch:${date}`,
  });
  base.notification_sent = result.ok;
  if (!result.ok) errors.push(`telegram: ${result.reason}`);

  return base;
}
