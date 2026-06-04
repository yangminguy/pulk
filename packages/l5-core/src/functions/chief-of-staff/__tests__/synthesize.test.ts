import { synthesizeDeliverable } from '../synthesize';
import type { SynthesisInput, TaskOutcome } from '../synthesize';
import type { LLMClient } from '../../ceo-orchestration/types';

function mockLLM(reply: string): LLMClient {
  return { complete: jest.fn().mockResolvedValue(reply) };
}
function throwingLLM(): LLMClient {
  return { complete: jest.fn().mockRejectedValue(new Error('LLM down')) };
}

function outcome(over: Partial<TaskOutcome> = {}): TaskOutcome {
  return {
    task: {
      id: over.task?.id ?? 't1',
      assigned_agent: over.task?.assigned_agent ?? 'CMO',
      title: over.task?.title ?? '시장 조사',
      expected_output: over.task?.expected_output ?? '경쟁사 리스트',
      status: over.task?.status ?? 'done',
      risk_level: over.task?.risk_level,
    },
    work_handoff: over.work_handoff,
    ceo_handoff: over.ceo_handoff,
  };
}

function baseInput(outcomes: TaskOutcome[]): SynthesisInput {
  return { instruction_text: '신규 사업 검토해줘', ceo_goal: '신규 사업 타당성 판단', outcomes };
}

describe('synthesizeDeliverable', () => {
  it('happy path: merges summaries by index, populates decision_summary', async () => {
    const outcomes = [
      outcome({ task: { id: 'a', assigned_agent: 'CMO', title: '시장', expected_output: 'x', status: 'done' } }),
      outcome({ task: { id: 'b', assigned_agent: 'CFO', title: '재무', expected_output: 'y', status: 'done' } }),
    ];
    const llm = mockLLM(
      JSON.stringify({
        decision_summary: '전체적으로 진행 가능.',
        contribution_summaries: [
          { task_id: 'a', summary: '시장 분석 완료' },
          { task_id: 'b', summary: '재무 모델 완료' },
        ],
        open_gaps: [],
        next_actions: [
          { kind: 'approve', label: '채택', target_agent: null, reason: '좋음' },
          { kind: 'hold', label: '보류', target_agent: null, reason: '대기' },
        ],
      })
    );

    const r = await synthesizeDeliverable(baseInput(outcomes), llm);

    expect(r.decision_summary).toBe('전체적으로 진행 가능.');
    expect(r.contributions).toHaveLength(2);
    expect(r.contributions[0].summary).toBe('시장 분석 완료');
    expect(r.contributions[1].summary).toBe('재무 모델 완료');
    expect(r.contributions[0].agent).toBe('CMO');
    expect(r.contributions[1].agent).toBe('CFO');
  });

  it('contributions integrity: LLM mismatched/short list cannot corrupt structure', async () => {
    const outcomes = [
      outcome({ task: { id: 'a', assigned_agent: 'CMO', title: '시장', expected_output: 'x', status: 'done' } }),
      outcome({
        task: { id: 'b', assigned_agent: 'CTO', title: '기술', expected_output: 'y', status: 'killed' },
        work_handoff: { what_was_completed: '기술 검토 중단', what_remains_open: '', next_action: '', context: '' },
      }),
    ];
    // LLM returns wrong-length, wrong agents — must be ignored for structure.
    const llm = mockLLM(
      JSON.stringify({
        decision_summary: 's',
        contribution_summaries: [{ task_id: 'zzz', summary: '엉뚱한 요약' }],
        open_gaps: [],
        next_actions: [],
      })
    );

    const r = await synthesizeDeliverable(baseInput(outcomes), llm);

    expect(r.contributions).toHaveLength(2);
    expect(r.contributions[0].agent).toBe('CMO');
    expect(r.contributions[0].status).toBe('done');
    expect(r.contributions[0].task_title).toBe('시장');
    expect(r.contributions[0].summary).toBe('엉뚱한 요약'); // index 0 merged
    expect(r.contributions[1].agent).toBe('CTO');
    expect(r.contributions[1].status).toBe('killed');
    expect(r.contributions[1].task_title).toBe('기술');
    // no summary at index 1 → falls back to work handoff completion note
    expect(r.contributions[1].summary).toBe('기술 검토 중단');
  });

  it('missing approve/hold: defaults injected so both always present', async () => {
    const outcomes = [outcome()];
    const llm = mockLLM(
      JSON.stringify({
        decision_summary: 's',
        contribution_summaries: [{ task_id: 't1', summary: 'ok' }],
        open_gaps: ['추가 데이터 필요'],
        next_actions: [{ kind: 'delegate', label: '위임', target_agent: 'CRO', reason: '영업 검증' }],
      })
    );

    const r = await synthesizeDeliverable(baseInput(outcomes), llm);

    // delegate is always dropped now (it spawned surprise tasks); approve+hold only.
    expect(r.next_actions.map((a) => a.kind)).toEqual(['approve', 'hold']);
  });

  it('delegate is dropped even when the LLM proposes one (no surprise tasks)', async () => {
    const outcomes = [outcome()];
    const llm = mockLLM(
      JSON.stringify({
        decision_summary: 's',
        contribution_summaries: [{ task_id: 't1', summary: 'ok' }],
        open_gaps: ['영업 검증 미완'],
        next_actions: [
          { kind: 'approve', label: '채택', target_agent: null, reason: 'r' },
          { kind: 'delegate', label: '위임', target_agent: 'CRO', reason: '영업 검증' },
          { kind: 'hold', label: '보류', target_agent: null, reason: 'r' },
        ],
      })
    );

    const r = await synthesizeDeliverable(baseInput(outcomes), llm);

    expect(r.next_actions.find((a) => a.kind === 'delegate')).toBeUndefined();
    expect(r.next_actions.map((a) => a.kind)).toEqual(['approve', 'hold']);
    // open_gaps are still surfaced as text (just not turned into a new task).
    expect(r.open_gaps).toEqual(['영업 검증 미완']);
  });

  it('contributions carry task_id so the inbox can open the full work', async () => {
    const outcomes = [outcome()];
    const llm = mockLLM(
      JSON.stringify({
        decision_summary: 's',
        contribution_summaries: [{ task_id: 't1', summary: 'ok' }],
        open_gaps: [],
        next_actions: [],
      })
    );

    const r = await synthesizeDeliverable(baseInput(outcomes), llm);
    expect(r.contributions[0].task_id).toBe(outcomes[0].task.id);
  });

  it('fallback: LLM throws → deterministic result, no throw', async () => {
    const outcomes = [
      outcome({
        task: { id: 'a', assigned_agent: 'CMO', title: '시장', expected_output: 'x', status: 'done' },
        work_handoff: { what_was_completed: '완료됨', what_remains_open: '가격 미정', next_action: '', context: '' },
      }),
      outcome({
        task: { id: 'b', assigned_agent: 'CFO', title: '재무', expected_output: 'y', status: 'killed' },
      }),
    ];

    const r = await synthesizeDeliverable(baseInput(outcomes), throwingLLM());

    expect(r.decision_summary).toBe('신규 사업 타당성 판단 — 1개 작업 완료');
    expect(r.contributions).toHaveLength(2);
    expect(r.contributions[0].summary).toBe('완료됨');
    expect(r.open_gaps).toEqual(['가격 미정']);
    const kinds = r.next_actions.map((a) => a.kind);
    expect(kinds).toEqual(['approve', 'hold']);
  });

  it('fallback: unrecoverable JSON → deterministic result', async () => {
    const outcomes = [outcome({ work_handoff: { what_was_completed: 'done', what_remains_open: '', next_action: '', context: '' } })];
    const r = await synthesizeDeliverable(baseInput(outcomes), mockLLM('not json at all'));
    expect(r.contributions[0].summary).toBe('done');
    expect(r.next_actions.map((a) => a.kind)).toEqual(['approve', 'hold']);
  });

  it('JSON-in-fence: parses fenced JSON', async () => {
    const outcomes = [outcome()];
    const fenced =
      '여기 결과입니다:\n```json\n' +
      JSON.stringify({
        decision_summary: '펜스 안 요약',
        contribution_summaries: [{ task_id: 't1', summary: '펜스 요약' }],
        open_gaps: [],
        next_actions: [
          { kind: 'approve', label: '채택', target_agent: null, reason: 'r' },
          { kind: 'hold', label: '보류', target_agent: null, reason: 'r' },
        ],
      }) +
      '\n```';
    const r = await synthesizeDeliverable(baseInput(outcomes), mockLLM(fenced));
    expect(r.decision_summary).toBe('펜스 안 요약');
    expect(r.contributions[0].summary).toBe('펜스 요약');
  });

  it('empty outcomes: returns empty contributions, defaults present', async () => {
    const llm = mockLLM(
      JSON.stringify({
        decision_summary: '작업 없음',
        contribution_summaries: [],
        open_gaps: [],
        next_actions: [],
      })
    );
    const r = await synthesizeDeliverable(baseInput([]), llm);
    expect(r.contributions).toEqual([]);
    expect(r.next_actions.map((a) => a.kind)).toEqual(['approve', 'hold']);
  });

  it('missing summary at index falls back to "(요약 없음)" when no work handoff', async () => {
    const outcomes = [outcome()]; // no work_handoff
    const llm = mockLLM(
      JSON.stringify({
        decision_summary: 's',
        contribution_summaries: [],
        open_gaps: [],
        next_actions: [],
      })
    );
    const r = await synthesizeDeliverable(baseInput(outcomes), llm);
    expect(r.contributions[0].summary).toBe('(요약 없음)');
  });
});
