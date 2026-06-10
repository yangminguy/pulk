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

describe('runCmoStrategyTurn (second_brain_insights injection)', () => {
  it('buildUser includes second_brain_insights in the deterministic fallback reply path', async () => {
    // We verify by checking that the LLM receives the insights in the user prompt.
    // Use a spy LLM that captures the user string.
    let capturedUser = '';
    const llm = {
      complete: async ({ user }: { system: string; user: string }) => {
        capturedUser = user;
        return JSON.stringify({ reply: 'ok', ready_to_advance: false, proposal: null, gate: null });
      },
    };
    await runCmoStrategyTurn(
      [],
      '테스트',
      ctx({ second_brain_insights: ['문제에서 시작하라', '역순 기획'] }),
      { llm },
    );
    expect(capturedUser).toContain('세컨브레인(비즈니스 PT 강의) 인사이트');
    expect(capturedUser).toContain('- 문제에서 시작하라');
    expect(capturedUser).toContain('- 역순 기획');
  });

  it('does not add insights block when second_brain_insights is absent', async () => {
    let capturedUser = '';
    const llm = {
      complete: async ({ user }: { system: string; user: string }) => {
        capturedUser = user;
        return JSON.stringify({ reply: 'ok', ready_to_advance: false, proposal: null, gate: null });
      },
    };
    await runCmoStrategyTurn([], '테스트', ctx(), { llm });
    expect(capturedUser).not.toContain('세컨브레인(비즈니스 PT 강의) 인사이트');
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

  it('strips a fenced JSON blob embedded in reply, keeping only natural language', async () => {
    const llm = llmReturning({
      reply:
        '키 콘텐츠 후보 3개를 잡았습니다.\n```json\n{"candidates":["a","b","c"]}\n```\n확인해 주세요.',
      ready_to_advance: false,
      proposal: { summary: '후보 3개', data: { candidates: ['a', 'b', 'c'] } },
      gate: null,
    });
    const r = await runCmoStrategyTurn([], '잡아줘', ctx(), { llm });
    expect(r.reply).not.toContain('candidates');
    expect(r.reply).not.toContain('```');
    expect(r.reply).not.toContain('{');
    expect(r.reply).toContain('키 콘텐츠 후보 3개를 잡았습니다.');
    expect(r.reply).toContain('확인해 주세요.');
    // structured data is preserved only in the proposal
    expect(r.proposal!.data).toEqual({ candidates: ['a', 'b', 'c'] });
  });

  it('strips a bare object literal serialized into reply', async () => {
    const llm = llmReturning({
      reply: '추천안: {"title":"문제에서 시작","reason":"고객 문제"}',
      ready_to_advance: false,
      proposal: { summary: '추천', data: { title: '문제에서 시작' } },
      gate: null,
    });
    const r = await runCmoStrategyTurn([], '?', ctx(), { llm });
    expect(r.reply).not.toContain('{');
    expect(r.reply).not.toContain('"title"');
    expect(r.reply).toContain('추천안:');
  });

  it('falls back to the stage script when reply is entirely a JSON blob', async () => {
    const llm = llmReturning({
      reply: '{"candidates":["a","b"]}',
      ready_to_advance: false,
      proposal: { summary: '후보', data: { candidates: ['a', 'b'] } },
      gate: null,
    });
    const r = await runCmoStrategyTurn([], '?', ctx(), { llm });
    expect(r.reply).toBe(STAGE_SCRIPT.key_content_ideation.prompt);
    // proposal still carries the structured data
    expect(r.proposal!.data).toEqual({ candidates: ['a', 'b'] });
  });

  it('falls back to the stage script when the model returns garbage', async () => {
    const llm: CmoLLM = { complete: async () => 'not json at all' };
    const r = await runCmoStrategyTurn([], '?', ctx(), { llm });
    expect(r.reply).toBe(STAGE_SCRIPT.key_content_ideation.prompt);
  });
});
