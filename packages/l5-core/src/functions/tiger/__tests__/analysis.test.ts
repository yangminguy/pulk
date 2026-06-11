// 호랑이 분석 엔진 단위테스트 (순수 판단 룰). 정본 SPEC §3.
import {
  prepareCandidates,
  selectModel,
  buildTigerPrompt,
  parseTigerOutput,
  cardToBPRLog,
  cardToProposal,
  cardToMemoryEntry,
  encodeTargetRef,
  decodeTargetRef,
  type ImprovementCard,
} from '../analysis';
import type { BottleneckCandidate } from '../collector';

function cand(over: Partial<BottleneckCandidate> = {}): BottleneckCandidate {
  return {
    fingerprint: 'cmo_slide_video_factory|render timeout',
    executive: 'CMO',
    tool_id: 'cmo_slide_video_factory',
    repo: '/Users/wonminyang/ai-slide-video-factory',
    kind: 'error',
    title: 'render timeout after retries',
    occurrences: 3,
    first_seen: '2026-06-10T01:00:00.000Z',
    last_seen: '2026-06-10T05:00:00.000Z',
    sources: [{ source: 'tool_log', ref: 'log:1' }],
    sample_detail: 'Error: ETIMEDOUT\nat render()\nat job()',
    max_pii_level: 'none',
    priority_score: 70,
    related_task_ids: [],
    related_business_ids: [],
    ...over,
  };
}

describe('prepareCandidates', () => {
  it('filters known card ids and sorts by priority desc', () => {
    const a = cand({ fingerprint: 'a', priority_score: 50 });
    const b = cand({ fingerprint: 'b', priority_score: 90 });
    const c = cand({ fingerprint: 'c', priority_score: 70 });
    const out = prepareCandidates([a, b, c], new Set(['a']));
    expect(out.map((x) => x.fingerprint)).toEqual(['b', 'c']);
  });

  it('slices to maxCards', () => {
    const list = Array.from({ length: 20 }, (_, i) =>
      cand({ fingerprint: `f${i}`, priority_score: i }),
    );
    const out = prepareCandidates(list, new Set(), { maxCards: 3 });
    expect(out).toHaveLength(3);
    // highest priority first
    expect(out[0].fingerprint).toBe('f19');
  });

  it('truncates sample_detail to maxEvidenceLines', () => {
    const detail = Array.from({ length: 30 }, (_, i) => `line${i}`).join('\n');
    const out = prepareCandidates([cand({ sample_detail: detail })], new Set(), {
      maxEvidenceLines: 5,
    });
    expect(out[0].sample_detail!.split('\n')).toHaveLength(5);
  });

  it('returns [] for empty/invalid input (never-throw)', () => {
    expect(prepareCandidates([], new Set())).toEqual([]);
    expect(prepareCandidates(null, new Set())).toEqual([]);
    expect(prepareCandidates(undefined, new Set())).toEqual([]);
  });
});

describe('selectModel (adaptive)', () => {
  it('picks sonnet for empty/easy', () => {
    expect(selectModel([])).toBe('claude-sonnet-4-6');
    expect(selectModel([cand({ kind: 'manual', occurrences: 1, max_pii_level: 'none' })])).toBe(
      'claude-sonnet-4-6',
    );
  });

  it('picks opus for hard (many error candidates across repos)', () => {
    const hard = [
      cand({ fingerprint: '1', repo: 'a', kind: 'error' }),
      cand({ fingerprint: '2', repo: 'b', kind: 'stall' }),
      cand({ fingerprint: '3', repo: 'c', kind: 'error' }),
      cand({ fingerprint: '4', repo: 'd', kind: 'error', occurrences: 15 }),
      cand({ fingerprint: '5', repo: 'e', kind: 'stall', occurrences: 10 }),
    ];
    expect(selectModel(hard)).toBe('claude-opus-4-8');
  });
});

describe('buildTigerPrompt', () => {
  it('embeds candidate_id and forces JSON-only, includes lessons', () => {
    const p = buildTigerPrompt([cand({ fingerprint: 'fp-x' })], ['전에 같은 타임아웃 해결됨']);
    expect(p).toContain('JSON 배열로만');
    expect(p).toContain('fp-x');
    expect(p).toContain('candidate_id');
    expect(p).toContain('전에 같은 타임아웃 해결됨');
  });
});

describe('parseTigerOutput', () => {
  const cands = [cand({ fingerprint: 'fp1' }), cand({ fingerprint: 'fp2', repo: 'pulk' })];

  it('parses clean JSON array and overrides repo/executive from source', () => {
    const raw = JSON.stringify([
      {
        candidate_id: 'fp1',
        problem: 'p1',
        root_cause: 'rc1',
        planned_fix: 'fix1',
        effort_estimate: 'M',
        impact: 'high',
        risk_level: 'D2',
        confidence: 0.8,
        repo_path: 'HALLUCINATED', // should be ignored
      },
    ]);
    const { cards, dropped } = parseTigerOutput(raw, cands);
    expect(cards).toHaveLength(1);
    expect(cards[0].repo_path).toBe('/Users/wonminyang/ai-slide-video-factory');
    expect(cards[0].target_id).toBe('cmo_slide_video_factory');
    expect(cards[0].risk_level).toBe('D2');
    expect(dropped).toBe(0);
  });

  it('strips code fences and surrounding prose', () => {
    const raw =
      '여기 결과입니다:\n```json\n[{"candidate_id":"fp2","problem":"p","planned_fix":"f"}]\n```\n끝';
    const { cards } = parseTigerOutput(raw, cands);
    expect(cards).toHaveLength(1);
    expect(cards[0].candidate_id).toBe('fp2');
    // defaults applied
    expect(cards[0].risk_level).toBe('D1');
    expect(cards[0].impact).toBe('medium');
    expect(cards[0].effort_estimate).toBe('M');
  });

  it('drops hallucinated candidate_id not in source', () => {
    const raw = JSON.stringify([
      { candidate_id: 'ghost', problem: 'p', planned_fix: 'f' },
    ]);
    const { cards, dropped } = parseTigerOutput(raw, cands);
    expect(cards).toHaveLength(0);
    expect(dropped).toBe(1);
  });

  it('drops items missing required problem/planned_fix', () => {
    const raw = JSON.stringify([{ candidate_id: 'fp1', problem: 'only problem' }]);
    const { cards, dropped } = parseTigerOutput(raw, cands);
    expect(cards).toHaveLength(0);
    expect(dropped).toBe(1);
  });

  it('clamps confidence to 0..1 and dedupes repeated candidate_id', () => {
    const raw = JSON.stringify([
      { candidate_id: 'fp1', problem: 'p', planned_fix: 'f', confidence: 9 },
      { candidate_id: 'fp1', problem: 'p2', planned_fix: 'f2', confidence: 0.5 },
    ]);
    const { cards } = parseTigerOutput(raw, cands);
    expect(cards).toHaveLength(1);
    expect(cards[0].confidence).toBe(1);
  });

  it('returns empty on non-JSON garbage (never-throw)', () => {
    const { cards } = parseTigerOutput('totally not json', cands);
    expect(cards).toEqual([]);
  });
});

describe('card mappings', () => {
  const card: ImprovementCard = {
    candidate_id: 'fp1',
    executive: 'CMO',
    target_id: 'cmo_slide_video_factory',
    repo_path: '/Users/wonminyang/ai-slide-video-factory',
    problem: '렌더 타임아웃',
    root_cause: '동기 렌더 락',
    planned_fix: '큐 분리',
    effort_estimate: 'M',
    impact: 'high',
    risk_level: 'D2',
    confidence: 0.8,
  };

  it('cardToBPRLog maps to identified status', () => {
    const bpr = cardToBPRLog(card);
    expect(bpr.bottleneck_description).toBe('렌더 타임아웃');
    expect(bpr.proposed_solution).toBe('큐 분리');
    expect(bpr.root_cause).toBe('동기 렌더 락');
    expect(bpr.impact).toBe('high');
    expect(bpr.status).toBe('identified');
    expect(bpr.owner_agent_id).toBe('CMO');
  });

  it('cardToProposal maps to proposed with Tiger author and embeds target', () => {
    const wip = cardToProposal(card);
    expect(wip.identified_bottleneck).toBe('렌더 타임아웃');
    expect(wip.proposed_improvement).toBe('큐 분리');
    expect(wip.effort_to_implement).toBe('M');
    expect(wip.suggested_by_agent_id).toBe('Tiger');
    expect(wip.status).toBe('proposed');
    expect(wip.current_process).toContain('cmo_slide_video_factory');
  });

  it('cardToMemoryEntry maps to bpr category, pending, no pii', () => {
    const mem = cardToMemoryEntry(card);
    expect(mem.category).toBe('bpr');
    expect(mem.pii_level).toBe('none');
    expect(mem.contains_pii).toBe(false);
    expect(mem.approval_status).toBe('pending');
    expect(mem.searchable_tags).toContain('cmo_slide_video_factory');
    expect(mem.reusability_score).toBe(80);
  });
});

describe('target ref codec', () => {
  it('round-trips', () => {
    expect(decodeTargetRef(encodeTargetRef('cmo_viewtrap_youtube'))).toBe('cmo_viewtrap_youtube');
    expect(decodeTargetRef('not-tiger')).toBeNull();
    expect(decodeTargetRef(undefined)).toBeNull();
  });
});
