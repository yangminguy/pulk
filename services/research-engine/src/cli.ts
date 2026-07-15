// research-engine CLI runner (WO-B entrypoint).
//
//   node dist/cli.js --request '<ResearchRequest JSON>' \
//       [--resume <runId>] [--slack-channel <ch>] [--slack-thread <ts>]
//
// Assembles the concrete adapters from config, injects them into the pure
// @l5/core pipeline, and runs EXPAND→…→PUBLISH. State is persisted after every
// phase (fs store), so a crashed run is resumable with --resume <runId>.
//
// LLM: the domain exposes a SINGLE llm port, so extraction and synthesis share
// one client. We use createClaudeCLIClient (env ANTHROPIC_API_KEY is honored by
// the claude CLI itself; we intentionally do NOT add a separate SDK path — CLI
// only, per the WO-B simplification note). Default model is opus for synthesis
// quality; override with RESEARCH_LLM_MODEL=sonnet|haiku. (Because model can't be
// split per-phase here, this is recorded as an intentional deviation.)
//
// Exit code 0 on success; non-zero on failure (the pipeline persists the error
// into runs/<runId>/state.json before throwing, so the run can be resumed).

import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createClaudeCLIClient, runResearchPipeline } from '@l5/core';
import type { ResearchPorts, ResearchRequest } from '@l5/core';
import { loadConfig, type ResearchEngineConfig } from './config.js';
import { YouTubeCliAdapter } from './adapters/youtube-cli.js';
import { FsStore } from './adapters/store-fs.js';
import { makeBrainCards } from './adapters/brain-cards.js';
import { makeEmbeddings } from './adapters/embeddings.js';
import { NotionPublisher } from './adapters/notion.js';
import { SlackNotifier } from './adapters/slack.js';
import { DocsVerifier } from './adapters/docs-verify.js';
import { withRetry } from './adapters/llm-retry.js';
import { parseCliArgs, USAGE } from './cli-args.js';

const LLM_TIMEOUT_MS = Number(process.env.RESEARCH_LLM_TIMEOUT_MS ?? 300_000);

function log(msg: string): void {
  process.stderr.write(`[${new Date().toISOString()}] ${msg}\n`);
}

export function buildPorts(cfg: ResearchEngineConfig, defaultChannel?: string): ResearchPorts {
  const youtube = new YouTubeCliAdapter({ vendorPath: cfg.vendorYoutubePath, cwd: cfg.repoRoot });
  const cards = makeBrainCards({
    dir: cfg.secondBrainDir,
    brain: cfg.secondBrainBrain,
    py: cfg.secondBrainPy,
    log,
  });
  const store = new FsStore({ rootDir: cfg.storeDir, cards: cards ?? undefined, log });
  const embeddings = makeEmbeddings({
    dbPath: cfg.embeddingsDbPath,
    bridgePath: cfg.embedBridgePath,
    dir: cfg.secondBrainDir,
    py: cfg.secondBrainPy,
    log,
  });
  const notion = new NotionPublisher({
    token: cfg.notionToken,
    version: cfg.notionVersion,
    parentPageId: cfg.notionParentPageId,
    databaseId: cfg.notionDatabaseId,
    log,
  });
  const slack = new SlackNotifier({ token: cfg.slackToken, defaultChannel, log });
  const docsVerify = new DocsVerifier({ model: cfg.docsVerifyModel, log });
  const llm = withRetry(createClaudeCLIClient({ model: cfg.llmModel, timeoutMs: LLM_TIMEOUT_MS }), {
    attempts: Number(process.env.RESEARCH_LLM_RETRY_ATTEMPTS ?? 3),
    log,
  });

  return { youtube, transcript: youtube, llm, store, embeddings, notion, slack, docsVerify };
}

async function main(argv: string[]): Promise<number> {
  const parsed = parseCliArgs(argv);
  if (parsed.error) {
    process.stderr.write(`${parsed.error}\n\n${USAGE}\n`);
    return 1;
  }

  const cfg = loadConfig();
  const ports = buildPorts(cfg, parsed.slackChannel);
  const request: ResearchRequest =
    parsed.request ?? { topic: '(resume)', researchPurpose: 'LEARNING' };

  log(
    `research-engine start — ${parsed.resume ? `resume ${parsed.runId}` : `topic="${request.topic}" purpose=${request.researchPurpose}`}; ` +
      `store=${cfg.storeDir} model=${cfg.llmModel}`,
  );

  try {
    const result = await runResearchPipeline({
      request,
      ports,
      runId: parsed.runId,
      resume: parsed.resume,
      slack: { channel: parsed.slackChannel, threadTs: parsed.slackThread },
    });
    log(
      `DONE runId=${result.runId} analyzed=${result.state.transcriptsDone.length} ` +
        `atoms=${result.state.atoms?.length ?? 0} notion=${result.notionUrl ?? '(none)'} ` +
        `errors=${result.state.errors.length}`,
    );
    return 0;
  } catch (err) {
    log(`FAILED: ${(err as Error).message}`);
    return 1;
  }
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedDirectly) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((err) => {
      log(`FATAL: ${(err as Error).message}`);
      process.exit(1);
    });
}

export { main };
