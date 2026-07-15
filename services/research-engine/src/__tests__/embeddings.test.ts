import { makeEmbeddings } from '../adapters/embeddings';
import type { EmbeddingItem } from '@l5/core';

const BASE = {
  dbPath: '/store/embeddings.sqlite',
  bridgePath: '/svc/embed_bridge.py',
  py: '/sb/.venv/bin/python',
  log: () => {},
};

describe('makeEmbeddings (graceful disable)', () => {
  it('available() is false when python/bridge missing', () => {
    const emb = makeEmbeddings({ ...BASE, fileExists: () => false, probe: () => true });
    expect(emb.available()).toBe(false);
  });

  it('available() is false when fastembed import probe fails', () => {
    const emb = makeEmbeddings({ ...BASE, fileExists: () => true, probe: () => false });
    expect(emb.available()).toBe(false);
  });

  it('available() is true and is cached (probe called once)', () => {
    let probes = 0;
    const emb = makeEmbeddings({
      ...BASE,
      fileExists: () => true,
      probe: () => {
        probes += 1;
        return true;
      },
    });
    expect(emb.available()).toBe(true);
    expect(emb.available()).toBe(true);
    expect(probes).toBe(1);
  });

  it('embed() pipes {dbPath, items:[{refId,kind,text,runId}]} on stdin', async () => {
    let stdinSeen = '';
    const emb = makeEmbeddings({
      ...BASE,
      fileExists: () => true,
      probe: () => true,
      runStdin: async (_py, _args, _cwd, stdin) => {
        stdinSeen = stdin;
        return JSON.stringify({ embedded: 1, skipped: 0 });
      },
    });
    const items: EmbeddingItem[] = [{ refId: 'v1:0', text: 'chunk text', runId: 'run-1', videoId: 'v1' }];
    await emb.embed('segment', items);
    const payload = JSON.parse(stdinSeen);
    expect(payload.dbPath).toBe('/store/embeddings.sqlite');
    expect(payload.items).toEqual([{ refId: 'v1:0', kind: 'segment', text: 'chunk text', runId: 'run-1' }]);
  });

  it('embed() no-ops on empty items', async () => {
    let ran = false;
    const emb = makeEmbeddings({
      ...BASE,
      fileExists: () => true,
      probe: () => true,
      runStdin: async () => {
        ran = true;
        return '{}';
      },
    });
    await emb.embed('atom', []);
    expect(ran).toBe(false);
  });
});
