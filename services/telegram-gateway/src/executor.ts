// Executor — runs the matched executive as a headless `claude` subagent.
//
// Why claude CLI (not the agent-runtime runXAgent functions): the runtime
// functions return a JSON *decision* only. To actually DO the work and produce
// real files (html plans, rendered mp4, ACR dispatch), we drive the same Claude
// Code engine that powers the .claude/agents/<id>.md personas, headless.
//
//   claude -p "<prompt>" --model <m> <extra args>   (cwd = pulk repo root)
//
// The agent is told to save every deliverable into a per-run directory; the
// gateway then ships whatever lands there to Telegram.

import { spawn } from 'node:child_process';
import { mkdir, readdir, stat } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ExecutiveDef } from './router.js';

// Speed: a bare `claude -p` loads the host project's MCP servers (Supabase/
// Notion/Slack/etc.) on every spawn — ~5-9s of cold start plus possible OAuth
// popups — none of which the executives need. Force an empty MCP config so each
// run starts lean. (Mirrors packages/l5-core claude-cli-client.ts.)
const EMPTY_MCP_CONFIG_PATH = (() => {
  try {
    const p = join(tmpdir(), 'l5-telegram-empty-mcp.json');
    writeFileSync(p, '{"mcpServers":{}}');
    return p;
  } catch {
    return null;
  }
})();

export interface ExecutorConfig {
  /** pulk repo root — where .claude/agents and the codebase live. */
  repoRoot: string;
  /** Model for the headless run (sonnet/opus/haiku). */
  model: string;
  /** Extra claude CLI args (e.g. permission flags). */
  extraArgs: string[];
  /** Hard wall-clock limit per run (ms). */
  timeoutMs: number;
  /** Optional override for the claude binary. */
  claudeBin?: string;
}

// Anthropic의 분당 burst 한도(시간당 잔여와 별개)에 걸리면 claude CLI는 stdout에
// 짧은 안내 문자열만 뱉고 종료한다. 그 텍스트가 그대로 텔레그램으로 전달되면
// 사장님이 의미 없는 알림을 반복해서 받게 되므로 — 게이트웨이가 직접 감지하고
// 백오프 재시도로 흡수한다. 정상 답변에 우연히 'rate limit' 단어가 섞이는 경우와
// 구분하려고 "짧은 stdout 안에서만" 매칭한다.
const RATE_LIMIT_RE =
  /rate[-_ ]?limit(ing|ed|er)?|overloaded_error|429 too many requests|provider is rate-limit/i;

export function looksRateLimited(stdout: string, stderr: string): boolean {
  const out = (stdout ?? '').trim();
  if (out && RATE_LIMIT_RE.test(out) && out.length < 400) return true;
  if (RATE_LIMIT_RE.test(stderr ?? '')) return true;
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export interface ExecutorResult {
  /** Final assistant text (sent to Telegram). */
  reply: string;
  /** Absolute paths of deliverable files produced this run. */
  files: string[];
  /** The per-run deliverable directory (for deferred "send me the files"). */
  dir: string;
  exitCode: number;
}

function buildPrompt(exec: ExecutiveDef, instruction: string, deliverDir: string): string {
  return [
    `You are operating as the ${exec.label} executive of L5 Business OS, invoked from Telegram by the Founder (사장님).`,
    `Use the "${exec.id}" subagent to handle this request — adopt that persona, role, and guardrails.`,
    '',
    '[사장님 지시]',
    instruction || '(별도 지시 없음 — 담당 영역 현황을 보고하라)',
    '',
    '[실행 규칙]',
    '- 대화로 끝내지 말고 로컬에서 실제 작업을 수행하라. 합의가 필요하면 짧게 되묻되, 명확하면 바로 착수.',
    `- 산출물 파일(문서/html/mp4/png 등)은 반드시 이 디렉토리에 저장하라: ${deliverDir}`,
    '- 외부 발행/전송/결제 등 위험 액션은 승인 게이트를 지키고 직접 실행하지 마라.',
    '- 마지막 답변은 한국어로 간결하게: 무엇을 했는지 + 파일 위치 + 한 줄 요약. (이 텍스트가 텔레그램으로 전송된다)',
  ].join('\n');
}

/** Resolve newly-produced deliverable files (everything written into deliverDir). */
async function collectFiles(deliverDir: string): Promise<string[]> {
  try {
    const entries = await readdir(deliverDir);
    const out: string[] = [];
    for (const name of entries) {
      const full = join(deliverDir, name);
      const s = await stat(full);
      if (s.isFile() && s.size > 0) out.push(full);
    }
    return out;
  } catch {
    return [];
  }
}

// Spawn one headless `claude -p` run. Pure side-effect: returns stdout/stderr/exit.
async function spawnOnce(
  args: string[],
  bin: string,
  cwd: string,
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  let stdout = '';
  let stderr = '';
  const exitCode = await new Promise<number>((resolve) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(bin, args, { cwd, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch {
      resolve(1);
      return;
    }
    let settled = false;
    const finish = (code: number) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(code);
    };
    const timer = setTimeout(() => {
      try { child.kill('SIGTERM'); } catch { /* ignore */ }
      setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* ignore */ } }, 5000);
      finish(124);
    }, timeoutMs);

    child.stdout?.on('data', (d) => { stdout += d.toString(); });
    child.stderr?.on('data', (d) => { stderr += d.toString(); });
    child.on('close', (code) => finish(code ?? 1));
    child.on('error', () => finish(1));
  });
  return { stdout, stderr, exitCode };
}

export async function runExecutive(
  exec: ExecutiveDef,
  instruction: string,
  runId: string,
  cfg: ExecutorConfig,
): Promise<ExecutorResult> {
  const deliverDir = join(cfg.repoRoot, '.telegram-runs', runId);
  await mkdir(deliverDir, { recursive: true });

  const prompt = buildPrompt(exec, instruction, deliverDir);
  const bin = cfg.claudeBin ?? 'claude';
  const mcpArgs = EMPTY_MCP_CONFIG_PATH
    ? ['--strict-mcp-config', '--mcp-config', EMPTY_MCP_CONFIG_PATH]
    : [];
  const args = ['-p', prompt, '--model', cfg.model, ...mcpArgs, ...cfg.extraArgs];

  const maxRetries = Math.max(0, Number(process.env.TELEGRAM_RATE_LIMIT_RETRIES ?? 3));
  const retryWaitMs = Math.max(0, Number(process.env.TELEGRAM_RATE_LIMIT_WAIT_MS ?? 60_000));

  let stdout = '';
  let stderr = '';
  let exitCode = 1;
  let rateLimited = false;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const r = await spawnOnce(args, bin, cfg.repoRoot, cfg.timeoutMs);
    stdout = r.stdout;
    stderr = r.stderr;
    exitCode = r.exitCode;
    rateLimited = looksRateLimited(stdout, stderr);
    if (!rateLimited) break;
    if (attempt < maxRetries) {
      // eslint-disable-next-line no-console
      console.log(
        `[${new Date().toISOString()}] rate-limited (${exec.id} ${runId}) — retry ${attempt + 1}/${maxRetries} in ${Math.round(retryWaitMs / 1000)}s`,
      );
      await sleep(retryWaitMs);
    }
  }

  const files = await collectFiles(deliverDir);
  let reply = stdout.trim();
  if (rateLimited) {
    // 모든 재시도가 burst 한도에 걸렸음 — 사장님께는 한 번만 짧게 안내한다.
    reply =
      `⏳ ${exec.label} 작업이 Anthropic 분당 burst 한도에 반복해서 걸렸습니다 (${maxRetries + 1}회 시도). ` +
      `잠시 후 다시 한 번 메시지를 보내주세요. 작업은 수행되지 않았습니다.`;
  } else if (!reply) {
    reply =
      exitCode === 124
        ? `${exec.label} 작업이 시간 초과로 중단됐습니다.`
        : `${exec.label} 작업이 응답 없이 종료됐습니다 (exit ${exitCode}). ${stderr.slice(-300)}`.trim();
  }
  return { reply, files, dir: deliverDir, exitCode };
}
