// CMO M1 — Viewtrap 파싱·필터·변환·어댑터 단위테스트.
// CDP 연결 없이 fixture(원시 추출물)로만 검증한다.

import {
  normalizeGrade,
  parseViews,
  extractVideoId,
  parseVideoSearchRow,
  parseVideoSearchRows,
  parseExtensionCard,
  parseExtensionCards,
} from '../viewtrap/parse.js';
import { passesDiscoveryFilter, filterDiscoveryRows } from '../viewtrap/filters.js';
import {
  toReferenceCandidates,
  toViewtrapValidationInput,
  toValidationScore,
} from '../viewtrap/transform.js';
import { createViewtrapScraperAdapter } from '../viewtrap/adapter.js';
import type { RawTableRow, RawExtensionCard, VideoSearchRow } from '../viewtrap/types.js';

// ── parse: 원자 헬퍼 ──────────────────────────────────────────────────────────

describe('normalizeGrade', () => {
  it('등급 단어를 정규화한다(대소문자·느낌표 무시)', () => {
    expect(normalizeGrade('Wow!')).toBe('wow');
    expect(normalizeGrade('GREAT')).toBe('great');
    expect(normalizeGrade(' good ')).toBe('good');
    expect(normalizeGrade('Normal')).toBe('normal');
  });
  it('등급이 아니면 null', () => {
    expect(normalizeGrade('-')).toBeNull();
    expect(normalizeGrade('')).toBeNull();
    expect(normalizeGrade(null)).toBeNull();
    expect(normalizeGrade(undefined)).toBeNull();
  });
  it('shadow DOM 추출 노이즈 접두(스파크라인/아이콘)가 붙어도 등급을 뽑는다', () => {
    // deepWalk가 모은 shadowRoot 텍스트는 "기여도 ... Good" 처럼 노이즈가 섞임.
    expect(normalizeGrade('기여도 Good')).toBe('good');
    expect(normalizeGrade('▮▮▮ Great')).toBe('great');
    expect(normalizeGrade('성과도\nNormal')).toBe('normal');
  });
});

// ── parse: deepWalk(2단계) 확장 카드 — 노이즈 섞인 metrics 값 ────────────────

describe('parseExtensionCard — deepWalk 노이즈 등급', () => {
  it('shadow DOM에서 뽑은 노이즈 등급 문자열도 정규화한다', () => {
    const card = parseExtensionCard({
      href: 'https://www.youtube.com/watch?v=DEEP44444',
      title: 'AI로 돈벌기',
      metaText: '조회수 27만회',
      // gradeFrom이 라벨 뒤 등급만 잡지만, 셀에 노이즈가 남는 케이스를 normalizeGrade가 흡수.
      metrics: { 기여도: '▮▮ Good', 성과도: 'Great', 노출확률: '- Normal' },
    })!;
    expect(card.videoId).toBe('DEEP44444');
    expect(card.views).toBe(270000);
    expect(card.contribution).toBe('good');
    expect(card.performance).toBe('great');
    expect(card.exposure).toBe('normal');
  });
});

describe('parseViews', () => {
  it('콤마/만/천/조회수 접두를 처리한다', () => {
    expect(parseViews('272,415')).toBe(272415);
    expect(parseViews('조회수 27만회')).toBe(270000);
    expect(parseViews('1.2천회')).toBe(1200);
    expect(parseViews('1.5만')).toBe(15000);
  });
  it('영문 로케일 K/M/B views 를 처리한다', () => {
    expect(parseViews('6.5M views')).toBe(6_500_000);
    expect(parseViews('1.2K views')).toBe(1_200);
    expect(parseViews('2B views')).toBe(2_000_000_000);
    expect(parseViews('272,415 views')).toBe(272_415);
  });
  it('파싱 불가는 null', () => {
    expect(parseViews('-')).toBeNull();
    expect(parseViews(null)).toBeNull();
  });
});

describe('extractVideoId', () => {
  it('썸네일/watch/youtu.be/shorts 에서 id 추출', () => {
    expect(extractVideoId('https://i.ytimg.com/vi/abc123XYZ/hqdefault.jpg')).toBe('abc123XYZ');
    expect(extractVideoId('https://www.youtube.com/watch?v=def456&t=10')).toBe('def456');
    expect(extractVideoId('https://youtu.be/ghi789')).toBe('ghi789');
    expect(extractVideoId('https://www.youtube.com/shorts/jkl012')).toBe('jkl012');
    expect(extractVideoId(null)).toBeNull();
  });
});

// ── parse: video-search 테이블 (11열 실측 fixture) ──────────────────────────

// 컬럼: [0]선택 [1]CC [2]썸네일(길이) [3]제목 [4]조회수 [5]구독자
//       [6]기여도 [7]성과도 [8]노출확률 [9]총영상수 [10]게시일
const TABLE_ROW_FULL: RawTableRow = {
  cells: ['', 'CC', '12:34', '인스타그램 릴스 만드는 방법', '272,415', '12.3만',
    'Great', 'Good', '-', '152', '2023.05.12'],
  thumbnailSrc: 'https://i.ytimg.com/vi/VID11111/hqdefault.jpg',
};

describe('parseVideoSearchRow', () => {
  it('11열 행을 정확히 매핑한다(노출확률 미로드 → null)', () => {
    const row = parseVideoSearchRow(TABLE_ROW_FULL)!;
    expect(row.videoId).toBe('VID11111');
    expect(row.title).toBe('인스타그램 릴스 만드는 방법');
    expect(row.views).toBe(272415);
    expect(row.contribution).toBe('great');
    expect(row.performance).toBe('good');
    expect(row.exposure).toBeNull();
    expect(row.publishedAt).toBe('2023.05.12');
    expect(row.url).toBe('https://youtu.be/VID11111');
  });

  it('썸네일 src 없는 행(videoId 불가)은 null', () => {
    expect(parseVideoSearchRow({ cells: ['', 'ad'], thumbnailSrc: null })).toBeNull();
  });

  it('컬럼 수가 다른 행은 휴리스틱으로 등급/조회수를 복구한다', () => {
    const odd: RawTableRow = {
      cells: ['짧은제목인데가장김 이건제목', '88,000', 'Wow', 'Great', 'Good'],
      thumbnailSrc: 'https://i.ytimg.com/vi/ODD22222/hq.jpg',
    };
    const row = parseVideoSearchRow(odd)!;
    expect(row.videoId).toBe('ODD22222');
    expect(row.views).toBe(88000);
    expect(row.contribution).toBe('wow');
    expect(row.performance).toBe('great');
    expect(row.exposure).toBe('good');
  });
});

describe('parseVideoSearchRows', () => {
  it('videoId 없는 행을 걸러낸다', () => {
    const rows = parseVideoSearchRows([
      TABLE_ROW_FULL,
      { cells: ['광고'], thumbnailSrc: null },
    ]);
    expect(rows).toHaveLength(1);
  });
});

// ── parse: YouTube 검색결과 확장 카드 fixture ────────────────────────────────

const EXT_CARD: RawExtensionCard = {
  href: 'https://www.youtube.com/watch?v=EXT33333',
  title: '릴스 알고리즘 완전정복',
  metaText: '조회수 18만회 · 3개월 전',
  metrics: { 기여도: 'Good', 성과도: 'Great', 노출확률: 'Normal' },
};

describe('parseExtensionCard', () => {
  it('shadow DOM dt/dd 지표를 매핑한다', () => {
    const card = parseExtensionCard(EXT_CARD)!;
    expect(card.videoId).toBe('EXT33333');
    expect(card.title).toBe('릴스 알고리즘 완전정복');
    expect(card.views).toBe(180000);
    expect(card.contribution).toBe('good');
    expect(card.performance).toBe('great');
    expect(card.exposure).toBe('normal');
  });

  it('확장 지표가 전혀 없으면 null(확장 미주입 카드)', () => {
    expect(
      parseExtensionCard({ href: 'https://youtu.be/NONE', title: 't', metaText: '', metrics: {} }),
    ).toBeNull();
  });

  it('parseExtensionCards 는 미주입 카드를 걸러낸다', () => {
    const cards = parseExtensionCards([
      EXT_CARD,
      { href: 'https://youtu.be/NONE', title: 't', metaText: '', metrics: {} },
    ]);
    expect(cards).toHaveLength(1);
  });
});

// ── filters: 발굴 기준 ────────────────────────────────────────────────────────

describe('passesDiscoveryFilter', () => {
  const base = { views: 60000, contribution: 'good', performance: 'good', exposure: 'normal' } as const;

  it('기준 충족 행을 통과', () => {
    expect(passesDiscoveryFilter({ ...base })).toBe(true);
  });
  it('조회수 5만 미만 탈락', () => {
    expect(passesDiscoveryFilter({ ...base, views: 49999 })).toBe(false);
  });
  it('성과도 normal 이하 탈락', () => {
    expect(passesDiscoveryFilter({ ...base, performance: 'normal' })).toBe(false);
  });
  it('기여도 bad 탈락', () => {
    expect(passesDiscoveryFilter({ ...base, contribution: 'bad' })).toBe(false);
  });
  it('노출확률 bad 탈락', () => {
    expect(passesDiscoveryFilter({ ...base, exposure: 'bad' })).toBe(false);
  });
  it('노출확률 미로드(null)는 기본 통과', () => {
    expect(passesDiscoveryFilter({ ...base, exposure: null })).toBe(true);
  });
  it('requireExposure=true 면 노출확률 null 탈락', () => {
    expect(passesDiscoveryFilter({ ...base, exposure: null }, { requireExposure: true })).toBe(false);
  });
});

describe('filterDiscoveryRows', () => {
  it('통과 행만 남긴다', () => {
    const rows = [
      { videoId: 'a', views: 60000, contribution: 'great', performance: 'good', exposure: 'good' },
      { videoId: 'b', views: 10000, contribution: 'great', performance: 'great', exposure: 'great' },
    ] as const;
    const out = filterDiscoveryRows([...rows]);
    expect(out.map((r) => r.videoId)).toEqual(['a']);
  });
});

// ── transform: l5-core 입력 변환 ─────────────────────────────────────────────

const SCRAPED = [
  {
    videoId: 'VID11111',
    title: '릴스 만드는 법',
    url: 'https://youtu.be/VID11111',
    views: 272415,
    contribution: 'great' as const,
    performance: 'good' as const,
    exposure: 'normal' as const,
    publishedAt: '2023.05.12',
    thumbnail: 'https://i.ytimg.com/vi/VID11111/hqdefault.jpg',
  },
];

describe('toReferenceCandidates', () => {
  it('결정론 id + 실측 selection_reason 으로 ReferenceCandidate 형태 생성', () => {
    const cands = toReferenceCandidates(SCRAPED, {
      researchSessionId: 'sess-1',
      consumerStage: '욕구',
      selectedFor: 'key_content',
    });
    expect(cands).toHaveLength(1);
    const c = cands[0];
    expect(c.id).toBe('viewtrap-VID11111');
    expect(c.research_session_id).toBe('sess-1');
    expect(c.source).toBe('viewtrap');
    expect(c.consumer_stage).toBe('욕구');
    expect(c.selected_for).toBe('key_content');
    expect(c.view_count).toBe(272415);
    expect(c.contribution_score).toBe(4); // GRADE_RANK.great
    expect(c.uploaded_at).toBe('2023.05.12');
    expect(c.selection_reason).toContain('272,415');
    expect(c.selection_reason).toContain('기여도 great');
  });
});

describe('toValidationScore', () => {
  it('6등급을 3등급으로 압축', () => {
    expect(toValidationScore('wow')).toBe('great');
    expect(toValidationScore('great')).toBe('great');
    expect(toValidationScore('good')).toBe('good');
    expect(toValidationScore('normal')).toBe('normal');
    expect(toValidationScore('bad')).toBe('normal');
    expect(toValidationScore(null)).toBe('normal');
  });
});

describe('toViewtrapValidationInput', () => {
  it('최고 등급으로 매핑 + growth_status=unknown(실데이터만)', () => {
    const input = toViewtrapValidationInput(SCRAPED, { validatedKeywords: ['릴스', '편집'] });
    expect(input.validated_keywords).toEqual(['릴스', '편집']);
    expect(input.candidate_titles).toEqual(['릴스 만드는 법']);
    expect(input.performance_score).toBe('good'); // good
    expect(input.contribution_score).toBe('great'); // great
    expect(input.growth_status).toBe('unknown');
    expect(input.channel_value_risk).toBe(false);
    expect(input.person_value_risk).toBe(false);
  });

  it('리스크 오버라이드를 반영', () => {
    const input = toViewtrapValidationInput(SCRAPED, {
      validatedKeywords: [],
      channelValueRisk: true,
    });
    expect(input.channel_value_risk).toBe(true);
  });
});

// ── adapter: fetch(query) → scrape → filter → transform (fake session) ──────

describe('createViewtrapScraperAdapter', () => {
  // CDP 없이 — cdp.ts 의 scrape 경로를 거치지 않도록, scrapeVideoSearchTable 이
  // 읽는 page.evaluate 를 fake page 로 흉내낸다.
  function fakeSession(rawRows: RawTableRow[], spy?: { confirmClicked?: boolean }) {
    // 검색 흐름 단계 추적: 첫 행 텍스트가 검색 후 바뀌도록(결과 갱신 감지) 흉내낸다.
    let firstRowReads = 0;
    const page = {
      url: () => 'https://app.viewtrap.com/video-search',
      bringToFront: async () => {},
      waitForTimeout: async () => {},
      fill: async () => {},
      press: async () => {},
      waitForSelector: async () => {},
      goto: async () => {},
      // scrapeVideoSearchTable 의 evaluate 는 인자 없는 fn 이지만, 우리가 원시행을 직접 돌려준다.
      evaluate: async () => rawRows as unknown,
      // 새 경로: input value / 행 수 / 첫 행(td:nth-child(4)) / 확인 모달 폴링을 흉내낸다.
      evalExpr: async (expr: string) => {
        if (/\.value/.test(expr)) return '' as unknown; // input value(=재검색 유발)
        if (/td:nth-child\(4\)/.test(expr)) {
          // 첫 호출(검색 전)="" → 이후="changed-title" → waitForResultChange가 즉시 통과.
          firstRowReads += 1;
          return (firstRowReads <= 1 ? '' : 'changed-title') as unknown;
        }
        if (/검색하시겠습니까|이용횟수가 차감/.test(expr)) {
          // 확인 모달 처리 흉내: 모달 떠있다고 보고 "확인" 클릭.
          if (spy) spy.confirmClicked = true;
          return 'CONFIRMED' as unknown;
        }
        return rawRows.length as unknown; // 행 수 폴링(stabilizeRowCount 등)
      },
      locator: () => ({
        first() {
          return this;
        },
        count: async () => 0,
        click: async () => {},
        innerText: async () => '-',
      }),
    };
    return {
      browser: { contexts: () => [], close: async () => {} },
      context: { pages: () => [page], newPage: async () => page },
    } as never;
  }

  it('통과 행만 ReferenceCandidate 로 반환', async () => {
    const adapter = createViewtrapScraperAdapter(fakeSession([TABLE_ROW_FULL]), {
      transform: { researchSessionId: 's', consumerStage: '욕구', selectedFor: 'key_content' },
    });
    const out = await adapter.fetch('릴스');
    // TABLE_ROW_FULL: 27만+ · great · good · 노출 null(기본 통과) → 통과
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('viewtrap-VID11111');
  });

  it('필터 탈락 행은 제외', async () => {
    const lowViews: RawTableRow = {
      ...TABLE_ROW_FULL,
      cells: [...TABLE_ROW_FULL.cells],
      thumbnailSrc: 'https://i.ytimg.com/vi/LOWVIEW00/hq.jpg',
    };
    lowViews.cells[4] = '1,000';
    const adapter = createViewtrapScraperAdapter(fakeSession([lowViews]), {
      transform: { researchSessionId: 's', consumerStage: '욕구', selectedFor: 'key_content' },
    });
    expect(await adapter.fetch('릴스')).toHaveLength(0);
  });

  it('검색 트리거 시 확인 모달의 "확인"을 클릭한다(이용횟수 차감 확인)', async () => {
    const spy: { confirmClicked?: boolean } = {};
    const adapter = createViewtrapScraperAdapter(fakeSession([TABLE_ROW_FULL], spy), {
      transform: { researchSessionId: 's', consumerStage: '욕구', selectedFor: 'key_content' },
    });
    const out = await adapter.fetch('릴스');
    expect(out).toHaveLength(1);
    // 입력→검색→확인모달 클릭→결과대기 경로를 거쳤음.
    expect(spy.confirmClicked).toBe(true);
  });

  it('이미 같은 query·테이블이 차 있으면 재검색하지 않는다(alreadyOnQuery 스킵)', async () => {
    // input value 가 query 와 일치 + 행 존재 → fill/press/확인모달 호출 없이 기존 테이블만 파싱.
    let filled = false;
    let pressed = false;
    let confirmProbed = false;
    const page = {
      url: () => 'https://app.viewtrap.com/video-search',
      bringToFront: async () => {},
      waitForTimeout: async () => {},
      fill: async () => {
        filled = true;
      },
      press: async () => {
        pressed = true;
      },
      waitForSelector: async () => {},
      goto: async () => {},
      evaluate: async () => [TABLE_ROW_FULL] as unknown,
      evalExpr: async (expr: string) => {
        if (/\.value/.test(expr)) return '릴스' as unknown; // 이미 같은 query 입력됨
        if (/검색하시겠습니까|이용횟수가 차감/.test(expr)) {
          confirmProbed = true;
          return 'NO_MODAL' as unknown;
        }
        if (/td:nth-child\(4\)/.test(expr)) return 'existing' as unknown;
        return 1 as unknown; // 행 존재
      },
      locator: () => ({
        first() {
          return this;
        },
        count: async () => 0,
        click: async () => {},
        innerText: async () => '-',
      }),
    };
    const session = {
      browser: { contexts: () => [], close: async () => {} },
      context: { pages: () => [page], newPage: async () => page },
    } as never;
    const adapter = createViewtrapScraperAdapter(session, {
      transform: { researchSessionId: 's', consumerStage: '욕구', selectedFor: 'key_content' },
    });
    const out = await adapter.fetch('릴스');
    expect(out).toHaveLength(1); // 기존 테이블 파싱됨
    expect(filled).toBe(false);
    expect(pressed).toBe(false);
    expect(confirmProbed).toBe(false); // 검색 트리거 자체를 건너뜀
  });
});

// VideoSearchRow 타입을 fixture 가 실제로 만족하는지 컴파일 타임 확인(런타임 no-op).
const _typecheck: VideoSearchRow = parseVideoSearchRow(TABLE_ROW_FULL)!;
void _typecheck;
