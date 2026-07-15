// Phase 2 Scene Decision 엔진 단위 테스트.
// 스코어링 규칙별(프로젝트 규칙: 모든 scoring rule 단위테스트 필수) + 페이싱 분할 +
// 축약/강조 추출 + rhythm/transition/mood + 밸런싱 + 브리프/슬라이드 계획 통합.

import type { VideoExecutionBrief, SlideSpec } from '../types';
import {
  stripScriptArtifacts,
  splitSentences,
  estimateSceneSeconds,
  paceSpeakerText,
  condenseHeadline,
  condenseBody,
  countMetricSignals,
  countComparisonSignals,
  countSequenceSignals,
  countQuoteSignals,
  countEnumerationSignals,
  countReframeSignals,
  countProblemSignals,
  hasSectionTransition,
  countCtaSignals,
  scoreSceneTypes,
  decideSceneType,
  extractQuotedSpans,
  extractNumericSpans,
  extractRepeatedKeywords,
  extractEmphasis,
  assignRhythmRole,
  pickTransition,
  pickMood,
  balanceInsightShare,
  hintTypeFromText,
  planScenesFromBrief,
  planScenesFromLogicBlocks,
  planScenesFromSlides,
  noopScenePlanRefiner,
  SCENE_MAX_SECONDS,
  SCENE_TARGET_MIN_SECONDS,
  type ScenePlanRefiner,
} from '../scene-decision';

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeBrief(overrides: Partial<VideoExecutionBrief> = {}): VideoExecutionBrief {
  return {
    schema_version: 'cmo_to_factory_v2',
    content_card_id: 'card-1',
    content_type: 'pulling',
    title: '작은 브랜드가 광고보다 구조를 먼저 잡아야 하는 이유',
    target_viewer: {
      who: '1인 브랜드 사장님',
      knowledge_level: '광고만 돌려봄',
      pain: '광고비 대비 매출이 안 나옴',
      desired_reaction: '구조부터 잡아야겠다',
    },
    strategy: {
      core_message: '광고는 증폭기일 뿐, 엔진이 아니다',
      covered_stages: ['phenomenon', 'desire'],
      role_in_content_set: '풀링 1편',
      bridge_to_key_content: '키 콘텐츠에서 구조 잡는 법을 다룬다',
    },
    script: {
      full_script: '전체 원고입니다.',
      intro_30s:
        '광고비를 두 배로 늘렸는데 매출은 그대로인 적 있으신가요? 오늘은 그 진짜 이유를 끝까지 짚어드릴게요.',
      logic_blocks: [
        {
          block_id: 'b1',
          role: 'explain',
          speaker_text:
            '광고를 더 돌려도 매출이 안 오르는 진짜 이유가 있습니다. 광고는 증폭기일 뿐이에요. 엔진이 없는 차에 기름만 붓는 것과 같아요. 구조가 없으면 광고비는 그대로 새어 나갑니다.\n\n---\n\n두 번째 이유는 측정의 부재예요. 광고비 300만원을 쓰면서 전환율 1%도 측정하지 않는 사장님이 대부분이거든요. 실제 사례를 하나 드릴게요. 마포구 사장님은 측정 하나만 붙이고 매출이 두 배로 늘었어요.',
          communication_goal: '문제 인식',
          viewer_reaction_target: '뜨끔함',
          required_evidence: ['광고비 통계'],
        },
      ],
    },
    source_materials: { used_insights: {} },
    constraints: { tone: '단호한 조언', format: 'youtube_16_9' },
    ...overrides,
  };
}

// ── 1. 텍스트 유틸 ───────────────────────────────────────────────────────────

describe('stripScriptArtifacts', () => {
  it('removes "---" divider lines and inline dividers', () => {
    expect(stripScriptArtifacts('앞 문단.\n\n---\n\n뒤 문단.')).not.toContain('---');
    expect(stripScriptArtifacts('앞 --- 뒤')).not.toContain('---');
    expect(stripScriptArtifacts('  공백  정리  ')).toBe('공백 정리');
  });
});

describe('splitSentences', () => {
  it('splits on sentence-final punctuation with optional closing quotes', () => {
    const s = splitSentences('첫 문장입니다. 두 번째 문장이에요! 세 번째인가요?');
    expect(s).toHaveLength(3);
    expect(s[0]).toBe('첫 문장입니다.');
  });

  it('does not split inside quoted lists without following whitespace boundary', () => {
    const s = splitSentences("'발레아쥬', '핸드페인팅', '멜팅'. 이 단어들은 어렵습니다.");
    expect(s).toHaveLength(2);
  });
});

describe('estimateSceneSeconds', () => {
  it('clamps to [3, 12] with chars/5.5', () => {
    expect(estimateSceneSeconds('짧다')).toBe(3);
    expect(estimateSceneSeconds('가'.repeat(55))).toBe(10);
    expect(estimateSceneSeconds('가'.repeat(500))).toBe(SCENE_MAX_SECONDS);
  });
});

describe('paceSpeakerText', () => {
  const longText = Array.from({ length: 10 }, (_, i) => `문장 번호 ${i}번이고 대략 서른 글자쯤 되는 설명 문장입니다.`).join(' ');

  it('splits long paragraphs into 8~12s target chunks at sentence boundaries', () => {
    const chunks = paceSpeakerText(longText);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(estimateSceneSeconds(c.text)).toBeLessThanOrEqual(SCENE_MAX_SECONDS);
      // 문장 경계 보존: chunk 텍스트는 문장들의 연결이다.
      expect(c.sentences.join(' ')).toBe(c.text);
    }
  });

  it('treats "---" as a section boundary and strips it from text', () => {
    const chunks = paceSpeakerText('첫 섹션 문장입니다.\n\n---\n\n두 번째 섹션 문장입니다.');
    expect(chunks.some((c) => c.text.includes('---'))).toBe(false);
    expect(chunks[0].sectionIndex).toBe(0);
    expect(chunks[chunks.length - 1].sectionIndex).toBe(1);
    expect(chunks.filter((c) => c.isSectionStart)).toHaveLength(2);
  });

  it('merges a tiny remainder into the previous chunk (no <3s scenes)', () => {
    const text = `${'가'.repeat(50)}. 끝.`;
    const chunks = paceSpeakerText(text);
    expect(chunks[chunks.length - 1].text.length).toBeGreaterThanOrEqual(17);
  });
});

// ── 2. 축약 ──────────────────────────────────────────────────────────────────

describe('condenseHeadline', () => {
  it('extracts a core clause instead of copying the full sentence, no ellipsis', () => {
    const src = '그러니까 열심히 할수록, 광고비는 그대로 새어 나갑니다.';
    const h = condenseHeadline(src);
    expect(h).not.toBe(src);
    expect(h).not.toContain('…');
    expect(h.length).toBeLessThanOrEqual(36);
    expect(h.length).toBeGreaterThan(0);
  });

  it('strips common sentence endings when enough text remains', () => {
    expect(condenseHeadline('구조적 함정이 하나 있거든요.')).not.toMatch(/거든요$/);
  });

  it('never contains script artifacts', () => {
    expect(condenseHeadline('--- 구획 뒤 제목입니다.')).not.toContain('---');
  });
});

describe('condenseBody', () => {
  it('keeps at most 2 condensed lines, never the full paragraph', () => {
    const sentences = [
      '첫 번째 설명 문장입니다.',
      '팔로워 2천 명 중 실제 손님은 몇 명일까요?',
      '세 번째 부연 문장입니다.',
      '네 번째 부연 문장입니다.',
    ];
    const body = condenseBody(sentences);
    expect(body.split('\n').length).toBeLessThanOrEqual(2);
    expect(body.length).toBeLessThan(sentences.join(' ').length);
  });
});

// ── 3. 스코어링 규칙(규칙별) ─────────────────────────────────────────────────

describe('countMetricSignals', () => {
  it('counts digit+unit and Korean numeral signals', () => {
    expect(countMetricSignals('팔로워 1,800명에 매달 12개 이상 올려요')).toBe(2);
    expect(countMetricSignals('매출이 두 배로 늘었어요')).toBe(1);
    expect(countMetricSignals('숫자가 전혀 없는 문장')).toBe(0);
  });
});

describe('countComparisonSignals', () => {
  it('detects vs/보다/반면/차이/완전히 다른', () => {
    expect(countComparisonSignals('저장과 예약은 완전히 다른 심리 상태예요')).toBeGreaterThan(0);
    expect(countComparisonSignals('A vs B 구도예요')).toBeGreaterThan(0);
    expect(countComparisonSignals('반면 예약은 늘지 않아요')).toBeGreaterThan(0);
    expect(countComparisonSignals('평범한 설명 문장')).toBe(0);
  });
});

describe('countSequenceSignals', () => {
  it('detects 첫째/둘째, N단계, 체크리스트, 화살표', () => {
    expect(countSequenceSignals('첫째, 링크를 답니다. 둘째, 가격표를 만듭니다.')).toBeGreaterThanOrEqual(2);
    expect(countSequenceSignals('3 단계로 정리할게요')).toBeGreaterThan(0);
    expect(countSequenceSignals('체크리스트를 확인하세요')).toBeGreaterThan(0);
    expect(countSequenceSignals('전략 입력 → 스크립트 생성')).toBeGreaterThan(0);
    expect(countSequenceSignals('나열 신호가 전혀 없는 평범한 문장')).toBe(0);
  });
});

describe('countQuoteSignals', () => {
  it('detects quoted spans and verbal-quote markers', () => {
    expect(countQuoteSignals('"우리 실력을 보여주면 손님이 오겠지."라고 말해요')).toBeGreaterThanOrEqual(2);
    expect(countQuoteSignals('실제 사례를 하나 드릴게요')).toBeGreaterThan(0);
    expect(countQuoteSignals('인용이 전혀 없는 문장')).toBe(0);
  });
});

describe('countEnumerationSignals', () => {
  it('detects N가지 and 3+ listed quoted spans', () => {
    expect(countEnumerationSignals('세 가지만 기억하세요')).toBeGreaterThan(0);
    expect(countEnumerationSignals("'발레아쥬', '핸드페인팅', '멜팅', '토닝'")).toBeGreaterThan(0);
    expect(countEnumerationSignals('나열이 없는 문장')).toBe(0);
  });
});

describe('countReframeSignals', () => {
  it('detects 사실은/진짜 이유/아니에요/오해/착각/즉', () => {
    expect(countReframeSignals('콘텐츠가 부족해서? 아니에요. 사실은 구조 문제예요.')).toBeGreaterThanOrEqual(2);
    expect(countReframeSignals('그건 오해이자 착각이에요')).toBeGreaterThanOrEqual(2);
    expect(countReframeSignals('반전이 없는 문장')).toBe(0);
  });
});

describe('countProblemSignals', () => {
  it('detects 왜 안/함정/실수/손해/문제/구멍', () => {
    expect(countProblemSignals('왜 안 될까요? 여기서 첫 번째 구멍이 생겨요.')).toBeGreaterThanOrEqual(2);
    expect(countProblemSignals('구조적 함정이 있어요')).toBeGreaterThan(0);
    expect(countProblemSignals('맑고 무해한 문장이에요')).toBe(0);
  });
});

describe('hasSectionTransition', () => {
  it('detects ordinal transitions only at sentence start', () => {
    expect(hasSectionTransition('두 번째 이유는 조금 더 불편한 얘기예요.')).toBe(true);
    expect(hasSectionTransition('마지막으로 정리할게요.')).toBe(true);
    expect(hasSectionTransition('이유는 두 번째 문장에 있어요.')).toBe(false);
  });
});

describe('countCtaSignals', () => {
  it('detects imperative CTA endings', () => {
    expect(countCtaSignals('지금 예약까지 가는 클릭이 몇 번인지 세어보세요')).toBeGreaterThan(0);
    expect(countCtaSignals('채널을 구독하고 다음 영상을 확인하세요')).toBeGreaterThan(0);
    expect(countCtaSignals('행동 유도가 없는 설명')).toBe(0);
  });
});

// ── 4. 타입 결정 ─────────────────────────────────────────────────────────────

describe('decideSceneType', () => {
  it('routes each signal family to its scene type', () => {
    expect(decideSceneType('팔로워 1,800명, 매달 12개, 신규 서너 명 수준이었어요.')).toBe('metric_cards');
    expect(decideSceneType('저장과 예약은 완전히 다른 심리 상태예요. 반면 예약은 다른 문제죠.')).toBe('comparison');
    expect(decideSceneType('첫째, 링크를 답니다. 둘째, 가격표를 만듭니다.')).toBe('steps');
    expect(decideSceneType('전략 입력 → 스크립트 생성 → 렌더 순서로 갑니다.')).toBe('flow');
    expect(decideSceneType('"실력을 보여주면 오겠지."라고 말해요. 실제 사례도 있어요.')).toBe('quote');
    expect(decideSceneType("'발레아쥬', '핸드페인팅', '멜팅', '토닝' 같은 요소들이에요.")).toBe('orbital');
    expect(decideSceneType('콘텐츠가 부족해서? 아니에요. 사실은 구조가 진짜 이유예요.')).toBe('reframe');
    expect(decideSceneType('여기서 구멍이 생기고 이탈이 나요. 이게 함정이에요.')).toBe('problem');
    expect(decideSceneType('평범하고 조용한 서술형 통찰 한 줄.')).toBe('insight');
  });

  it('allows section only at section start and cta only at final chunk', () => {
    const sectionText = '두 번째 이유는 조금 더 불편한 얘기예요.';
    expect(decideSceneType(sectionText, { isSectionStart: true })).toBe('section');
    expect(decideSceneType(sectionText, { isSectionStart: false })).not.toBe('section');

    const ctaText = '지금 프로필을 열어보고 클릭 수를 세어보세요.';
    expect(decideSceneType(ctaText, { isFinalChunk: true })).toBe('cta');
    expect(decideSceneType(ctaText, { isFinalChunk: false })).not.toBe('cta');
  });

  it('applies hint weight from visual_intent_hint', () => {
    expect(decideSceneType('중립적인 설명 문장입니다.', { hintType: 'comparison' })).toBe('comparison');
  });
});

describe('hintTypeFromText', () => {
  it('maps CMO hints to decidable types', () => {
    expect(hintTypeFromText('비교 차트')).toBe('comparison');
    expect(hintTypeFromText('고객 후기 인용')).toBe('quote');
    expect(hintTypeFromText('3단계 체크리스트')).toBe('steps');
    expect(hintTypeFromText('프레임워크 구조도')).toBe('flow');
    expect(hintTypeFromText('핵심 지표 숫자')).toBe('metric_cards');
    expect(hintTypeFromText(undefined)).toBeUndefined();
    expect(hintTypeFromText('아무 힌트 아님')).toBeUndefined();
  });
});

// ── 5. emphasis ──────────────────────────────────────────────────────────────

describe('extractQuotedSpans / extractNumericSpans / extractRepeatedKeywords', () => {
  it('extracts quoted spans', () => {
    expect(extractQuotedSpans("'발견 플랫폼'이에요")).toEqual(['발견 플랫폼']);
    expect(extractQuotedSpans('"예약해야지"라고 생각해요')).toEqual(['예약해야지']);
  });

  it('extracts number+unit spans', () => {
    expect(extractNumericSpans('팔로워 1,800명이 매달 12개')).toEqual(['1,800명', '12개']);
  });

  it('extracts repeated keywords with particle stripping', () => {
    const kws = extractRepeatedKeywords('예약이 중요해요. 예약을 만들려면 예약 링크가 필요해요.');
    expect(kws).toContain('예약');
  });
});

describe('extractEmphasis', () => {
  it('prioritises quoted spans and numbers, caps at 4, dedupes', () => {
    const e = extractEmphasis('헤드라인', "'발견 플랫폼'에서 팔로워 2,000명이 저장만 해요. 저장은 예약이 아니에요. 저장 폴더만 쌓여요.");
    expect(e.length).toBeGreaterThanOrEqual(1);
    expect(e.length).toBeLessThanOrEqual(4);
    expect(e[0]).toBe('발견 플랫폼');
    expect(e).toContain('2,000명');
    expect(new Set(e).size).toBe(e.length);
  });

  it('always returns at least one emphasis (fallback)', () => {
    expect(extractEmphasis('제목', '아주 짧다').length).toBeGreaterThanOrEqual(1);
  });
});

// ── 6. rhythm / transition / mood ───────────────────────────────────────────

describe('assignRhythmRole', () => {
  it('follows hook→tension→explain→proof→insight→cta arc mapping', () => {
    expect(assignRhythmRole('hero', 0, 10)).toBe('hook');
    expect(assignRhythmRole('problem', 2, 10)).toBe('tension');
    expect(assignRhythmRole('metric_cards', 4, 10)).toBe('proof');
    expect(assignRhythmRole('quote', 5, 10)).toBe('proof');
    expect(assignRhythmRole('reframe', 3, 10)).toBe('insight');
    expect(assignRhythmRole('section', 5, 10)).toBe('reset');
    expect(assignRhythmRole('insight', 2, 10)).toBe('explain');
    expect(assignRhythmRole('insight', 8, 10)).toBe('insight'); // 마지막 1/4 조임
    expect(assignRhythmRole('cta', 9, 10)).toBe('cta');
  });
});

describe('pickTransition', () => {
  it('fades in first, fade_scale on sections, slide_up on cta, alternates cut/fade', () => {
    expect(pickTransition('hero', 0)).toBe('fade');
    expect(pickTransition('section', 5)).toBe('fade_scale');
    expect(pickTransition('cta', 9)).toBe('slide_up');
    expect(pickTransition('insight', 1)).toBe('cut');
    expect(pickTransition('insight', 2)).toBe('fade');
  });
});

describe('pickMood', () => {
  it('contrasts hook/cta(dark) vs proof(clean) vs body(light)', () => {
    expect(pickMood('hero')).toBe('dark');
    expect(pickMood('cta')).toBe('dark');
    expect(pickMood('section')).toBe('dark');
    expect(pickMood('metric_cards')).toBe('clean');
    expect(pickMood('quote')).toBe('clean');
    expect(pickMood('insight')).toBe('light');
  });
});

// ── 7. 밸런싱 ────────────────────────────────────────────────────────────────

describe('balanceInsightShare', () => {
  it('keeps insight share below half by reassigning to spotlight/split', () => {
    const chunk = (text: string) => ({
      text,
      sentences: splitSentences(text),
      sectionIndex: 0,
      isSectionStart: false,
    });
    const drafts = Array.from({ length: 10 }, (_, i) => ({
      type: 'insight' as const,
      chunk: chunk(`중립 서술 문장 ${i}번입니다. 부연 설명 문장도 하나 있습니다.`),
    }));
    const balanced = balanceInsightShare(drafts);
    const insightCount = balanced.filter((d) => d.type === 'insight').length;
    expect(insightCount / balanced.length).toBeLessThan(0.5);
    expect(balanced.some((d) => d.type === 'spotlight' || d.type === 'split')).toBe(true);
  });
});

// ── 8. 계획 통합 ────────────────────────────────────────────────────────────

describe('planScenesFromBrief', () => {
  const beats = planScenesFromBrief(makeBrief());

  it('starts with a hero clamped to 8~12s (no more 20s intro)', () => {
    expect(beats[0].scene_type).toBe('hero');
    expect(beats[0].rhythm_role).toBe('hook');
    expect(beats[0].duration).toBeGreaterThanOrEqual(SCENE_TARGET_MIN_SECONDS);
    expect(beats[0].duration).toBeLessThanOrEqual(SCENE_MAX_SECONDS);
  });

  it('always ends with a cta and places pulling bridge as a section before it', () => {
    const last = beats[beats.length - 1];
    expect(last.scene_type).toBe('cta');
    expect(last.rhythm_role).toBe('cta');
    expect(last.transition).toBe('slide_up');
    const bridge = beats[beats.length - 2];
    expect(bridge.scene_type).toBe('section');
    expect(bridge.speaker_text).toContain('키 콘텐츠');
  });

  it('fills emphasis/mood/transition on every beat and keeps durations ≤ 12s', () => {
    for (const b of beats) {
      expect(b.emphasis && b.emphasis.length).toBeGreaterThanOrEqual(1);
      expect(b.mood).toBeDefined();
      expect(b.transition).toBeDefined();
      expect(b.duration).toBeLessThanOrEqual(SCENE_MAX_SECONDS);
      expect(b.duration).toBeGreaterThanOrEqual(3);
      expect(b.headline).not.toContain('---');
      expect(b.speaker_text).not.toContain('---');
      expect(b.body ?? '').not.toContain('---');
    }
  });

  it('splits long blocks into multiple scenes with diverse types', () => {
    expect(beats.length).toBeGreaterThan(4); // 인트로1+블록1장×1이던 기존 붕괴와 다름
    const types = new Set(beats.map((b) => b.scene_type));
    expect(types.size).toBeGreaterThanOrEqual(4);
  });

  it('applies an injected refiner (default noop passthrough)', () => {
    const reversedTitles: ScenePlanRefiner = {
      refine: (bs) => bs.map((b) => ({ ...b, headline: `${b.headline}!` })),
    };
    const refined = planScenesFromBrief(makeBrief(), reversedTitles);
    expect(refined[0].headline.endsWith('!')).toBe(true);
    expect(noopScenePlanRefiner.refine(beats, { title: 't' })).toBe(beats);
  });
});

describe('planScenesFromLogicBlocks', () => {
  it('plans body beats without hero/cta framing', () => {
    const beats = planScenesFromLogicBlocks(makeBrief().script.logic_blocks);
    expect(beats.length).toBeGreaterThan(1);
    expect(beats[0].scene_type).not.toBe('hero');
    for (const b of beats) {
      expect(b.duration).toBeLessThanOrEqual(SCENE_MAX_SECONDS);
      expect(b.emphasis && b.emphasis.length).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('planScenesFromSlides (legacy spec path)', () => {
  const slides: SlideSpec[] = [
    { index: 0, headline: '제목', visual_type: 'text', speaker_text: '인트로 문장입니다. 흥미로운 도입부죠.' },
    {
      index: 1,
      headline: '본문',
      visual_type: 'comparison',
      speaker_text: '저장과 예약은 완전히 다른 심리 상태예요. 반면 예약은 다른 문제죠.',
    },
    { index: 2, headline: '마무리', visual_type: 'text', speaker_text: '조용한 마무리 설명입니다.' },
  ];

  it('keeps hero first, honours visual hints, and guarantees a trailing cta', () => {
    const beats = planScenesFromSlides(slides);
    expect(beats[0].scene_type).toBe('hero');
    expect(beats[0].duration).toBeGreaterThanOrEqual(SCENE_TARGET_MIN_SECONDS);
    expect(beats.some((b) => b.scene_type === 'comparison')).toBe(true);
    expect(beats[beats.length - 1].scene_type).toBe('cta');
    for (const b of beats) {
      expect(b.duration).toBeLessThanOrEqual(SCENE_MAX_SECONDS);
      expect(b.emphasis && b.emphasis.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('returns empty for empty slides', () => {
    expect(planScenesFromSlides([])).toEqual([]);
  });
});
