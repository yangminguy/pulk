// L5 Inbound Slack Gateway — entrypoint.
//
//   @CEO / @CMO / @CTO mention (or DM) in Slack
//     → each executive is its own Socket Mode app
//     → allowlist check (only the Founder's Slack user id)
//     → ACK the envelope, strip the bot mention → instruction
//     → post "…가 작업을 시작합니다" into the thread
//     → runExecutive (headless claude subagent, does real work)
//     → post reply into the same thread + upload any deliverable files
//
// Runs as a persistent process (launchd KeepAlive) on the Founder's Mac, holding
// one WebSocket per executive app.

import { loadConfig, type BotConfig } from './config.js';
import { SlackApi } from './slack-api.js';
import { SocketModeClient, type SlackEvent } from './socket-mode.js';
import { EXECUTIVES, cleanInstruction, classifyCtoIntent, classifyCmoIntent } from './router.js';
import { runExecutive } from './executor.js';
import { PulkClient } from './pulk-api.js';
import { handleCtoPlanning, resolveCtoIntent, slackThreadId } from './cto-planning-bridge.js';
import { parseResearchRequest, launchResearchRun } from './research-bridge.js';
import { formatSlackText } from './formatting.js';

function log(msg: string): void {
  // eslint-disable-next-line no-console
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  log(
    `slack-gateway up. bots=${cfg.bots.map((b) => b.id).join(',')} ` +
      `repoRoot=${cfg.repoRoot} model=${cfg.model} ` +
      `allowed=${cfg.allowedUserIds.join(',') || '(ANY — WARNING)'}`,
  );
  if (cfg.allowedUserIds.length === 0) {
    log('WARN: SLACK_ALLOWED_USER_IDS not set — any workspace user can command the executives.');
  }

  await Promise.all(cfg.bots.map((bot) => startBot(bot, cfg)));
}

async function startBot(bot: BotConfig, cfg: Awaited<ReturnType<typeof loadConfig>>): Promise<void> {
  const api = new SlackApi(bot.botToken);

  let botUserId = '';
  try {
    const auth = await api.authTest();
    botUserId = auth.user_id;
    log(`${bot.label} authenticated as bot user ${botUserId} (team ${auth.team})`);
  } catch (err) {
    log(`${bot.label} auth.test failed: ${errMsg(err)} — this executive will not come online`);
    return;
  }

  // De-dupe redelivered events (safety net; we ACK immediately so this is rare).
  const seen = new Set<string>();

  const handler = async (event: SlackEvent): Promise<void> => {
    const isMention = event.type === 'app_mention';
    const isDm = event.type === 'message' && event.channel_type === 'im';
    if (!isMention && !isDm) return;
    if (event.bot_id) return; // ignore bot/self messages → no loops
    if (event.subtype) return; // ignore edits/joins/etc.

    const user = event.user ?? '';
    if (cfg.allowedUserIds.length && !cfg.allowedUserIds.includes(user)) {
      log(`${bot.label} ignored non-allowlisted user ${user}`);
      return;
    }

    const channel = event.channel;
    const eventTs = event.ts;
    if (!channel || !eventTs) return;

    const dedupeKey = `${channel}:${eventTs}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    if (seen.size > 1000) seen.clear();

    const instruction = cleanInstruction(event.text ?? '', botUserId);
    const threadTs = event.thread_ts ?? eventTs; // reply in-thread
    const runId = `${Date.now()}-${bot.id}`;
    log(`${bot.label} dispatch run=${runId} instr="${instruction.slice(0, 80)}"`);

    // CTO structured-planning bridge: explicit planning/approval phrasings go to
    // the pulk planning rail (cto:planMessage / cto:approvePlan). Everything
    // else (and CEO/CMO entirely) keeps the existing generic executive path.
    if (bot.id === 'cto' && cfg.ctoPlanningEnabled) {
      const pulk = new PulkClient(cfg.nocobaseUrl, cfg.nocobaseToken);
      // Sticky planning: a generic-looking follow-up *inside an existing planning
      // thread* stays on the structured rail (otherwise it leaks to the generic
      // executor). event.thread_ts present == reply in an existing thread.
      const { intent, sticky } = await resolveCtoIntent(
        classifyCtoIntent(instruction),
        Boolean(event.thread_ts),
        slackThreadId(channel, threadTs),
        pulk,
      );
      if (sticky) log(`${bot.label} sticky-planning: generic follow-up → plan ${runId}`);
      if (intent !== 'generic') {
        await api.postMessage({
          channel,
          thread_ts: threadTs,
          text:
            intent === 'plan'
              ? ':clipboard: CTO가 구조화 기획을 시작합니다… (PRD/로드맵/태스크)'
              : ':white_check_mark: 계획 승인을 처리합니다…',
        });
        const reply = await handleCtoPlanning(
          intent,
          instruction,
          slackThreadId(channel, threadTs),
          pulk,
        );
        await api.postMessage({ channel, thread_ts: threadTs, text: `*${bot.label}*\n\n${reply}` });
        log(`${bot.label} planning(${intent}) done ${runId}`);
        return;
      }
    }

    // CMO research bridge: an explicit "리서치 …" request launches the general
    // research engine (detached) instead of the generic executive. The engine
    // reports back into this same thread with a Notion link. Anything that isn't
    // an explicit research trigger (all other CMO/CEO messages) falls through.
    if (bot.id === 'cmo' && cfg.cmoResearchEnabled && classifyCmoIntent(instruction) === 'research') {
      const request = parseResearchRequest(instruction);
      await api.postMessage({
        channel,
        thread_ts: threadTs,
        text:
          `🔎 리서치 시작: ${request.topic || '(주제 미상)'} (목적: ${request.researchPurpose}) — ` +
          '완료되면 이 스레드에 Notion 링크로 회신합니다.',
      });
      try {
        const r = launchResearchRun({ request, channel, threadTs, repoRoot: cfg.repoRoot });
        if (r.ok) {
          log(`${bot.label} research launched ${runId} pid=${r.pid ?? '?'} cli=${r.cliPath}`);
        } else {
          await api.postMessage({
            channel,
            thread_ts: threadTs,
            text: `⚠️ 리서치 엔진을 시작하지 못했습니다: ${r.error}`,
          });
          log(`${bot.label} research launch failed ${runId}: ${r.error}`);
        }
      } catch (err) {
        const m = errMsg(err);
        await api.postMessage({ channel, thread_ts: threadTs, text: `⚠️ ${bot.label} 리서치 시작 중 오류: ${m}` });
        log(`${bot.label} research error ${runId}: ${m}`);
      }
      return;
    }

    await api.postMessage({
      channel,
      thread_ts: threadTs,
      text: `:large_green_circle: ${bot.label}가 작업을 시작합니다…`,
    });

    try {
      const result = await runExecutive(EXECUTIVES[bot.id], instruction, runId, cfg);
      await api.postMessage({
        channel,
        thread_ts: threadTs,
        text: `*${bot.label}*\n\n${formatSlackText(result.reply)}`,
      });

      if (result.files.length > 0) {
        if (cfg.postFilesInline) {
          for (const file of result.files) {
            try {
              await api.uploadFile(file, channel, threadTs, `${bot.label} 산출물`);
            } catch (e) {
              log(`${bot.label} upload failed (${file}): ${errMsg(e)}`);
            }
          }
        } else {
          const names = result.files.map((f) => f.split('/').pop()).join(', ');
          await api.postMessage({
            channel,
            thread_ts: threadTs,
            text: `📎 산출물 ${result.files.length}개 저장됨: ${names}`,
          });
        }
      }
      log(`${bot.label} done ${runId} exit=${result.exitCode} files=${result.files.length}`);
    } catch (err) {
      const m = errMsg(err);
      await api.postMessage({ channel, thread_ts: threadTs, text: `⚠️ ${bot.label} 작업 중 오류: ${m}` });
      log(`${bot.label} error ${runId}: ${m}`);
    }
  };

  const client = new SocketModeClient(bot.appToken, handler, log, bot.label);
  await client.start();
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('fatal:', err);
  process.exit(1);
});
