import { mkdtempSync, existsSync, readFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FsStore, type PrincipleCardWriter } from '../adapters/store-fs';
import type {
  ConceptEdge,
  KnowledgeAtom,
  ResolvedResearchRequest,
  RunState,
  SynthesisReport,
  SynthesizedPrinciple,
  Transcript,
  VideoMeta,
} from '@l5/core';

function resolvedRequest(): ResolvedResearchRequest {
  return {
    topic: '테스트 주제',
    researchPurpose: 'LEARNING',
    researchQuestion: null,
    targetAudience: null,
    markets: ['KR', 'US'],
    outputLanguage: 'ko',
    requiredVideoCount: 15,
    minimumViewCount: 50000,
    minimumDurationSeconds: 240,
    maxPerChannel: 2,
    candidateTarget: 100,
  };
}

function runState(overrides: Partial<RunState> = {}): RunState {
  return {
    runId: 'run-test-0001',
    request: resolvedRequest(),
    phase: 'ANALYZE',
    queries: [],
    candidates: [],
    selected: [],
    skipped: [],
    transcriptsDone: ['v1'],
    atomsDone: [],
    startedAt: '2026-07-14T00:00:00.000Z',
    updatedAt: '2026-07-14T00:00:00.000Z',
    errors: [],
    ...overrides,
  };
}

function transcript(sha: string): Transcript {
  return {
    videoId: 'v1',
    available: true,
    text: 'hello',
    segments: [],
    chunks: [],
    languageCode: 'ko',
    source: 'manual',
    charCount: 5,
    sha256: sha,
  };
}

function meta(): VideoMeta {
  return {
    videoId: 'v1',
    title: 'T',
    channelId: 'ch1',
    channelTitle: 'CH',
    market: 'KR',
    viewCount: 1000,
    durationSeconds: 300,
    channelCountry: 'KR',
    subscriberCount: 500,
    publishedAt: '2026-01-01T00:00:00Z',
  };
}

describe('FsStore layout + dedup', () => {
  let root: string;
  let store: FsStore;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 're-store-'));
    store = new FsStore({ rootDir: root, log: () => {} });
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('saves state under runs/<runId>/ and round-trips (resume)', async () => {
    const s = runState({ atomsDone: ['v1'], phase: 'SYNTHESIZE' });
    await store.saveState(s);
    expect(existsSync(join(root, 'runs', s.runId, 'state.json'))).toBe(true);
    expect(existsSync(join(root, 'runs', s.runId, 'request.json'))).toBe(true);
    const loaded = await store.loadState(s.runId);
    expect(loaded).not.toBeNull();
    expect(loaded?.phase).toBe('SYNTHESIZE');
    expect(loaded?.atomsDone).toEqual(['v1']);
    expect(loaded?.request.topic).toBe('테스트 주제');
  });

  it('loadState returns null for unknown runId', async () => {
    expect(await store.loadState('nope')).toBeNull();
  });

  it('writes transcript + meta to raw_sources and indexes sha256', async () => {
    const res = await store.saveTranscript(transcript('sha-a'), meta());
    expect(res.deduped).toBe(false);
    expect(existsSync(join(root, 'raw_sources', 'v1.transcript.json'))).toBe(true);
    expect(existsSync(join(root, 'raw_sources', 'v1.meta.json'))).toBe(true);
    expect(await store.hasTranscriptSha('sha-a')).toBe(true);
    expect(await store.hasTranscriptSha('sha-unknown')).toBe(false);
  });

  it('skips re-save when sha256 already stored (dedup)', async () => {
    await store.saveTranscript(transcript('dup'), meta());
    const second = await store.saveTranscript({ ...transcript('dup'), videoId: 'v2' }, { ...meta(), videoId: 'v2' });
    expect(second.deduped).toBe(true);
    // v2 files must NOT have been written (deduped).
    expect(existsSync(join(root, 'raw_sources', 'v2.transcript.json'))).toBe(false);
  });

  it('dedup persists across a fresh store instance (reupload in later run)', async () => {
    await store.saveTranscript(transcript('persist'), meta());
    const store2 = new FsStore({ rootDir: root, log: () => {} });
    expect(await store2.hasTranscriptSha('persist')).toBe(true);
  });

  it('loadTranscript round-trips', async () => {
    await store.saveTranscript(transcript('sha-x'), meta());
    const t = await store.loadTranscript('v1');
    expect(t?.sha256).toBe('sha-x');
  });

  it('saves atoms, graph (jsonl), synthesis, and report markdown', async () => {
    const atoms = [{ claimId: 'run-x-v1-0', claim: 'c' } as unknown as KnowledgeAtom];
    await store.saveAtoms('run-x', atoms);
    expect(existsSync(join(root, 'knowledge_atoms', 'run-x', 'run-x-v1-0.json'))).toBe(true);

    const edges: ConceptEdge[] = [
      { from: 'a', to: 'b', type: 'SUPPORTS', confidence: 0.9 },
      { from: 'b', to: 'c', type: 'CONTRADICTS', confidence: 0.5 },
    ];
    await store.saveGraph('run-x', edges);
    const jsonl = readFileSync(join(root, 'graph', 'run-x.edges.jsonl'), 'utf8').trim().split('\n');
    expect(jsonl).toHaveLength(2);
    expect(JSON.parse(jsonl[0]).type).toBe('SUPPORTS');

    await store.saveSynthesis('run-x', { runId: 'run-x', topic: 't' } as unknown as SynthesisReport);
    expect(existsSync(join(root, 'syntheses', 'run-x.json'))).toBe(true);

    const path = await store.saveReportMarkdown('run-x', '# Title\nbody');
    expect(path).toBe(join(root, 'reports', 'run-x.md'));
    expect(readFileSync(path, 'utf8')).toContain('# Title');
  });

  it('saves and round-trips book chapters under book_chapters/<runId>/', async () => {
    await store.saveBookChapter('run-x', 'ch1-overview', '# 개요\n본문');
    expect(existsSync(join(root, 'book_chapters', 'run-x', 'ch1-overview.md'))).toBe(true);
    expect(await store.loadBookChapter('run-x', 'ch1-overview')).toBe('# 개요\n본문');
    expect(await store.loadBookChapter('run-x', 'missing')).toBeNull();
  });

  it('sanitizes an unsafe chapterId to a single filename segment', async () => {
    await store.saveBookChapter('run-x', 'a/b c', 'body');
    expect(await store.loadBookChapter('run-x', 'a/b c')).toBe('body');
    // no nested path escape — a single .md file under the run dir
    expect(existsSync(join(root, 'book_chapters', 'run-x', 'a_b_c.md'))).toBe(true);
  });

  it('pushPrincipleCards is a no-op when no card writer configured', async () => {
    await expect(
      store.pushPrincipleCards({ topic: 't', notionUrl: null, principles: [] }),
    ).resolves.toBeUndefined();
  });

  it('pushPrincipleCards delegates to the configured writer', async () => {
    const seen: unknown[] = [];
    const cards: PrincipleCardWriter = { push: async (i) => { seen.push(i); } };
    const s = new FsStore({ rootDir: root, cards, log: () => {} });
    const principles = [{ id: 'p1', statement: 's' } as unknown as SynthesizedPrinciple];
    await s.pushPrincipleCards({ topic: 't', notionUrl: 'http://n', principles });
    expect(seen).toHaveLength(1);
  });

  it('atomic writes leave no .tmp files behind', async () => {
    await store.saveTranscript(transcript('clean'), meta());
    const files = readdirSync(join(root, 'raw_sources'));
    expect(files.some((f) => f.includes('.tmp-'))).toBe(false);
  });
});
