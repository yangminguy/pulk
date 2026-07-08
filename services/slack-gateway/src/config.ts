// Config — resolved entirely from environment (rules: no secret hardcoding).
//
// Each executive is a separate Slack app in Socket Mode, so each needs a pair:
//   <PREFIX>_BOT_TOKEN  (xoxb-...)  — Web API calls (chat.postMessage, files…)
//   <PREFIX>_APP_TOKEN  (xapp-...)  — Socket Mode connection (apps.connections.open)
// A bot is skipped if neither is set, so you can bring executives online one at
// a time. If exactly one of the pair is set, that's a misconfiguration → throw.

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ExecutiveId } from './router.js';

export interface BotConfig {
  id: ExecutiveId;
  label: string;
  botToken: string;
  appToken: string;
}

export interface GatewayConfig {
  bots: BotConfig[];
  /** Slack user ids allowed to command the executives. Empty = allow anyone (warned). */
  allowedUserIds: string[];
  repoRoot: string;
  model: string;
  extraArgs: string[];
  timeoutMs: number;
  claudeBin?: string;
  /** Upload deliverable files back into the Slack thread. */
  postFilesInline: boolean;
  /** CTO structured planning bridge (cto:planMessage/approvePlan via NocoBase). */
  ctoPlanningEnabled: boolean;
  nocobaseUrl: string;
  nocobaseToken: string;
}

const BOT_DEFS: { id: ExecutiveId; label: string; envPrefix: string }[] = [
  { id: 'ceo', label: 'CEO', envPrefix: 'SLACK_CEO' },
  { id: 'cmo', label: 'CMO', envPrefix: 'SLACK_CMO' },
  { id: 'cto', label: 'CTO', envPrefix: 'SLACK_CTO' },
];

export function loadConfig(env: NodeJS.ProcessEnv = process.env): GatewayConfig {
  const bots: BotConfig[] = [];
  for (const def of BOT_DEFS) {
    const botToken = env[`${def.envPrefix}_BOT_TOKEN`] ?? '';
    const appToken = env[`${def.envPrefix}_APP_TOKEN`] ?? '';
    if (!botToken && !appToken) continue; // executive not configured yet — skip
    if (!botToken || !appToken) {
      throw new Error(
        `${def.label}: both ${def.envPrefix}_BOT_TOKEN (xoxb-) and ${def.envPrefix}_APP_TOKEN (xapp-) are required`,
      );
    }
    bots.push({ id: def.id, label: def.label, botToken, appToken });
  }
  if (bots.length === 0) {
    throw new Error(
      'no executives configured — set at least SLACK_CEO_BOT_TOKEN + SLACK_CEO_APP_TOKEN',
    );
  }

  // Default repo root: services/slack-gateway/dist -> up 3 = pulk root.
  const here = dirname(fileURLToPath(import.meta.url));
  const defaultRoot = resolve(here, '../../..');

  const allowedUserIds = (env.SLACK_ALLOWED_USER_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    bots,
    allowedUserIds,
    repoRoot: env.PULK_DIR ?? defaultRoot,
    model: env.SLACK_AGENT_MODEL ?? 'sonnet',
    // Default permission mode lets the agent write files without prompting.
    // For full autonomy (bash/render), set SLACK_CLAUDE_ARGS="--dangerously-skip-permissions".
    extraArgs: (env.SLACK_CLAUDE_ARGS ?? '--permission-mode acceptEdits')
      .split(/\s+/)
      .filter(Boolean),
    timeoutMs: Number(env.SLACK_RUN_TIMEOUT_MS ?? 15 * 60 * 1000),
    claudeBin: env.CLAUDE_BIN,
    postFilesInline: (env.SLACK_POST_FILES ?? 'true') !== 'false',
    // On by default; needs NOCOBASE_TOKEN at call time (missing → clear error reply).
    ctoPlanningEnabled: (env.SLACK_CTO_PLANNING_ENABLED ?? 'true') !== 'false',
    nocobaseUrl: env.NOCOBASE_URL ?? 'http://localhost:13000',
    nocobaseToken: env.NOCOBASE_TOKEN ?? '',
  };
}
