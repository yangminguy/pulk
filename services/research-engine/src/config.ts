// research-engine configuration — resolved entirely from env (spec §10).
// Mirrors services/notion-gateway/src/config.ts: no dotenv dependency (notion-gateway
// reads process.env directly; the launchd/shell env supplies .env.local values).
// No secret is hardcoded — only non-secret ids (Notion page id) get documented defaults.

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type LlmModel = 'opus' | 'sonnet' | 'haiku';

export interface ResearchEngineConfig {
  // filesystem
  repoRoot: string;
  serviceRoot: string;
  storeDir: string;
  // youtube-cli
  vendorYoutubePath: string;
  // llm (single port — see cli.ts note; opus for synthesis quality)
  llmModel: LlmModel;
  // second brain
  secondBrainDir: string;
  secondBrainBrain: string;
  secondBrainPy: string;
  embeddingsDbPath: string;
  embedBridgePath: string;
  // notion
  notionToken: string;
  notionVersion: string;
  notionParentPageId: string;
  notionDatabaseId: string;
  // slack
  slackToken: string;
  // docs verify
  docsVerifyModel: string;
}

function expandHome(p: string): string {
  if (p === '~') return process.env.HOME ?? p;
  if (p.startsWith('~/')) return join(process.env.HOME ?? '', p.slice(2));
  return p;
}

function resolvePaths(): { repoRoot: string; serviceRoot: string } {
  // dist/config.js → serviceRoot = services/research-engine, repoRoot = pulk root.
  const here = dirname(fileURLToPath(import.meta.url));
  const serviceRoot = resolve(here, '..');
  const repoRoot = resolve(here, '../../..');
  return { repoRoot, serviceRoot };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ResearchEngineConfig {
  const { repoRoot, serviceRoot } = resolvePaths();
  const storeDir = expandHome(env.RESEARCH_STORE_DIR ?? join('~', 'second-brain', 'research'));
  const secondBrainDir = env.SECONDBRAIN_DIR ?? '/Users/wonminyang/세컨 브레인';
  const secondBrainPy = env.SECONDBRAIN_PY ?? resolve(secondBrainDir, '.venv/bin/python');

  const model = (env.RESEARCH_LLM_MODEL ?? 'opus') as LlmModel;

  return {
    repoRoot: env.PULK_DIR ?? repoRoot,
    serviceRoot,
    storeDir,
    vendorYoutubePath: join(serviceRoot, 'vendor', 'youtube-research', 'youtube.mjs'),
    llmModel: model === 'sonnet' || model === 'haiku' ? model : 'opus',
    secondBrainDir,
    secondBrainBrain: env.SECONDBRAIN_BRAIN ?? 'biz',
    secondBrainPy,
    embeddingsDbPath: join(storeDir, 'embeddings.sqlite'),
    embedBridgePath: join(serviceRoot, 'src', 'adapters', 'embed_bridge.py'),
    // Token: conventional NOTION_TOKEN or the founder's .env.local key.
    notionToken: env.NOTION_TOKEN ?? env.notionintegrationtoken ?? '',
    notionVersion: env.NOTION_VERSION ?? '2022-06-28',
    // Documented default: L5 리서치 보고서 페이지(양원민 Documentation DB 하위), 2026-07-14 생성.
    // A Notion page id is not a secret (same precedent as notion-gateway's notionDatabaseId).
    notionParentPageId:
      env.NOTION_RESEARCH_PARENT_PAGE_ID ?? '39d37e66cadf8140959cd30c6264e429',
    notionDatabaseId: env.NOTION_RESEARCH_DATABASE_ID ?? '',
    slackToken: env.RESEARCH_SLACK_BOT_TOKEN ?? env.SLACK_CMO_BOT_TOKEN ?? '',
    docsVerifyModel: env.RESEARCH_DOCS_VERIFY_MODEL ?? 'claude-opus-4-8',
  };
}
