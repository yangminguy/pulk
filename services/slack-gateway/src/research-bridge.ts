// CMO research bridge — Slack thread → general-purpose research engine CLI.
//
// The CMO app is one *client* of the research engine (RESEARCH_ENGINE_SPEC §8).
// This module owns only the Slack-side wiring:
//   parseResearchRequest()  — turn a "리서치 …" instruction into a ResearchRequest
//   launchResearchRun()      — detached-spawn the research-engine CLI (fire & forget)
//
// The engine itself (services/research-engine, WO-B) is built by a separate
// agent. We NEVER import it — we only spawn its CLI by path contract. If the CLI
// isn't built yet, launchResearchRun returns an error string and never spawns, so
// the caller can surface a clear message into the Slack thread.
//
// Pure parsing + injectable spawn/fs seams → fully unit-testable without a real
// child process or filesystem (mirrors executor.ts's GitExec injection pattern).

import { spawn, type SpawnOptions } from 'node:child_process';
import { existsSync, mkdirSync, openSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

// ---------------------------------------------------------------------------
// Request shape.
//
// This is the subset of RESEARCH_ENGINE_SPEC §3 ResearchRequest that the Slack
// entry constructs. Defined locally (not imported from @l5/core) so the gateway
// stays decoupled from the in-progress engine/domain packages — the CLI receives
// the full JSON and applies its own defaults for the remaining fields.

export type ResearchPurpose =
  | 'LEARNING'
  | 'TECHNICAL_RESEARCH'
  | 'CONTENT_PLANNING'
  | 'BUSINESS_RESEARCH'
  | 'DECISION_SUPPORT';

export interface ResearchRequest {
  topic: string;
  researchPurpose: ResearchPurpose;
  researchQuestion?: string;
}

const PURPOSES: readonly ResearchPurpose[] = [
  'LEARNING',
  'TECHNICAL_RESEARCH',
  'CONTENT_PLANNING',
  'BUSINESS_RESEARCH',
  'DECISION_SUPPORT',
];

// Explicit `목적=XXX` override (any of the enum values, case-insensitive).
const PURPOSE_OVERRIDE_RE = /목적\s*=\s*([A-Za-z_]+)/;
// Explicit `질문=…` researchQuestion; takes the rest of the line to end.
const QUESTION_OVERRIDE_RE = /질문\s*=\s*(.+)$/;

// Heuristic purpose inference (only when 목적= is not given). Order matters:
// content/planning first, then technical, else default LEARNING (spec §8).
const CONTENT_RE = /콘텐츠|컨텐츠|기획/;
const TECH_RE =
  /개발|코드|코딩|프로그래밍|API|프레임워크|아키텍처|라이브러리|SDK|배포|알고리즘|데이터베이스|인프라|백엔드|프론트엔드|버그|런타임/i;

/**
 * Parse a (mention-stripped, research-classified) CMO instruction into a
 * ResearchRequest. Strips the trigger prefix/suffix to recover the topic,
 * honors explicit `목적=` / `질문=` overrides, and otherwise infers purpose.
 */
export function parseResearchRequest(instruction: string): ResearchRequest {
  let text = typeof instruction === 'string' ? instruction.trim() : '';

  // 1) Explicit overrides (removed from the text before topic extraction).
  let researchPurpose: ResearchPurpose | undefined;
  const pm = text.match(PURPOSE_OVERRIDE_RE);
  if (pm) {
    const val = pm[1].toUpperCase() as ResearchPurpose;
    if (PURPOSES.includes(val)) researchPurpose = val;
    text = text.replace(pm[0], ' ').trim();
  }

  let researchQuestion: string | undefined;
  const qm = text.match(QUESTION_OVERRIDE_RE);
  if (qm) {
    const q = qm[1].trim();
    if (q) researchQuestion = q;
    text = text.replace(qm[0], ' ').trim();
  }

  // 2) Strip the research trigger to recover the topic.
  const topic = text
    .replace(/^\s*(?:리서치|research)\s*[:：]\s*/i, '') // "리서치:" / "research:" prefix
    .replace(/^\s*(?:리서치|research)\s+/i, '') //          "리서치 " / "research " prefix
    .replace(/\s*리서치\s*해줘[.!~\s]*$/i, '') //           "…리서치해줘" / "…리서치 해줘" suffix
    .trim();

  // 3) Infer purpose when not explicitly given (spec §8 heuristic).
  if (!researchPurpose) {
    if (CONTENT_RE.test(topic)) researchPurpose = 'CONTENT_PLANNING';
    else if (TECH_RE.test(topic)) researchPurpose = 'TECHNICAL_RESEARCH';
    else researchPurpose = 'LEARNING';
  }

  const request: ResearchRequest = { topic, researchPurpose };
  if (researchQuestion) request.researchQuestion = researchQuestion;
  return request;
}

// ---------------------------------------------------------------------------
// CLI launch (detached spawn, fire-and-forget).

/** Minimal structural view of a spawned child (test seam). */
export interface SpawnedChild {
  pid?: number;
  unref: () => void;
}

export type SpawnFn = (
  command: string,
  args: string[],
  options: SpawnOptions,
) => SpawnedChild;

export interface LaunchResearchArgs {
  request: ResearchRequest;
  channel: string;
  threadTs: string;
  /** pulk repo root; CLI path defaults to <repoRoot>/services/research-engine/dist/cli.js. */
  repoRoot: string;
  /** Append target for the detached child's stdio. Default ~/.l5/logs/research-engine.log. */
  logPath?: string;
  // ---- injectable seams (tests) ----
  cliPath?: string;
  fileExists?: (p: string) => boolean;
  /** Returns an fd (or 'ignore') for the child's stdout/stderr. */
  openLogFd?: (logPath: string) => number | 'ignore';
  spawnProcess?: SpawnFn;
}

export interface LaunchResearchResult {
  ok: boolean;
  cliPath: string;
  /** node argv (without the leading 'node') actually passed to spawn. */
  argv?: string[];
  pid?: number;
  error?: string;
}

/** Default log destination for the detached research-engine child. */
export function defaultResearchLogPath(): string {
  return join(homedir(), '.l5', 'logs', 'research-engine.log');
}

/** Default CLI path by contract: <repoRoot>/services/research-engine/dist/cli.js. */
export function researchCliPath(repoRoot: string): string {
  return join(repoRoot, 'services', 'research-engine', 'dist', 'cli.js');
}

function defaultOpenLogFd(logPath: string): number {
  mkdirSync(dirname(logPath), { recursive: true });
  return openSync(logPath, 'a');
}

const defaultSpawn: SpawnFn = (command, args, options) => spawn(command, args, options);

/**
 * Launch the research-engine CLI as a detached, unref'd child so the gateway
 * never blocks on the (long-running) research run. If the CLI file isn't present
 * we do NOT spawn — we return `{ ok:false, error }` and let the caller notify
 * Slack. The engine reports back into the same thread via --slack-channel/-thread.
 */
export function launchResearchRun(args: LaunchResearchArgs): LaunchResearchResult {
  const cliPath = args.cliPath ?? researchCliPath(args.repoRoot);
  const fileExists = args.fileExists ?? existsSync;

  if (!fileExists(cliPath)) {
    return {
      ok: false,
      cliPath,
      error:
        `리서치 엔진 CLI가 아직 없습니다: ${cliPath} ` +
        `(services/research-engine 빌드 필요). 리서치를 시작하지 못했습니다.`,
    };
  }

  const logPath = args.logPath ?? defaultResearchLogPath();
  const openLogFd = args.openLogFd ?? defaultOpenLogFd;
  const spawnProcess = args.spawnProcess ?? defaultSpawn;

  const argv = [
    cliPath,
    '--request',
    JSON.stringify(args.request),
    '--slack-channel',
    args.channel,
    '--slack-thread',
    args.threadTs,
  ];

  try {
    const logTarget = openLogFd(logPath);
    const stdio: Array<'ignore' | number> = ['ignore', logTarget, logTarget];
    const child = spawnProcess('node', argv, { detached: true, stdio, cwd: args.repoRoot });
    child.unref();
    return { ok: true, cliPath, argv, pid: child.pid };
  } catch (err) {
    const m = err instanceof Error ? err.message : String(err);
    return { ok: false, cliPath, error: `리서치 엔진 spawn 실패: ${m}` };
  }
}
