import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runCTOAgent, extractTeamFeatures } from './cto.js';
import type { LLMClient } from '@l5/core';

type Complete = LLMClient['complete'];

describe('extractTeamFeatures (§29 multi-feature decomposition)', () => {
  it('returns a single feature when the task has no subtasks (solo run)', () => {
    const task = { id: 't1', title: 'Add login API', rationale: 'users need auth' } as never;
    const features = extractTeamFeatures(task, 'C2', 'FEATURE', ['.env']);
    expect(features).toHaveLength(1);
    expect(features[0]!.objective).toBe('Add login API');
    expect(features[0]!.acceptanceCriteria).toEqual(['users need auth']);
    expect(features[0]!.blockedFiles).toEqual(['.env']);
  });

  it('fans out one feature per subtask when 2+ subtasks exist (team run)', () => {
    const task = {
      id: 't2',
      title: 'Build dashboard',
      subtasks: [
        { objective: 'Build chart component', rationale: 'render metrics' },
        { title: 'Add data API endpoint' },
      ],
    } as never;
    const features = extractTeamFeatures(task, 'C3', 'FEATURE', ['.env']);
    expect(features).toHaveLength(2);
    expect(features[0]!.objective).toBe('Build chart component');
    expect(features[0]!.acceptanceCriteria).toEqual(['render metrics']);
    expect(features[1]!.objective).toBe('Add data API endpoint');
    // UI keyword routes to the ui domain (deterministic inference).
    expect(features[0]!.domains).toContain('ui');
  });

  it('ignores blank/empty subtasks and falls back to solo when <2 valid', () => {
    const task = {
      id: 't3',
      title: 'Single thing',
      subtasks: [{ objective: '   ' }, { title: '' }],
    } as never;
    const features = extractTeamFeatures(task, 'C1', 'FEATURE', []);
    expect(features).toHaveLength(1);
    expect(features[0]!.objective).toBe('Single thing');
  });
});

function makeLLM(responses: Array<string | Error | null>): LLMClient {
  let i = 0;
  const complete: Complete = async () => {
    const r = responses[i++];
    if (r instanceof Error) throw r;
    if (r === null) throw new Error('null response');
    return r;
  };
  return { complete };
}

// LLM that records how many times complete() is invoked — used to prove the
// deterministic path never calls the model.
function makeCountingLLM(): LLMClient & { calls: () => number } {
  let n = 0;
  return {
    complete: (async () => {
      n++;
      return JSON.stringify(VALID_LLM_PHASES);
    }) as Complete,
    calls: () => n,
  };
}

const TASK = {
  id: 't-1',
  title: 'Add login validation',
  rationale: 'Prevent malformed payloads from crashing the API',
  expected_output: 'Validated login endpoint',
};

// FEATURE class: research → spec → test → implement → review → commit (6 phases)
const VALID_LLM_PHASES = {
  task_class: 'FEATURE',
  phases: [
    {
      kind: 'research',
      name: '오픈소스 조사',
      runtime: 'claude',
      read_only: true,
      acceptance_criteria: ['후보 비교표', '채택 근거'],
      verifier_hint: '비교표 확인',
      prompt_packet: 'research libs',
      expected_output: 'comparison table',
      risk_level: 'D1',
    },
    {
      kind: 'spec',
      name: '스펙 작성',
      runtime: 'claude',
      read_only: true,
      dependsOn: ['research'],
      acceptance_criteria: ['요구사항 명세', '측정 가능한 criteria', '영향 파일 목록'],
      verifier_hint: 'spec 산출물 존재 확인',
      prompt_packet: 'write spec',
      expected_output: 'spec doc',
      risk_level: 'D1',
    },
    {
      kind: 'test',
      name: '실패 테스트',
      runtime: 'codex',
      read_only: false,
      dependsOn: ['spec'],
      acceptance_criteria: ['실패 테스트 추가', 'red 확인'],
      verifier_hint: '신규 테스트 fail 확인',
      prompt_packet: 'write failing test',
      expected_output: 'red test',
      risk_level: 'D2',
    },
    {
      kind: 'implement',
      name: '구현',
      runtime: 'codex',
      read_only: false,
      dependsOn: ['test'],
      acceptance_criteria: ['테스트 pass', '회귀 없음'],
      verifier_hint: 'pnpm test green',
      prompt_packet: 'implement',
      expected_output: 'code',
      risk_level: 'D2',
    },
    {
      kind: 'review',
      name: '리뷰',
      runtime: 'claude',
      read_only: true,
      dependsOn: ['implement'],
      acceptance_criteria: ['LGTM 또는 fix list'],
      verifier_hint: '리뷰 코멘트 명시',
      prompt_packet: 'review diff',
      expected_output: 'review',
      risk_level: 'D1',
    },
    {
      kind: 'commit',
      name: '커밋',
      runtime: 'claude',
      read_only: false,
      dependsOn: ['review'],
      acceptance_criteria: ['atomic commit 메시지', '1개 commit 추가'],
      verifier_hint: 'git log 1개 commit',
      prompt_packet: 'commit',
      expected_output: 'commit sha',
      risk_level: 'D2',
    },
  ],
};

// Silence ACR network warnings during tests.
const ORIG_FETCH = global.fetch;
beforeAll(() => {
  global.fetch = (async () =>
    new Response(JSON.stringify({ ok: true }), { status: 200 })) as typeof fetch;
});
afterAll(() => {
  global.fetch = ORIG_FETCH;
});

// These exercise the opt-in LLM phase planner (ACR_DETERMINISTIC_PHASES=0).
describe('runCTOAgent — dev workflow SOP enforcement (LLM planner)', () => {
  beforeEach(() => {
    process.env.ACR_DETERMINISTIC_PHASES = '0';
  });
  afterEach(() => {
    delete process.env.ACR_DETERMINISTIC_PHASES;
  });

  it('uses the LLM phases when the response is a valid FEATURE SOP (6 stages)', async () => {
    const llm = makeLLM([JSON.stringify(VALID_LLM_PHASES)]);

    const out = await runCTOAgent({ task: TASK }, { llm });

    expect(out.clarifying_questions).toBeUndefined();
    expect(out.acr_intent.phases).toHaveLength(6);
    // L5 single-approval: any intent reaching dispatch has cleared L5's gate
    // (the Hermes dispatcher only forwards approval_required=false tasks), so
    // ACR can clear its own manual_founder gate from this flag.
    expect(out.acr_intent.l5_approved).toBe(true);
    expect(out.acr_intent.phases.map((p) => p.name)).toEqual([
      '오픈소스 조사',
      '스펙 작성',
      '실패 테스트',
      '구현',
      '리뷰',
      '커밋',
    ]);
  });

  it('retries once when the LLM returns only 4 phases, then falls back to deterministic FEATURE SOP', async () => {
    const fourPhase = { task_class: 'FEATURE', phases: VALID_LLM_PHASES.phases.slice(0, 4) };
    const llm = makeLLM([JSON.stringify(fourPhase), JSON.stringify(fourPhase)]);

    const out = await runCTOAgent({ task: TASK }, { llm });

    // Deterministic FEATURE fallback returns 6 phases.
    expect(out.acr_intent.phases).toHaveLength(6);
    expect(out.acr_intent.phases.map((p) => p.name)).toEqual([
      '오픈소스 조사',
      '스펙 작성',
      '실패 테스트 작성',
      '구현',
      '리뷰',
      '커밋',
    ]);
  });

  it('falls back to deterministic SOP when the LLM throws', async () => {
    const llm = makeLLM([new Error('network down')]);

    const out = await runCTOAgent({ task: TASK }, { llm });

    // TASK title "Add login validation" → FEATURE (6 phases)
    expect(out.acr_intent.phases).toHaveLength(6);
    expect(out.acr_intent.phases[0]!.name).toBe('오픈소스 조사');
    expect(out.acr_intent.phases[5]!.name).toBe('커밋');
  });

  it('falls back to deterministic SOP when no LLM is available', async () => {
    const out = await runCTOAgent({ task: TASK }, { llm: null });

    // TASK title "Add login validation" → FEATURE (6 phases)
    expect(out.acr_intent.phases).toHaveLength(6);
    // M9.3 tier→runtime: T1→claude, T2→codex, T3→antigravity. FEATURE phases map
    // research/spec/review (T1)→claude, test/implement (T2)→codex, commit (T3)→
    // antigravity — the verified-live claude3/codex2/agy1 distribution.
    expect(out.acr_intent.phases.map((p) => p.runtime)).toEqual([
      'claude',      // research (T1)
      'claude',      // spec (T1)
      'codex',       // test (T2)
      'codex',       // implement (T2)
      'claude',      // review (T1)
      'antigravity', // commit (T3)
    ]);
  });

  it('surfaces clarifying_questions when the LLM returns them and skips ACR dispatch path', async () => {
    const llm = makeLLM([
      JSON.stringify({
        clarifying_questions: [
          '로그인은 OAuth 인가요, 자체 인증인가요?',
          '에러 응답 포맷은 무엇인가요?',
        ],
      }),
    ]);

    const out = await runCTOAgent({ task: TASK }, { llm });

    expect(out.clarifying_questions).toEqual([
      '로그인은 OAuth 인가요, 자체 인증인가요?',
      '에러 응답 포맷은 무엇인가요?',
    ]);
    expect(out.requires_founder_approval).toBe(true);
    expect(out.decision).toMatch(/clarification/);
  });
});

// B1: deterministic phase generation is the DEFAULT — no LLM round-trip, no
// retry loop, no LLM clarifying-question escalation.
describe('runCTOAgent — deterministic phases (default)', () => {
  it('never calls the LLM and returns the deterministic FEATURE SOP', async () => {
    const llm = makeCountingLLM();

    const out = await runCTOAgent({ task: TASK }, { llm });

    expect(llm.calls()).toBe(0); // model never invoked
    expect(out.clarifying_questions).toBeUndefined();
    expect(out.acr_intent.phases).toHaveLength(6);
    expect(out.acr_intent.phases.map((p) => p.name)).toEqual([
      '오픈소스 조사',
      '스펙 작성',
      '실패 테스트 작성',
      '구현',
      '리뷰',
      '커밋',
    ]);
  });

  it('classifies a single-component task as SMALL_FIX (4 phases) without the LLM', async () => {
    const llm = makeCountingLLM();

    const out = await runCTOAgent(
      {
        task: {
          id: 't-2',
          title: 'Add RoadmapMiniCard 카드 컴포넌트',
          rationale: '로드맵 요약 카드 하나 추가',
          expected_output: 'RoadmapMiniCard 렌더',
        },
      },
      { llm },
    );

    expect(llm.calls()).toBe(0);
    // SMALL_FIX SOP = repro → fix → regress → commit (4 phases), not the 6-phase
    // FEATURE ceremony — the single-component heuristic at work.
    expect(out.acr_intent.phases).toHaveLength(4);
  });

  // B5: quota-aware routing — an exhausted tier must not be dispatched to.
  it('routes off an exhausted tier (no dead-tier dispatch)', async () => {
    const quotaPath = join(tmpdir(), `quota-${process.pid}-${Date.now()}.json`);
    // FEATURE test/implement phases are T2→codex; mark T2 exhausted.
    writeFileSync(quotaPath, JSON.stringify({ tiers: { T2: { available: false } } }));
    process.env.ACR_QUOTA_TRACKER_PATH = quotaPath;
    try {
      const out = await runCTOAgent({ task: TASK }, { llm: null });
      const runtimes = out.acr_intent.phases.map((p) => p.runtime);
      expect(runtimes).not.toContain('codex'); // T2 dead → never routed there
    } finally {
      delete process.env.ACR_QUOTA_TRACKER_PATH;
      unlinkSync(quotaPath);
    }
  });
});
