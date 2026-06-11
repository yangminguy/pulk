// Config — resolved entirely from environment (rules: no secret hardcoding).

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface GatewayConfig {
  botToken: string;
  /** Allowlisted chat ids. Only these may issue commands. Empty = deny all. */
  allowedChatIds: number[];
  repoRoot: string;
  model: string;
  extraArgs: string[];
  timeoutMs: number;
  pollTimeoutSec: number;
  claudeBin?: string;
}

function parseChatIds(raw: string | undefined): number[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): GatewayConfig {
  const botToken = env.TELEGRAM_BOT_TOKEN ?? '';
  if (!botToken) throw new Error('TELEGRAM_BOT_TOKEN is not set');

  // Default repo root: services/telegram-gateway/dist -> up 3 = pulk root.
  const here = dirname(fileURLToPath(import.meta.url));
  const defaultRoot = resolve(here, '../../..');

  // Telegram allows one or many founders; reuse TELEGRAM_CHAT_ID for the common
  // single-chat case, and TELEGRAM_ALLOWED_CHAT_IDS for an explicit allowlist.
  const allowed = parseChatIds(
    env.TELEGRAM_ALLOWED_CHAT_IDS ?? env.TELEGRAM_CHAT_ID,
  );

  return {
    botToken,
    allowedChatIds: allowed,
    repoRoot: env.PULK_DIR ?? defaultRoot,
    model: env.TELEGRAM_AGENT_MODEL ?? 'sonnet',
    // Default permission mode lets the agent write files without prompting.
    // For full autonomy (bash/render), set e.g.
    //   TELEGRAM_CLAUDE_ARGS="--dangerously-skip-permissions"
    extraArgs: (env.TELEGRAM_CLAUDE_ARGS ?? '--permission-mode acceptEdits')
      .split(/\s+/)
      .filter(Boolean),
    timeoutMs: Number(env.TELEGRAM_RUN_TIMEOUT_MS ?? 15 * 60 * 1000),
    pollTimeoutSec: Number(env.TELEGRAM_POLL_TIMEOUT_SEC ?? 30),
    claudeBin: env.CLAUDE_BIN,
  };
}
