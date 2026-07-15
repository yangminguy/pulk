// embeddings adapter — EmbeddingPort backed by the Second Brain venv's fastembed,
// invoked through a small stdin/stdout Python bridge (embed_bridge.py). No native
// npm dependency is added; the external repo is never modified.
//
// available(): true only when the venv python exists AND `import fastembed`
// succeeds (checked once via spawnSync, cached). When false the pipeline skips
// embedding entirely (graceful disable).
//
// embed(): pipes {dbPath, items:[{refId,kind,text,runId}]} as JSON on stdin; the
// bridge upserts into <RESEARCH_STORE_DIR>/embeddings.sqlite keyed by sha256(text)
// (existing hashes are skipped) and returns {embedded, skipped} on stdout.

import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { EmbeddingItem, EmbeddingPort } from '@l5/core';

const CHECK_TIMEOUT_MS = 20_000;
const EMBED_TIMEOUT_MS = 300_000;

export type StdinRunner = (
  py: string,
  args: string[],
  cwd: string,
  stdin: string,
  timeoutMs: number,
) => Promise<string>;

/** spawn helper that writes `stdin` and resolves stdout (rejects on non-zero). */
const defaultRunStdin: StdinRunner = (py, args, cwd, stdin, timeoutMs) =>
  new Promise((resolvePromise, reject) => {
    const child = spawn(py, args, { cwd, timeout: timeoutMs });
    let out = '';
    let err = '';
    child.stdout.on('data', (c) => (out += String(c)));
    child.stderr.on('data', (c) => (err += String(c)));
    child.on('error', (e) => reject(new Error(`embed bridge spawn error: ${e.message}`)));
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`embed bridge exit ${code}: ${err.slice(0, 400)}`));
        return;
      }
      resolvePromise(out);
    });
    child.stdin.write(stdin);
    child.stdin.end();
  });

/** Synchronous fastembed availability probe (test seam). */
export type ImportProbe = (py: string) => boolean;

const defaultProbe: ImportProbe = (py) => {
  try {
    const r = spawnSync(py, ['-c', 'import fastembed, sqlite3'], {
      timeout: CHECK_TIMEOUT_MS,
      encoding: 'utf8',
    });
    return r.status === 0;
  } catch {
    return false;
  }
};

export interface EmbeddingsOptions {
  /** <RESEARCH_STORE_DIR>/embeddings.sqlite */
  dbPath: string;
  /** absolute path to embed_bridge.py */
  bridgePath: string;
  dir?: string;
  py?: string;
  fileExists?: (p: string) => boolean;
  probe?: ImportProbe;
  runStdin?: StdinRunner;
  log?: (msg: string) => void;
}

const DEFAULT_DIR = '/Users/wonminyang/세컨 브레인';

export function makeEmbeddings(opts: EmbeddingsOptions): EmbeddingPort {
  const dir = opts.dir ?? process.env.SECONDBRAIN_DIR ?? DEFAULT_DIR;
  const py = opts.py ?? process.env.SECONDBRAIN_PY ?? resolve(dir, '.venv/bin/python');
  const fileExists = opts.fileExists ?? existsSync;
  const probe = opts.probe ?? defaultProbe;
  const runStdin = opts.runStdin ?? defaultRunStdin;
  const log = opts.log ?? ((m) => process.stderr.write(`${m}\n`));

  let cachedAvailable: boolean | null = null;

  return {
    available(): boolean {
      if (cachedAvailable !== null) return cachedAvailable;
      if (!fileExists(py) || !fileExists(opts.bridgePath)) {
        cachedAvailable = false;
      } else {
        cachedAvailable = probe(py);
      }
      if (!cachedAvailable) log('[embeddings] disabled — venv python / fastembed not available');
      return cachedAvailable;
    },

    async embed(kind: 'segment' | 'atom', items: EmbeddingItem[]): Promise<void> {
      if (items.length === 0) return;
      const payload = JSON.stringify({
        dbPath: opts.dbPath,
        items: items.map((it) => ({
          refId: it.refId,
          kind,
          text: it.text,
          runId: it.runId,
        })),
      });
      const stdout = await runStdin(py, [opts.bridgePath], dir, payload, EMBED_TIMEOUT_MS);
      const line = stdout
        .split('\n')
        .map((l) => l.trim())
        .reverse()
        .find((l) => l.startsWith('{'));
      if (line) {
        try {
          const res = JSON.parse(line) as { embedded?: number; skipped?: number };
          log(`[embeddings] ${kind}: embedded=${res.embedded ?? 0} skipped=${res.skipped ?? 0}`);
        } catch {
          /* non-JSON tail is fine */
        }
      }
    },
  };
}
