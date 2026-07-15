// D3 Phase 8 — background_media/broll/gallery 배정 단위테스트 + 실브리프 검증.
// Work Order D3 Phase 8: Scene Decision 플래너가 각 씬에 실사 미디어를 배정하는지 검증한다.
//   - decideBackgroundMedia: 데이터 씬 미배정, 한→영 스톡 사전, 스크린샷 우선 규칙,
//     asset_requests 우선 반영(face_video는 배정 대상 아님), 강한 기본 보정.
//   - assignBrollGallery: 10 미만 총량은 미배치, 실세계 신호 있는 씬 1개→broll,
//     orbital 1개→gallery.
//   - 실브리프(b302482b 미용실 SNS) 종단 검증: background_media 배정률 ≥60%,
//     kind 분포, broll/gallery 개수 ≤10%, treatment 강한 기본값, 팩토리 zod 계약 형태.

import * as fs from 'fs';
import * as path from 'path';
import type { VideoExecutionBrief } from '../types';
import { buildSlideDeckSpecFromBrief, buildFactoryJobFromSlideDeck } from '../render-pipeline';
import {
  decideBackgroundMedia,
  assignBrollGallery,
  paceSpeakerText,
} from '../scene-decision';
import type { FactoryScene } from '../script-factory';

const FIXTURE = path.join(__dirname, 'fixtures', 'brief-b302482b-salon-sns.json');

// ── 1. decideBackgroundMedia 단위테스트 ──────────────────────────────────────

describe('decideBackgroundMedia', () => {
  it('assigns nothing for data-heavy scene types (readability first)', () => {
    expect(decideBackgroundMedia('metric_cards', '이 매장은 예약이 300건 늘었어요')).toBeUndefined();
    expect(decideBackgroundMedia('chart_reveal', '1월 120명, 2월 340명으로 늘었어요')).toBeUndefined();
    expect(decideBackgroundMedia('comparison', '저장과 예약은 완전히 다른 심리 상태예요')).toBeUndefined();
  });

  it('maps 미용실 to a hair salon stock query with strong default treatment', () => {
    const bg = decideBackgroundMedia('insight', '미용실 원장님들이 흔히 하는 착각이에요');
    expect(bg).toBeDefined();
    expect(bg!.kind).toBe('stock_photo');
    expect(bg!.query).toBe('hair salon');
    expect(bg!.treatment).toEqual({ grade: 'duotone', blur: 6, scrim: 0.7, grain: true, ken_burns: true });
  });

  it('maps 인스타/릴스 to instagram phone scrolling (stock_video, no ken_burns)', () => {
    const bg = decideBackgroundMedia('spotlight', '인스타 릴스를 매일 찍고 있어요');
    expect(bg).toBeDefined();
    expect(bg!.kind).toBe('stock_video');
    expect(bg!.query).toBe('instagram phone scrolling');
    expect(bg!.treatment?.ken_burns).toBeUndefined();
  });

  it('maps 손님/고객 to customer shop', () => {
    expect(decideBackgroundMedia('insight', '신규 손님이 늘지 않는 이유')?.query).toBe('customer shop');
  });

  it('maps 예약 to booking phone calendar', () => {
    expect(decideBackgroundMedia('insight', '예약까지 이어지지 않는 구조')?.query).toBe(
      'booking phone calendar',
    );
  });

  it('maps 매출/성장 to business growth chart', () => {
    expect(decideBackgroundMedia('insight', '매출이 두 배로 성장했어요')?.query).toBe(
      'business growth chart',
    );
  });

  it('prioritises screenshot over a stock hit when the text describes app UI (사장님 방침)', () => {
    // "인스타"(스톡 후보)와 "바이오에 링크"(스크린샷 신호)가 함께 있으면 스크린샷이 우선.
    const bg = decideBackgroundMedia('insight', '인스타 바이오에 링크를 눌렀을 때 뭐가 나와요?');
    expect(bg).toBeDefined();
    expect(bg!.kind).toBe('screenshot');
    expect(bg!.query).toBeUndefined();
    expect(bg!.focus).toBe('ui');
  });

  it('returns undefined when nothing matches the dictionary', () => {
    expect(decideBackgroundMedia('insight', '완전히 추상적인 철학적 진술')).toBeUndefined();
  });

  it('prefers a matching asset_request over the default dictionary', () => {
    const bg = decideBackgroundMedia('insight', '가격표를 스토리에 올려두었어요', [
      { need: '가격표 화면', preferred_asset_type: 'source_screenshot', reason: '실제 가격표 UI' },
    ]);
    expect(bg).toBeDefined();
    expect(bg!.kind).toBe('screenshot');
  });

  it('skips background_media when the matching asset_request is face_video (talking_head hint only)', () => {
    const bg = decideBackgroundMedia('insight', '원장님이 직접 설명하는 장면이에요', [
      { need: '원장님 인터뷰', preferred_asset_type: 'face_video', reason: '신뢰감 있는 설명' },
    ]);
    expect(bg).toBeUndefined();
  });

  it('maps reference_image asset_requests to stock_photo', () => {
    const bg = decideBackgroundMedia('spotlight', '카페 매장 분위기를 보여줘요', [
      { need: '카페 매장 사진', preferred_asset_type: 'reference_image', reason: '분위기 전달' },
    ]);
    expect(bg).toBeDefined();
    expect(bg!.kind).toBe('stock_photo');
  });
});

// ── 2. assignBrollGallery 단위테스트 ─────────────────────────────────────────

describe('assignBrollGallery', () => {
  function draftsFrom(texts: string[], types: string[]) {
    return texts.map((text, i) => ({
      type: types[i],
      chunk: paceSpeakerText(text)[0] ?? { text, sentences: [text], sectionIndex: 0, isSectionStart: false },
    })) as Parameters<typeof assignBrollGallery>[0];
  }

  it('does not place broll/gallery when total body chunk count is below 10 (cap<1)', () => {
    const drafts = draftsFrom(
      ['미용실에서 손님을 맞이하는 장면이에요.', '두 번째 문장입니다.'],
      ['insight', 'spotlight'],
    );
    const result = assignBrollGallery(drafts);
    expect(result.some((d) => d.type === 'broll')).toBe(false);
    expect(result.some((d) => d.type === 'gallery')).toBe(false);
  });

  it('converts one early real-world-signal scene to broll when total >= 10', () => {
    const texts = Array.from({ length: 12 }, (_, i) => `중립 서술 문장 ${i}번입니다.`);
    // 앞쪽(hook~중반) 실세계 신호 텍스트.
    texts[1] = '미용실 원장님이 손님을 응대하는 장면이에요.';
    const types = texts.map((_, i) => (i === 1 ? 'insight' : 'insight'));
    const drafts = draftsFrom(texts, types);
    const result = assignBrollGallery(drafts);
    expect(result.filter((d) => d.type === 'broll').length).toBe(1);
    expect(result[1].type).toBe('broll');
  });

  it('does not convert a screenshot-subject scene to broll even with a stock hit nearby', () => {
    const texts = Array.from({ length: 12 }, (_, i) => `중립 서술 문장 ${i}번입니다.`);
    texts[1] = '인스타 프로필의 바이오 링크를 눌러보세요.'; // 인스타(스톡) + 링크를 눌 (스크린샷) 동시 존재
    const drafts = draftsFrom(texts, texts.map(() => 'insight'));
    const result = assignBrollGallery(drafts);
    expect(result.some((d) => d.type === 'broll')).toBe(false);
  });

  it('converts one orbital scene to gallery when total >= 10', () => {
    const texts = Array.from({ length: 12 }, (_, i) => `중립 서술 문장 ${i}번입니다.`);
    const types = texts.map((_, i) => (i === 5 ? 'orbital' : 'insight'));
    const drafts = draftsFrom(texts, types);
    const result = assignBrollGallery(drafts);
    expect(result.filter((d) => d.type === 'gallery').length).toBe(1);
    expect(result[5].type).toBe('gallery');
  });
});

// ── 3. 실브리프(b302482b 미용실 SNS) 종단 검증 ───────────────────────────────

describe('background_media wiring on the real salon SNS brief (b302482b)', () => {
  const brief = JSON.parse(fs.readFileSync(FIXTURE, 'utf-8')) as VideoExecutionBrief;
  const spec = buildSlideDeckSpecFromBrief(brief, {
    id: 'spec-bg-media',
    video_project_id: 'proj-bg-media',
    script_draft_id: 'draft-bg-media',
    voice_recording_id: 'voice-bg-media',
  });
  const roundTripped = JSON.parse(JSON.stringify(spec));
  const job = buildFactoryJobFromSlideDeck(roundTripped, { slug: 'bg-media', title: brief.title });

  type SceneWithMedia = FactoryScene & {
    background_media?: { kind: string; query?: string; treatment?: Record<string, unknown> };
    media?: { kind: string; query?: string };
    items?: Array<{ kind: string; query?: string; label?: string }>;
  };
  const scenes = job.scenes as SceneWithMedia[];

  // broll/gallery는 background_media가 아니라 media/items 필드로 실사를 나른다 —
  // "실사 미디어가 배정된 씬"이라는 관점에서는 둘 다 동등하게 센다.
  const hasRealMedia = (s: SceneWithMedia) =>
    !!s.background_media || s.type === 'broll' || s.type === 'gallery';

  it('prints the background_media assignment report (보고용)', () => {
    const withBg = scenes.filter((s) => s.background_media);
    const kindCounts = withBg.reduce<Record<string, number>>((acc, s) => {
      const k = s.background_media!.kind;
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    }, {});
    const queries = Array.from(
      new Set(withBg.map((s) => s.background_media!.query).filter((q): q is string => !!q)),
    );
    const brollCount = scenes.filter((s) => s.type === 'broll').length;
    const galleryCount = scenes.filter((s) => s.type === 'gallery').length;
    const mediaAssigned = scenes.filter(hasRealMedia).length;
    // eslint-disable-next-line no-console
    console.log(
      `[background_media report] total=${scenes.length} background_media=${withBg.length} ` +
        `real-media-assigned(incl. broll/gallery)=${mediaAssigned} ` +
        `(${((mediaAssigned / scenes.length) * 100).toFixed(1)}%)\n` +
        `kind distribution: ${JSON.stringify(kindCounts)}\n` +
        `broll=${brollCount} gallery=${galleryCount}\n` +
        `queries: ${queries.join(', ')}`,
    );
    expect(scenes.length).toBeGreaterThan(0);
  });

  it('assigns real media (background_media, or broll/gallery media) to at least 60% of scenes', () => {
    const assigned = scenes.filter(hasRealMedia).length;
    expect(assigned / scenes.length).toBeGreaterThanOrEqual(0.6);
  });

  it('never assigns background_media to data-heavy scene types (readability first)', () => {
    for (const s of scenes) {
      if (s.type === 'metric_cards' || s.type === 'chart_reveal' || s.type === 'comparison') {
        expect(s.background_media).toBeUndefined();
      }
    }
  });

  it('caps broll and gallery scenes at ~10% of total scenes each', () => {
    const brollCount = scenes.filter((s) => s.type === 'broll').length;
    const galleryCount = scenes.filter((s) => s.type === 'gallery').length;
    expect(brollCount / scenes.length).toBeLessThanOrEqual(0.1 + Number.EPSILON);
    expect(galleryCount / scenes.length).toBeLessThanOrEqual(0.1 + Number.EPSILON);
  });

  it('fills every assigned background_media with the strong default treatment', () => {
    for (const s of scenes) {
      if (!s.background_media) continue;
      expect(s.background_media.treatment).toBeDefined();
      const t = s.background_media.treatment as { grade?: string; blur?: number; scrim?: number; grain?: boolean };
      expect(t.grade).toBe('duotone');
      expect(t.blur).toBeGreaterThanOrEqual(6);
      expect(t.scrim).toBeGreaterThanOrEqual(0.7);
      expect(t.grain).toBe(true);
    }
  });

  it('matches the factory zod contract shape for broll (media.kind required)', () => {
    const broll = scenes.find((s) => s.type === 'broll');
    if (!broll) return; // 이 브리프에 broll이 배치되지 않았다면 스킵(다른 씬 조합에서만 후보 발견될 수 있음).
    expect(broll.media).toBeDefined();
    expect(typeof broll.media!.kind).toBe('string');
  });

  it('matches the factory zod contract shape for gallery (2~4 items)', () => {
    const gallery = scenes.find((s) => s.type === 'gallery');
    if (!gallery) return;
    expect(Array.isArray(gallery.items)).toBe(true);
    expect(gallery.items!.length).toBeGreaterThanOrEqual(2);
    expect(gallery.items!.length).toBeLessThanOrEqual(4);
  });

  it('routes screenshot-subject scenes (프로필/바이오/링크/가격표 등) to kind=screenshot over stock', () => {
    const screenshotScenes = scenes.filter((s) => s.background_media?.kind === 'screenshot');
    expect(screenshotScenes.length).toBeGreaterThan(0);
    for (const s of screenshotScenes) {
      expect(s.background_media!.query).toBeUndefined();
    }
  });
});
