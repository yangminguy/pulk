// L5 Inbound Telegram Gateway — entrypoint.
//
//   Telegram message ("@cto 지금 진행상황 정리해줘")
//     → long-poll getUpdates
//     → allowlist check (only the Founder's chat)
//     → routeMessage → { executive, instruction }
//     → ack ("CTO가 작업을 시작합니다…")
//     → runExecutive (headless claude subagent, does real work)
//     → reply text + sendDocument for each deliverable file
//
// Runs as a persistent process (launchd KeepAlive) on the Founder's Mac.

import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { loadConfig } from './config.js';
import { TelegramApi } from './telegram-api.js';
import { routeMessage, helpText, wantsFiles, isSendLastFilesRequest } from './router.js';
import { runExecutive } from './executor.js';

function log(msg: string): void {
  // eslint-disable-next-line no-console
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  const api = new TelegramApi({ botToken: cfg.botToken, pollTimeoutSec: cfg.pollTimeoutSec });

  if (cfg.allowedChatIds.length === 0) {
    log('WARN: no TELEGRAM_CHAT_ID / TELEGRAM_ALLOWED_CHAT_IDS set — all messages will be ignored.');
  }
  log(`gateway up. repoRoot=${cfg.repoRoot} model=${cfg.model} allowed=${cfg.allowedChatIds.join(',') || '(none)'}`);

  // Remember the last run per chat so "그 파일 보내줘" can ship prior deliverables.
  const lastRun = new Map<number, { dir: string; label: string }>();

  let offset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const updates = await api.getUpdates(offset);
    for (const u of updates) {
      offset = u.update_id + 1;
      const msg = u.message;
      if (!msg?.text) continue;

      const chatId = msg.chat.id;
      if (!cfg.allowedChatIds.includes(chatId)) {
        log(`ignored message from non-allowlisted chat ${chatId}`);
        continue;
      }

      const routed = routeMessage(msg.text);
      if (!routed) {
        // Only nudge with help if they tried to mention someone (contains '@').
        if (msg.text.includes('@')) await api.sendMessage(chatId, helpText());
        continue;
      }

      const { executive, instruction } = routed;

      // Shortcut: "방금 그 파일 보내줘" — ship the previous run's files, no re-run.
      if (isSendLastFilesRequest(instruction)) {
        const prev = lastRun.get(chatId);
        const files = prev ? await listFiles(prev.dir) : [];
        if (files.length === 0) {
          await api.sendMessage(chatId, '보낼 산출물이 없습니다. (직전 작업에 저장된 파일이 없어요)');
        } else {
          for (const f of files) await api.sendDocument(chatId, f, `${prev!.label} 산출물`);
        }
        continue;
      }

      const runId = `${Date.now()}-${msg.message_id}-${executive.id}`;
      const sendFiles = wantsFiles(instruction);
      log(`dispatch ${executive.id} run=${runId} sendFiles=${sendFiles} instr="${instruction.slice(0, 80)}"`);
      await api.sendMessage(chatId, `🟢 ${executive.label}가 작업을 시작합니다…`);

      try {
        const result = await runExecutive(executive, instruction, runId, cfg);
        lastRun.set(chatId, { dir: result.dir, label: executive.label });

        let reply = `*${executive.label}*\n\n${result.reply}`;
        // If files were produced but not requested, note them instead of dumping.
        if (!sendFiles && result.files.length > 0) {
          const names = result.files.map((f) => f.split('/').pop()).join(', ');
          reply += `\n\n📎 산출물 ${result.files.length}개 저장됨 (받으려면 "파일 보내줘"): ${names}`;
        }
        await api.sendMessage(chatId, reply);

        if (sendFiles) {
          for (const file of result.files) {
            await api.sendDocument(chatId, file, `${executive.label} 산출물`);
          }
        }
        log(`done ${runId} exit=${result.exitCode} files=${result.files.length} sent=${sendFiles}`);
      } catch (err) {
        const m = err instanceof Error ? err.message : String(err);
        await api.sendMessage(chatId, `⚠️ ${executive.label} 작업 중 오류: ${m}`);
        log(`error ${runId}: ${m}`);
      }
    }
  }
}

/** List non-empty files in a directory (absolute paths). */
async function listFiles(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir);
    const out: string[] = [];
    for (const name of entries) {
      const full = join(dir, name);
      const s = await stat(full);
      if (s.isFile() && s.size > 0) out.push(full);
    }
    return out;
  } catch {
    return [];
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('fatal:', err);
  process.exit(1);
});
