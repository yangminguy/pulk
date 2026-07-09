// Notion gateway entrypoint — polls on an interval (no Notion Workers required).
// Run once with `--once` (E2E / cron), or as a long-lived daemon (launchd).
//
// Each round:
//   1) PRD round (if NOTION_PRD_DATABASE_ID set): CTO plans → PRD저장소 pages.
//   2) Task round: agent_tasks ↔ 코딩 워크플로우 로그, with optional metadata
//      columns (schema-checked) and a source-PRD link from the PRD round.

import { filterManagedProps, filterFounderProps } from '@l5/core';
import { loadConfig } from './config.js';
import { NotionClient } from './notion-client.js';
import { NocoBaseClient } from './nocobase-client.js';
import { runSyncRound, type SyncRoundOptions } from './sync.js';
import { runPrdSyncRound } from './prd-sync.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  const cfg = loadConfig();
  const notion = new NotionClient(cfg);
  const noco = new NocoBaseClient(cfg);
  const once = process.argv.includes('--once');

  const round = async () => {
    try {
      const opts: SyncRoundOptions = {};

      if (cfg.notionPrdDatabaseId) {
        const taskLinks = await noco.listTaskLinks();
        const prd = await runPrdSyncRound(noco, notion, cfg.notionPrdDatabaseId, taskLinks);
        opts.prdPageByInstruction = prd.prdPageByInstruction;
        console.log(`[notion-gateway] prd: +${prd.created} created, ${prd.updated} updated`);
      }

      // Optional pulk columns + founder columns (영역/워크플로우 태그/PR·이슈 링크,
      // fill-if-empty): intersect with the live schema.
      try {
        const schema = await notion.retrieveDatabaseSchema();
        opts.availableProps = filterManagedProps(schema);
        opts.founderProps = filterFounderProps(schema);
      } catch (err) {
        console.error(`[notion-gateway] schema check failed (core columns only): ${(err as Error).message}`);
      }

      const summary = await runSyncRound(noco, notion, opts);
      console.log(
        `[notion-gateway] synced: +${summary.created} created, ${summary.updated} updated, ${summary.pulledBack} pulled back`,
      );
    } catch (err) {
      console.error(`[notion-gateway] round failed: ${(err as Error).message}`);
    }
  };

  if (once) {
    await round();
    return;
  }

  console.log(
    `[notion-gateway] polling every ${cfg.pollIntervalMs}ms` +
      (cfg.notionPrdDatabaseId ? ' (PRD sync enabled)' : ' (PRD sync disabled — set NOTION_PRD_DATABASE_ID)'),
  );
  // eslint-disable-next-line no-constant-condition
  while (true) {
    await round();
    await sleep(cfg.pollIntervalMs);
  }
}

main().catch((err) => {
  console.error(`[notion-gateway] fatal: ${(err as Error).message}`);
  process.exit(1);
});
