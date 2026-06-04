import { runCmoStrategyTurn } from '../plan-turn';
import { STAGE_SCRIPT } from '../stage-script';
import type { CmoLLM } from '../types';

const ctx = (overrides = {}) => ({
  status: 'key_content_ideation' as const,
  project_title: 'AI 마케팅팀 콘텐츠',
  product: 'AI 마케팅 자동화 팀',
  target_audience: '작은 브랜드 대표',
  ...overrides,
});

describe('runCmoStrategyTurn (deterministic fallback)', () => {
  it('returns the stage-script prompt when no LLM is configured', async () => {
    const r = await runCmoStrategyTurn([], '키 콘텐츠 좀 잡아줘', ctx());
    expect(r.reply).toBe(STAGE_SCRIPT.key_content_ideation.prompt);
    expect(r.proposal).toBeNull();
    expect(r.gate).toBeNull();
    expect(r.ready_to_advance).toBe(false);
  });

  it('auto-builds an approval gate at a gate stage with default options', async () => {
    const r = await runCmoStrategyTurn([], '?', ctx({ status: 'key_content_approval' }));
    expect(r.gate).not.toBeNull();
    expect(r.gate!.gate_type).toBe('key_content_approval');
    expect(r.gate!.options).toEqual(['승인', '수정 요청', '다른 후보 보기', '보류']);
    expect(r.gate!.recommended_option).toBe('승인');
  });

  it('never raises a gate at a non-gate stage', async () => {
    const r = await runCmoStrategyTurn([], '?', ctx({ status: 'viewtrap_key_research' }));
    expect(r.gate).toBeNull();
  });
});

describe('runCmoStrategyTurn (LLM-driven)', () => {
  const llmReturning = (payload: object): CmoLLM => ({
    complete: async () => JSON.stringify(payload),
  });

  it('parses reply + proposal + ready flag from the model', async () => {
    const llm = llmReturning({
      reply: '키 콘텐츠 후보 3개를 잡았습니다.',
      ready_to_advance: true,
      proposal: { summary: '후보 3개', data: { candidates: ['a', 'b', 'c'] } },
      gate: null,
    });
    const r = await runCmoStrategyTurn([], '잡아줘', ctx(), { llm });
    expect(r.reply).toContain('키 콘텐츠 후보 3개');
    expect(r.ready_to_advance).toBe(true);
    expect(r.proposal).toEqual({
      stage: 'key_content_ideation',
      summary: '후보 3개',
      data: { candidates: ['a', 'b', 'c'] },
    });
  });

  it('parses a gate from the model at a gate stage and handles fenced JSON', async () => {
    const llm: CmoLLM = {
      complete: async () =>
        '```json\n' +
        JSON.stringify({
          reply: '키 콘텐츠 1개를 추천합니다.',
          ready_to_advance: true,
          proposal: { summary: '추천 키 콘텐츠' },
          gate: {
            title: '키 콘텐츠 확정',
            context: '고객 문제와 직접 연결됨',
            options: ['승인', '보류'],
            recommended_option: '승인',
          },
        }) +
        '\n```',
    };
    const r = await runCmoStrategyTurn([], '확정?', ctx({ status: 'key_content_approval' }), { llm });
    expect(r.gate!.title).toBe('키 콘텐츠 확정');
    expect(r.gate!.options).toEqual(['승인', '보류']);
  });

  it('falls back to the stage script when the model returns garbage', async () => {
    const llm: CmoLLM = { complete: async () => 'not json at all' };
    const r = await runCmoStrategyTurn([], '?', ctx(), { llm });
    expect(r.reply).toBe(STAGE_SCRIPT.key_content_ideation.prompt);
  });
});
