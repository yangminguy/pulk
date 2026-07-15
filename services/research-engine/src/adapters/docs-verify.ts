// docs-verify adapter — DocsVerifyPort. Cross-checks technical claims against
// official documentation by spawning the `claude` CLI with WebSearch/WebFetch
// enabled (spec §7.6). This needs --allowedTools, which the shared
// claude-cli-client doesn't expose, so we spawn directly here.
//
// Graceful failure: if the claude binary is missing, times out, or returns
// unparsable output, every claim comes back UNVERIFIED (never throws) so the
// pipeline's VERIFY phase can continue and record the limitation.

import { spawn as nodeSpawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
  DocsVerifyClaim,
  DocsVerifyPort,
  DocsVerificationResult,
  VerificationStatus,
} from '@l5/core';

const DEFAULT_MODEL = 'claude-opus-4-8';
const DEFAULT_TIMEOUT_MS = 300_000;

const VALID_STATUS: ReadonlySet<VerificationStatus> = new Set<VerificationStatus>([
  'VERIFIED',
  'SUPPORTED',
  'PRACTITIONER_CONSENSUS',
  'CONTESTED',
  'ANECDOTAL',
  'UNVERIFIED',
  'TRANSCRIPT_AMBIGUOUS',
  'OUTDATED',
]);

// Empty MCP config so the spawn doesn't load the host project's MCP servers
// (OAuth popups + cold start) — same trick as claude-cli-client.
const EMPTY_MCP_CONFIG_PATH = (() => {
  try {
    const p = join(tmpdir(), 'l5-research-docsverify-empty-mcp.json');
    writeFileSync(p, '{"mcpServers":{}}');
    return p;
  } catch {
    return null;
  }
})();

export type SpawnFn = typeof nodeSpawn;

export interface DocsVerifyOptions {
  model?: string;
  timeoutMs?: number;
  spawnImpl?: SpawnFn;
  now?: () => Date;
  log?: (msg: string) => void;
}

function buildPrompt(claims: DocsVerifyClaim[]): string {
  const list = claims
    .map((c, i) => `${i + 1}. ${c.claim}${c.hint ? ` (context: ${c.hint})` : ''}`)
    .join('\n');
  return [
    'You are a fact-checker verifying technical claims against OFFICIAL documentation.',
    'For each claim, use WebSearch/WebFetch. Priority of sources: official docs > GitHub releases > papers > official blog > secondary > (never rely on YouTube).',
    'When a claim conflicts with official docs, mark it and describe the conflict; official docs win.',
    '',
    'Return ONLY a JSON array (no prose, no code fence). One object per claim, same order:',
    '{"claim": <verbatim claim>, "status": <one of VERIFIED|SUPPORTED|CONTESTED|OUTDATED|UNVERIFIED>, "sourceUrl": <url or "">, "checkedVersion": <version or "">, "conflict": <string or "">}',
    '',
    'Claims:',
    list,
  ].join('\n');
}

function runClaude(
  prompt: string,
  model: string,
  timeoutMs: number,
  spawnImpl: SpawnFn,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = [
      '-p',
      prompt,
      '--model',
      model,
      '--output-format',
      'json',
      '--allowedTools',
      'WebSearch',
      'WebFetch',
      '--strict-mcp-config',
    ];
    if (EMPTY_MCP_CONFIG_PATH) args.push('--mcp-config', EMPTY_MCP_CONFIG_PATH);

    const child = spawnImpl('claude', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        child.kill('SIGKILL');
      } catch {
        /* ignore */
      }
      reject(new Error(`docs-verify: timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout?.on('data', (c: Buffer | string) => (stdout += c.toString()));
    child.stderr?.on('data', (c: Buffer | string) => (stderr += c.toString()));
    child.on('error', (err: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`docs-verify: spawn error (${err.message})`));
    });
    child.on('close', (code: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`docs-verify: exit ${code ?? 'null'} — ${stderr.trim().slice(0, 300)}`));
        return;
      }
      resolve(stdout);
    });
  });
}

/** Extract the model's answer string from `--output-format json` envelope. */
function extractResult(stdout: string): string {
  const trimmed = stdout.trim();
  if (!trimmed) throw new Error('empty stdout');
  const lines = trimmed.split(/\r?\n/).filter((l) => l.trim());
  let parsed: { result?: unknown; is_error?: boolean } | undefined;
  for (const line of lines) {
    try {
      parsed = JSON.parse(line);
    } catch {
      /* try next */
    }
  }
  const payload: { result?: unknown; is_error?: boolean } =
    parsed ?? (JSON.parse(trimmed) as { result?: unknown; is_error?: boolean });
  if (payload.is_error === true) throw new Error('claude reported is_error');
  if (typeof payload.result !== 'string') throw new Error('missing result string');
  return payload.result;
}

/** Extract the outermost JSON array from a possibly fenced string. */
function parseArray(result: string): unknown[] {
  let s = result.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();
  const start = s.indexOf('[');
  const end = s.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) throw new Error('no JSON array found');
  const parsed = JSON.parse(s.slice(start, end + 1));
  if (!Array.isArray(parsed)) throw new Error('expected array');
  return parsed;
}

export class DocsVerifier implements DocsVerifyPort {
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly spawnImpl: SpawnFn;
  private readonly now: () => Date;
  private readonly log: (msg: string) => void;

  constructor(opts: DocsVerifyOptions = {}) {
    this.model = opts.model ?? process.env.RESEARCH_DOCS_VERIFY_MODEL ?? DEFAULT_MODEL;
    this.timeoutMs = opts.timeoutMs ?? Number(process.env.RESEARCH_DOCS_VERIFY_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
    this.spawnImpl = opts.spawnImpl ?? nodeSpawn;
    this.now = opts.now ?? (() => new Date());
    this.log = opts.log ?? ((m) => process.stderr.write(`${m}\n`));
  }

  private allUnverified(claims: DocsVerifyClaim[]): DocsVerificationResult[] {
    const checkedAt = this.now().toISOString();
    return claims.map((c) => ({ claim: c.claim, status: 'UNVERIFIED' as VerificationStatus, checkedAt }));
  }

  async verifyClaims(claims: DocsVerifyClaim[]): Promise<DocsVerificationResult[]> {
    if (claims.length === 0) return [];
    let items: unknown[];
    try {
      const stdout = await runClaude(buildPrompt(claims), this.model, this.timeoutMs, this.spawnImpl);
      items = parseArray(extractResult(stdout));
    } catch (err) {
      this.log(`[docs-verify] falling back to UNVERIFIED: ${(err as Error).message}`);
      return this.allUnverified(claims);
    }

    const checkedAt = this.now().toISOString();
    const byClaim = new Map<string, Record<string, unknown>>();
    for (const it of items) {
      if (it && typeof it === 'object' && 'claim' in it) {
        byClaim.set(String((it as Record<string, unknown>).claim).trim(), it as Record<string, unknown>);
      }
    }

    return claims.map((c) => {
      const raw = byClaim.get(c.claim.trim());
      if (!raw) return { claim: c.claim, status: 'UNVERIFIED' as VerificationStatus, checkedAt };
      const status = String(raw.status ?? '').toUpperCase() as VerificationStatus;
      const result: DocsVerificationResult = {
        claim: c.claim,
        status: VALID_STATUS.has(status) ? status : 'UNVERIFIED',
        checkedAt,
      };
      if (raw.sourceUrl && String(raw.sourceUrl).trim()) result.sourceUrl = String(raw.sourceUrl).trim();
      if (raw.checkedVersion && String(raw.checkedVersion).trim())
        result.checkedVersion = String(raw.checkedVersion).trim();
      if (raw.conflict && String(raw.conflict).trim()) result.conflict = String(raw.conflict).trim();
      return result;
    });
  }
}
