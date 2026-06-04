// Project Status Sync Runner — launchd entrypoint.
// Calls runProjectStatusSync once with live deps and exits.

import { runProjectStatusSync } from "./project-status-sync.js";

async function main() {
  console.log(`[ProjectStatusSync] Starting at ${new Date().toISOString()}`);
  const start = Date.now();
  try {
    const result = await runProjectStatusSync();
    const elapsed = Date.now() - start;
    console.log(
      `[ProjectStatusSync] Done in ${elapsed}ms — updated: ${result.updated}, failed: ${result.failed}`,
    );
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  } catch (err) {
    const elapsed = Date.now() - start;
    console.error(`[ProjectStatusSync] Fatal error after ${elapsed}ms:`, (err as Error).message);
    process.exit(1);
  }
}

main();
