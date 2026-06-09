import {
  proposeThumbnailDraft,
  proposeScriptDraft,
  type ThumbnailDraftInput,
  type ScriptDraftInput,
} from '../content-production';

const thumbInput: ThumbnailDraftInput = {
  content_id: 'cand-0',
  topic_title: '콘텐츠가 매출로 안 이어지는 진짜 이유',
  thumbnail_direction: '문제를 한 장에 압축',
  risk_notes: ['초기 가설 — 데이터 검증 필요'],
};

const scriptInput: ScriptDraftInput = {
  content_id: 'cand-0',
  content_type: 'key',
  topic_title: '콘텐츠가 매출로 안 이어지는 진짜 이유',
  target_viewer: '작은 브랜드 대표',
  materials: ['조회수는 높은데 매출이 안 난다', '콘텐츠와 상품 연결이 끊겨 있다'],
  voc_lines: ['영상은 잘 되는데 돈이 안 돼요'],
  safe_claims: ['구조를 바꾸면 전환이 오른다'],
};

function makeLlmThumbs(count: number): string {
  const arr = Array.from({ length: count }, (_u, i) => ({
    copy: `LLM 카피 ${i}`,
    visual_direction: `LLM 시각방향 ${i}`,
    click_logic: 'curiosity',
  }));
  return '```json\n' + JSON.stringify(arr) + '\n```';
}

describe('proposeThumbnailDraft', () => {
  it('주입 LLM 경로: LLM 후보를 사용한다', async () => {
    const result = await proposeThumbnailDraft(
      thumbInput,
      { llmComplete: async () => makeLlmThumbs(3) },
      3,
    );
    expect(result.candidates).toHaveLength(3);
    expect(result.candidates[0].copy).toBe('LLM 카피 0');
    // recommended는 candidates 안에 항상 존재.
    expect(result.candidates.some((c) => c.candidate_id === result.recommended)).toBe(true);
  });

  it('폴백 경로(미주입): buildThumbnailPlan 결정론 후보(>=3)', async () => {
    const result = await proposeThumbnailDraft(thumbInput);
    expect(result.candidates.length).toBeGreaterThanOrEqual(3);
    expect(result.thumbnail_direction).toBe('문제를 한 장에 압축');
    expect(result.candidates.some((c) => c.candidate_id === result.recommended)).toBe(true);
  });

  it('LLM 실패 시 결정론 폴백으로 회귀', async () => {
    const result = await proposeThumbnailDraft(
      thumbInput,
      { llmComplete: async () => 'not json', maxRetries: 1 },
      3,
    );
    expect(result.candidates.length).toBeGreaterThanOrEqual(3);
  });

  it('결정론: 동일 입력 → 동일 폴백 산출', async () => {
    const a = await proposeThumbnailDraft(thumbInput);
    const b = await proposeThumbnailDraft(thumbInput);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('proposeScriptDraft', () => {
  it('폴백 경로(미주입): intro/blocks/integrated/qa 4종 산출', async () => {
    const result = await proposeScriptDraft(scriptInput);
    expect(result.intro_30s.script.length).toBeGreaterThan(0);
    expect(result.logic_blocks.length).toBeGreaterThan(0);
    expect(result.integrated_script.full_script.length).toBeGreaterThan(0);
    expect(result.qa.overall_pass).toBe(true);
  });

  it('주입 LLM 경로: 통합 원고 본문을 LLM 결과로 덮어쓴다', async () => {
    const result = await proposeScriptDraft(scriptInput, {
      llmComplete: async () => '매끄럽게 다듬어진 전체 원고',
    });
    expect(result.integrated_script.full_script).toBe('매끄럽게 다듬어진 전체 원고');
    // 구조/QA는 결정론 유지.
    expect(result.qa.overall_pass).toBe(true);
  });

  it('LLM 실패 시 결정론 원고 유지', async () => {
    const det = await proposeScriptDraft(scriptInput);
    const withFail = await proposeScriptDraft(scriptInput, {
      llmComplete: async () => '',
      maxRetries: 0,
    });
    expect(withFail.integrated_script.full_script).toBe(det.integrated_script.full_script);
  });

  it('결정론: 동일 입력 → 동일 산출', async () => {
    const a = await proposeScriptDraft(scriptInput);
    const b = await proposeScriptDraft(scriptInput);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('VOC 미주입이어도 폴백으로 도입부 생성(throw 없음)', async () => {
    const result = await proposeScriptDraft({ ...scriptInput, voc_lines: [] });
    expect(result.intro_30s.script.length).toBeGreaterThan(0);
  });
});
