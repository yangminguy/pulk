import {
  generateRunId,
  resolveRequest,
  runResearchPipeline,
  type RunPipelineOptions,
} from '../pipeline';
import type {
  ChannelStats,
  DocsVerifyPort,
  EmbeddingItem,
  EmbeddingPort,
  NotionPublishPort,
  ResearchPorts,
  SearchParams,
  SecondBrainStorePort,
  SlackNotifyPort,
  TranscriptPort,
  VideoStats,
  YouTubePort,
  YouTubeSearchHit,
} from '../ports';
import type {
  ConceptEdge,
  KnowledgeAtom,
  RunState,
  SynthesisReport,
  Transcript,
  VideoMeta,
} from '../types';
import { buildTranscript, makeMockLLM, type LlmHandler } from '../__fixtures__';

const NOW = () => new Date('2025-07-01T00:00:00Z');

// ---------------------------------------------------------------------------
// Video pool (8 videos, 4 KR + 4 US, distinct channels, descending views)
// ---------------------------------------------------------------------------

interface PoolVideo {
  videoId: string;
  channelId: string;
  country: 'KR' | 'US';
  viewCount: number;
}
const POOL: PoolVideo[] = Array.from({ length: 8 }, (_, i) => ({
  videoId: `v${i + 1}`,
  channelId: `ch${i + 1}`,
  country: i % 2 === 0 ? 'KR' : 'US',
  viewCount: 1_000_000 - i * 10_000,
}));

// ---------------------------------------------------------------------------
// Mock ports
// ---------------------------------------------------------------------------

class MemStore implements SecondBrainStorePort {
  states = new Map<string, string>();
  transcripts = new Map<string, Transcript>();
  shas = new Set<string>();
  atoms: KnowledgeAtom[] = [];
  graphs: ConceptEdge[] = [];
  syntheses = new Map<string, SynthesisReport>();
  reports = new Map<string, string>();
  bookChapters = new Map<string, string>();
  cards: unknown[] = [];
  bookSaveCalls = 0;
  throwOnBookSaveCall?: number; // simulate a mid-COMPOSE crash for resume tests

  async saveState(s: RunState): Promise<void> {
    this.states.set(s.runId, JSON.stringify(s));
  }
  async loadState(id: string): Promise<RunState | null> {
    const j = this.states.get(id);
    return j ? (JSON.parse(j) as RunState) : null;
  }
  async hasTranscriptSha(sha: string): Promise<boolean> {
    return this.shas.has(sha);
  }
  async saveTranscript(t: Transcript, _meta: VideoMeta): Promise<{ deduped: boolean }> {
    const deduped = this.shas.has(t.sha256);
    this.shas.add(t.sha256);
    this.transcripts.set(t.videoId, t);
    return { deduped };
  }
  async loadTranscript(id: string): Promise<Transcript | null> {
    return this.transcripts.get(id) ?? null;
  }
  async saveAtoms(_runId: string, atoms: KnowledgeAtom[]): Promise<void> {
    this.atoms = atoms;
  }
  async saveGraph(_runId: string, edges: ConceptEdge[]): Promise<void> {
    this.graphs = edges;
  }
  async saveSynthesis(runId: string, report: SynthesisReport): Promise<void> {
    this.syntheses.set(runId, report);
  }
  async saveReportMarkdown(runId: string, markdown: string): Promise<string> {
    this.reports.set(runId, markdown);
    return `reports/${runId}.md`;
  }
  async saveBookChapter(runId: string, chapterId: string, markdown: string): Promise<void> {
    this.bookSaveCalls += 1;
    if (this.throwOnBookSaveCall && this.bookSaveCalls === this.throwOnBookSaveCall) {
      throw new Error('simulated book chapter save failure');
    }
    this.bookChapters.set(`${runId}:${chapterId}`, markdown);
  }
  async loadBookChapter(runId: string, chapterId: string): Promise<string | null> {
    return this.bookChapters.get(`${runId}:${chapterId}`) ?? null;
  }
  async pushPrincipleCards(input: { topic: string; notionUrl: string | null; principles: unknown[] }): Promise<void> {
    this.cards.push(input);
  }
}

function makeYouTube(): YouTubePort {
  return {
    async search(_params: SearchParams): Promise<YouTubeSearchHit[]> {
      return POOL.map((p) => ({
        videoId: p.videoId,
        title: `영상 ${p.videoId}`,
        channelTitle: `채널 ${p.channelId}`,
        channelId: p.channelId,
        publishedAt: '2025-06-01T00:00:00Z',
        description: '설명',
        liveBroadcastContent: 'none',
      }));
    },
    async stats(ids: string[]): Promise<VideoStats[]> {
      return ids.map((id) => {
        const p = POOL.find((x) => x.videoId === id)!;
        return { videoId: id, viewCount: p.viewCount, durationSeconds: 600 };
      });
    },
    async channelStats(ids: string[]): Promise<ChannelStats[]> {
      return ids.map((id) => {
        const p = POOL.find((x) => x.channelId === id)!;
        return { channelId: id, country: p.country, subscriberCount: 100_000 };
      });
    },
  };
}

interface TranscriptMockOpts {
  skipVideoIds?: string[];
  throwAtCall?: number; // throw once when the fetch call count reaches this
  fetched?: string[]; // out-param: records fetched videoIds in order
}
function makeTranscriptPort(opts: TranscriptMockOpts = {}): TranscriptPort {
  let call = 0;
  let thrown = false;
  return {
    async fetchTranscript(videoId: string) {
      call += 1;
      opts.fetched?.push(videoId);
      if (opts.throwAtCall && call === opts.throwAtCall && !thrown) {
        thrown = true;
        throw new Error(`simulated transport failure for ${videoId}`);
      }
      if (opts.skipVideoIds?.includes(videoId)) {
        return { videoId, available: false, skipped: true, note: 'no captions' };
      }
      return buildTranscript({ videoId, sha256: `sha-${videoId}` });
    },
  };
}

function makeLLM(over: Record<string, LlmHandler> = {}) {
  return makeMockLLM({
    'research.expandQueries': () =>
      JSON.stringify({
        queries: [
          { q: '콘텐츠 전략', lang: 'ko', angle: 'core' },
          { q: 'content strategy', lang: 'en', angle: 'core' },
        ],
      }),
    'research.extractAtoms': () =>
      JSON.stringify({
        atoms: [
          {
            claim: '섬네일이 조회수를 결정',
            claimType: 'causal_claim',
            explanation: '',
            evidence: '섬네일',
            startSeconds: 0,
            endSeconds: 5,
            confidence: 0.8,
          },
        ],
      }),
    'research.cluster': ({ user }) => {
      const ids = [...user.matchAll(/(run-\S+)/g)].map((m) => m[1]);
      return JSON.stringify({
        clusters: [{ clusterId: 'k1', label: '핵심 원칙', atomIds: ids, relation: 'common' }],
      });
    },
    'research.unifiedTheory': () => JSON.stringify({ unifiedTheory: '통합 이론' }),
    // Book WRITE: return prose comfortably over the 800-char floor so chapters
    // succeed (outline itself falls back deterministically — no handler needed).
    'research.book.write': () =>
      '이 장에서는 유튜브 콘텐츠 전략의 핵심을 단계적으로 살펴본다. '.repeat(40),
    'research.verify': () =>
      JSON.stringify({
        presentInTranscript: true,
        timestampAccurate: true,
        opinionAsFact: false,
        doubleCounted: false,
        suspectAutoCaption: false,
        note: 'ok',
      }),
    ...over,
  });
}

interface BuildPortsOpts {
  store?: MemStore;
  transcript?: TranscriptPort;
  withOptional?: boolean;
  docsVerify?: DocsVerifyPort;
  embedCalls?: Array<{ kind: string; count: number }>;
  slackCalls?: string[];
  llm?: ResearchPorts['llm'];
}
function buildPorts(o: BuildPortsOpts = {}): ResearchPorts {
  const store = o.store ?? new MemStore();
  const ports: ResearchPorts = {
    youtube: makeYouTube(),
    transcript: o.transcript ?? makeTranscriptPort(),
    llm: o.llm ?? makeLLM(),
    store,
  };
  if (o.withOptional) {
    const embeddings: EmbeddingPort = {
      available: () => true,
      async embed(kind: 'segment' | 'atom', items: EmbeddingItem[]) {
        o.embedCalls?.push({ kind, count: items.length });
      },
    };
    const notion: NotionPublishPort = {
      async publishReport() {
        return { url: 'https://notion.so/report', skipped: false };
      },
    };
    const slack: SlackNotifyPort = {
      async notify(input) {
        o.slackCalls?.push(input.text);
      },
    };
    ports.embeddings = embeddings;
    ports.notion = notion;
    ports.slack = slack;
  }
  if (o.docsVerify) ports.docsVerify = o.docsVerify;
  return ports;
}

function baseOpts(ports: ResearchPorts, over: Partial<RunPipelineOptions> = {}): RunPipelineOptions {
  return {
    request: { topic: '유튜브 콘텐츠 전략', researchPurpose: 'LEARNING', requiredVideoCount: 3 },
    ports,
    runId: 'testrun',
    now: NOW,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('resolveRequest', () => {
  it('applies all defaults', () => {
    const r = resolveRequest({ topic: 't', researchPurpose: 'LEARNING' });
    expect(r.markets).toEqual(['KR', 'US']);
    expect(r.minimumViewCount).toBe(50_000);
    expect(r.requiredVideoCount).toBe(15);
    expect(r.outputLanguage).toBe('ko');
  });
});

describe('generateRunId', () => {
  it('produces a run-prefixed id', () => {
    expect(generateRunId(new Date('2025-07-01T00:00:00Z'))).toMatch(/^run-\d{14}-[a-z0-9]{4}$/);
  });
});

describe('runResearchPipeline — full happy path', () => {
  it('runs all phases to DONE and produces a report + optional publishing', async () => {
    const store = new MemStore();
    const embedCalls: Array<{ kind: string; count: number }> = [];
    const slackCalls: string[] = [];
    const ports = buildPorts({ store, withOptional: true, embedCalls, slackCalls });

    const result = await runResearchPipeline(baseOpts(ports));

    expect(result.state.phase).toBe('DONE');
    expect(result.state.transcriptsDone).toHaveLength(3);
    expect(result.state.atomsDone).toHaveLength(3);
    expect(result.report).not.toBeNull();
    expect(result.notionUrl).toBe('https://notion.so/report');

    // atoms persisted, one common principle synthesized, graph saved
    expect(store.atoms.length).toBe(3);
    expect(store.syntheses.get('testrun')?.commonClaims.length).toBeGreaterThan(0);
    expect(store.graphs.length).toBeGreaterThan(0);

    // embeddings for both kinds + slack summary + brain card push
    expect(embedCalls.map((c) => c.kind).sort()).toEqual(['atom', 'segment']);
    expect(slackCalls[0]).toMatch(/리서치 완료/);
    expect(store.cards.length).toBe(1);

    // final state persisted as DONE
    const persisted = await store.loadState('testrun');
    expect(persisted?.phase).toBe('DONE');

    // reports/<runId>.md is the BOOK manuscript: preface + chapters + appendix.
    const book = store.reports.get('testrun') ?? '';
    expect(book).toContain('서문 — 이 책을 읽는 법');
    expect(book).toContain('부록 — 신뢰성 근거');
    expect(result.state.bookOutline?.length ?? 0).toBeGreaterThan(0);
    expect(result.state.bookDone?.length).toBe(result.state.bookOutline?.length);
    // every outlined chapter was persisted to the store
    expect(store.bookChapters.size).toBe(result.state.bookOutline?.length);
  });

  it('works without any optional ports (store + youtube + transcript + llm only)', async () => {
    const ports = buildPorts({ withOptional: false });
    const result = await runResearchPipeline(baseOpts(ports));
    expect(result.state.phase).toBe('DONE');
    expect(result.notionUrl).toBeNull();
  });
});

describe('runResearchPipeline — transcript skip triggers backfill', () => {
  it('records SKIPPED_NO_TRANSCRIPT and still reaches requiredVideoCount', async () => {
    const store = new MemStore();
    // v1 has no captions → must be skipped and backfilled from the shortlist
    const transcript = makeTranscriptPort({ skipVideoIds: ['v1'] });
    const ports = buildPorts({ store, transcript });

    const result = await runResearchPipeline(baseOpts(ports));
    expect(result.state.transcriptsDone).toHaveLength(3);
    expect(result.state.transcriptsDone).not.toContain('v1');
    expect(result.state.skipped).toContainEqual({ videoId: 'v1', status: 'SKIPPED_NO_TRANSCRIPT' });
  });
});

describe('runResearchPipeline — resume after a mid-TRANSCRIPT crash', () => {
  it('persists progress on failure and skips completed videos on resume', async () => {
    const store = new MemStore();
    const fetched: string[] = [];
    // throw on the 3rd fetch (2 transcripts already acquired + persisted)
    const transcript = makeTranscriptPort({ throwAtCall: 3, fetched });
    const ports = buildPorts({ store, transcript });

    // first run crashes during TRANSCRIPT
    await expect(runResearchPipeline(baseOpts(ports))).rejects.toThrow(/simulated transport failure/);

    const mid = await store.loadState('testrun');
    expect(mid?.phase).toBe('TRANSCRIPT');
    expect(mid?.transcriptsDone.length).toBe(2);
    const doneBefore = [...(mid?.transcriptsDone ?? [])];
    const fetchesBefore = fetched.length;

    // resume with the SAME ports (throw already consumed)
    const result = await runResearchPipeline(baseOpts(ports, { resume: true }));
    expect(result.state.phase).toBe('DONE');
    expect(result.state.transcriptsDone.length).toBe(3);

    // completed videos are NOT re-fetched on resume
    const refetchedDone = fetched.slice(fetchesBefore).filter((v) => doneBefore.includes(v));
    expect(refetchedDone).toEqual([]);
  });

  it('throws when resuming an unknown runId', async () => {
    const ports = buildPorts();
    await expect(
      runResearchPipeline(baseOpts(ports, { resume: true, runId: 'ghost' })),
    ).rejects.toThrow(/no saved state/);
  });
});

describe('runResearchPipeline — resume after a mid-COMPOSE crash (chapter resume)', () => {
  it('persists bookDone and skips completed chapters on resume', async () => {
    const store = new MemStore();
    store.throwOnBookSaveCall = 2; // crash while saving the 2nd chapter
    const ports = buildPorts({ store });

    await expect(runResearchPipeline(baseOpts(ports))).rejects.toThrow(/book chapter save/);

    const mid = await store.loadState('testrun');
    expect(mid?.phase).toBe('COMPOSE');
    expect(mid?.bookOutline?.length ?? 0).toBeGreaterThan(1);
    expect(mid?.bookDone?.length).toBe(1); // only the 1st chapter completed
    const firstChapterId = mid!.bookDone![0];
    const savedSlotBefore = store.bookChapters.get(`testrun:${firstChapterId}`);

    // resume: stop throwing, continue from the failed chapter
    store.throwOnBookSaveCall = undefined;
    const result = await runResearchPipeline(baseOpts(ports, { resume: true }));

    expect(result.state.phase).toBe('DONE');
    expect(result.state.bookDone?.length).toBe(result.state.bookOutline?.length);
    // the already-completed chapter is preserved and not re-written to a new slot
    expect(result.state.bookDone).toContain(firstChapterId);
    expect(store.bookChapters.get(`testrun:${firstChapterId}`)).toBe(savedSlotBefore);
  });
});

// ---------------------------------------------------------------------------
// Refill depth: backfill must continue through the WHOLE ranked remainder, not
// stop at the shortlist (§4.3-4.4). Regression for the live "only 12/15
// transcripts acquired (queue exhausted)" while 200+ candidates remained.
// ---------------------------------------------------------------------------

interface BigPoolVideo {
  videoId: string;
  channelId: string;
  country: 'KR' | 'US';
  viewCount: number;
}
function makeYouTubeFromPool(pool: BigPoolVideo[]): YouTubePort {
  return {
    async search(): Promise<YouTubeSearchHit[]> {
      return pool.map((p) => ({
        videoId: p.videoId,
        title: `영상 ${p.videoId}`,
        channelTitle: `채널 ${p.channelId}`,
        channelId: p.channelId,
        publishedAt: '2025-06-01T00:00:00Z',
        description: '설명',
        liveBroadcastContent: 'none',
      }));
    },
    async stats(ids: string[]): Promise<VideoStats[]> {
      return ids.map((id) => {
        const p = pool.find((x) => x.videoId === id)!;
        return { videoId: id, viewCount: p.viewCount, durationSeconds: 600 };
      });
    },
    async channelStats(ids: string[]): Promise<ChannelStats[]> {
      return ids.map((id) => {
        const p = pool.find((x) => x.channelId === id)!;
        return { channelId: id, country: p.country, subscriberCount: 100_000 };
      });
    },
  };
}

describe('runResearchPipeline — refill continues past the shortlist', () => {
  it('backfills from the remaining ranked candidates when the whole shortlist is caption-less', async () => {
    // 40 distinct-channel videos, views descending → rank = v00..v39.
    // required 15 → shortlist = requiredVideoCount + 10 = top 25 (v00..v24).
    const pool: BigPoolVideo[] = Array.from({ length: 40 }, (_, i) => ({
      videoId: `v${String(i).padStart(2, '0')}`,
      channelId: `ch${String(i).padStart(2, '0')}`,
      country: i % 2 === 0 ? 'KR' : 'US',
      viewCount: 1_000_000 - i * 1000,
    }));
    const shortlistIds = pool.slice(0, 25).map((p) => p.videoId); // caption-less
    const store = new MemStore();
    const transcript = makeTranscriptPort({ skipVideoIds: shortlistIds });
    const ports: ResearchPorts = {
      youtube: makeYouTubeFromPool(pool),
      transcript,
      llm: makeLLM(),
      store,
    };

    const result = await runResearchPipeline(
      baseOpts(ports, {
        request: { topic: '콘텐츠 전략', researchPurpose: 'LEARNING', requiredVideoCount: 15 },
      }),
    );

    // Reached the target purely from refill candidates ranked *below* the shortlist.
    expect(result.state.transcriptsDone).toHaveLength(15);
    expect(result.state.transcriptsDone.every((id) => !shortlistIds.includes(id))).toBe(true);
    // Every shortlisted video was tried and skipped (not silently abandoned).
    expect(result.state.skipped.filter((s) => s.status === 'SKIPPED_NO_TRANSCRIPT')).toHaveLength(25);
  });

  it('respects the per-channel cap (max 2) while backfilling from refill', async () => {
    // Channel "hot" owns 4 caption-bearing videos; every other channel is
    // caption-less. Cap 2 means at most 2 of hot's videos can ever be accepted,
    // so refill must NOT keep grabbing hot videos to chase the target.
    const pool: BigPoolVideo[] = [
      { videoId: 'hot1', channelId: 'hot', country: 'KR', viewCount: 900_000 },
      { videoId: 'hot2', channelId: 'hot', country: 'KR', viewCount: 890_000 },
      { videoId: 'hot3', channelId: 'hot', country: 'KR', viewCount: 880_000 },
      { videoId: 'hot4', channelId: 'hot', country: 'KR', viewCount: 870_000 },
      ...Array.from({ length: 20 }, (_, i) => ({
        videoId: `o${String(i).padStart(2, '0')}`,
        channelId: `och${String(i).padStart(2, '0')}`,
        country: (i % 2 === 0 ? 'KR' : 'US') as 'KR' | 'US',
        viewCount: 500_000 - i * 1000,
      })),
    ];
    const captionLess = pool.filter((p) => p.channelId !== 'hot').map((p) => p.videoId);
    const store = new MemStore();
    const transcript = makeTranscriptPort({ skipVideoIds: captionLess });
    const ports: ResearchPorts = {
      youtube: makeYouTubeFromPool(pool),
      transcript,
      llm: makeLLM(),
      store,
    };

    const result = await runResearchPipeline(
      baseOpts(ports, {
        request: { topic: '콘텐츠 전략', researchPurpose: 'LEARNING', requiredVideoCount: 3, markets: ['KR'] },
      }),
    );

    // Only 2 hot videos can be accepted; the cap holds even though refill kept
    // being offered hot3/hot4 to reach the (unreachable) target of 3.
    expect(result.state.transcriptsDone).toHaveLength(2);
    expect(result.state.transcriptsDone.every((id) => id.startsWith('hot'))).toBe(true);
    const hotAccepted = result.state.transcriptsDone.filter((id) => id.startsWith('hot'));
    expect(hotAccepted.length).toBeLessThanOrEqual(2);
  });
});

describe('runResearchPipeline — no 60-char truncation in keyConcepts (§12-A 회귀)', () => {
  it('keeps a long framework claim intact as a report keyConcept term', async () => {
    const longClaim =
      '에이전트 프레임워크는 사전 정의된 아키텍처와 도구 통합과 상태 관리와 오케스트레이션 레이어를 한데 묶어 개발을 쉽게 만든다는 점이 핵심이다';
    expect(longClaim.length).toBeGreaterThan(60);
    const store = new MemStore();
    const llm = makeLLM({
      'research.extractAtoms': () =>
        JSON.stringify({
          atoms: [
            {
              claim: longClaim,
              claimType: 'framework',
              explanation: '프레임워크가 묶어 제공하는 구성요소',
              evidence: '섬네일',
              startSeconds: 0,
              endSeconds: 5,
              confidence: 0.8,
            },
          ],
        }),
    });
    const ports = buildPorts({ store, llm });
    const result = await runResearchPipeline(baseOpts(ports));
    const terms = (result.report?.keyConcepts ?? []).map((c) => c.term);
    expect(terms).toContain(longClaim); // full statement, not cut at 60
  });
});

describe('runResearchPipeline — technical purpose uses docs-verify', () => {
  it('merges official-docs statuses into principles', async () => {
    const store = new MemStore();
    const docsVerify: DocsVerifyPort = {
      async verifyClaims(claims) {
        return claims.map((c) => ({ claim: c.claim, status: 'VERIFIED', sourceUrl: 'https://docs' }));
      },
    };
    const ports = buildPorts({ store, docsVerify });
    const result = await runResearchPipeline(
      baseOpts(ports, {
        request: { topic: 'React 서버 컴포넌트', researchPurpose: 'TECHNICAL_RESEARCH', requiredVideoCount: 3 },
      }),
    );
    const principles = result.state.principles ?? [];
    expect(principles.length).toBeGreaterThan(0);
    expect(principles.every((p) => p.verificationStatus === 'VERIFIED')).toBe(true);
    // docs results wired into the report's learning section
    expect(result.report?.learning?.docsVerification.length).toBeGreaterThan(0);
  });
});
