import { classifyMarket, hangulRatio } from '../market-classifier';

describe('hangulRatio', () => {
  it('is 1 for all-Hangul text', () => {
    expect(hangulRatio('안녕하세요')).toBe(1);
  });
  it('is 0 for all-latin text', () => {
    expect(hangulRatio('hello world')).toBe(0);
  });
  it('ignores whitespace in the denominator', () => {
    expect(hangulRatio('가 a')).toBeCloseTo(0.5, 5);
  });
  it('is 0 for empty text', () => {
    expect(hangulRatio('')).toBe(0);
  });
});

describe('classifyMarket', () => {
  it('prefers channel.country over language and text (country wins)', () => {
    // Korean title, but the channel country is US → US.
    const m = classifyMarket({
      channelCountry: 'US',
      defaultAudioLanguage: 'ko',
      title: '한국어 제목입니다',
    });
    expect(m).toBe('US');
  });

  it('maps country KR → KR', () => {
    expect(classifyMarket({ channelCountry: 'kr', title: 'hello' })).toBe('KR');
  });

  it('falls back to declared language when country is absent', () => {
    expect(classifyMarket({ defaultAudioLanguage: 'ko', title: 'hello world' })).toBe('KR');
    expect(classifyMarket({ defaultLanguage: 'en-US', title: '한국어' })).toBe('US');
  });

  it('uses Hangul ratio of title+description as last resort', () => {
    expect(classifyMarket({ title: '유튜브 콘텐츠 전략 완전정복' })).toBe('KR');
    expect(classifyMarket({ title: 'youtube content strategy guide' })).toBe('US');
  });

  it('returns null when there is no country, language, or text signal', () => {
    expect(classifyMarket({})).toBeNull();
  });

  it('never consults a regionCode field (not part of the signal type)', () => {
    // Passing an unrelated regionCode-like field must not change the result.
    const signals = { title: 'youtube content strategy' } as Record<string, unknown>;
    signals.regionCode = 'KR';
    expect(classifyMarket(signals as never)).toBe('US');
  });
});
