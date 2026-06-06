import { buildVoiceOfCustomerPack, countRealLanguage } from '../voc-research';
import type { VoiceOfCustomerPack } from '../types';

describe('buildVoiceOfCustomerPack', () => {
  it('returns a complete pack with all provided fields', () => {
    const input: Partial<VoiceOfCustomerPack> = {
      repeated_phrases: ['유튜브로 먹고살 수 있을까?', '조회수가 안 나와'],
      pain_expressions: ['영상 만들어도 아무도 안 봐', '구독자가 늘지 않아'],
      desire_expressions: ['내 채널이 알고리즘을 타면 좋겠다', '조회수 10만은 찍어보고 싶다'],
      objection_expressions: ['나 같은 평범한 사람이 유튜브로 돈 벌 수 있어?'],
      realistic_situations: ['퇴근 후 혼자 카메라 켜고 영상 찍는 상황'],
      must_use_language: ['알고리즘', '조회수', '썸네일 클릭률'],
      avoid_language: ['콘텐츠 전략', '퍼널'],
    };

    const pack = buildVoiceOfCustomerPack(input);

    expect(pack.repeated_phrases).toEqual(['유튜브로 먹고살 수 있을까?', '조회수가 안 나와']);
    expect(pack.pain_expressions).toEqual(['영상 만들어도 아무도 안 봐', '구독자가 늘지 않아']);
    expect(pack.desire_expressions).toEqual([
      '내 채널이 알고리즘을 타면 좋겠다',
      '조회수 10만은 찍어보고 싶다',
    ]);
    expect(pack.objection_expressions).toEqual(['나 같은 평범한 사람이 유튜브로 돈 벌 수 있어?']);
    expect(pack.realistic_situations).toEqual(['퇴근 후 혼자 카메라 켜고 영상 찍는 상황']);
    expect(pack.must_use_language).toEqual(['알고리즘', '조회수', '썸네일 클릭률']);
    expect(pack.avoid_language).toEqual(['콘텐츠 전략', '퍼널']);
  });

  it('fills missing fields with empty arrays', () => {
    const pack = buildVoiceOfCustomerPack({
      pain_expressions: ['돈이 없어'],
    });

    expect(pack.repeated_phrases).toEqual([]);
    expect(pack.desire_expressions).toEqual([]);
    expect(pack.objection_expressions).toEqual([]);
    expect(pack.realistic_situations).toEqual([]);
    expect(pack.must_use_language).toEqual([]);
    expect(pack.avoid_language).toEqual([]);
    // provided field is kept
    expect(pack.pain_expressions).toEqual(['돈이 없어']);
  });

  it('returns all empty arrays for empty input', () => {
    const pack = buildVoiceOfCustomerPack({});

    const keys: (keyof VoiceOfCustomerPack)[] = [
      'repeated_phrases',
      'pain_expressions',
      'desire_expressions',
      'objection_expressions',
      'realistic_situations',
      'must_use_language',
      'avoid_language',
    ];
    for (const key of keys) {
      expect(pack[key]).toEqual([]);
    }
  });
});

describe('countRealLanguage', () => {
  it('counts entries across all expression fields, excluding avoid_language', () => {
    const pack = buildVoiceOfCustomerPack({
      repeated_phrases: ['a', 'b'],           // 2
      pain_expressions: ['c'],                 // 1
      desire_expressions: ['d', 'e'],          // 2
      objection_expressions: ['f'],            // 1
      realistic_situations: ['g', 'h', 'i'],   // 3
      must_use_language: ['j'],                // 1
      avoid_language: ['k', 'l', 'm'],         // NOT counted
    });

    expect(countRealLanguage(pack)).toBe(10);
  });

  it('returns 0 for an empty pack', () => {
    const pack = buildVoiceOfCustomerPack({});
    expect(countRealLanguage(pack)).toBe(0);
  });

  it('satisfies Gate1 threshold: count >= 5 when enough real language exists', () => {
    const pack = buildVoiceOfCustomerPack({
      repeated_phrases: ['유튜브로 먹고살 수 있을까?'],
      pain_expressions: ['아무도 내 영상을 안 봐'],
      desire_expressions: ['조회수 10만 찍고 싶다'],
      objection_expressions: ['나는 재능이 없어'],
      realistic_situations: ['퇴근 후 혼자 찍는 상황'],
      avoid_language: ['ignored1', 'ignored2'],
    });

    expect(countRealLanguage(pack)).toBeGreaterThanOrEqual(5);
  });

  it('fails Gate1 threshold when real language is fewer than 5', () => {
    const pack = buildVoiceOfCustomerPack({
      repeated_phrases: ['a'],
      pain_expressions: ['b'],
      // only 2 real entries
    });

    expect(countRealLanguage(pack)).toBeLessThan(5);
  });
});
