// S1(scout) + S3(critic summary) + S5(모호성 게이트) + S6(acceptance criteria) 테스트.

import { runCtoPlanningTurn } from '../plan-turn';
import {
  scoutRepo,
  extractScoutKeywords,
  formatScoutForPrompt,
  type ScoutDeps,
  type RepoScoutReport,
} from '../scout';
import { buildCriticSummary, runCriticPanel } from '../critic';
import type { LLMClient } from '../../ceo-orchestration/types';

function llmReturning(outputs: string[]): LLMClient & { users: string[] } {
  let i = 0;
  const users: string[] = [];
  return {
    users,
    async complete({ user }) {
      users.push(user);
      const out = outputs[Math.min(i, outputs.length - 1)];
      i++;
      return out;
    },
  };
}

const PLAN_JSON = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    reply: '계획을 제안합니다.',
    ready: true,
    open_questions: [],
    plan: {
      prd: '테스트 PRD',
      roadmap_items: [{ title: 'R1', summary: 's', objective: 'o', sequence: 1 }],
      tasks: [
        {
          title: 'T1',
          rationale: 'r',
          expected_output: 'src/a.ts',
          roadmap_sequence: 1,
          size: 'small',
          acceptance_criteria: ['pnpm test -- a 통과', 'a.ts export 존재'],
        },
      ],
      project_proposal: null,
    },
    ...extra,
  });

describe('S5 모호성 게이트', () => {
  it('blocking open_question이 있으면 plan을 확정하지 않고 질문을 reply에 붙인다', async () => {
    const llm = llmReturning([
      PLAN_JSON({
        open_questions: [
          { question: '저장 위치는 어디인가요?', blocking: true },
          { question: '색상 취향', blocking: false },
        ],
      }),
    ]);
    const r = await runCtoPlanningTurn([], '기능 만들어줘', {}, { llm });
    expect(r.plan).toBeNull();
    expect(r.reply).toContain('저장 위치는 어디인가요?');
    expect(r.open_questions?.filter((q) => q.blocking)).toHaveLength(1);
  });

  it('blocking이 없으면 plan이 통과한다', async () => {
    const llm = llmReturning([PLAN_JSON()]);
    const r = await runCtoPlanningTurn([], '기능 만들어줘', {}, { llm });
    expect(r.plan).not.toBeNull();
    expect(r.open_questions).toEqual([]);
  });
});

describe('S6 acceptance criteria', () => {
  it('태스크의 acceptance_criteria가 정규화되어 보존된다', async () => {
    const llm = llmReturning([PLAN_JSON()]);
    const r = await runCtoPlanningTurn([], '기능', {}, { llm });
    expect(r.plan!.tasks[0]!.acceptance_criteria).toEqual([
      'pnpm test -- a 통과',
      'a.ts export 존재',
    ]);
  });

  it('비문자열/빈 criteria는 걸러진다', async () => {
    const raw = JSON.parse(PLAN_JSON());
    raw.plan.tasks[0].acceptance_criteria = ['ok', '', 3, null];
    const llm = llmReturning([JSON.stringify(raw)]);
    const r = await runCtoPlanningTurn([], '기능', {}, { llm });
    expect(r.plan!.tasks[0]!.acceptance_criteria).toEqual(['ok']);
  });
});

describe('S4 재시도 배선', () => {
  it('1차 깨진 출력 → 2차 재시도로 plan 확보', async () => {
    const llm = llmReturning(['garbage not json', PLAN_JSON()]);
    const r = await runCtoPlanningTurn([], '기능', {}, { llm });
    expect(r.plan).not.toBeNull();
    expect(llm.users).toHaveLength(2);
    expect(llm.users[1]).toContain('[재시도 지시]');
  });
});

describe('S1 scout', () => {
  const FS: Record<string, string[] | string> = {
    '/repo': ['packages', 'services', 'README.md'],
    '/repo/packages': ['l5-core'],
    '/repo/packages/l5-core': ['package.json', 'src'],
    '/repo/packages/l5-core/package.json': JSON.stringify({
      name: '@l5/core',
      description: '도메인 로직',
    }),
    '/repo/packages/l5-core/src': ['notion-sync.ts'],
    '/repo/services': ['notion-gateway'],
    '/repo/services/notion-gateway': ['package.json'],
    '/repo/services/notion-gateway/package.json': JSON.stringify({ name: '@l5/notion-gateway' }),
  };
  const deps: ScoutDeps = {
    readdir: (p) => (Array.isArray(FS[p]) ? (FS[p] as string[]) : []),
    readFile: (p) => (typeof FS[p] === 'string' ? (FS[p] as string) : null),
    isDirectory: (p) => Array.isArray(FS[p]),
  };

  it('모듈 지도와 키워드 매칭을 만든다', () => {
    const r = scoutRepo('/repo', ['notion'], deps);
    expect(r.modules.map((m) => m.path)).toContain('packages/l5-core');
    expect(r.keyword_matches.some((m) => m.path.includes('notion'))).toBe(true);
    expect(r.warnings).toEqual([]);
  });

  it('읽을 수 없는 repo는 warnings만 남기고 빈 리포트', () => {
    const r = scoutRepo('/nope', ['x'], deps);
    expect(r.modules).toEqual([]);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it('키워드 추출: 불용어 제거 + 최대 8개', () => {
    const kws = extractScoutKeywords('notion 동기화 기능 만들어줘 slack 게이트웨이');
    expect(kws).toContain('notion');
    expect(kws).toContain('slack');
    expect(kws).not.toContain('만들어줘');
  });

  it('프롬프트 주입: buildUser에 실측 섹션이 들어간다', async () => {
    const scout: RepoScoutReport = {
      repo_path: '/repo',
      modules: [{ path: 'packages/l5-core', summary: '@l5/core' }],
      keyword_matches: [{ path: 'src/notion-sync.ts', reason: "이름에 키워드 'notion' 포함" }],
      warnings: [],
    };
    const llm = llmReturning([PLAN_JSON()]);
    await runCtoPlanningTurn([], 'notion 기능', { repo_scout: scout }, { llm });
    expect(llm.users[0]).toContain('[repo 실측 — 기존 모듈]');
    expect(llm.users[0]).toContain('src/notion-sync.ts');
  });

  it('formatScoutForPrompt: 빈 리포트는 null', () => {
    expect(
      formatScoutForPrompt({ repo_path: '/r', modules: [], keyword_matches: [], warnings: [] }),
    ).toBeNull();
  });
});

describe('S3 critic', () => {
  it('runCriticPanel: 3관점 병렬 실행 + must_fix 집계', async () => {
    const verdict = (lens: string, sev: string) =>
      JSON.stringify({ score: 3, issues: [{ severity: sev, note: `${lens} 지적`, target: 'T1' }] });
    let call = 0;
    const llm: LLMClient = {
      async complete({ system }) {
        call++;
        if (system.includes('단순화')) return verdict('simplify', 'must_fix');
        if (system.includes('리스크')) return verdict('risk', 'warn');
        return verdict('verifiability', 'warn');
      },
    };
    const plan = JSON.parse(PLAN_JSON()).plan;
    const r = await runCriticPanel(plan, llm);
    expect(call).toBe(3);
    expect(r.verdicts).toHaveLength(3);
    expect(r.must_fix_count).toBe(1);
    expect(r.summary).toContain('⛔ simplify 지적');
  });

  it('일부 관점 실패는 graceful 누락', async () => {
    let call = 0;
    const llm: LLMClient = {
      async complete() {
        call++;
        if (call <= 2) throw new Error('down'); // simplify 1차+재시도 실패
        return JSON.stringify({ score: 4, issues: [] });
      },
    };
    const plan = JSON.parse(PLAN_JSON()).plan;
    const r = await runCriticPanel(plan, llm, { lenses: ['simplify', 'risk'] });
    expect(r.verdicts.length).toBeGreaterThanOrEqual(1);
    expect(r.summary).not.toBeNull();
  });

  it('buildCriticSummary: 빈 판정 → null', () => {
    expect(buildCriticSummary([])).toBeNull();
  });
});
