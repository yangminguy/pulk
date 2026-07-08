// Notion gateway entrypoint — polls on an interval (no Notion Workers required).
// Run once with `--once` (E2E / cron), or as a long-lived daemon (launchd).

import { loadConfig } from './config.js';
import { NotionClient } from './notion-client.js';
import { NocoBaseClient } from './nocobase-client.js';
import { runSyncRound } from './sync.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  const cfg = loadConfig();
  const notion = new NotionClient(cfg);
  const noco = new NocoBaseClient(cfg);
  const once = process.argv.includes('--once');

  const round = async () => {
    try {
      const summary = await runSyncRound(noco, notion);
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

  console.log(`[notion-gateway] polling every ${cfg.pollIntervalMs}ms`);
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
