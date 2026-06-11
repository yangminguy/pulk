import {
  classifyImageRisk,
  buildAttributionBlock,
  collectImageSources,
  type ImageSource,
  type ImageSearchAdapter,
} from '../image-sourcing';

describe('classifyImageRisk (§7-3)', () => {
  it('self_photo → low', () => {
    expect(classifyImageRisk({ source_type: 'self_photo' })).toBe('low');
  });
  it('free_stock 상업가능 → medium, 상업불가 → high', () => {
    expect(classifyImageRisk({ source_type: 'free_stock', commercial_use_allowed: true })).toBe('medium');
    expect(classifyImageRisk({ source_type: 'free_stock', commercial_use_allowed: false })).toBe('high');
  });
  it('google_image / news_blog → high', () => {
    expect(classifyImageRisk({ source_type: 'google_image' })).toBe('high');
    expect(classifyImageRisk({ source_type: 'news_blog' })).toBe('high');
  });
  it('민감 이미지 → critical(사용 금지)', () => {
    expect(classifyImageRisk({ source_type: 'self_photo', sensitive: true })).toBe('critical');
  });
});

describe('buildAttributionBlock (§7-4)', () => {
  const sources: ImageSource[] = [
    { image_id: 'i1', source_type: 'google_image', source_url: 'http://a/1', creator_or_owner: 'A', license: 'CC-BY', risk_level: 'high' },
    { image_id: 'i2', source_type: 'news_blog', source_url: 'http://b/2', risk_level: 'critical' }, // 제외돼야
  ];
  it('Critical은 제외하고 출처 블록 생성', () => {
    const block = buildAttributionBlock(sources);
    expect(block).toContain('[이미지 출처]');
    expect(block).toContain('Image 1: A / http://a/1 / CC-BY');
    expect(block).not.toContain('http://b/2');
    expect(block).toContain('즉시 수정하겠습니다');
  });
});

describe('collectImageSources (어댑터 주입)', () => {
  it('어댑터 미주입 시 빈 배열(manual 폴백)', async () => {
    expect(await collectImageSources('q', 5)).toEqual([]);
  });

  it('어댑터 hits → 위험도·출처표기 자동 부여 + zod 검증', async () => {
    const adapter: ImageSearchAdapter = {
      search: async () => [
        { source_type: 'google_image', source_url: 'http://g/1', creator_or_owner: 'G' },
        { source_type: 'self_photo', source_url: 'http://s/2', sensitive: true },
      ],
    };
    const out = await collectImageSources('자동화 대시보드', 2, { adapter, idPrefix: 't' });
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ image_id: 't-1', risk_level: 'high', attribution_required: true });
    expect(out[1].risk_level).toBe('critical');
    expect(out[1].usage_note).toContain('사용 금지');
  });
});
