// research-engine — candidate selection (SELECT phase, §4.3).
//
// 100% deterministic, no LLM. Every function here is pure and unit-tested:
//   filters → videoId dedup → reupload dedup → market classify → rank →
//   shortlist (channel cap + KR/US minimums + requiredVideoCount+10) → refill.

import { classifyMarket } from './market-classifier';
import type {
  CandidateVideo,
  Market,
  RankedCandidate,
  RejectedCandidate,
  ResolvedResearchRequest,
  SearchQuery,
  SelectionResult,
} from './types';

// ---------------------------------------------------------------------------
// Tokenisation / similarity
// ---------------------------------------------------------------------------

const TOKEN_SPLIT = /[^0-9a-z가-힣]+/i;

/** Lowercase word/Hangul tokens of length ≥ 2. */
export function tokenize(text: string): Set<string> {
  const out = new Set<string>();
  if (!text) return out;
  for (const raw of text.toLowerCase().split(TOKEN_SPLIT)) {
    if (raw.length >= 2) out.add(raw);
  }
  return out;
}

/** Jaccard similarity of two token sets (0..1). */
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

const REUPLOAD_SIMILARITY = 0.85;
const REUPLOAD_DURATION_DELTA = 5; // seconds

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

interface FilterOutcome {
  kept: CandidateVideo[];
  rejected: RejectedCandidate[];
}

/** viewCount / duration / live filters + exact videoId de-duplication. */
export function applyFilters(
  candidates: CandidateVideo[],
  req: ResolvedResearchRequest,
): FilterOutcome {
  const kept: CandidateVideo[] = [];
  const rejected: RejectedCandidate[] = [];
  const seen = new Set<string>();

  for (const c of candidates) {
    if (seen.has(c.videoId)) {
      rejected.push({ videoId: c.videoId, reason: 'duplicate_videoid' });
      continue;
    }
    seen.add(c.videoId);

    const live = (c.liveBroadcastContent ?? 'none').toLowerCase();
    if (live === 'live' || live === 'upcoming') {
      rejected.push({ videoId: c.videoId, reason: 'live_or_upcoming' });
      continue;
    }
    if ((c.viewCount ?? 0) < req.minimumViewCount) {
      rejected.push({ videoId: c.videoId, reason: 'below_view_count' });
      continue;
    }
    if ((c.durationSeconds ?? 0) < req.minimumDurationSeconds) {
      rejected.push({ videoId: c.videoId, reason: 'below_duration' });
      continue;
    }
    kept.push(c);
  }

  return { kept, rejected };
}

/**
 * Remove re-uploads: normalized-title Jaccard ≥ 0.85 AND duration delta ≤ 5s.
 * The higher-viewCount copy is kept; the loser is rejected as 'reupload'.
 */
export function dedupeReuploads(candidates: CandidateVideo[]): FilterOutcome {
  // Process in descending viewCount so the survivor is always the popular copy.
  const ordered = [...candidates].sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0));
  const kept: CandidateVideo[] = [];
  const keptTokens: Array<Set<string>> = [];
  const rejected: RejectedCandidate[] = [];

  for (const c of ordered) {
    const tokens = tokenize(c.title);
    let isReupload = false;
    for (let i = 0; i < kept.length; i++) {
      const other = kept[i];
      const durDelta = Math.abs((c.durationSeconds ?? 0) - (other.durationSeconds ?? 0));
      if (durDelta <= REUPLOAD_DURATION_DELTA && jaccard(tokens, keptTokens[i]) >= REUPLOAD_SIMILARITY) {
        isReupload = true;
        break;
      }
    }
    if (isReupload) {
      rejected.push({ videoId: c.videoId, reason: 'reupload' });
    } else {
      kept.push(c);
      keptTokens.push(tokens);
    }
  }

  return { kept, rejected };
}

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------

const WEIGHTS = { relevance: 0.4, views: 0.3, recency: 0.15, subscribers: 0.15 };
const RECENCY_HALF_LIFE_DAYS = 540; // ~18 months
const LOG_VIEW_CAP = 8; // log10(1e8)
const LOG_SUB_CAP = 8;

function log10Norm(value: number, cap: number): number {
  const v = Math.max(0, value);
  return Math.min(1, Math.log10(v + 1) / cap);
}

function recencyScore(publishedAt: string | undefined, now: Date): number {
  if (!publishedAt) return 0.5; // neutral when unknown
  const t = Date.parse(publishedAt);
  if (Number.isNaN(t)) return 0.5;
  const ageDays = Math.max(0, (now.getTime() - t) / 86_400_000);
  return Math.exp((-Math.LN2 * ageDays) / RECENCY_HALF_LIFE_DAYS);
}

function relevanceScore(c: CandidateVideo, queryTokens: Set<string>): number {
  if (queryTokens.size === 0) return 0;
  const text = tokenize(`${c.title} ${c.description ?? ''}`);
  let hit = 0;
  for (const t of queryTokens) if (text.has(t)) hit += 1;
  return hit / queryTokens.size;
}

/** Union of all query token sets. */
export function queryTokenSet(queries: SearchQuery[]): Set<string> {
  const out = new Set<string>();
  for (const query of queries) {
    for (const t of tokenize(query.q)) out.add(t);
  }
  return out;
}

/**
 * Deterministic ranking. Candidates that cannot be assigned a requested market
 * are rejected as 'unknown_market'. Returns ranked list (desc) + rejects.
 */
export function rankCandidates(
  candidates: CandidateVideo[],
  req: ResolvedResearchRequest,
  queries: SearchQuery[],
  now: Date,
): { ranked: RankedCandidate[]; rejected: RejectedCandidate[] } {
  const qTokens = queryTokenSet(queries);
  const ranked: RankedCandidate[] = [];
  const rejected: RejectedCandidate[] = [];

  for (const c of candidates) {
    const market = classifyMarket({
      channelCountry: c.channelCountry,
      defaultAudioLanguage: c.defaultAudioLanguage,
      defaultLanguage: c.defaultLanguage,
      title: c.title,
      description: c.description,
    });
    if (market === null || !req.markets.includes(market)) {
      rejected.push({ videoId: c.videoId, reason: 'unknown_market' });
      continue;
    }
    const parts = {
      relevance: relevanceScore(c, qTokens),
      recency: recencyScore(c.publishedAt, now),
      views: log10Norm(c.viewCount ?? 0, LOG_VIEW_CAP),
      subscribers: log10Norm(c.subscriberCount ?? 0, LOG_SUB_CAP),
    };
    const rankScore =
      WEIGHTS.relevance * parts.relevance +
      WEIGHTS.views * parts.views +
      WEIGHTS.recency * parts.recency +
      WEIGHTS.subscribers * parts.subscribers;
    ranked.push({ video: c, market, rankScore, scoreParts: parts });
  }

  ranked.sort(compareRanked);
  return { ranked, rejected };
}

/** Stable total order: rankScore desc, then viewCount desc, then videoId asc. */
export function compareRanked(a: RankedCandidate, b: RankedCandidate): number {
  if (b.rankScore !== a.rankScore) return b.rankScore - a.rankScore;
  const va = a.video.viewCount ?? 0;
  const vb = b.video.viewCount ?? 0;
  if (vb !== va) return vb - va;
  return a.video.videoId < b.video.videoId ? -1 : a.video.videoId > b.video.videoId ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Shortlist
// ---------------------------------------------------------------------------

const MIN_PER_MARKET = 4;
const SHORTLIST_MARGIN = 10;

/**
 * Pick the shortlist from ranked candidates:
 *  - channel cap ≤ maxPerChannel
 *  - each requested market gets ≥ min(4, available)
 *  - total size = requiredVideoCount + 10 (when enough candidates exist)
 * Everything not shortlisted (incl. channel-capped) becomes the refill queue,
 * kept in ranked order.
 */
export function selectShortlist(
  ranked: RankedCandidate[],
  req: ResolvedResearchRequest,
): { shortlist: RankedCandidate[]; refillQueue: RankedCandidate[] } {
  const target = req.requiredVideoCount + SHORTLIST_MARGIN;
  const channelCount = new Map<string, number>();
  const picked = new Set<string>();
  const shortlist: RankedCandidate[] = [];

  const canPick = (rc: RankedCandidate): boolean => {
    if (picked.has(rc.video.videoId)) return false;
    const used = channelCount.get(rc.video.channelId) ?? 0;
    return used < req.maxPerChannel;
  };
  const take = (rc: RankedCandidate): void => {
    picked.add(rc.video.videoId);
    channelCount.set(rc.video.channelId, (channelCount.get(rc.video.channelId) ?? 0) + 1);
    shortlist.push(rc);
  };

  // Phase A — guarantee per-market minimums (ranked order within each market).
  for (const market of req.markets) {
    let have = 0;
    for (const rc of ranked) {
      if (have >= MIN_PER_MARKET || shortlist.length >= target) break;
      if (rc.market !== market) continue;
      if (canPick(rc)) {
        take(rc);
        have += 1;
      }
    }
  }

  // Phase B — fill remaining slots from the global ranked order.
  for (const rc of ranked) {
    if (shortlist.length >= target) break;
    if (canPick(rc)) take(rc);
  }

  // Refill queue = everything ranked but not shortlisted, ranked order preserved.
  const refillQueue = ranked.filter((rc) => !picked.has(rc.video.videoId));
  return { shortlist, refillQueue };
}

/** End-to-end SELECT: filter → reupload-dedup → rank → shortlist. */
export function selectCandidates(
  candidates: CandidateVideo[],
  req: ResolvedResearchRequest,
  queries: SearchQuery[],
  now: Date,
): SelectionResult {
  const filtered = applyFilters(candidates, req);
  const deduped = dedupeReuploads(filtered.kept);
  const { ranked, rejected: marketRejected } = rankCandidates(deduped.kept, req, queries, now);
  const { shortlist, refillQueue } = selectShortlist(ranked, req);
  return {
    shortlist,
    refillQueue,
    rejected: [...filtered.rejected, ...deduped.rejected, ...marketRejected],
  };
}

// ---------------------------------------------------------------------------
// Refill (transcript failure backfill, §4.4)
// ---------------------------------------------------------------------------

export interface RefillContext {
  refillQueue: RankedCandidate[];
  /** videoIds already tried (accepted or skipped) — never re-offered. */
  triedVideoIds: ReadonlySet<string>;
  /** channelId → count among currently accepted (transcript-confirmed) videos. */
  acceptedChannelCount: ReadonlyMap<string, number>;
  maxPerChannel: number;
  /** prefer a replacement from this market first (the skipped video's market). */
  preferMarket?: Market;
}

/**
 * Choose the next candidate to attempt when a shortlisted video is skipped.
 * Prefers the same market, respects the channel cap against accepted videos,
 * and never re-offers a tried videoId. Returns null when the queue is exhausted.
 * Pure — the caller mutates its own tried/accepted bookkeeping.
 */
export function planRefill(ctx: RefillContext): RankedCandidate | null {
  const eligible = ctx.refillQueue.filter((rc) => {
    if (ctx.triedVideoIds.has(rc.video.videoId)) return false;
    const used = ctx.acceptedChannelCount.get(rc.video.channelId) ?? 0;
    return used < ctx.maxPerChannel;
  });
  if (eligible.length === 0) return null;
  if (ctx.preferMarket) {
    const sameMarket = eligible.find((rc) => rc.market === ctx.preferMarket);
    if (sameMarket) return sameMarket;
  }
  return eligible[0];
}
