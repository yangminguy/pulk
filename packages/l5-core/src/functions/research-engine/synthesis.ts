// research-engine — synthesis (SYNTHESIZE phase, §4.6).
//
// LLM clusters atoms (ids only); the principle aggregation is then fully
// deterministic and unit-tested: mentionVideoCount (distinct videoIds),
// independentChannelCount (distinct channelIds — same channel twice = 1),
// representative sources, evidence quality, and provisional status.
// "많이 언급됨 ≠ 검증됨" — mention counts and verificationStatus are separate.

import type { LLMClient } from '../ceo-orchestration/types';
import {
  AtomCluster,
  ClusterRelation,
  KnowledgeAtom,
  PrincipleKind,
  RepresentativeSource,
  ResearchParseError,
  SynthesizedPrinciple,
  requireArray,
  requireString,
  strictJsonObject,
} from './types';
import { deriveVerificationStatus } from './verification';

const VALID_RELATIONS: ClusterRelation[] = ['common', 'conflict', 'conditional', 'independent'];
const MAX_REPRESENTATIVE_SOURCES = 3;

// ---------------------------------------------------------------------------
// Clustering prompt + parser
// ---------------------------------------------------------------------------

export function buildClusterPrompt(atoms: KnowledgeAtom[]): { system: string; user: string } {
  const system =
    '너는 지식 합성가다. 주어진 아톰(주장) 목록을 의미가 같은/충돌하는/조건부/독립 클러스터로 묶는다. ' +
    '각 클러스터에 담기는 것은 아톰 id 목록뿐이다(원문 재작성 금지). ' +
    'relation: 여러 아톰이 같은 주장을 지지하면 "common", 서로 반대면 "conflict", ' +
    '조건에 따라 갈리면 "conditional", 묶이지 않으면 "independent". ' +
    '반드시 JSON만 출력: {"clusters":[{"clusterId":string,"label":string,' +
    '"atomIds":[string],"relation":"common"|"conflict"|"conditional"|"independent"}]}';
  const lines = atoms.map((a) => `- ${a.claimId} [${a.market}] ${a.claim}`);
  return { system, user: `[아톰 목록]\n${lines.join('\n')}` };
}

/** Strict parse of the cluster response. Throws on malformed input. */
export function parseClusterResponse(raw: string): AtomCluster[] {
  const obj = strictJsonObject(raw);
  const arr = requireArray(obj, 'clusters');
  const out: AtomCluster[] = [];
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const clusterId = requireString(o.clusterId, 'clusterId');
    const atomIds = requireArray(o, 'atomIds').filter((x): x is string => typeof x === 'string');
    if (atomIds.length === 0) continue;
    const relation: ClusterRelation = VALID_RELATIONS.includes(o.relation as ClusterRelation)
      ? (o.relation as ClusterRelation)
      : 'common';
    out.push({
      clusterId,
      label: typeof o.label === 'string' && o.label.trim() ? o.label.trim() : clusterId,
      atomIds,
      relation,
    });
  }
  if (out.length === 0) throw new ResearchParseError('no valid clusters in response');
  return out;
}

// ---------------------------------------------------------------------------
// Deterministic principle aggregation
// ---------------------------------------------------------------------------

function evidenceQualityOf(independentChannelCount: number): SynthesizedPrinciple['evidenceQuality'] {
  if (independentChannelCount >= 3) return 'strong';
  if (independentChannelCount === 2) return 'moderate';
  return 'weak';
}

function pickRepresentativeSources(atoms: KnowledgeAtom[]): RepresentativeSource[] {
  const byConfidence = [...atoms].sort((a, b) => b.confidence - a.confidence);
  const seenVideo = new Set<string>();
  const out: RepresentativeSource[] = [];
  for (const a of byConfidence) {
    if (seenVideo.has(a.videoId)) continue;
    seenVideo.add(a.videoId);
    out.push({
      videoId: a.videoId,
      startSeconds: a.startSeconds,
      sourceUrl: a.sourceUrl,
      market: a.market,
    });
    if (out.length >= MAX_REPRESENTATIVE_SOURCES) break;
  }
  return out;
}

function kindFromRelation(relation: ClusterRelation, marketsSpanned: number): PrincipleKind {
  if (relation === 'conflict') return marketsSpanned >= 2 ? 'kr_us_diff' : 'conflict';
  if (relation === 'conditional') return 'conditional';
  return 'common';
}

/**
 * Build principles from clusters + the atom pool. Fully deterministic — this is
 * the function §9's common/conflict/independent-channel tests target.
 */
export function synthesizePrinciples(
  clusters: AtomCluster[],
  atoms: KnowledgeAtom[],
): SynthesizedPrinciple[] {
  const byId = new Map(atoms.map((a) => [a.claimId, a]));
  const out: SynthesizedPrinciple[] = [];

  for (const cluster of clusters) {
    const members = cluster.atomIds
      .map((id) => byId.get(id))
      .filter((a): a is KnowledgeAtom => a !== undefined);
    if (members.length === 0) continue;

    const videoIds = new Set(members.map((m) => m.videoId));
    const channelIds = new Set(members.map((m) => m.channelId));
    const markets = new Set(members.map((m) => m.market));
    const mentionVideoCount = videoIds.size;
    const independentChannelCount = channelIds.size;
    const kind = kindFromRelation(cluster.relation, markets.size);
    const allAmbiguous = members.every((m) => m.verificationStatus === 'TRANSCRIPT_AMBIGUOUS');
    const hasCounter = kind === 'conflict' || kind === 'kr_us_diff';

    const verificationStatus = deriveVerificationStatus({
      kind,
      mentionVideoCount,
      independentChannelCount,
      hasCounter,
      allAmbiguous,
    });

    out.push({
      id: `principle-${cluster.clusterId}`,
      statement: cluster.label,
      kind,
      mentionVideoCount,
      independentChannelCount,
      representativeSources: pickRepresentativeSources(members),
      evidenceQuality: evidenceQualityOf(independentChannelCount),
      counterClaims: [],
      applicabilityConditions: [],
      verificationStatus,
      atomIds: members.map((m) => m.claimId),
    });
  }

  return out;
}

/** Partition principles for the report's common / conflict / KR-US sections. */
export function partitionPrinciples(principles: SynthesizedPrinciple[]): {
  common: SynthesizedPrinciple[];
  conflict: SynthesizedPrinciple[];
  krUsDiff: SynthesizedPrinciple[];
} {
  return {
    common: principles.filter((p) => p.kind === 'common' || p.kind === 'conditional'),
    conflict: principles.filter((p) => p.kind === 'conflict'),
    krUsDiff: principles.filter((p) => p.kind === 'kr_us_diff'),
  };
}

// ---------------------------------------------------------------------------
// Unified theory (optional LLM step)
// ---------------------------------------------------------------------------

export function buildUnifiedTheoryPrompt(
  topic: string,
  principles: SynthesizedPrinciple[],
): { system: string; user: string } {
  const system =
    '너는 지식 통합가다. 아래 원칙들을 관통하는 하나의 통합 이론(또는 실행 프레임워크)을 ' +
    '2~4문장으로 제시한다. 근거 없는 확장 금지. 반드시 JSON만 출력: {"unifiedTheory":string}';
  const lines = principles.map((p) => `- (${p.kind}, ch=${p.independentChannelCount}) ${p.statement}`);
  return { system, user: `주제: ${topic}\n\n[원칙]\n${lines.join('\n')}` };
}

/** Strict parse of the unified-theory response. Throws on malformed input. */
export function parseUnifiedTheoryResponse(raw: string): string {
  const obj = strictJsonObject(raw);
  return requireString(obj.unifiedTheory, 'unifiedTheory');
}

/**
 * Full SYNTHESIZE: LLM clusters → deterministic principles → optional unified
 * theory. Never throws — clustering failure falls back to one principle per
 * videoId group so downstream phases still have material.
 */
export async function runSynthesis(
  topic: string,
  atoms: KnowledgeAtom[],
  llm: LLMClient,
): Promise<{ principles: SynthesizedPrinciple[]; unifiedTheory: string | null }> {
  let clusters: AtomCluster[];
  try {
    const raw = await llm.complete({ ...buildClusterPrompt(atoms), trace_name: 'research.cluster' });
    clusters = parseClusterResponse(raw);
  } catch {
    clusters = fallbackClusters(atoms);
  }

  const principles = synthesizePrinciples(clusters, atoms);

  let unifiedTheory: string | null = null;
  if (principles.length > 0) {
    try {
      const raw = await llm.complete({
        ...buildUnifiedTheoryPrompt(topic, principles),
        trace_name: 'research.unifiedTheory',
      });
      unifiedTheory = parseUnifiedTheoryResponse(raw);
    } catch {
      unifiedTheory = null;
    }
  }

  return { principles, unifiedTheory };
}

/** Deterministic fallback clustering: group atoms by normalized claim head. */
export function fallbackClusters(atoms: KnowledgeAtom[]): AtomCluster[] {
  const groups = new Map<string, KnowledgeAtom[]>();
  for (const a of atoms) {
    const key = a.claim.trim().toLowerCase().slice(0, 40);
    const list = groups.get(key) ?? [];
    list.push(a);
    groups.set(key, list);
  }
  let n = 0;
  const out: AtomCluster[] = [];
  for (const [, list] of groups) {
    out.push({
      clusterId: `fb-${n}`,
      label: list[0].claim,
      atomIds: list.map((a) => a.claimId),
      relation: 'common',
    });
    n += 1;
  }
  return out;
}
