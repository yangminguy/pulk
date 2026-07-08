// Executor — runs the matched executive as a headless `claude` subagent.
// (Same engine as services/telegram-gateway; only the framing text and run dir
// differ.) The runtime's runXAgent() returns a JSON *decision* only; to actually
// DO work and produce files we drive the .claude/agents/<id>.md persona headless:
//
//   claude -p "<prompt>" --model <m> <extra args>   (cwd = pulk repo root)
//
// The agent saves deliverables into a per-run directory; the gateway then ships
// whatever lands there back into the Slack thread.

import { spawn } from 'node:child_process';
import { mkdir, readdir, stat } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ExecutiveDef } from './router.js';

// A bare `claude -p` loads the host project's MCP servers on every spawn (~5-9s
// cold start + possible OAuth popups) — none of which the executives need. Force
// an empty MCP config so each run starts lean.
const EMPTY_MCP_CONFIG_PATH = (() => {
  try {
    const p = join(tmpdir(), 'l5-slack-empty-mcp.json');
    writeFileSync(p, '{"mcpServers":{}}');
    return p;
  } catch {
    return null;
  }
})();

export interface ExecutorConfig {
  repoRoot: string;
  model: string;
  extraArgs: string[];
  timeoutMs: number;
  claudeBin?: string;
}

// When Anthropic's per-minute burst limit is hit, the CLI prints a short notice
// and exits. Detect it so we retry with backoff instead of forwarding noise.
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
  reply: string;
  files: string[];
  dir: string;
  exitCode: number;
}

function buildPrompt(exec: ExecutiveDef, instruction: string, deliverDir: string): string {
  return [
    `You are operating as the ${exec.label} executive of L5 Business OS, invoked from Slack by the Founder (사장님).`,
    `Use the "${exec.id}" subagent to handle this request — adopt that persona, role, and guardrails.`,
    '',
    '[사장님 지시]',
    instruction || '(별도 지시 없음 — 담당 영역 현황을 보고하라)',
    '',
    '[실행 규칙]',
    '- 대화로 끝내지 말고 로컬에서 실제 작업을 수행하라. 합의가 필요하면 짧게 되묻되, 명확하면 바로 착수.',
    `- 산출물 파일(문서/html/mp4/png 등)은 반드시 이 디렉토리에 저장하라: ${deliverDir}`,
    '- 외부 발행/전송/결제 등 위험 액션은 승인 게이트를 지키고 직접 실행하지 마라.',
    '- 마지막 답변은 한국어로 간결하게: 무엇을 했는지 + 파일 위치 + 한 줄 요약. (이 텍스트가 Slack 스레드로 전송된다)',
  ].join('\n');
}

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
      try {
        child.kill('SIGTERM');
      } catch {
        /* ignore */
      }
      setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {
          /* ignore */
        }
      }, 5000);
      finish(124);
    }, timeoutMs);

    child.stdout?.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr?.on('data', (d) => {
      stderr += d.toString();
    });
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
  const deliverDir = join(cfg.repoRoot, '.slack-runs', runId);
  await mkdir(deliverDir, { recursive: true });

  const prompt = buildPrompt(exec, instruction, deliverDir);
  const bin = cfg.claudeBin ?? 'claude';
  const mcpArgs = EMPTY_MCP_CONFIG_PATH
    ? ['--strict-mcp-config', '--mcp-config', EMPTY_MCP_CONFIG_PATH]
    : [];
  const args = ['-p', prompt, '--model', cfg.model, ...mcpArgs, ...cfg.extraArgs];

  const maxRetries = Math.max(0, Number(process.env.SLACK_RATE_LIMIT_RETRIES ?? 3));
  const retryWaitMs = Math.max(0, Number(process.env.SLACK_RATE_LIMIT_WAIT_MS ?? 60_000));

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
