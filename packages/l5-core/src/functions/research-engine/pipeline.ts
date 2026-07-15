// research-engine — pipeline (§4 phase runner).
//
// EXPAND → COLLECT → SELECT → TRANSCRIPT → ANALYZE → SYNTHESIZE → VERIFY →
// STORE → PUBLISH. Ports are injected; RunState is persisted after every phase
// (and per-video inside TRANSCRIPT/ANALYZE) so --resume can skip completed work
// and partially re-enter TRANSCRIPT/ANALYZE by videoId. Pure orchestration:
// every side effect goes through a port.

import type {
  ResearchPorts,
  YouTubeSearchHit,
  VideoStats,
  ChannelStats,
  EmbeddingItem,
} from './ports';
import {
  CandidateVideo,
  KnowledgeAtom,
  Market,
  MethodologySummary,
  RankedCandidate,
  ReportVideoSource,
  ResearchRequest,
  ResolvedResearchRequest,
  RunError,
  RunPhase,
  RunState,
  REQUEST_DEFAULTS,
  SearchQuery,
  SynthesisReport,
  Transcript,
  TranscriptSegment,
  VideoMeta,
  isTranscriptAvailable,
} from './types';
import { expandQueries } from './query-expansion';
import { planRefill, selectCandidates } from './candidate-selection';
import { extractAtomsForVideo, segmentsInRange, verifyChunkIntegrity } from './atom-extraction';
import { runSynthesis } from './synthesis';
import { verifyPrincipleFreshContext } from './verification';
import { buildConceptGraph } from './concept-graph';
import { assembleReport, emptyLearning, renderAppendixMarkdown } from './report';
import { assembleBook, composeOutline, gatherChapterExcerpts, writeChapter } from './book-composer';
import type { BookOutline } from './types';

const NEXT_PHASE: Record<RunPhase, RunPhase> = {
  EXPAND: 'COLLECT',
  COLLECT: 'SELECT',
  SELECT: 'TRANSCRIPT',
  TRANSCRIPT: 'ANALYZE',
  ANALYZE: 'SYNTHESIZE',
  SYNTHESIZE: 'VERIFY',
  VERIFY: 'COMPOSE',
  COMPOSE: 'STORE',
  STORE: 'PUBLISH',
  PUBLISH: 'DONE',
  DONE: 'DONE',
};

const STATS_BATCH = 50;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface RunPipelineOptions {
  request: ResearchRequest;
  ports: ResearchPorts;
  /** explicit runId for a new run (else generated); required target for resume. */
  runId?: string;
  resume?: boolean;
  slack?: { channel?: string; threadTs?: string };
  /** injectable clock for determinism in tests. */
  now?: () => Date;
}

export interface PipelineResult {
  runId: string;
  state: RunState;
  report: SynthesisReport | null;
  notionUrl: string | null;
}

export function resolveRequest(req: ResearchRequest): ResolvedResearchRequest {
  return {
    topic: req.topic,
    researchPurpose: req.researchPurpose,
    researchQuestion: req.researchQuestion ?? null,
    targetAudience: req.targetAudience ?? null,
    markets: req.markets && req.markets.length > 0 ? req.markets : [...REQUEST_DEFAULTS.markets],
    outputLanguage: req.outputLanguage ?? REQUEST_DEFAULTS.outputLanguage,
    requiredVideoCount: req.requiredVideoCount ?? REQUEST_DEFAULTS.requiredVideoCount,
    minimumViewCount: req.minimumViewCount ?? REQUEST_DEFAULTS.minimumViewCount,
    minimumDurationSeconds: req.minimumDurationSeconds ?? REQUEST_DEFAULTS.minimumDurationSeconds,
    maxPerChannel: req.maxPerChannel ?? REQUEST_DEFAULTS.maxPerChannel,
    candidateTarget: req.candidateTarget ?? REQUEST_DEFAULTS.candidateTarget,
  };
}

export function generateRunId(now: Date): string {
  const iso = now.toISOString().replace(/[-:T.]/g, '').slice(0, 14);
  const rand = Math.random().toString(36).slice(2, 6);
  return `run-${iso}-${rand}`;
}

interface Ctx {
  ports: ResearchPorts;
  now: () => Date;
  slack?: { channel?: string; threadTs?: string };
  /** in-memory transcripts for this process (repopulated from store on resume). */
  transcripts: Map<string, Transcript>;
  /** all ranked candidates (shortlist ∪ refill) indexed by videoId. */
  rankedById: Map<string, RankedCandidate>;
  /** in-memory book chapters for this process (repopulated from store on resume). */
  chapters: Map<string, string>;
}

export async function runResearchPipeline(opts: RunPipelineOptions): Promise<PipelineResult> {
  const now = opts.now ?? (() => new Date());
  const ctx: Ctx = {
    ports: opts.ports,
    now,
    slack: opts.slack,
    transcripts: new Map(),
    rankedById: new Map(),
    chapters: new Map(),
  };

  let state: RunState;
  if (opts.resume) {
    if (!opts.runId) throw new Error('resume requires runId');
    const loaded = await opts.ports.store.loadState(opts.runId);
    if (!loaded) throw new Error(`no saved state for runId ${opts.runId}`);
    state = loaded;
  } else {
    const started = now().toISOString();
    state = {
      runId: opts.runId ?? generateRunId(now()),
      request: resolveRequest(opts.request),
      phase: 'EXPAND',
      queries: [],
      candidates: [],
      selected: [],
      skipped: [],
      transcriptsDone: [],
      atomsDone: [],
      startedAt: started,
      updatedAt: started,
      errors: [],
    };
    await save(state, ctx);
  }

  rebuildRankedIndex(state, ctx);

  while (state.phase !== 'DONE') {
    const phase = state.phase;
    try {
      await runPhase(phase, state, ctx);
    } catch (err) {
      recordError(state, phase, err);
      await save(state, ctx);
      throw err;
    }
    state.phase = NEXT_PHASE[phase];
    await save(state, ctx);
  }

  return {
    runId: state.runId,
    state,
    report: state.report ?? null,
    notionUrl: state.notionUrl ?? null,
  };
}

// ---------------------------------------------------------------------------
// Phase dispatch
// ---------------------------------------------------------------------------

async function runPhase(phase: RunPhase, state: RunState, ctx: Ctx): Promise<void> {
  switch (phase) {
    case 'EXPAND':
      return phaseExpand(state, ctx);
    case 'COLLECT':
      return phaseCollect(state, ctx);
    case 'SELECT':
      return phaseSelect(state, ctx);
    case 'TRANSCRIPT':
      return phaseTranscript(state, ctx);
    case 'ANALYZE':
      return phaseAnalyze(state, ctx);
    case 'SYNTHESIZE':
      return phaseSynthesize(state, ctx);
    case 'VERIFY':
      return phaseVerify(state, ctx);
    case 'COMPOSE':
      return phaseCompose(state, ctx);
    case 'STORE':
      return phaseStore(state, ctx);
    case 'PUBLISH':
      return phasePublish(state, ctx);
    default:
      return;
  }
}

// ---------------------------------------------------------------------------
// EXPAND
// ---------------------------------------------------------------------------

async function phaseExpand(state: RunState, ctx: Ctx): Promise<void> {
  state.queries = await expandQueries(state.request, ctx.ports.llm);
}

// ---------------------------------------------------------------------------
// COLLECT
// ---------------------------------------------------------------------------

async function phaseCollect(state: RunState, ctx: Ctx): Promise<void> {
  const req = state.request;
  const perQuery = Math.min(50, Math.max(25, Math.ceil(req.candidateTarget / Math.max(1, state.queries.length)) + 5));

  const hits = new Map<string, YouTubeSearchHit>();
  for (const query of state.queries) {
    try {
      const res = await ctx.ports.youtube.search({
        q: query.q,
        market: query.market,
        lang: query.lang,
        max: perQuery,
        order: 'relevance',
      });
      for (const h of res) if (!hits.has(h.videoId)) hits.set(h.videoId, h);
    } catch (err) {
      recordError(state, 'COLLECT', err, `search failed: ${query.q}`);
    }
  }

  if (hits.size === 0) throw new Error('COLLECT produced zero candidates');

  const candidates = new Map<string, CandidateVideo>();
  for (const h of hits.values()) {
    candidates.set(h.videoId, {
      videoId: h.videoId,
      title: h.title,
      description: h.description,
      channelId: h.channelId,
      channelTitle: h.channelTitle,
      publishedAt: h.publishedAt,
      liveBroadcastContent: h.liveBroadcastContent,
    });
  }

  // Enrich with video stats (best-effort, batched).
  const ids = [...candidates.keys()];
  for (let i = 0; i < ids.length; i += STATS_BATCH) {
    const batch = ids.slice(i, i + STATS_BATCH);
    let stats: VideoStats[] = [];
    try {
      stats = await ctx.ports.youtube.stats(batch);
    } catch (err) {
      recordError(state, 'COLLECT', err, 'stats batch failed');
      continue;
    }
    for (const s of stats) {
      const c = candidates.get(s.videoId);
      if (!c) continue;
      c.viewCount = s.viewCount;
      c.likeCount = s.likeCount;
      c.commentCount = s.commentCount;
      c.durationSeconds = s.durationSeconds;
      c.isShort = s.isShort;
      c.captionsAvailable = s.captionsAvailable;
      c.defaultLanguage = s.defaultLanguage;
      c.defaultAudioLanguage = s.defaultAudioLanguage;
      c.tags = s.tags;
    }
  }

  // Enrich with channel stats (best-effort, batched).
  const channelIds = [...new Set([...candidates.values()].map((c) => c.channelId))];
  const channelById = new Map<string, ChannelStats>();
  for (let i = 0; i < channelIds.length; i += STATS_BATCH) {
    const batch = channelIds.slice(i, i + STATS_BATCH);
    try {
      const res = await ctx.ports.youtube.channelStats(batch);
      for (const ch of res) channelById.set(ch.channelId, ch);
    } catch (err) {
      recordError(state, 'COLLECT', err, 'channelStats batch failed');
    }
  }
  for (const c of candidates.values()) {
    const ch = channelById.get(c.channelId);
    if (ch) {
      c.channelCountry = ch.country;
      c.subscriberCount = ch.subscriberCount;
    }
  }

  state.candidates = [...candidates.values()];
}

// ---------------------------------------------------------------------------
// SELECT
// ---------------------------------------------------------------------------

async function phaseSelect(state: RunState, ctx: Ctx): Promise<void> {
  const result = selectCandidates(state.candidates, state.request, state.queries, ctx.now());
  state.selected = result.shortlist;
  state.refillQueue = result.refillQueue;
  rebuildRankedIndex(state, ctx);
  if (state.selected.length === 0) {
    recordError(state, 'SELECT', new Error('no candidates survived selection'));
  }
}

// ---------------------------------------------------------------------------
// TRANSCRIPT (resumable per videoId)
// ---------------------------------------------------------------------------

async function phaseTranscript(state: RunState, ctx: Ctx): Promise<void> {
  const req = state.request;
  const tried = new Set<string>([...state.transcriptsDone, ...state.skipped.map((s) => s.videoId)]);
  const acceptedChannelCount = new Map<string, number>();
  for (const vid of state.transcriptsDone) {
    const rc = ctx.rankedById.get(vid);
    if (rc) acceptedChannelCount.set(rc.video.channelId, (acceptedChannelCount.get(rc.video.channelId) ?? 0) + 1);
  }

  const refillQueue = state.refillQueue ?? [];
  const queue: RankedCandidate[] = state.selected.filter((rc) => !tried.has(rc.video.videoId));
  // Candidates queued from refill but not yet attempted. Excluded from planRefill
  // so the same candidate is never offered twice (double-offers silently drain
  // queue slots and used to strand the run at the shortlist — §4.3-4.4).
  const reserved = new Set<string>();

  const takeRefill = (preferMarket?: Market): boolean => {
    const next = planRefill({
      refillQueue,
      triedVideoIds: new Set([...tried, ...reserved]),
      acceptedChannelCount,
      maxPerChannel: req.maxPerChannel,
      preferMarket,
    });
    if (!next) return false;
    reserved.add(next.video.videoId);
    queue.push(next);
    return true;
  };

  while (state.transcriptsDone.length < req.requiredVideoCount) {
    // Shortlist drained but still short → keep pulling the remaining ranked
    // candidates (whole refill queue) until required count met or exhausted.
    if (queue.length === 0 && !takeRefill()) break;
    const rc = queue.shift();
    if (!rc || tried.has(rc.video.videoId)) continue;
    const videoId = rc.video.videoId;
    reserved.delete(videoId);
    tried.add(videoId);

    // Transport error propagates → outer catch persists progress for resume.
    const result = await ctx.ports.transcript.fetchTranscript(videoId, {
      langs: req.markets.includes('US') ? ['ko', 'en'] : ['ko'],
      chunkChars: 7000,
    });

    if (!isTranscriptAvailable(result)) {
      state.skipped.push({ videoId, status: 'SKIPPED_NO_TRANSCRIPT' });
      takeRefill(rc.market);
      await save(state, ctx);
      continue;
    }

    if (await ctx.ports.store.hasTranscriptSha(result.sha256)) {
      state.skipped.push({ videoId, status: 'SKIPPED_DUPLICATE' });
      takeRefill(rc.market);
      await save(state, ctx);
      continue;
    }

    await ctx.ports.store.saveTranscript(result, buildVideoMeta(rc));
    ctx.transcripts.set(videoId, result);
    state.transcriptsDone.push(videoId);
    acceptedChannelCount.set(
      rc.video.channelId,
      (acceptedChannelCount.get(rc.video.channelId) ?? 0) + 1,
    );
    await save(state, ctx);
  }

  if (state.transcriptsDone.length < req.requiredVideoCount) {
    recordError(
      state,
      'TRANSCRIPT',
      new Error(
        `only ${state.transcriptsDone.length}/${req.requiredVideoCount} transcripts acquired (queue exhausted)`,
      ),
    );
  }
}

function buildVideoMeta(rc: RankedCandidate): VideoMeta {
  const v = rc.video;
  return {
    videoId: v.videoId,
    title: v.title,
    channelId: v.channelId,
    channelTitle: v.channelTitle ?? null,
    market: rc.market,
    viewCount: v.viewCount ?? null,
    durationSeconds: v.durationSeconds ?? null,
    channelCountry: v.channelCountry ?? null,
    subscriberCount: v.subscriberCount ?? null,
    publishedAt: v.publishedAt ?? null,
  };
}

// ---------------------------------------------------------------------------
// ANALYZE (resumable per videoId)
// ---------------------------------------------------------------------------

async function phaseAnalyze(state: RunState, ctx: Ctx): Promise<void> {
  await ensureTranscriptsLoaded(state, ctx);
  state.atoms = state.atoms ?? [];

  for (const videoId of state.transcriptsDone) {
    if (state.atomsDone.includes(videoId)) continue;
    const transcript = ctx.transcripts.get(videoId);
    if (!transcript) {
      recordError(state, 'ANALYZE', new Error(`transcript missing for ${videoId}`));
      state.atomsDone.push(videoId);
      await save(state, ctx);
      continue;
    }

    const integrity = verifyChunkIntegrity(transcript);
    if (!integrity.ok) {
      recordError(state, 'ANALYZE', new Error(`chunk integrity: ${integrity.issues[0]}`), videoId);
    }

    const rc = ctx.rankedById.get(videoId);
    // LLM transport error propagates → resume checkpoint.
    const atoms = await extractAtomsForVideo({
      transcript,
      llm: ctx.ports.llm,
      ctx: {
        videoId,
        channelId: rc?.video.channelId ?? '',
        market: rc?.market ?? 'KR',
        transcriptSource: transcript.source,
        runId: state.runId,
        outputLanguage: state.request.outputLanguage,
      },
    });
    state.atoms.push(...atoms);
    state.atomsDone.push(videoId);
    await save(state, ctx);
  }
}

async function ensureTranscriptsLoaded(state: RunState, ctx: Ctx): Promise<void> {
  for (const videoId of state.transcriptsDone) {
    if (ctx.transcripts.has(videoId)) continue;
    const t = await ctx.ports.store.loadTranscript(videoId);
    if (t) ctx.transcripts.set(videoId, t);
  }
}

// ---------------------------------------------------------------------------
// SYNTHESIZE
// ---------------------------------------------------------------------------

async function phaseSynthesize(state: RunState, ctx: Ctx): Promise<void> {
  const atoms = state.atoms ?? [];
  const { principles, unifiedTheory } = await runSynthesis(state.request.topic, atoms, ctx.ports.llm);
  state.principles = principles;
  state.unifiedTheory = unifiedTheory;
}

// ---------------------------------------------------------------------------
// VERIFY
// ---------------------------------------------------------------------------

async function phaseVerify(state: RunState, ctx: Ctx): Promise<void> {
  await ensureTranscriptsLoaded(state, ctx);
  const atoms = state.atoms ?? [];
  const atomsById = new Map(atoms.map((a) => [a.claimId, a]));
  const principles = state.principles ?? [];

  for (const principle of principles) {
    const pAtoms = principle.atomIds
      .map((id) => atomsById.get(id))
      .filter((a): a is KnowledgeAtom => a !== undefined);
    const segments = gatherSegments(pAtoms, ctx);
    principle.verificationStatus = await verifyPrincipleFreshContext({
      principle,
      atoms: pAtoms,
      segments,
      llm: ctx.ports.llm,
    });
  }

  // Technical claims → official docs cross-check (optional).
  const isTechnical = state.request.researchPurpose === 'TECHNICAL_RESEARCH';
  if (isTechnical && ctx.ports.docsVerify && principles.length > 0) {
    try {
      const claims = principles.slice(0, 20).map((p) => ({ claim: p.statement }));
      const results = await ctx.ports.docsVerify.verifyClaims(claims);
      const byClaim = new Map(results.map((r) => [r.claim.trim(), r]));
      for (const p of principles) {
        const r = byClaim.get(p.statement.trim());
        if (!r) continue;
        p.verificationStatus = r.status;
      }
      state.docsResults = results;
    } catch (err) {
      recordError(state, 'VERIFY', err, 'docs verify failed');
    }
  }
}

function gatherSegments(atoms: KnowledgeAtom[], ctx: Ctx): TranscriptSegment[] {
  const out: TranscriptSegment[] = [];
  const seen = new Set<string>();
  for (const a of atoms) {
    const t = ctx.transcripts.get(a.videoId);
    if (!t) continue;
    for (const s of segmentsInRange(t.segments, a.startSeconds, a.endSeconds)) {
      const key = `${a.videoId}:${s.index}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(s);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// COMPOSE (§12-A — book-style manuscript; resumable per chapter)
// ---------------------------------------------------------------------------

async function phaseCompose(state: RunState, ctx: Ctx): Promise<void> {
  await ensureTranscriptsLoaded(state, ctx);
  const atoms = state.atoms ?? [];
  const principles = state.principles ?? [];
  const videoTitles = buildVideoTitles(ctx);

  // 1. OUTLINE — designed once, kept in state (small) for resume + assembly.
  if (!state.bookOutline || state.bookOutline.length === 0) {
    const outline = await composeOutline({
      request: state.request,
      principles,
      atoms,
      llm: ctx.ports.llm,
    });
    state.bookOutline = outline.chapters;
    await save(state, ctx);
  }

  const atomsById = new Map(atoms.map((a) => [a.claimId, a]));
  state.bookDone = state.bookDone ?? [];
  state.bookFailedChapters = state.bookFailedChapters ?? [];
  const done = new Set(state.bookDone);
  const chapters = state.bookOutline;

  // 2+3. WRITE per chapter (resumable — completed chapters are skipped; prose is
  // persisted to the store, never into RunState).
  for (let i = 0; i < chapters.length; i++) {
    const chapter = chapters[i];
    if (done.has(chapter.chapterId)) continue;

    const chapterAtoms = chapter.atomIds
      .map((id) => atomsById.get(id))
      .filter((a): a is KnowledgeAtom => a !== undefined);
    const excerpts = gatherChapterExcerpts({
      atoms: chapterAtoms,
      transcripts: ctx.transcripts,
      videoTitles,
    });
    const previousTitles = chapters.slice(0, i).map((c) => c.title);

    const { markdown, fallback } = await writeChapter({
      chapter,
      atoms: chapterAtoms,
      excerpts,
      previousTitles,
      request: state.request,
      videoTitles,
      llm: ctx.ports.llm,
    });

    await ctx.ports.store.saveBookChapter(state.runId, chapter.chapterId, markdown);
    ctx.chapters.set(chapter.chapterId, markdown);
    state.bookDone.push(chapter.chapterId);
    if (fallback && !state.bookFailedChapters.includes(chapter.chapterId)) {
      state.bookFailedChapters.push(chapter.chapterId);
    }
    await save(state, ctx);
  }
}

function buildVideoTitles(ctx: Ctx): Map<string, string> {
  const out = new Map<string, string>();
  for (const [videoId, rc] of ctx.rankedById) out.set(videoId, rc.video.title);
  return out;
}

/**
 * Assemble the full book markdown from state: outline (state) + per-chapter prose
 * (in-memory cache → store on resume) + appendix (rendered from the canonical
 * report). Pure assembly; the only I/O is loading persisted chapters.
 */
async function assembleBookFromState(
  state: RunState,
  ctx: Ctx,
  report: SynthesisReport,
): Promise<string> {
  const outline: BookOutline = { chapters: state.bookOutline ?? [] };
  const chapters = new Map<string, string>();
  for (const c of outline.chapters) {
    let body = ctx.chapters.get(c.chapterId);
    if (body === undefined) {
      const loaded = await ctx.ports.store.loadBookChapter(state.runId, c.chapterId);
      if (loaded !== null) {
        body = loaded;
        ctx.chapters.set(c.chapterId, loaded);
      }
    }
    if (body) chapters.set(c.chapterId, body);
  }
  return assembleBook({
    outline,
    request: state.request,
    chapters,
    appendixMarkdown: renderAppendixMarkdown(report),
  });
}

// ---------------------------------------------------------------------------
// STORE
// ---------------------------------------------------------------------------

async function phaseStore(state: RunState, ctx: Ctx): Promise<void> {
  await ensureTranscriptsLoaded(state, ctx);
  const atoms = state.atoms ?? [];
  const principles = state.principles ?? [];

  await ctx.ports.store.saveAtoms(state.runId, atoms);

  const graph = buildConceptGraph(principles, atoms);
  state.graph = graph;
  await ctx.ports.store.saveGraph(state.runId, graph);

  const report = buildReportFromState(state, ctx);
  state.report = report;
  await ctx.ports.store.saveSynthesis(state.runId, report);
  // reports/<runId>.md is the BOOK manuscript (§12-A); the canonical JSON stays
  // in syntheses/. The book carries the report only as its appendix.
  const book = await assembleBookFromState(state, ctx, report);
  await ctx.ports.store.saveReportMarkdown(state.runId, book);

  // Embeddings (optional, graceful).
  if (ctx.ports.embeddings?.available()) {
    try {
      const atomItems: EmbeddingItem[] = atoms.map((a) => ({
        refId: a.claimId,
        text: a.claim,
        runId: state.runId,
        videoId: a.videoId,
      }));
      await ctx.ports.embeddings.embed('atom', atomItems);

      const segItems: EmbeddingItem[] = [];
      for (const videoId of state.transcriptsDone) {
        const t = ctx.transcripts.get(videoId);
        if (!t) continue;
        for (const chunk of t.chunks) {
          segItems.push({
            refId: `${videoId}:${chunk.index}`,
            text: chunk.text,
            runId: state.runId,
            videoId,
          });
        }
      }
      await ctx.ports.embeddings.embed('segment', segItems);
    } catch (err) {
      recordError(state, 'STORE', err, 'embeddings failed');
    }
  }
}

// ---------------------------------------------------------------------------
// PUBLISH
// ---------------------------------------------------------------------------

async function phasePublish(state: RunState, ctx: Ctx): Promise<void> {
  const report = state.report;
  let notionUrl: string | null = null;
  if (report && ctx.ports.notion) {
    try {
      // Notion gets the BOOK manuscript, not the raw canonical render (§12-A).
      const book = await assembleBookFromState(state, ctx, report);
      const res = await ctx.ports.notion.publishReport({
        title: `[리서치] ${report.topic}`,
        markdown: book,
      });
      notionUrl = res.url;
    } catch (err) {
      recordError(state, 'PUBLISH', err, 'notion publish failed');
    }
  }
  state.notionUrl = notionUrl;

  // Brain-card push (top principles) — carries the Notion link when present.
  try {
    await ctx.ports.store.pushPrincipleCards({
      topic: state.request.topic,
      notionUrl,
      principles: (state.principles ?? [])
        .filter((p) => p.kind === 'common' && p.evidenceQuality !== 'weak')
        .slice(0, 10),
    });
  } catch (err) {
    recordError(state, 'PUBLISH', err, 'brain card push failed');
  }

  if (ctx.ports.slack) {
    try {
      await ctx.ports.slack.notify({
        channel: ctx.slack?.channel,
        threadTs: ctx.slack?.threadTs,
        text: buildSlackSummary(state, notionUrl),
      });
    } catch (err) {
      recordError(state, 'PUBLISH', err, 'slack notify failed');
    }
  }
}

// ---------------------------------------------------------------------------
// Report assembly from state
// ---------------------------------------------------------------------------

function buildReportFromState(state: RunState, ctx: Ctx): SynthesisReport {
  const videoSources: ReportVideoSource[] = [];
  const marketBreakdown: Record<Market, number> = { KR: 0, US: 0 };
  for (const videoId of state.transcriptsDone) {
    const rc = ctx.rankedById.get(videoId);
    const t = ctx.transcripts.get(videoId);
    const market: Market = rc?.market ?? 'KR';
    marketBreakdown[market] += 1;
    videoSources.push({
      videoId,
      title: rc?.video.title ?? videoId,
      channelTitle: rc?.video.channelTitle ?? '',
      market,
      viewCount: rc?.video.viewCount ?? null,
      durationSeconds: rc?.video.durationSeconds ?? null,
      transcriptSource: t?.source ?? 'auto',
      sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
    });
  }

  const skippedNoTranscript = state.skipped
    .filter((s) => s.status === 'SKIPPED_NO_TRANSCRIPT')
    .map((s) => s.videoId);
  const originalShortlist = new Set(state.selected.map((rc) => rc.video.videoId));
  const refillUsed = state.transcriptsDone.filter((v) => !originalShortlist.has(v)).length;

  const methodology: MethodologySummary = {
    candidateCount: state.candidates.length,
    analyzedCount: state.atomsDone.length,
    skippedNoTranscript,
    refillUsed,
    marketBreakdown,
    queriesUsed: state.queries.length,
  };

  const limitations: string[] = [];
  if (state.transcriptsDone.length < state.request.requiredVideoCount) {
    limitations.push(
      `목표 ${state.request.requiredVideoCount}개 중 ${state.transcriptsDone.length}개만 분석됨(자막 확보 한계).`,
    );
  }
  if (state.candidates.length < state.request.candidateTarget) {
    limitations.push(
      `후보 목표 ${state.request.candidateTarget}개 중 ${state.candidates.length}개만 수집됨.`,
    );
  }
  if ((state.bookFailedChapters?.length ?? 0) > 0) {
    limitations.push(
      `${state.bookFailedChapters!.length}개 챕터는 자동 집필에 실패해 아톰 기반 요약으로 대체됨.`,
    );
  }

  const keyConcepts = deriveKeyConcepts(state.atoms ?? []);

  const purpose = state.request.researchPurpose;
  const learning =
    (purpose === 'LEARNING' || purpose === 'TECHNICAL_RESEARCH') && (state.docsResults?.length ?? 0) > 0
      ? { ...emptyLearning(), glossary: keyConcepts, docsVerification: state.docsResults ?? [] }
      : undefined;

  return assembleReport({
    runId: state.runId,
    request: state.request,
    principles: state.principles ?? [],
    unifiedTheory: state.unifiedTheory ?? null,
    atoms: state.atoms ?? [],
    videoSources,
    methodology,
    generatedAt: ctx.now().toISOString(),
    keyConcepts,
    limitations,
    learning,
  });
}

function deriveKeyConcepts(atoms: KnowledgeAtom[]): { term: string; definition: string }[] {
  const out: { term: string; definition: string }[] = [];
  const seen = new Set<string>();
  for (const a of atoms) {
    if (a.claimType !== 'framework') continue;
    // §12-A: no truncation — the full claim is the term (60자 잘림 제거).
    const term = a.claim.trim();
    if (!term || seen.has(term)) continue;
    seen.add(term);
    out.push({ term, definition: a.explanation || a.claim });
    if (out.length >= 8) break;
  }
  return out;
}

function buildSlackSummary(state: RunState, notionUrl: string | null): string {
  const top = (state.principles ?? [])
    .filter((p) => p.kind === 'common')
    .slice(0, 3)
    .map((p, i) => `${i + 1}. ${p.statement}`);
  const vstatus = Object.entries(state.report?.verification.byStatus ?? {})
    .map(([s, n]) => `${s} ${n}`)
    .join(', ');
  const lines = [
    `🔎 리서치 완료: ${state.request.topic}`,
    `분석 영상 ${state.transcriptsDone.length}개`,
    '핵심 발견:',
    ...top,
    vstatus ? `검증: ${vstatus}` : '',
    notionUrl ? `Notion: ${notionUrl}` : `로컬 리포트: reports/${state.runId}.md`,
  ];
  return lines.filter(Boolean).join('\n');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rebuildRankedIndex(state: RunState, ctx: Ctx): void {
  ctx.rankedById.clear();
  for (const rc of state.selected) ctx.rankedById.set(rc.video.videoId, rc);
  for (const rc of state.refillQueue ?? []) ctx.rankedById.set(rc.video.videoId, rc);
}

async function save(state: RunState, ctx: Ctx): Promise<void> {
  state.updatedAt = ctx.now().toISOString();
  await ctx.ports.store.saveState(state);
}

function recordError(state: RunState, phase: RunPhase, err: unknown, prefix?: string): void {
  const message = `${prefix ? `${prefix}: ` : ''}${err instanceof Error ? err.message : String(err)}`;
  const entry: RunError = { phase, message, at: new Date().toISOString() };
  state.errors.push(entry);
}
