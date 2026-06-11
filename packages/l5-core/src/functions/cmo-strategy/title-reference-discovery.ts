/**
 * 제목 디벨롭 레퍼런스 자동 발굴 (사장님 지시 2026-06-11)
 *
 * 기존: Founder가 Viewtrap 검증 레퍼런스 2개를 수동 입력.
 * 변경: YouTube API 기반으로 "같은 주제 + 조회수 잘 나온" 영상 2개를 자동 발굴해
 *       기존 검증(validateTitleReferences)을 통과시킨 뒤 8단계 디벨롭에 투입한다.
 *
 * 컨벤션 (discovery-pipeline.ts 동일):
 * - 외부 어댑터는 전부 deps 주입 — l5-core는 @l5/youtube 비의존(미러 타입).
 * - 단계별 실패 = 그 단계만 폴백 + notes에 사유 기록. 추측으로 데이터 조작 금지.
 * - 성과도/기여도는 확장 스크래퍼(deps.scrapeGrades) 실측이 있을 때만 필터로 쓰고,
 *   미실측이면 'Good' 기본값 + selected_reason에 "미실측(YouTube API 발굴)" 명시(투명성).
 */
import { randomUUID } from 'node:crypto';
import type { TitleDevelopmentReference, ViewtrapGrade } from './title-development-types';
import { generateTitleSearchTerms, validateTitleReferences } from './title-development';

// ── deps (구조적 미러 타입 — @l5/youtube 비의존) ─────────────────────────────

export interface ReferenceSearchHit {
  video_id: string;
  title: string;
  channel_id?: string;
  channel_title?: string;
  url?: string;
}

export interface TitleReferenceDiscoveryDeps {
  /** YouTube 검색 (search.list 위임). */
  search: (query: string, maxResults?: number) => Promise<ReferenceSearchHit[]>;
  /** videoId → 조회수 (videos.list statistics 위임). */
  getStats: (videoIds: string[]) => Promise<Record<string, number>>;
  /**
   * (옵션) Viewtrap 확장 성과도/기여도 실측. 키=video_id.
   * 값 예: { performance: 'good'|'great'|'wow'|'normal'|'bad'|..., contribution: ... }
   */
  scrapeGrades?: (
    videos: { video_id: string; title: string }[],
  ) => Promise<Record<string, { performance?: string | null; contribution?: string | null }>>;
  /**
   * (옵션) 썸네일 문구/구조 추출 어댑터 (비전 LLM 또는 CDP 스크랩).
   * null 반환 시 결정론 폴백(제목 핵심 구절)을 쓴다.
   */
  describeThumbnail?: (
    video: ReferenceSearchHit,
  ) => Promise<{ thumbnail_text: string; thumbnail_structure: string } | null>;
  /**
   * (옵션) 적격 후보가 2개 미만일 때 같은 의미 범위로 검색어를 넓히는 LLM 확장.
   * (PRD §7.2: 완전히 같은 주제가 없을 때만 같은 의미 범위 확장 허용)
   * 일반명사화된 짧은 검색어(2~4어절) 배열을 반환해야 한다.
   */
  expandQueries?: (input: {
    pulling_topic: string;
    target_audience: string;
    existing_queries: string[];
  }) => Promise<string[]>;
}

// ── 입력/출력 ────────────────────────────────────────────────────────────────

export interface DiscoverTitleReferencesInput {
  pulling_topic: string;
  target_audience: string;
  business_goal?: string;
  research_session_id?: string;
  /** 검색에 쓸 쿼리 수 상한 (기본 4 = exact 3 + expanded 1). */
  max_queries?: number;
  /** 조회수 하한 (기본 50,000 — PRD AC-02). */
  min_view_count?: number;
  /** 쿼리당 검색 결과 수 (기본 10). */
  results_per_query?: number;
}

/** 발굴 후보 풀 항목 — UI/보고서 투명성용. */
export interface DiscoveredReferenceCandidate {
  video_id: string;
  title: string;
  channel_id?: string;
  channel_title?: string;
  url?: string;
  view_count: number;
  matched_query: string;
  query_kind: 'exact' | 'expanded';
  performance_raw?: string | null;
  contribution_raw?: string | null;
  excluded_reason?: string;
}

export type DiscoverTitleReferencesResult =
  | {
      ok: true;
      references: [TitleDevelopmentReference, TitleDevelopmentReference];
      pool: DiscoveredReferenceCandidate[];
      notes: string[];
    }
  | {
      ok: false;
      reason: 'insufficient_candidates' | 'search_failed';
      pool: DiscoveredReferenceCandidate[];
      notes: string[];
    };

// ── 등급 정규화 ──────────────────────────────────────────────────────────────

/** 확장/뷰트랩 등급 문자열 → PRD ViewtrapGrade. 미충족 등급은 null. */
export function normalizeViewtrapGrade(raw: string | null | undefined): ViewtrapGrade | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if (v === 'wow' || v === 'great') return 'Great';
  if (v === 'good') return 'Good';
  return null; // normal/bad/worst 등 — 레퍼런스 부적격
}

// ── 결정론 폴백: 제목 → 썸네일 문구/구조 ─────────────────────────────────────

/**
 * 썸네일 실측 어댑터가 없을 때의 폴백. 제목의 핵심 구절(앞 절)을 문구로 쓰고
 * 구조는 "문구 중심 + 주제 이미지"로 보수적으로 기술한다. 추측 과장 금지.
 */
export function fallbackThumbnailDescription(title: string): {
  thumbnail_text: string;
  thumbnail_structure: string;
} {
  const trimmed = title.trim();
  const firstClause = trimmed.split(/[,|·—\-(]/)[0]?.trim() || trimmed;
  const text = firstClause.length > 18 ? `${firstClause.slice(0, 18)}…` : firstClause;
  return {
    thumbnail_text: text,
    thumbnail_structure:
      '미실측 폴백 — 제목 핵심 구절 기반 문구 중심 구성으로 가정. 실제 썸네일 확인 필요.',
  };
}

// ── 본체 ────────────────────────────────────────────────────────────────────

const DEFAULT_MIN_VIEWS = 50000;
const DEFAULT_MAX_QUERIES = 4;
const DEFAULT_RESULTS_PER_QUERY = 10;

/**
 * 같은 주제 + 조회수 상위 레퍼런스 2개를 자동 발굴한다.
 *
 * 흐름: 검색어 생성(결정론) → 검색 → 조회수 → 5만+ 필터 → (옵션)등급 실측 필터
 * → 조회수 내림차순 + 채널 다양성(서로 다른 채널 우선)으로 2개 선정
 * → TitleDevelopmentReference로 변환 → validateTitleReferences 재검증.
 */
export async function discoverTitleReferences(
  input: DiscoverTitleReferencesInput,
  deps: TitleReferenceDiscoveryDeps,
): Promise<DiscoverTitleReferencesResult> {
  const notes: string[] = [];
  const minViews = input.min_view_count ?? DEFAULT_MIN_VIEWS;
  const maxQueries = input.max_queries ?? DEFAULT_MAX_QUERIES;
  const perQuery = input.results_per_query ?? DEFAULT_RESULTS_PER_QUERY;

  const terms = generateTitleSearchTerms({
    pulling_topic: input.pulling_topic,
    target_audience: input.target_audience,
    business_goal: input.business_goal,
  });
  const queries: { query: string; kind: 'exact' | 'expanded' }[] = [
    ...terms.exact_search_terms.map((query) => ({ query, kind: 'exact' as const })),
    ...terms.expanded_search_terms.map((query) => ({ query, kind: 'expanded' as const })),
  ].slice(0, maxQueries);

  // 1) 검색 — 쿼리별 실패는 그 쿼리만 스킵
  const byVideoId = new Map<string, DiscoveredReferenceCandidate>();
  let searchFailures = 0;
  for (const { query, kind } of queries) {
    try {
      const hits = await deps.search(query, perQuery);
      for (const hit of hits) {
        if (!hit.video_id || byVideoId.has(hit.video_id)) continue;
        byVideoId.set(hit.video_id, {
          video_id: hit.video_id,
          title: hit.title,
          channel_id: hit.channel_id,
          channel_title: hit.channel_title,
          url: hit.url ?? `https://www.youtube.com/watch?v=${hit.video_id}`,
          view_count: 0,
          matched_query: query,
          query_kind: kind,
        });
      }
    } catch {
      searchFailures += 1;
      notes.push(`검색 실패(스킵): "${query}"`);
    }
  }
  if (byVideoId.size === 0 && !deps.expandQueries) {
    return {
      ok: false,
      reason: searchFailures === queries.length ? 'search_failed' : 'insufficient_candidates',
      pool: [],
      notes: [...notes, '검색 결과 0건'],
    };
  }

  // 2) 조회수 (1차 검색이 0건이고 확장이 가능하면 2.5)에서 채운다)
  const ids = [...byVideoId.keys()];
  let stats: Record<string, number> = {};
  if (ids.length > 0) {
    try {
      stats = await deps.getStats(ids);
    } catch {
      return { ok: false, reason: 'insufficient_candidates', pool: [...byVideoId.values()], notes: [...notes, '조회수 조회 실패 — 발굴 중단'] };
    }
  }
  for (const c of byVideoId.values()) {
    c.view_count = stats[c.video_id] ?? 0;
    if (c.view_count < minViews) c.excluded_reason = `조회수 ${minViews.toLocaleString()} 미만`;
  }

  // 2.5) 적격(조회수 통과) 후보가 2개 미만이면 의미범위 확장 쿼리로 2차 검색.
  //      (deterministic 검색어는 주제가 문장형일 때 너무 좁아 후보가 안 나오는 실측 사례 — 2026-06-12)
  const countQualified = () => [...byVideoId.values()].filter((c) => !c.excluded_reason).length;
  if (countQualified() < 2 && deps.expandQueries) {
    try {
      const existing = queries.map((qq) => qq.query);
      const extra = (
        await deps.expandQueries({
          pulling_topic: input.pulling_topic,
          target_audience: input.target_audience,
          existing_queries: existing,
        })
      )
        .map((s) => String(s).trim())
        .filter((s) => s.length > 0 && !existing.includes(s))
        .slice(0, 4);
      if (extra.length > 0) {
        notes.push(`2차 의미범위 확장 검색: ${extra.join(' / ')}`);
        const newIds: string[] = [];
        for (const query of extra) {
          try {
            const hits = await deps.search(query, perQuery);
            for (const hit of hits) {
              if (!hit.video_id || byVideoId.has(hit.video_id)) continue;
              byVideoId.set(hit.video_id, {
                video_id: hit.video_id,
                title: hit.title,
                channel_id: hit.channel_id,
                channel_title: hit.channel_title,
                url: hit.url ?? `https://www.youtube.com/watch?v=${hit.video_id}`,
                view_count: 0,
                matched_query: query,
                query_kind: 'expanded',
              });
              newIds.push(hit.video_id);
            }
          } catch {
            notes.push(`검색 실패(스킵): "${query}"`);
          }
        }
        if (newIds.length > 0) {
          try {
            const stats2 = await deps.getStats(newIds);
            for (const id of newIds) {
              const c = byVideoId.get(id);
              if (!c) continue;
              c.view_count = stats2[id] ?? 0;
              if (c.view_count < minViews) {
                c.excluded_reason = `조회수 ${minViews.toLocaleString()} 미만`;
              }
            }
          } catch {
            notes.push('2차 조회수 조회 실패 — 확장 후보 미사용');
            for (const id of newIds) byVideoId.delete(id);
          }
        }
      }
    } catch {
      notes.push('확장 쿼리 생성 실패 — 1차 결과로만 진행');
    }
  }

  // 확장까지 거치고도 검색 결과가 전혀 없으면 종료.
  if (byVideoId.size === 0) {
    return {
      ok: false,
      reason: searchFailures === queries.length && queries.length > 0 ? 'search_failed' : 'insufficient_candidates',
      pool: [],
      notes: [...notes, '검색 결과 0건'],
    };
  }

  // 3) (옵션) 성과도/기여도 실측
  let gradesAvailable = false;
  if (deps.scrapeGrades) {
    try {
      const targets = [...byVideoId.values()].filter((c) => !c.excluded_reason);
      const grades = await deps.scrapeGrades(
        targets.map((c) => ({ video_id: c.video_id, title: c.title })),
      );
      gradesAvailable = Object.keys(grades).length > 0;
      for (const c of targets) {
        const g = grades[c.video_id];
        c.performance_raw = g?.performance ?? null;
        c.contribution_raw = g?.contribution ?? null;
        if (g) {
          const perf = normalizeViewtrapGrade(g.performance);
          const contrib = normalizeViewtrapGrade(g.contribution);
          // 실측이 존재하는데 Good/Great 미만이면 제외 (PRD AC-03/04)
          if ((g.performance && !perf) || (g.contribution && !contrib)) {
            c.excluded_reason = '성과도/기여도 Good·Great 미충족(실측)';
          }
        }
      }
      if (!gradesAvailable) notes.push('성과도/기여도 실측 0건 — 조회수 기준으로만 선정');
    } catch {
      notes.push('성과도/기여도 스크랩 실패 — 조회수 기준으로만 선정');
    }
  } else {
    notes.push('성과도/기여도 어댑터 미주입 — 조회수 기준으로만 선정(YouTube API 발굴)');
  }

  // 4) 선정 — 조회수 내림차순, 실측 등급 보유 후보 우선, 채널 다양성
  const eligible = [...byVideoId.values()]
    .filter((c) => !c.excluded_reason)
    .sort((a, b) => {
      const aGraded = normalizeViewtrapGrade(a.performance_raw) ? 1 : 0;
      const bGraded = normalizeViewtrapGrade(b.performance_raw) ? 1 : 0;
      if (aGraded !== bGraded) return bGraded - aGraded;
      return b.view_count - a.view_count;
    });

  const picked: DiscoveredReferenceCandidate[] = [];
  for (const c of eligible) {
    if (picked.length >= 2) break;
    const sameChannel =
      c.channel_id && picked.some((p) => p.channel_id && p.channel_id === c.channel_id);
    if (sameChannel && eligible.length > 2) continue; // 다양성: 다른 채널 우선
    picked.push(c);
  }
  // 채널 다양성 제약으로 2개를 못 채우면 제약 해제 후 재선정
  if (picked.length < 2) {
    for (const c of eligible) {
      if (picked.length >= 2) break;
      if (!picked.includes(c)) picked.push(c);
    }
  }

  const pool = [...byVideoId.values()].sort((a, b) => b.view_count - a.view_count);
  if (picked.length < 2) {
    return {
      ok: false,
      reason: 'insufficient_candidates',
      pool,
      notes: [...notes, `적격 후보 ${picked.length}개 — 2개 미만이라 디벨롭 진행 불가`],
    };
  }

  // 5) TitleDevelopmentReference 변환
  const sessionId = input.research_session_id ?? randomUUID();
  const references = (await Promise.all(
    picked.map(async (c) => {
      let thumb: { thumbnail_text: string; thumbnail_structure: string } | null = null;
      if (deps.describeThumbnail) {
        try {
          thumb = await deps.describeThumbnail({
            video_id: c.video_id,
            title: c.title,
            channel_id: c.channel_id,
            channel_title: c.channel_title,
            url: c.url,
          });
        } catch {
          thumb = null;
        }
      }
      if (!thumb) {
        thumb = fallbackThumbnailDescription(c.title);
        notes.push(`썸네일 미실측 폴백: ${c.video_id}`);
      }

      const perf = normalizeViewtrapGrade(c.performance_raw);
      const contrib = normalizeViewtrapGrade(c.contribution_raw);
      const gradeNote = perf && contrib ? '성과도/기여도 실측 통과' : '성과도/기여도 미실측(YouTube API 발굴)';

      const ref: TitleDevelopmentReference = {
        id: `ref-${c.video_id}`,
        research_session_id: sessionId,
        source: perf && contrib ? 'viewtrap' : 'youtube',
        url: c.url,
        title: c.title,
        thumbnail_text: thumb.thumbnail_text,
        thumbnail_structure: thumb.thumbnail_structure,
        topic: input.pulling_topic,
        view_count: c.view_count,
        performance_grade: perf ?? 'Good',
        contribution_grade: contrib ?? 'Good',
        topic_similarity: c.query_kind === 'exact' ? 'exact' : 'expanded_same_meaning',
        similarity_reason: `검색어 "${c.matched_query}"(${c.query_kind === 'exact' ? '정확' : '확장'}) 매칭`,
        selected_reason: `조회수 ${c.view_count.toLocaleString()} · ${gradeNote} · 자동 발굴(채널: ${c.channel_title ?? '미상'})`,
      };
      return ref;
    }),
  )) as [TitleDevelopmentReference, TitleDevelopmentReference];

  // 6) 기존 검증 재통과 보장 (AC-01~06과 동일 게이트)
  const validation = validateTitleReferences(references);
  if (!validation.passed) {
    return {
      ok: false,
      reason: 'insufficient_candidates',
      pool,
      notes: [
        ...notes,
        ...validation.failed_references.map(
          (f) => `검증 실패 ${f.reference_id}: ${f.reasons.join(', ')}`,
        ),
      ],
    };
  }

  return { ok: true, references, pool, notes };
}
