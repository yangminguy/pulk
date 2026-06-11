// Claude CLI-backed LLMClient adapter.
//
// Shells out to the local `claude` binary with `-p --model <id> --output-format json`,
// passes the combined system+user prompt to `claude -p <prompt>` and parses
// the JSON result.
//
// Includes a small in-memory LRU+TTL cache to short-circuit duplicate prompts that
// happen within a single process (e.g. retries inside a workflow run).

import { spawn as nodeSpawn } from 'child_process';
import { createHash } from 'crypto';
import { writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { LLMClient } from '../functions/ceo-orchestration/types';

export type ClaudeCLIModel = 'opus' | 'sonnet' | 'haiku';

export interface ClaudeCLIClientOptions {
  model: ClaudeCLIModel;
  timeoutMs?: number;
  cwd?: string;
}

const MODEL_ID_MAP: Record<ClaudeCLIModel, string> = {
  opus: 'claude-opus-4-7',
  sonnet: 'claude-sonnet-4-6',
  haiku: 'claude-haiku-4-5',
};

const CACHE_MAX_ENTRIES = 50;
const CACHE_TTL_MS = 60_000;
const DEFAULT_TIMEOUT_MS = 60_000;

// Each `claude -p` spawn otherwise loads the host project's MCP servers
// (claude.ai Supabase/Google etc.), which adds ~5s cold-start per round AND
// triggers OAuth login popups. The executive tool-loop uses our own text-based
// tool protocol, not claude CLI MCP, so MCP is dead weight here. We force an
// empty MCP config via --strict-mcp-config to cut each round ~8.8s → ~4.2s.
// (perf fix 2026-06-02)
const EMPTY_MCP_CONFIG_PATH = (() => {
  try {
    const p = join(tmpdir(), 'l5-claude-cli-empty-mcp.json');
    writeFileSync(p, '{"mcpServers":{}}');
    return p;
  } catch {
    return null;
  }
})();

interface CacheEntry {
  value: string;
  expiresAt: number;
}

// Module-level cache shared across all clients in the process. Keyed by
// sha256(`${modelId}|${system}\n${user}`).
const promptCache = new Map<string, CacheEntry>();

function cacheKey(modelId: string, system: string, user: string): string {
  return createHash('sha256').update(`${modelId}|${system}\n${user}`).digest('hex');
}

function cacheGet(key: string): string | undefined {
  const entry = promptCache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    promptCache.delete(key);
    return undefined;
  }
  // Refresh LRU position.
  promptCache.delete(key);
  promptCache.set(key, entry);
  return entry.value;
}

function cacheSet(key: string, value: string): void {
  promptCache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  while (promptCache.size > CACHE_MAX_ENTRIES) {
    const oldestKey = promptCache.keys().next().value;
    if (oldestKey === undefined) break;
    promptCache.delete(oldestKey);
  }
}

// Spawn function is injected so tests can mock child_process.
type SpawnFn = typeof nodeSpawn;
let spawnImpl: SpawnFn = nodeSpawn;

// Test-only hook. Not part of the public API surface; consumers should not use this.
export function __setSpawnForTest(impl: SpawnFn | null): void {
  spawnImpl = impl ?? nodeSpawn;
}

// Test-only hook to clear the LRU cache between test cases.
export function __clearCacheForTest(): void {
  promptCache.clear();
}

interface ClaudeCLIResultPayload {
  type?: string;
  subtype?: string;
  is_error?: boolean;
  result?: string;
  [k: string]: unknown;
}

function parseClaudeOutput(stdout: string): string {
  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new Error('claude-cli failed: empty stdout');
  }

  // `--output-format json` emits a single JSON object, but be defensive in case
  // future CLI versions stream NDJSON: take the last parseable JSON line.
  const lines = trimmed.split(/\r?\n/).filter((l) => l.trim().length > 0);
  let lastParsed: ClaudeCLIResultPayload | undefined;
  for (const line of lines) {
    try {
      lastParsed = JSON.parse(line) as ClaudeCLIResultPayload;
    } catch {
      // ignore — try next line
    }
  }

  // Fallback: try parsing the whole blob.
  if (!lastParsed) {
    try {
      lastParsed = JSON.parse(trimmed) as ClaudeCLIResultPayload;
    } catch (err) {
      throw new Error(
        `claude-cli failed: invalid JSON output (${(err as Error).message})`,
      );
    }
  }

  if (lastParsed.is_error === true) {
    throw new Error(
      `claude-cli failed: result reported is_error=true (subtype=${lastParsed.subtype ?? 'unknown'})`,
    );
  }

  if (typeof lastParsed.result !== 'string') {
    throw new Error(
      `claude-cli failed: missing result string (got type=${lastParsed.type ?? 'unknown'})`,
    );
  }

  return lastParsed.result;
}

function runClaude(
  modelId: string,
  prompt: string,
  timeoutMs: number,
  cwd?: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = ['-p', prompt, '--model', modelId, '--output-format', 'json'];
    if (EMPTY_MCP_CONFIG_PATH) {
      args.push('--strict-mcp-config', '--mcp-config', EMPTY_MCP_CONFIG_PATH);
    }
    const child = spawnImpl('claude', args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        child.kill('SIGKILL');
      } catch {
        // ignore
      }
      reject(new Error(`claude-cli failed: timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout?.on('data', (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on('error', (err: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`claude-cli failed: spawn error (${err.message})`));
    });

    child.on('close', (code: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        const stderrSnippet = stderr.trim().slice(0, 500);
        reject(
          new Error(
            `claude-cli failed: exit code ${code ?? 'null'}${stderrSnippet ? ` — ${stderrSnippet}` : ''}`,
          ),
        );
        return;
      }
      try {
        resolve(parseClaudeOutput(stdout));
      } catch (err) {
        reject(err);
      }
    });

  });
}

export function createClaudeCLIClient(opts: ClaudeCLIClientOptions): LLMClient {
  const modelId = MODEL_ID_MAP[opts.model];
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const cwd = opts.cwd;

  return {
    async complete({ system, user }) {
      const prompt = `${system}\n\n${user}`;
      const key = cacheKey(modelId, system, user);

      const cached = cacheGet(key);
      if (cached !== undefined) return cached;

      const result = await runClaude(modelId, prompt, timeoutMs, cwd);
      cacheSet(key, result);
      return result;
    },
  };
}
