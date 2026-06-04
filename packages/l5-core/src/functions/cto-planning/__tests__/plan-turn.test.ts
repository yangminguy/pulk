import { runCtoPlanningTurn } from '../plan-turn';
import type { CtoPlanningMessage } from '../types';
import type { LLMClient } from '../../ceo-orchestration/types';

const mockLLM = (response: string): LLMClient => ({
  complete: async () => response,
});

const HISTORY: CtoPlanningMessage[] = [
  { role: 'founder', text: '세컨 브레인에 검색 기능 넣고 싶어' },
  { role: 'cto', text: '어떤 검색을 원하세요?' },
];

describe('runCtoPlanningTurn', () => {
  it('falls back to a clarifying reply with no LLM', async () => {
    const res = await runCtoPlanningTurn(HISTORY, '음 잘 모르겠어');
    expect(res.plan).toBeNull();
    expect(res.reply).toContain('구체적으로');
  });

  it('returns reply only when the CTO is not ready', async () => {
    const llm = mockLLM(JSON.stringify({ reply: '예산은 어느 정도인가요?', ready: false }));
    const res = await runCtoPlanningTurn(HISTORY, '키워드 검색', { }, { llm });
    expect(res.reply).toBe('예산은 어느 정도인가요?');
    expect(res.plan).toBeNull();
  });

  it('returns a full plan when the CTO is ready', async () => {
    const llm = mockLLM(
      JSON.stringify({
        reply: '이렇게 진행하면 어떨까요?',
        ready: true,
        plan: {
          prd: '검색 기능 PRD',
          roadmap_items: [
            { title: '검색 인덱싱', summary: '문서 색인', objective: '색인 완료', sequence: 1 },
            { title: '검색 UI', summary: '검색창', objective: '검색 가능', sequence: 2 },
          ],
          tasks: [
            { title: '인덱서 구현', rationale: '문서를 색인', expected_output: '인덱서', roadmap_sequence: 1 },
            { title: '검색창 구현', rationale: '입력 UI', expected_output: '검색창', roadmap_sequence: 2 },
          ],
          project_proposal: null,
        },
      }),
    );
    const res = await runCtoPlanningTurn(HISTORY, '키워드 검색이면 충분해', {}, { llm });
    expect(res.plan).not.toBeNull();
    expect(res.plan!.prd).toBe('검색 기능 PRD');
    expect(res.plan!.roadmap_items).toHaveLength(2);
    expect(res.plan!.tasks).toHaveLength(2);
    expect(res.plan!.project_proposal).toBeNull();
  });

  it('captures a new-project proposal', async () => {
    const llm = mockLLM(
      JSON.stringify({
        reply: '이건 별도 프로젝트가 좋겠어요.',
        ready: true,
        plan: {
          prd: '신규 모바일 앱 PRD',
          roadmap_items: [{ title: 'MVP', summary: 'x', objective: 'y', sequence: 1 }],
          tasks: [{ title: '앱 골격', rationale: 'r', expected_output: 'o', roadmap_sequence: 1 }],
          project_proposal: {
            is_new_project: true,
            business_id: '4',
            suggested_project_title: '세컨브레인 모바일',
            rationale: '기존 웹과 분리된 새 플랫폼',
          },
        },
      }),
    );
    const res = await runCtoPlanningTurn(HISTORY, '모바일 앱으로 새로 가자', {}, { llm });
    expect(res.plan!.project_proposal).not.toBeNull();
    expect(res.plan!.project_proposal!.is_new_project).toBe(true);
    expect(res.plan!.project_proposal!.business_id).toBe('4');
    expect(res.plan!.project_proposal!.suggested_project_title).toBe('세컨브레인 모바일');
  });

  it('clamps task roadmap_sequence to a valid range and renumbers roadmap', async () => {
    const llm = mockLLM(
      JSON.stringify({
        reply: 'ok',
        ready: true,
        plan: {
          prd: 'p',
          roadmap_items: [
            { title: 'A', summary: '', objective: '', sequence: 5 },
            { title: 'B', summary: '', objective: '', sequence: 9 },
          ],
          tasks: [{ title: 'T', rationale: '', expected_output: '', roadmap_sequence: 99 }],
        },
      }),
    );
    const res = await runCtoPlanningTurn(HISTORY, 'go', {}, { llm });
    expect(res.plan!.roadmap_items.map((r) => r.sequence)).toEqual([1, 2]);
    expect(res.plan!.tasks[0].roadmap_sequence).toBe(2); // clamped to roadmap length
  });

  it('treats ready=true with an empty plan as not ready', async () => {
    const llm = mockLLM(
      JSON.stringify({ reply: '...', ready: true, plan: { prd: '', roadmap_items: [], tasks: [] } }),
    );
    const res = await runCtoPlanningTurn(HISTORY, 'x', {}, { llm });
    expect(res.plan).toBeNull();
  });

  it('falls back to a reply when the LLM returns garbage', async () => {
    const llm = mockLLM('not json at all');
    const res = await runCtoPlanningTurn(HISTORY, 'x', {}, { llm });
    expect(res.plan).toBeNull();
    expect(res.reply).toContain('구체적으로');
  });
});
