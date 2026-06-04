// M3: SecondBrain transport — spawn-based local Python project.
//
// ENV:
//   SECONDBRAIN_DIR   default: /Users/wonminyang/세컨 브레인
//   SECONDBRAIN_BRAIN default: biz
//   SECONDBRAIN_PY    default: <DIR>/.venv/bin/python
//
// makeSecondBrainTransport() returns null (graceful disable) when the
// directory or python binary does not exist.
//
// Security: user strings are passed via sys.argv, never interpolated into
// the -c script string.

import { execFile } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';

type SecondBrainTransport = import('../../../../../../../../packages/l5-core/dist/functions/memory/secondbrain-source').SecondBrainTransport;

const QUERY_TIMEOUT_MS = 20_000;
const WRITE_TIMEOUT_MS = 30_000;

function getConfig(): { dir: string; brain: string; py: string } | null {
  const dir = process.env.SECONDBRAIN_DIR ?? '/Users/wonminyang/세컨 브레인';
  const brain = process.env.SECONDBRAIN_BRAIN ?? 'biz';
  const py = process.env.SECONDBRAIN_PY ?? resolve(dir, '.venv/bin/python');
  if (!existsSync(dir) || !existsSync(py)) return null;
  return { dir, brain, py };
}

function runPython(
  py: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(py, args, { cwd, timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`exit ${err.code}: ${stderr.slice(0, 300)}`));
        return;
      }
      resolve(stdout);
    });
  });
}

export function makeSecondBrainTransport(): SecondBrainTransport | null {
  const cfg = getConfig();
  if (!cfg) return null;

  const { dir, brain, py } = cfg;

  // Inline Python scripts receive user data via sys.argv[1], [2], ...
  // to avoid any shell injection risk.

  const QUERY_SCRIPT = `
import sys, json
sys.path.insert(0, 'scripts')
from search.tempr import search
query = sys.argv[1]
brain = sys.argv[2]
top_k = int(sys.argv[3])
hits = search(query, brain, top_k=top_k)
print(json.dumps(hits, ensure_ascii=False, default=str))
`.trim();

  const APPEND_SCRIPT = `
import sys, json
sys.path.insert(0, 'scripts')
from lib.store import add_card
brain = sys.argv[1]
claim = sys.argv[2]
created_by = sys.argv[3]
result = add_card(brain, claim, memory_type='semantic', topics=[], created_by=created_by)
print(json.dumps(result, ensure_ascii=False, default=str))
`.trim();

  return {
    async query(filter) {
      try {
        const topK = String(filter.limit ?? 8);
        const stdout = await runPython(
          py,
          ['-c', QUERY_SCRIPT, filter.role ?? '', brain, topK],
          dir,
          QUERY_TIMEOUT_MS,
        );
        // Strip warnings from stderr-contaminated stdout lines (fastembed UserWarning)
        const jsonLine = stdout
          .split('\n')
          .find((l) => l.trimStart().startsWith('[') || l.trimStart().startsWith('{'));
        if (!jsonLine) return [];
        const hits: unknown[] = JSON.parse(jsonLine);
        if (!Array.isArray(hits)) return [];
        return hits.map((h: any) => ({
          insight: String(h.claim ?? h.text ?? ''),
          source_agent: (h.created_by as string | undefined) ?? undefined,
          phase: undefined,
          pii_level: 'none' as const,
        }));
      } catch {
        return [];
      }
    },

    async append(req) {
      try {
        await runPython(
          py,
          ['-c', APPEND_SCRIPT, brain, req.insight, req.source_agent ?? 'L5'],
          dir,
          WRITE_TIMEOUT_MS,
        );
        return { ok: true };
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
    },
  };
}
