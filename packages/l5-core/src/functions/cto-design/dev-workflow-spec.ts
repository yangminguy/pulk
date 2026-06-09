/**
 * Phase: CTO Dev Workflow SOP
 *
 * Forces the CTO agent to decompose every technical task into the appropriate
 * phase set based on task classification (TaskClass). The CTO is the sole
 * authority for classification — neither the CEO nor decomposer participates.
 *
 * Classification-to-phase mapping:
 *   SMALL_FIX:  repro → fix → regress → commit
 *   FEATURE:    research → spec → test → implement → integrate → review → commit
 *   BIG_CHANGE: rfc → spec → test → implement → integrate → review → commit
 *   OPS:        backup → implement → smoke → commit
 *   RESEARCH:   research
 *   REFACTOR:   regress → refactor → regress → commit
 *
 * The `integrate` phase (FEATURE/BIG_CHANGE only) exists to prevent the
 * "built but not wired" failure mode: an implement phase can land a new file
 * that passes its own tests yet is never registered with the orchestrator,
 * exported from the barrel, or reachable from an existing entry point. Without
 * an explicit wiring step the build stays green while the deliverable sits
 * orphaned. integrate forces that connection before review/commit.
 *
 * This module is intentionally pure — no NocoBase, no network, no LLM. The
 * CTO agent (in services/agent-runtime) wires it into the runtime.
 */

/** Six task classes the CTO can assign. */
export type TaskClass =
  | 'TINY'
  | 'SMALL_FIX'
  | 'FEATURE'
  | 'BIG_CHANGE'
  | 'OPS'
  | 'RESEARCH'
  | 'REFACTOR';

export type DevPhaseKind =
  | 'spec'
  | 'test'
  | 'implement'
  | 'integrate'
  | 'review'
  | 'commit'
  | 'repro'
  | 'fix'
  | 'regress'
  | 'research'
  | 'rfc'
  | 'refactor'
  | 'backup'
  | 'smoke';

export interface DevPhaseTemplate {
  kind: DevPhaseKind;
  /** Korean phase name surfaced to operators and downstream runtimes. */
  name: string;
  runtime: 'claude' | 'codex';
  /** When true, the phase must not mutate repo state (no git writes, no edits). */
  read_only: boolean;
  /** Each phase's exit conditions — must be measurable. */
  acceptance_criteria: string[];
  /** Hint passed to the verifier (cto-verify) describing what to check. */
  verifier_hint: string;
  /** Other phase kinds that must complete before this one. */
  dependsOn?: DevPhaseKind[];
}

/**
 * Phase templates keyed by TaskClass. Each entry defines the canonical
 * phase set for that class. Order is load-bearing within each array.
 */
export const DEV_WORKFLOW_TEMPLATES: Record<TaskClass, DevPhaseTemplate[]> = {
  // TINY — trivial work (one small function, a typo, a one-liner). No research/
  // spec/test/review ceremony: implement directly, then commit. Keeps cold-start
  // count minimal (2 phases vs FEATURE's 6) so small tasks finish in seconds, not
  // minutes. classifyTask only routes here on explicit trivial signals.
  TINY: [
    {
      kind: 'implement',
      name: '구현',
      runtime: 'claude',
      read_only: false,
      acceptance_criteria: [
        '요청한 변경이 실제 코드로 구현되었다',
        '변경 범위가 요청에 한정되어 있다 (surgical)',
        '기존 테스트 회귀가 없다',
      ],
      verifier_hint:
        '요청한 변경이 실제로 구현되었는지, 범위가 최소인지 확인한다.',
    },
    {
      kind: 'commit',
      name: '커밋',
      runtime: 'claude',
      read_only: false,
      dependsOn: ['implement'],
      acceptance_criteria: [
        '단일 atomic commit이 변경 내용과 일치한다',
        'git log 상에 정확히 1개의 신규 commit이 추가되었다',
      ],
      verifier_hint:
        'git log를 확인해 정확히 1개의 신규 commit이 추가되었는지 검증한다.',
    },
  ],

  SMALL_FIX: [
    {
      kind: 'repro',
      name: '재현 테스트 작성',
      runtime: 'codex',
      read_only: false,
      acceptance_criteria: [
        '버그를 재현하는 실패 테스트가 추가되었다',
        '테스트 실행 시 실패(red) 상태가 확인된다',
      ],
      verifier_hint:
        '신규 재현 테스트가 추가되었는지, 실행 시 실패(red)하는지 확인한다.',
    },
    {
      kind: 'fix',
      name: '버그 수정',
      runtime: 'codex',
      read_only: false,
      dependsOn: ['repro'],
      acceptance_criteria: [
        '재현 테스트가 통과(green)한다',
        '기존 테스트 회귀가 없다',
        '변경 범위가 최소화되어 있다',
      ],
      verifier_hint:
        '재현 테스트가 green이 되었는지, 기존 테스트에 회귀가 없는지 확인한다.',
    },
    {
      kind: 'regress',
      name: '회귀 확인',
      runtime: 'claude',
      read_only: true,
      dependsOn: ['fix'],
      acceptance_criteria: [
        '전체 테스트 스위트가 green이다',
        '수정 이외 영역의 동작 변화가 없음이 확인된다',
      ],
      verifier_hint:
        '`pnpm test` 전체가 green인지, 수정 범위 외 영향이 없는지 검사한다.',
    },
    {
      kind: 'commit',
      name: '커밋',
      runtime: 'claude',
      read_only: false,
      dependsOn: ['regress'],
      acceptance_criteria: [
        '단일 atomic commit 메시지가 버그 수정 내용과 일치한다',
        'git log 상에 정확히 1개의 신규 commit이 추가되었다',
      ],
      verifier_hint:
        'git log를 확인해 정확히 1개의 신규 commit이 추가되었는지 검증한다.',
    },
  ],

  FEATURE: [
    {
      kind: 'research',
      name: '오픈소스 조사',
      runtime: 'claude',
      read_only: true,
      acceptance_criteria: [
        '관련 오픈소스/라이브러리 후보 2-3개가 비교표 형태로 정리되어 있다',
        '채택 근거 또는 배제 이유가 명시되어 있다',
      ],
      verifier_hint:
        '비교표 및 채택 근거가 문서화되어 있는지 확인한다.',
    },
    {
      kind: 'spec',
      name: '스펙 작성',
      runtime: 'claude',
      read_only: true,
      dependsOn: ['research'],
      acceptance_criteria: [
        '요구사항 명세가 문서화되어 있다',
        '측정 가능한 acceptance_criteria가 명시되어 있다',
        '영향을 받는 파일 및 모듈 목록이 식별되어 있다',
      ],
      verifier_hint:
        'spec 산출물이 존재하는지, acceptance_criteria가 객관적으로 측정 가능한지 확인한다.',
    },
    {
      kind: 'test',
      name: '실패 테스트 작성',
      runtime: 'codex',
      read_only: false,
      dependsOn: ['spec'],
      acceptance_criteria: [
        'spec에서 정의한 동작을 검증하는 테스트가 추가되었다',
        '추가한 테스트가 현재 코드 기준으로 실패한다 (red)',
        '커밋은 아직 만들지 않고 실행 결과를 첨부한다',
      ],
      verifier_hint:
        '신규 테스트 파일/케이스가 추가되었는지, 실행 시 실패(red)하는지 검사한다.',
    },
    {
      kind: 'implement',
      name: '구현',
      runtime: 'codex',
      read_only: false,
      dependsOn: ['test'],
      acceptance_criteria: [
        '직전 단계에서 작성된 실패 테스트가 통과한다 (green)',
        '기존 테스트가 회귀 없이 통과한다',
        '변경 범위는 spec에 명시된 파일/모듈에 한정된다',
        '동일 책임의 기존 자산을 우선 재활용하고 중복 구현을 새로 만들지 않는다',
      ],
      verifier_hint:
        '`pnpm test`가 green 상태인지, 변경된 파일이 spec 영향 범위 안에 있는지, 기존 자산과 중복된 구현을 만들지 않았는지 확인한다.',
    },
    {
      kind: 'integrate',
      name: '통합·배선',
      runtime: 'claude',
      read_only: false,
      dependsOn: ['implement'],
      acceptance_criteria: [
        '신규 산출물이 기존 진입점(orchestrator/registry/배럴 export/라우터)에 실제로 등록·연결되었다',
        '기존 자산과 중복 없이 정렬되었다 (구버전이 병존하면 대체 또는 위임을 명시한다)',
        '신규 기능이 기존 통합/E2E 경로에서 호출 가능함이 확인된다',
        '새 파일만 추가되고 기존 진입점 파일 수정이 0인 고립 상태가 아니다',
      ],
      verifier_hint:
        '신규 export가 기존 진입점 파일에서 실제로 import·등록되었는지, 새 파일만 추가되고 기존 파일 수정이 0인 고립 상태가 아닌지 확인한다.',
    },
    {
      kind: 'review',
      name: '리뷰',
      runtime: 'claude',
      read_only: true,
      dependsOn: ['integrate'],
      acceptance_criteria: [
        'diff 전체를 검토한 결과가 LGTM 또는 수정 사항 리스트로 명시되어 있다',
        '리뷰 코멘트는 어떤 라인/파일에 대한 것인지 식별 가능하다',
      ],
      verifier_hint:
        '리뷰 코멘트가 명시되어 있는지, LGTM 판정 또는 수정 요청 리스트가 구체적으로 기록되어 있는지 검사한다.',
    },
    {
      kind: 'commit',
      name: '커밋',
      runtime: 'claude',
      read_only: false,
      dependsOn: ['review'],
      acceptance_criteria: [
        '단일 atomic commit 메시지가 spec과 일치한다',
        'git log 상에 정확히 1개의 신규 commit이 추가되었다',
        '필요 시 origin으로 push가 완료되었다',
      ],
      verifier_hint:
        'git log를 확인해 정확히 1개의 신규 commit이 추가되었는지, 메시지가 atomic이며 spec과 일치하는지 검증한다.',
    },
  ],

  BIG_CHANGE: [
    {
      kind: 'rfc',
      name: 'RFC 작성',
      runtime: 'claude',
      read_only: true,
      acceptance_criteria: [
        '변경 동기, 대안, 영향 범위가 RFC 문서에 명시되어 있다',
        '사람 검토 게이트가 완료되어 있다(승인 또는 반려 기록)',
      ],
      verifier_hint:
        'RFC 문서가 존재하는지, 사람 검토 완료 기록이 있는지 확인한다.',
    },
    {
      kind: 'spec',
      name: '스펙 작성',
      runtime: 'claude',
      read_only: true,
      dependsOn: ['rfc'],
      acceptance_criteria: [
        '요구사항 명세가 문서화되어 있다',
        '측정 가능한 acceptance_criteria가 명시되어 있다',
        '영향을 받는 파일 및 모듈 목록이 식별되어 있다',
      ],
      verifier_hint:
        'spec 산출물이 존재하는지, acceptance_criteria가 객관적으로 측정 가능한지 확인한다.',
    },
    {
      kind: 'test',
      name: '실패 테스트 작성',
      runtime: 'codex',
      read_only: false,
      dependsOn: ['spec'],
      acceptance_criteria: [
        'spec에서 정의한 동작을 검증하는 테스트가 추가되었다',
        '추가한 테스트가 현재 코드 기준으로 실패한다 (red)',
      ],
      verifier_hint:
        '신규 테스트 파일/케이스가 추가되었는지, 실행 시 실패(red)하는지 검사한다.',
    },
    {
      kind: 'implement',
      name: '구현',
      runtime: 'codex',
      read_only: false,
      dependsOn: ['test'],
      acceptance_criteria: [
        '직전 단계에서 작성된 실패 테스트가 통과한다 (green)',
        '기존 테스트가 회귀 없이 통과한다',
        '변경 범위는 spec에 명시된 파일/모듈에 한정된다',
        '동일 책임의 기존 자산을 우선 재활용하고 중복 구현을 새로 만들지 않는다',
      ],
      verifier_hint:
        '`pnpm test`가 green 상태인지, 변경된 파일이 spec 영향 범위 안에 있는지, 기존 자산과 중복된 구현을 만들지 않았는지 확인한다.',
    },
    {
      kind: 'integrate',
      name: '통합·배선',
      runtime: 'claude',
      read_only: false,
      dependsOn: ['implement'],
      acceptance_criteria: [
        '신규 산출물이 기존 진입점(orchestrator/registry/배럴 export/라우터)에 실제로 등록·연결되었다',
        '기존 자산과 중복 없이 정렬되었다 (구버전이 병존하면 대체 또는 위임을 명시한다)',
        '신규 기능이 기존 통합/E2E 경로에서 호출 가능함이 확인된다',
        '새 파일만 추가되고 기존 진입점 파일 수정이 0인 고립 상태가 아니다',
      ],
      verifier_hint:
        '신규 export가 기존 진입점 파일에서 실제로 import·등록되었는지, 새 파일만 추가되고 기존 파일 수정이 0인 고립 상태가 아닌지 확인한다.',
    },
    {
      kind: 'review',
      name: '리뷰',
      runtime: 'claude',
      read_only: true,
      dependsOn: ['integrate'],
      acceptance_criteria: [
        'diff 전체를 검토한 결과가 LGTM 또는 수정 사항 리스트로 명시되어 있다',
        '리뷰 코멘트는 어떤 라인/파일에 대한 것인지 식별 가능하다',
      ],
      verifier_hint:
        '리뷰 코멘트가 명시되어 있는지, LGTM 판정 또는 수정 요청 리스트가 구체적으로 기록되어 있는지 검사한다.',
    },
    {
      kind: 'commit',
      name: '커밋',
      runtime: 'claude',
      read_only: false,
      dependsOn: ['review'],
      acceptance_criteria: [
        '단일 atomic commit 메시지가 spec과 일치한다',
        'git log 상에 정확히 1개의 신규 commit이 추가되었다',
      ],
      verifier_hint:
        'git log를 확인해 정확히 1개의 신규 commit이 추가되었는지, 메시지가 spec과 일치하는지 검증한다.',
    },
  ],

  OPS: [
    {
      kind: 'backup',
      name: '백업 및 롤백 계획',
      runtime: 'claude',
      read_only: true,
      acceptance_criteria: [
        '스냅샷/백업 완료 기록이 있다',
        '롤백 절차가 문서화되어 있다',
      ],
      verifier_hint:
        '백업 완료 기록과 롤백 절차 문서가 존재하는지 확인한다.',
    },
    {
      kind: 'implement',
      name: '운영 작업 실행',
      runtime: 'codex',
      read_only: false,
      dependsOn: ['backup'],
      acceptance_criteria: [
        '운영 작업이 계획대로 실행되었다',
        '실행 로그가 기록되어 있다',
      ],
      verifier_hint:
        '운영 작업 실행 로그가 존재하는지, 계획과 일치하는지 확인한다.',
    },
    {
      kind: 'smoke',
      name: '스모크 테스트',
      runtime: 'claude',
      read_only: true,
      dependsOn: ['implement'],
      acceptance_criteria: [
        '핵심 기능이 정상 동작함을 smoke test로 확인했다',
        '모니터링 지표에 이상이 없다',
      ],
      verifier_hint:
        'smoke test 결과가 pass이고, 모니터링 지표에 이상이 없는지 확인한다.',
    },
    {
      kind: 'commit',
      name: '커밋',
      runtime: 'claude',
      read_only: false,
      dependsOn: ['smoke'],
      acceptance_criteria: [
        '운영 작업 결과가 단일 atomic commit으로 기록되었다',
        'git log 상에 정확히 1개의 신규 commit이 추가되었다',
      ],
      verifier_hint:
        'git log를 확인해 정확히 1개의 신규 commit이 추가되었는지 검증한다.',
    },
  ],

  RESEARCH: [
    {
      kind: 'research',
      name: '조사 및 비교',
      runtime: 'claude',
      read_only: true,
      acceptance_criteria: [
        '후보 2-3개가 비교표 형태로 정리되어 있다',
        '각 후보의 장단점과 채택/배제 근거가 명시되어 있다',
        '코드 구현 없이 문서/분석 산출물만 존재한다',
      ],
      verifier_hint:
        '비교표가 존재하는지, 코드 변경 없이 분석 산출물만 있는지 확인한다.',
    },
  ],

  REFACTOR: [
    {
      kind: 'regress',
      name: '회귀 테스트 green 확보',
      runtime: 'claude',
      read_only: true,
      acceptance_criteria: [
        '리팩터링 전 전체 테스트 스위트가 green이다',
        '테스트 실행 결과가 기록되어 있다',
      ],
      verifier_hint:
        '리팩터링 전 `pnpm test` 전체가 green인지 확인하고 기록한다.',
    },
    {
      kind: 'refactor',
      name: '리팩터링',
      runtime: 'codex',
      read_only: false,
      dependsOn: ['regress'],
      acceptance_criteria: [
        '외부 동작 변화 없이 내부 구조가 개선되었다',
        '변경된 코드가 기존 명세를 유지한다',
      ],
      verifier_hint:
        '외부 동작 변화 없이 구조 개선만 이루어졌는지 확인한다.',
    },
    {
      kind: 'regress',
      name: '회귀 확인 (리팩터링 후)',
      runtime: 'claude',
      read_only: true,
      dependsOn: ['refactor'],
      acceptance_criteria: [
        '리팩터링 후에도 전체 테스트 스위트가 동일하게 green이다',
        '새로 실패한 테스트가 없다',
      ],
      verifier_hint:
        '리팩터링 후 `pnpm test` 전체가 green이고 새 실패가 없는지 확인한다.',
    },
    {
      kind: 'commit',
      name: '커밋',
      runtime: 'claude',
      read_only: false,
      dependsOn: ['regress'],
      acceptance_criteria: [
        '단일 atomic commit 메시지가 리팩터링 내용을 설명한다',
        'git log 상에 정확히 1개의 신규 commit이 추가되었다',
      ],
      verifier_hint:
        'git log를 확인해 정확히 1개의 신규 commit이 추가되었는지 검증한다.',
    },
  ],
};

/**
 * Build the system prompt the CTO agent prepends to every dev-workflow LLM
 * call. taskClass narrows the required phase set and rules injected into the
 * prompt. Defaults to 'FEATURE' when omitted (backward-compatible).
 */
export function buildDevWorkflowSystemPrompt(
  taskTitle: string,
  taskRationale: string,
  taskClass: TaskClass = 'FEATURE',
): string {
  const templates = DEV_WORKFLOW_TEMPLATES[taskClass];
  const phaseNames = templates.map((t) => t.kind).join(' → ');
  const stageDescriptions = templates
    .map((t, idx) => {
      const deps = t.dependsOn?.length
        ? ` (dependsOn: ${t.dependsOn.join(', ')})`
        : '';
      const criteria = t.acceptance_criteria.map((c) => `      - ${c}`).join('\n');
      return [
        `  ${idx + 1}. kind="${t.kind}", name="${t.name}", runtime="${t.runtime}", read_only=${t.read_only}${deps}`,
        `     acceptance_criteria:`,
        `${criteria}`,
        `     verifier_hint: ${t.verifier_hint}`,
      ].join('\n');
    })
    .join('\n');

  const kindUnion = templates.map((t) => `"${t.kind}"`).join('|');

  return [
    '당신은 시니어 개발자 역할의 CTO 에이전트다.',
    `자유롭게 phase를 만들지 말고 정확히 아래 ${templates.length}단계 SOP(task_class="${taskClass}")를 출력하라.`,
    '',
    `Task title: ${taskTitle}`,
    `Task rationale: ${taskRationale}`,
    `Task class: ${taskClass}`,
    '',
    `필수 ${templates.length}단계 (${phaseNames}):`,
    stageDescriptions,
    '',
    '출력 규칙:',
    `- 반드시 위 ${templates.length}단계를 정확히 같은 순서로 출력한다.`,
    '- 각 phase는 kind, name, runtime, read_only, acceptance_criteria, verifier_hint, dependsOn을 포함한다.',
    '- 각 phase에는 ACR 실행용 prompt_packet, expected_output, risk_level (D1-D5)도 함께 포함한다.',
    '- read_only=true 인 phase는 risk_level이 D2를 넘지 않도록 한다.',
    '- 요구사항이 모호하다면 phases를 생성하지 말고 `clarifying_questions: string[]` 필드만 포함한 JSON을 반환한다.',
    '- 응답은 markdown 없이 단일 JSON 객체로만 출력한다.',
    '',
    '응답 스키마:',
    '{',
    '  "task_class": ' + `"${taskClass}",`,
    '  "clarifying_questions"?: string[],',
    '  "phases"?: [',
    '    {',
    `      "kind": ${kindUnion},`,
    '      "name": string,',
    '      "runtime": "claude"|"codex",',
    '      "read_only": boolean,',
    '      "acceptance_criteria": string[],',
    '      "verifier_hint": string,',
    `      "dependsOn"?: (${kindUnion})[],`,
    '      "prompt_packet": string,',
    '      "expected_output": string,',
    '      "risk_level": "D1"|"D2"|"D3"|"D4"|"D5"',
    '    }',
    '  ]',
    '}',
  ].join('\n');
}

/**
 * Shape we accept from the LLM. Fields are loose because the model may emit
 * partial output; the validator rejects anything that violates the SOP.
 */
export interface DevWorkflowPhaseLike {
  kind?: string;
  name?: string;
  runtime?: string;
  read_only?: boolean;
  acceptance_criteria?: unknown;
  verifier_hint?: unknown;
  dependsOn?: unknown;
}

export interface DevWorkflowValidationResult {
  ok: boolean;
  errors: string[];
}

/**
 * Per-class expected order and dependsOn tables. REFACTOR has two 'regress'
 * phases (before and after), so order is stored as a plain tuple array.
 */
const CLASS_EXPECTED_ORDER: Record<TaskClass, DevPhaseKind[]> = {
  TINY:       ['implement', 'commit'],
  SMALL_FIX:  ['repro', 'fix', 'regress', 'commit'],
  FEATURE:    ['research', 'spec', 'test', 'implement', 'integrate', 'review', 'commit'],
  BIG_CHANGE: ['rfc', 'spec', 'test', 'implement', 'integrate', 'review', 'commit'],
  OPS:        ['backup', 'implement', 'smoke', 'commit'],
  RESEARCH:   ['research'],
  REFACTOR:   ['regress', 'refactor', 'regress', 'commit'],
};

const CLASS_EXPECTED_DEPENDS_ON: Record<TaskClass, Record<string, DevPhaseKind[]>> = {
  TINY: {
    implement: [],
    commit: ['implement'],
  },
  SMALL_FIX: {
    repro: [],
    fix: ['repro'],
    regress: ['fix'],
    commit: ['regress'],
  },
  FEATURE: {
    research: [],
    spec: ['research'],
    test: ['spec'],
    implement: ['test'],
    integrate: ['implement'],
    review: ['integrate'],
    commit: ['review'],
  },
  BIG_CHANGE: {
    rfc: [],
    spec: ['rfc'],
    test: ['spec'],
    implement: ['test'],
    integrate: ['implement'],
    review: ['integrate'],
    commit: ['review'],
  },
  OPS: {
    backup: [],
    implement: ['backup'],
    smoke: ['implement'],
    commit: ['smoke'],
  },
  RESEARCH: {
    research: [],
  },
  REFACTOR: {
    // position-based: phase[0]=regress(no dep), phase[1]=refactor(dep:regress),
    // phase[2]=regress(dep:refactor), phase[3]=commit(dep:regress)
    regress: [],
    refactor: ['regress'],
    commit: ['regress'],
  },
};

// Map common Korean/English phase names back to a kind when the LLM
// neglected to include the `kind` field explicitly.
const NAME_TO_KIND: Array<{ pattern: RegExp; kind: DevPhaseKind }> = [
  { pattern: /repro|재현/i, kind: 'repro' },
  { pattern: /\bfix\b|버그 수정|수정/i, kind: 'fix' },
  { pattern: /regress|회귀/i, kind: 'regress' },
  { pattern: /research|조사|비교/i, kind: 'research' },
  { pattern: /rfc/i, kind: 'rfc' },
  { pattern: /refactor|리팩터/i, kind: 'refactor' },
  { pattern: /backup|백업/i, kind: 'backup' },
  { pattern: /smoke|스모크/i, kind: 'smoke' },
  { pattern: /spec|스펙|명세|설계/i, kind: 'spec' },
  { pattern: /test|테스트/i, kind: 'test' },
  { pattern: /integrate|integration|통합|배선|wiring|등록|배럴/i, kind: 'integrate' },
  { pattern: /implement|구현|개발/i, kind: 'implement' },
  { pattern: /review|리뷰|검토/i, kind: 'review' },
  { pattern: /commit|커밋|배포/i, kind: 'commit' },
];

const ALL_KINDS: DevPhaseKind[] = [
  'spec', 'test', 'implement', 'integrate', 'review', 'commit',
  'repro', 'fix', 'regress', 'research', 'rfc', 'refactor', 'backup', 'smoke',
];

function inferKind(phase: DevWorkflowPhaseLike): DevPhaseKind | null {
  if (typeof phase.kind === 'string') {
    const k = phase.kind.toLowerCase().trim();
    if ((ALL_KINDS as string[]).includes(k)) {
      return k as DevPhaseKind;
    }
  }
  if (typeof phase.name === 'string') {
    for (const entry of NAME_TO_KIND) {
      if (entry.pattern.test(phase.name)) return entry.kind;
    }
  }
  return null;
}

/**
 * Validate that a phases[] array conforms to the SOP for the given taskClass.
 * Defaults to 'FEATURE' when taskClass is omitted (backward-compatible).
 * Caller can surface `errors` back to the LLM for a retry, or trigger the
 * deterministic fallback.
 */
export function validateDevWorkflowPhases(
  phases: ReadonlyArray<DevWorkflowPhaseLike> | undefined | null,
  taskClass: TaskClass = 'FEATURE',
): DevWorkflowValidationResult {
  const errors: string[] = [];
  const expectedOrder = CLASS_EXPECTED_ORDER[taskClass];
  const expectedDepsMap = CLASS_EXPECTED_DEPENDS_ON[taskClass];
  const templates = DEV_WORKFLOW_TEMPLATES[taskClass];

  if (!Array.isArray(phases)) {
    return { ok: false, errors: ['phases must be an array'] };
  }

  if (phases.length !== expectedOrder.length) {
    errors.push(
      `phases must contain exactly ${expectedOrder.length} stages (${expectedOrder.join(', ')}); got ${phases.length}`,
    );
  }

  const inferredKinds: Array<DevPhaseKind | null> = phases.map((p) => inferKind(p));

  inferredKinds.forEach((k, idx) => {
    if (k === null) {
      errors.push(`phase[${idx}] is missing a recognizable kind`);
    }
  });

  // Order check (only meaningful when length matches expected).
  if (phases.length === expectedOrder.length) {
    expectedOrder.forEach((expected, idx) => {
      const actual = inferredKinds[idx];
      if (actual !== expected) {
        errors.push(
          `phase[${idx}] expected kind="${expected}", got "${actual ?? 'unknown'}"`,
        );
      }
    });
  }

  // Uniqueness — only check for classes where duplicates are not expected
  // (REFACTOR intentionally repeats 'regress').
  if (taskClass !== 'REFACTOR') {
    const seen = new Set<DevPhaseKind>();
    inferredKinds.forEach((k, idx) => {
      if (k && seen.has(k)) {
        errors.push(`phase[${idx}] duplicates kind="${k}"`);
      }
      if (k) seen.add(k);
    });
  }

  // Per-phase structural checks.
  phases.forEach((p, idx) => {
    const kind = inferredKinds[idx];
    if (!kind) return;

    if (typeof p.name !== 'string' || p.name.trim().length === 0) {
      errors.push(`phase[${idx}] (${kind}) missing name`);
    }

    // Runtime check: look up by position in templates (handles REFACTOR repeat).
    const expectedRuntime = templates[idx]?.runtime;
    if (typeof p.runtime !== 'string') {
      errors.push(`phase[${idx}] (${kind}) missing runtime`);
    } else if (expectedRuntime && p.runtime !== expectedRuntime) {
      errors.push(
        `phase[${idx}] (${kind}) runtime must be "${expectedRuntime}", got "${p.runtime}"`,
      );
    }

    if (!Array.isArray(p.acceptance_criteria) || p.acceptance_criteria.length === 0) {
      errors.push(`phase[${idx}] (${kind}) acceptance_criteria must be a non-empty array`);
    }

    if (typeof p.verifier_hint !== 'string' || p.verifier_hint.trim().length === 0) {
      errors.push(`phase[${idx}] (${kind}) verifier_hint is required`);
    }

    // dependsOn chain — use position-based for REFACTOR, kind-based otherwise.
    let expectedDeps: DevPhaseKind[];
    if (taskClass === 'REFACTOR') {
      expectedDeps = templates[idx]?.dependsOn ?? [];
    } else {
      expectedDeps = expectedDepsMap[kind] ?? [];
    }

    const rawDeps = p.dependsOn;
    if (expectedDeps.length === 0) {
      if (Array.isArray(rawDeps) && rawDeps.length > 0) {
        errors.push(`phase[${idx}] (${kind}) must not declare dependsOn`);
      }
    } else {
      if (!Array.isArray(rawDeps)) {
        errors.push(
          `phase[${idx}] (${kind}) must declare dependsOn=[${expectedDeps.join(', ')}]`,
        );
      } else {
        const deps = rawDeps.map((d) => String(d).toLowerCase());
        for (const expectedDep of expectedDeps) {
          if (!deps.includes(expectedDep)) {
            errors.push(
              `phase[${idx}] (${kind}) dependsOn must include "${expectedDep}"`,
            );
          }
        }
      }
    }
  });

  return { ok: errors.length === 0, errors };
}

/**
 * Convenience: deterministic SOP phases keyed off the templates for the given
 * taskClass. Used as the CTO agent's fallback when the LLM is unavailable or
 * fails validation twice in a row. Defaults to 'FEATURE' (backward-compatible).
 */
export interface DeterministicDevPhase extends DevPhaseTemplate {
  prompt_packet: string;
  expected_output: string;
  risk_level: 'D1' | 'D2' | 'D3' | 'D4' | 'D5';
}

export function buildDeterministicDevPhases(
  taskTitle: string,
  taskClass: TaskClass = 'FEATURE',
): DeterministicDevPhase[] {
  const templates = DEV_WORKFLOW_TEMPLATES[taskClass];
  return templates.map((t) => ({
    ...t,
    prompt_packet: `[${t.kind}] ${t.name} — task: ${taskTitle}\nacceptance:\n${t.acceptance_criteria
      .map((c) => `- ${c}`)
      .join('\n')}\nverifier_hint: ${t.verifier_hint}`,
    expected_output: t.acceptance_criteria.join('; '),
    // Read-only stages are safe (D1); mutating stages stay at D2 by default.
    risk_level: t.read_only ? 'D1' : 'D2',
  }));
}

/**
 * Deterministic task classifier. CTO-only — neither CEO nor decomposer calls
 * this directly. Uses keyword heuristics for initial classification, then
 * applies 5-indicator escalation rules.
 *
 * Escalation thresholds (SMALL_FIX→FEATURE, FEATURE→BIG_CHANGE):
 *   If 3+ of the 5 indicators suggest the next tier, escalate.
 *   Indicators: estimated changed lines, impacted modules, new dependencies,
 *               schema changes, API compatibility impact.
 *
 * This function is deterministic and requires no LLM.
 */
export interface ClassifyTaskHints {
  /** Estimated lines to be changed (rough order of magnitude). */
  estimatedLines?: number;
  /** Number of distinct modules/packages impacted. */
  impactedModules?: number;
  /** Whether new external dependencies are required. */
  newDependencies?: boolean;
  /** Whether database/API schema changes are required. */
  schemaChange?: boolean;
  /** Whether existing public API contracts will break. */
  apiBreaking?: boolean;
}

export function classifyTask(
  title: string,
  rationale: string,
  hints: ClassifyTaskHints = {},
): TaskClass {
  const text = `${title} ${rationale}`.toLowerCase();

  // Keyword-based initial classification.
  if (/refactor|리팩터|리팩토링/.test(text)) {
    return 'REFACTOR';
  }
  if (/research|조사|비교|survey|탐색/.test(text)) {
    return 'RESEARCH';
  }
  if (/deploy|infra|launchd|migration|마이그레이션|배포|운영|ops|rollback|백업/.test(text)) {
    return 'OPS';
  }

  // 5-indicator escalation scoring (also gates TINY: any escalation signal
  // disqualifies trivial classification).
  const escalationScore = [
    (hints.estimatedLines ?? 0) > 200,
    (hints.impactedModules ?? 0) > 3,
    hints.newDependencies === true,
    hints.schemaChange === true,
    hints.apiBreaking === true,
  ].filter(Boolean).length;

  // TINY (M9.7) — route genuinely trivial work to a minimal 2-phase workflow so
  // it finishes in seconds instead of running the full 6-phase ceremony. Only on
  // explicit trivial signals (keyword or small-scope hints) AND no escalation,
  // to avoid under-serving real features.
  const trivialKeyword =
    /오타|typo|한 ?줄|one[- ]?liner|함수 하나|헬퍼 추가|상수 추가|rename|이름\s*변경|간단한? (추가|수정|변경)|단순 (추가|수정|변경)|trivial/.test(
      text,
    );
  const trivialHints =
    hints.estimatedLines !== undefined &&
    hints.estimatedLines <= 30 &&
    (hints.impactedModules ?? 1) <= 1 &&
    !hints.newDependencies &&
    !hints.schemaChange &&
    !hints.apiBreaking;
  if ((trivialKeyword || trivialHints) && escalationScore === 0) {
    return 'TINY';
  }

  // fix/bug → start at SMALL_FIX, then check escalation.
  const isBugKeyword = /\bfix\b|bug|버그|hotfix|patch|수정/.test(text);
  const baseClass: TaskClass = isBugKeyword ? 'SMALL_FIX' : 'FEATURE';

  // Single bounded UI component / model / util / endpoint → SMALL_FIX (4 phases:
  // repro→fix→regress→commit), NOT the full 6-phase FEATURE ceremony. Decomposing
  // a single card/panel/model into research→spec→test→implement→review→commit wasted
  // ~2-3x tokens/time on no-op research/spec/review phases (observed: CMO Video Room
  // had 28 such "FEATURE"s = 158 phases; most were single components). Genuinely
  // multi-component features still escalate via the indicator score.
  const singleComponentKeyword =
    /\b(card|panel|badge|loader|cell|chip|modal|tooltip|icon|util|helper|schema|model|hook|endpoint|route|router|menu|snapshot|spinner|toggle|dropdown)\b/.test(text) ||
    /카드|패널|뱃지|로더|버튼|모달|툴팁|유틸|헬퍼|스키마|모델|훅|엔드포인트|라우터|메뉴|스냅샷|단일\s*컴포넌트|컴포넌트\s*(추가|구현)|토글|드롭다운/.test(text);
  if (baseClass === 'FEATURE' && singleComponentKeyword && escalationScore < 2) {
    return 'SMALL_FIX';
  }

  if (baseClass === 'SMALL_FIX') {
    // 3+ indicators → escalate to FEATURE.
    if (escalationScore >= 3) return 'FEATURE';
    return 'SMALL_FIX';
  }

  // baseClass === 'FEATURE': 3+ indicators → escalate to BIG_CHANGE.
  if (escalationScore >= 3) return 'BIG_CHANGE';
  return 'FEATURE';
}
