// brain-cards adapter — pushes top synthesized principles into the external
// Second Brain as cards (one card per principle) via its Python `lib.store.add_card`.
//
// Mirrors plugin-orchestration/secondbrain-transport.ts: spawn <DIR>/.venv/bin/python
// with an inline -c script, passing all user data through sys.argv (never
// interpolated into the script string). Graceful disable: when SECONDBRAIN_DIR or
// the venv python is absent, makeBrainCards returns null and the fs store logs a skip.
//
// Card shape (spec §6): topics=[topic], origin='external', source_url=<Notion link>.

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { SynthesizedPrinciple } from '@l5/core';
import type { PrincipleCardWriter } from './store-fs.js';

const DEFAULT_DIR = '/Users/wonminyang/세컨 브레인';
const DEFAULT_BRAIN = 'biz';
const WRITE_TIMEOUT_MS = 30_000;

// add_card(brain, claim, memory_type='semantic', topics=None, source_url='',
//          origin='self', created_by='agent', bypass_staging=False)
const ADD_CARDS_SCRIPT = `
import sys, json
sys.path.insert(0, 'scripts')
from lib.store import add_card
brain = sys.argv[1]
topic = sys.argv[2]
source_url = sys.argv[3]
created_by = sys.argv[4]
claims = json.loads(sys.argv[5])
results = []
for claim in claims:
    r = add_card(brain, claim, memory_type='semantic', topics=[topic],
                 source_url=source_url, origin='external', created_by=created_by)
    results.append(r)
print(json.dumps(results, ensure_ascii=False, default=str))
`.trim();

export type PyRunner = (
  py: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
) => Promise<string>;

const defaultRunPython: PyRunner = (py, args, cwd, timeoutMs) =>
  new Promise((resolvePromise, reject) => {
    execFile(py, args, { cwd, timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`exit ${err.code}: ${String(stderr).slice(0, 300)}`));
        return;
      }
      resolvePromise(String(stdout));
    });
  });

export interface BrainCardsOptions {
  dir?: string;
  brain?: string;
  py?: string;
  createdBy?: string;
  fileExists?: (p: string) => boolean;
  runPython?: PyRunner;
  log?: (msg: string) => void;
}

/**
 * Build a PrincipleCardWriter, or return null when the Second Brain is not
 * present (graceful disable — the caller then simply skips card push).
 */
export function makeBrainCards(opts: BrainCardsOptions = {}): PrincipleCardWriter | null {
  const dir = opts.dir ?? process.env.SECONDBRAIN_DIR ?? DEFAULT_DIR;
  const brain = opts.brain ?? process.env.SECONDBRAIN_BRAIN ?? DEFAULT_BRAIN;
  const py = opts.py ?? process.env.SECONDBRAIN_PY ?? resolve(dir, '.venv/bin/python');
  const createdBy = opts.createdBy ?? 'research-engine';
  const fileExists = opts.fileExists ?? existsSync;
  const runPython = opts.runPython ?? defaultRunPython;
  const log = opts.log ?? ((m) => process.stderr.write(`${m}\n`));

  if (!fileExists(dir) || !fileExists(py)) {
    log(`[brain-cards] disabled — Second Brain not found (dir=${dir}, py=${py})`);
    return null;
  }

  return {
    async push(input) {
      const claims = input.principles.map((p) => p.statement).filter((s) => s && s.trim());
      if (claims.length === 0) return;
      await runPython(
        py,
        ['-c', ADD_CARDS_SCRIPT, brain, input.topic, input.notionUrl ?? '', createdBy, JSON.stringify(claims)],
        dir,
        WRITE_TIMEOUT_MS,
      );
    },
  };
}

/** Type-only re-export for callers that want the principle shape. */
export type { SynthesizedPrinciple };
