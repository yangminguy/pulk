import {
  generateRoadmapFromPRD,
  fallbackRoadmap,
} from '../generate-roadmap';
import type { LLMClient } from '../../ceo-orchestration/types';

const mockLLM = (response: string): LLMClient => ({
  complete: async () => response,
});

describe('fallbackRoadmap', () => {
  it('derives milestones from a numbered/bulleted PRD', () => {
    const items = fallbackRoadmap({
      prd: '- 회원 가입 흐름\n- 대시보드 화면\n- 결제 연동',
    });
    expect(items).toHaveLength(3);
    expect(items[0].title).toBe('회원 가입 흐름');
    expect(items.map((i) => i.sequence)).toEqual([1, 2, 3]);
  });

  it('falls to markdown headings when no bullets', () => {
    const items = fallbackRoadmap({
      prd: '# 인증\n본문\n## 결제\n본문',
    });
    expect(items.map((i) => i.title)).toEqual(['인증', '결제']);
  });

  it('falls to paragraphs when no bullets/headings', () => {
    const items = fallbackRoadmap({
      prd: '첫 번째 문단입니다.\n\n두 번째 문단입니다.',
    });
    expect(items).toHaveLength(2);
  });

  it('returns a single item for empty/unstructured PRD', () => {
    const items = fallbackRoadmap({ prd: '', project_title: '내 제품' });
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('내 제품');
    expect(items[0].sequence).toBe(1);
  });

  it('clamps to max_items and renumbers sequence', () => {
    const items = fallbackRoadmap(
      { prd: '- a\n- b\n- c\n- d\n- e' },
      2,
    );
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.sequence)).toEqual([1, 2]);
  });
});

describe('generateRoadmapFromPRD', () => {
  it('uses the deterministic fallback when no LLM is provided', async () => {
    const items = await generateRoadmapFromPRD({ prd: '- 하나\n- 둘' });
    expect(items).toHaveLength(2);
    expect(items[0].title).toBe('하나');
  });

  it('uses LLM output when the model returns valid JSON', async () => {
    const llm = mockLLM(
      JSON.stringify({
        items: [
          { title: '온보딩', summary: '가입과 첫 사용', objective: '가입 가능', sequence: 1 },
          { title: '핵심 기능', summary: '메인 가치', objective: '핵심 동작', sequence: 2 },
        ],
      }),
    );
    const items = await generateRoadmapFromPRD({ prd: '아무 PRD' }, { llm });
    expect(items).toHaveLength(2);
    expect(items[0].title).toBe('온보딩');
    expect(items[1].objective).toBe('핵심 동작');
  });

  it('parses LLM output wrapped in a markdown fence', async () => {
    const llm = mockLLM(
      '```json\n{"items":[{"title":"A","summary":"s","objective":"o","sequence":1}]}\n```',
    );
    const items = await generateRoadmapFromPRD({ prd: 'x' }, { llm });
    expect(items[0].title).toBe('A');
  });

  it('falls back when the LLM returns unusable output', async () => {
    const llm = mockLLM('죄송합니다 JSON을 만들 수 없습니다');
    const items = await generateRoadmapFromPRD(
      { prd: '- 폴백항목1\n- 폴백항목2' },
      { llm },
    );
    expect(items[0].title).toBe('폴백항목1');
  });

  it('renumbers sequence contiguously from LLM output', async () => {
    const llm = mockLLM(
      JSON.stringify({
        items: [
          { title: 'X', summary: '', objective: '', sequence: 9 },
          { title: 'Y', summary: '', objective: '', sequence: 3 },
        ],
      }),
    );
    const items = await generateRoadmapFromPRD({ prd: 'x' }, { llm });
    expect(items.map((i) => i.sequence)).toEqual([1, 2]);
  });
});
