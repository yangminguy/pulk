// Live full-pipeline run — EXPAND→…→PUBLISH end-to-end with real adapters.
//   node e2e/full-pipeline.mjs "<topic>" [purpose] [--videos N] [--slack-channel C] [--slack-thread TS]
//
// Requires: YouTube key (env or credentials), yt-dlp, and the `claude` CLI on PATH
// (the LLM port). Notion/Slack/Second-Brain are used if configured, else skipped
// gracefully. This is the definitive integration proof — do NOT run in CI unit runs.

import { requireBuilt, requireYouTubeKey } from './_guard.mjs';

requireBuilt();
requireYouTubeKey();

const args = process.argv.slice(2);
const topic = args.find((a) => !a.startsWith('--')) ?? '유튜브 콘텐츠 기획 방법론';
const purpose = args[1] && !args[1].startsWith('--') ? args[1] : 'CONTENT_PLANNING';
const flag = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};
const requiredVideoCount = Number(flag('--videos', '4'));
const slackChannel = flag('--slack-channel', undefined);
const slackThread = flag('--slack-thread', undefined);

const { loadConfig } = await import('../dist/config.js');
const { buildPorts } = await import('../dist/cli.js');
const core = await import('@l5/core');

const cfg = loadConfig();
const ports = buildPorts(cfg, slackChannel);

const request = {
  topic,
  researchPurpose: purpose,
  requiredVideoCount,
  candidateTarget: Math.max(20, requiredVideoCount * 5),
  minimumViewCount: 10000,
};

console.log(`[e2e] full pipeline — topic="${topic}" purpose=${purpose} videos=${requiredVideoCount} model=${cfg.llmModel}`);
const result = await core.runResearchPipeline({
  request,
  ports,
  slack: { channel: slackChannel, threadTs: slackThread },
});

console.log('[e2e] ---- result ----');
console.log(`runId:      ${result.runId}`);
console.log(`analyzed:   ${result.state.transcriptsDone.length} videos`);
console.log(`atoms:      ${result.state.atoms?.length ?? 0}`);
console.log(`principles: ${result.state.principles?.length ?? 0}`);
console.log(`notion:     ${result.notionUrl ?? '(skipped)'}`);
console.log(`report:     ${cfg.storeDir}/reports/${result.runId}.md`);
console.log(`errors:     ${result.state.errors.length}`);
if (result.state.errors.length) console.log(JSON.stringify(result.state.errors, null, 2));
console.log('[e2e] full-pipeline DONE');
