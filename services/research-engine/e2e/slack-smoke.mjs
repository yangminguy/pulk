// Live Slack smoke — posts one real message into a channel.
//   node e2e/slack-smoke.mjs <channelId> [threadTs]
// Requires: RESEARCH_SLACK_BOT_TOKEN|SLACK_CMO_BOT_TOKEN and a channel argument.

import { requireBuilt, requireEnv } from './_guard.mjs';

requireBuilt();
requireEnv(['RESEARCH_SLACK_BOT_TOKEN|SLACK_CMO_BOT_TOKEN']);

const channel = process.argv[2];
if (!channel) {
  console.error('[e2e] usage: node e2e/slack-smoke.mjs <channelId> [threadTs]');
  process.exit(1);
}
const threadTs = process.argv[3];

const { loadConfig } = await import('../dist/config.js');
const { SlackNotifier } = await import('../dist/adapters/slack.js');

const cfg = loadConfig();
const slack = new SlackNotifier({ token: cfg.slackToken });
await slack.notify({
  channel,
  threadTs,
  text: `:mag: 리서치 엔진 Slack 스모크 — ${new Date().toISOString()}`,
});
console.log(`[e2e] posted to ${channel}${threadTs ? ` (thread ${threadTs})` : ''}`);
console.log('[e2e] slack-smoke DONE');
