import {
  normalizeToken,
  tokenizeScript,
  alignToScript,
  buildEditPlan,
  type NarrationSource,
  type TranscriptWord,
} from '../narration-retake-edit';

// 편의: 연속 단어를 등간격 타임스탬프로 만든다(각 dur초).
function seq(
  words: string[],
  startAt: number,
  dur = 0.5,
  prob = 0.99,
): TranscriptWord[] {
  let t = startAt;
  return words.map((w) => {
    const word = { word: ` ${w}`, start: round(t), end: round(t + dur), probability: prob };
    t += dur;
    return word;
  });
}
function round(n: number) {
  return Math.round(n * 1000) / 1000;
}

describe('normalizeToken / tokenizeScript', () => {
  it('구두점·대소문자·공백을 제거해 비교 가능한 토큰으로 만든다', () => {
    expect(normalizeToken(' 준비하면서,')).toBe('준비하면서');
    expect(normalizeToken('Hello!')).toBe('hello');
  });

  it('원고 헤더(#...)와 빈 어절을 제거한다', () => {
    expect(tokenizeScript('# 제목\n우리가 새로운 브랜드를')).toEqual(['우리가', '새로운', '브랜드를']);
  });
});

describe('alignToScript', () => {
  it('정상 진행이면 원고 인덱스가 단조 증가하고 rewind가 없다', () => {
    const script = tokenizeScript('우리가 새로운 브랜드를 만든다');
    const words = seq(['우리가', '새로운', '브랜드를', '만든다'], 0);
    const aligned = alignToScript(words, script, 3);
    expect(aligned.map((a) => a.scriptIndex)).toEqual([0, 1, 2, 3]);
    expect(aligned.some((a) => a.rewind)).toBe(false);
  });

  it('원고에 없는 단어는 scriptIndex=-1', () => {
    const script = tokenizeScript('우리가 새로운 브랜드를');
    const words = seq(['음', '우리가', '어', '새로운'], 0);
    const aligned = alignToScript(words, script, 3);
    expect(aligned[0].scriptIndex).toBe(-1);
    expect(aligned[2].scriptIndex).toBe(-1);
  });

  it('앞 원고 위치로 크게 되감으면 rewind로 표시한다(재발화)', () => {
    const script = tokenizeScript('오늘 소개할 브랜드는 커뮤니티를 만들지 않았습니다');
    // "오늘 소개할 브랜드는" 말하다 멈추고 처음부터 다시.
    const words = seq(
      ['오늘', '소개할', '브랜드는', '오늘', '소개할', '브랜드는', '커뮤니티를', '만들지', '않았습니다'],
      0,
    );
    const aligned = alignToScript(words, script, 2);
    // 4번째 단어(두번째 "오늘")에서 되감기.
    expect(aligned[3].rewind).toBe(true);
  });
});

describe('buildEditPlan — 재발화/실패시작/침묵/필러', () => {
  it('즉시 중복 테이크 중 나쁜 것을 컷한다(retake_discarded 또는 false_start)', () => {
    const script = '오늘 소개할 브랜드는 커뮤니티를 만들지 않았습니다';
    // 첫 시도: "오늘 소개할 브랜드는"(미완) → 재발화: 전체.
    const words = seq(
      ['오늘', '소개할', '브랜드는', '오늘', '소개할', '브랜드는', '커뮤니티를', '만들지', '않았습니다'],
      0,
    );
    const plan = buildEditPlan({ approvedScript: script, sources: [{ source: 'full', words }] });
    // 실패한 첫 시도 구간이 컷에 포함되어야 한다.
    const discardCuts = plan.cuts.filter(
      (c) => c.reason === 'false_start' || c.reason === 'retake_discarded',
    );
    expect(discardCuts.length).toBeGreaterThanOrEqual(1);
    // 컷된 구간은 앞쪽(첫 시도) 시간대여야 한다.
    expect(discardCuts[0].start).toBeLessThan(2);
    // 최종 clip 총합에 완결 테이크가 남아야 한다.
    expect(plan.kept_seconds).toBeGreaterThan(0);
  });

  it('긴 무음을 silence 컷으로 분리한다', () => {
    const script = '첫 번째 단계는 초기 마케팅입니다';
    const a = seq(['첫', '번째', '단계는'], 0); // 0.0~1.5
    const b = seq(['초기', '마케팅입니다'], 8.0); // 6.5s 무음 뒤
    const plan = buildEditPlan({
      approvedScript: script,
      sources: [{ source: 'full', words: [...a, ...b] }],
    });
    const silence = plan.cuts.filter((c) => c.reason === 'silence');
    expect(silence.length).toBe(1);
    expect(silence[0].start).toBeCloseTo(1.5, 1);
    expect(silence[0].end).toBeCloseTo(8.0, 1);
  });

  it('원고에 없는 저신뢰 필러를 컷 + flag 한다', () => {
    const script = '우리가 브랜드를 만듭니다';
    const words = [
      ...seq(['우리가'], 0),
      ...seq(['음'], 0.5, 0.5, 0.2), // 저신뢰 필러
      ...seq(['브랜드를', '만듭니다'], 1.0),
    ];
    const plan = buildEditPlan({ approvedScript: script, sources: [{ source: 'full', words }] });
    const filler = plan.cuts.filter((c) => c.reason === 'filler');
    expect(filler.length).toBe(1);
    expect(plan.flags.some((f) => f.issue.includes('필러'))).toBe(true);
  });

  it('깨끗한 녹음은 컷이 거의 없다(과잉 편집 방지)', () => {
    const script = '우리가 새로운 브랜드를 만든다고 생각해 보세요';
    const words = seq(['우리가', '새로운', '브랜드를', '만든다고', '생각해', '보세요'], 0);
    const plan = buildEditPlan({ approvedScript: script, sources: [{ source: 'full', words }] });
    expect(plan.cuts.length).toBe(0);
    expect(plan.clips.length).toBe(1);
    expect(plan.clips[0].confidence).toBeGreaterThan(0.8);
  });

  it('다중 소스: revised에서 더 깨끗한 테이크를 채택할 수 있다', () => {
    const script = '두 번째 단계 제목입니다';
    // full: 절어서 원고 미완(낮은 prob).
    const full = seq(['두', '번째'], 10, 0.5, 0.4);
    // revised: 완결.
    const revised = seq(['두', '번째', '단계', '제목입니다'], 3, 0.5, 0.99);
    const plan = buildEditPlan({
      approvedScript: script,
      sources: [
        { source: 'full', words: full },
        { source: 'revised', words: revised },
      ],
    });
    // 채택 clip 중 revised가 있어야 한다.
    expect(plan.clips.some((c) => c.source === 'revised')).toBe(true);
  });
});

describe('buildEditPlan — 늘어진 단어 속 무음 제거(오디오 분석 주입)', () => {
  it('주입된 silence로 늘어진 단어를 clip 두 개로 쪼개고 그 사이를 컷한다', () => {
    const script = '대회를 준비하며 장비 정보를 나눴습니다';
    // "장비"가 1.0~5.0s로 4초 늘어짐(whisper가 앞뒤 침묵을 붙임).
    const words: TranscriptWord[] = [
      { word: ' 대회를', start: 0.0, end: 0.5, probability: 0.99 },
      { word: ' 준비하며', start: 0.5, end: 1.0, probability: 0.99 },
      { word: ' 장비', start: 1.0, end: 5.0, probability: 0.95 },
      { word: ' 정보를', start: 5.0, end: 5.5, probability: 0.99 },
      { word: ' 나눴습니다', start: 5.5, end: 6.0, probability: 0.99 },
    ];
    // 오디오 분석이 "장비" 발화(1.2s까지) 뒤 침묵 1.2~4.8s를 찾았다고 가정.
    const plan = buildEditPlan({
      approvedScript: script,
      sources: [{ source: 'full', words }],
      silences: [{ source: 'full', start: 1.2, end: 4.8 }],
    });
    const injected = plan.cuts.filter((c) => c.reason === 'silence' && c.note.includes('멈칫'));
    expect(injected.length).toBe(1);
    expect(injected[0].start).toBeCloseTo(1.2, 1);
    expect(injected[0].end).toBeCloseTo(4.8, 1);
    // 늘어진 단어 자리가 clip으로 이어져 총 길이가 무음만큼 줄어야 한다.
    expect(plan.kept_seconds).toBeCloseTo(6.0 - 3.6, 1);
    // silence 주입 시 긴 단어 flag는 만들지 않는다(자동 처리).
    expect(plan.flags.some((f) => f.issue.includes('절음'))).toBe(false);
  });
});

describe('buildEditPlan — 골든 대조 (bandit 실제 전사 방향성)', () => {
  // deliverables/bandit-.../edit_main_audio.py는 88.48~91.65s의 "대회를 준비하면서" 첫 시도를
  // 손으로 잘랐다. Whisper가 재발화를 늘 두 번 잡지는 않으므로(뭉갬), 여기서는 그 구간의
  // "비정상적으로 긴 단어"가 flag로 올라오는지(사람 검토로 유도)를 검증한다.
  it('비정상적으로 긴 단어를 절음 가능으로 flag 한다', () => {
    const script = '대회를 준비하면서 장비 정보를 나눴습니다';
    const words: TranscriptWord[] = [
      { word: ' 대회를', start: 88.11, end: 88.77, probability: 0.9 },
      { word: ' 준비하면서', start: 88.77, end: 89.41, probability: 0.98 },
      { word: ' 장비', start: 89.41, end: 93.35, probability: 0.91 }, // 3.94s — 절음 뭉갬
      { word: ' 정보를', start: 93.47, end: 94.07, probability: 0.98 },
      { word: ' 나눴습니다', start: 94.07, end: 94.77, probability: 0.98 },
    ];
    const plan = buildEditPlan({ approvedScript: script, sources: [{ source: 'full', words }] });
    expect(plan.flags.some((f) => f.issue.includes('절음') && Math.abs(f.at - 89.41) < 0.01)).toBe(
      true,
    );
  });
});
