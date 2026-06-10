# WO-2: l5-core 8단계 LLM 실행기 — 진행 노트

- 작업: 제목 디벨롭 PRD(docs/prd/cmo-title-development.md) §21.5 `runTitleDevelopmentSteps`(2~8단계 LLM 디벨롭 루프) + §21.4 `judgeCombinationAwkwardness` + §21.6 `evaluateFinalTitles`의 LLM 추론 부분을 `packages/l5-core`에 구현
- 선행: WO-1 완료(타입 §19 9종 + 결정론 함수 — `title-development-types.ts`, `title-development.ts`, 테스트 53/53 green, 커밋 b48286c)
- 상태: research 완료 (2026-06-10)

## Phase: research — 오픈소스/라이브러리 조사

### 조사 범위

WO-2가 필요로 하는 능력을 PRD와 WO-1 산출물에서 도출:

| 필요 능력 | 근거 |
|---|---|
| 2~8단계 순차 LLM 호출 루프 — 각 단계 입력 제목 → 출력 후보·변경 이유·버린 후보 (`TitleDevelopmentStepResult`) | PRD §8~§16, §21.5, §22.2-E(타임라인 UI), AC-09 |
| LLM 출력의 구조화 파싱(JSON) + 형식 오류 재시도 + 실패 시 결정론 폴백 | PRD §25 엣지케이스, 기존 CMO 원칙 |
| 어색함 판단(§21.4)·최종 평가 항목 점수 산정(§21.6)의 LLM 추론 — 점수 합산/임계 판정은 WO-1 결정론 함수(`scoreFinalTitle`/`recommendFromScore`/`isAwkward`) 재사용 | PRD §17, WO-1 spec S1 |
| LLM 클라이언트 추상화 — l5-core는 실모델 없이 jest 테스트 가능해야 함 | Development Rule 2, 기존 33개 파일의 `LLMClient` 주입 패턴 |
| 트레이싱 — 모든 LLM 워크플로우는 Langfuse 또는 trace 추상화로 추적 가능 | Development Rule 6, `LLMClient.complete`의 `trace_name`/`trace_metadata` 필드 |

### 기존 자산 (재조사 결과, 신규 도입 불필요 영역)

- **LLM 클라이언트**: `src/functions/ceo-orchestration/types.ts:50` `LLMClient` 인터페이스(`complete({system, user, trace_name?, trace_metadata?})`) — repo 전역 33개 파일이 사용하는 정착 컨벤션. 실구현은 `src/llm/claude-cli-client.ts`(claude CLI spawn, LRU+TTL 캐시, MCP off) 및 `ceo-orchestration/anthropic-client.ts`.
- **다단계 LLM 패턴 선례**: `video-room/discovery-classification.ts` — LLMClient 주입 + zod 파싱 + 배치 + 형식오류 재시도(maxRetries) + 실패분만 결정론 폴백(`source: 'llm' | 'fallback'`). `executive-runtime/tool-loop.ts` — 멀티라운드 루프. WO-2 실행기의 직접 참조 모델.
- **출력 파싱**: zod ^3.22.0 (이미 dependencies).

### 후보 비교표

#### A. 단계 오케스트레이션 (2~8단계 순차 실행기)

| 후보 | 장점 | 단점 | 판정 |
|---|---|---|---|
| **자체 구현 — 기존 `LLMClient` 주입 + 순차 for 루프** | repo 정착 패턴(discovery-classification, tool-loop) 그대로 재사용. 의존성 0. jest로 mock LLMClient 주입 테스트 가능(Rule 2). 단계별 결과를 PRD §19.4 `TitleDevelopmentStepResult[]`에 그대로 적재 — 타임라인 UI(§22.2-E) 요구와 1:1. trace_name으로 Langfuse 추상화 충족(Rule 6) | 그래프/병렬/중단재개 같은 고급 기능 없음 — 단, 8단계는 엄격한 선형 순차(PRD §8 "다음 순서로 진행")라 불필요 | **채택** |
| Mastra workflows (`@mastra/core`, 프로젝트 기술방향에 이미 포함) | step/suspend/resume 내장, 기술 스택 정합 | Mastra의 자리는 `services/agent-runtime`(에이전트 런타임 계층)이지 l5-core가 아님 — ARCHITECTURE 상 l5-core는 NocoBase·런타임 독립 순수 로직 패키지. l5-core에 `@mastra/core`를 넣으면 무거운 런타임 의존성이 유입되고 jest 단위테스트 격리 훼손. 8단계 선형 루프에 워크플로우 엔진은 과잉 | 배제 (l5-core 내부에서는. agent-runtime이 후속 WO에서 이 실행기를 step으로 감싸는 것은 허용) |
| LangChain / LangGraph (`langchain`, `@langchain/langgraph`) | 체인/그래프 오케스트레이션 표준, 커뮤니티 큼 | 신규 대형 의존성(전이 의존성 다수). 기존 `LLMClient` 추상화와 이중 컨벤션. §19.1 "알 수 없는 패키지 install 금지"와 충돌. 선형 8단계에 그래프 엔진은 명백한 과잉 | 배제 |
| Vercel AI SDK (`ai` — `generateObject`/`generateText`) | zod 스키마 → 구조화 출력 1급 지원, 경량 | 신규 의존성 + provider 어댑터 필요. 현 LLM 경로는 claude CLI spawn(API 키 아닌 구독 경유)이라 AI SDK provider 모델과 안 맞음. 구조화 출력은 기존 zod 수동 파싱 패턴으로 이미 해결돼 있음 | 배제 |

#### B. LLM 출력 구조화 파싱·검증

| 후보 | 장점 | 단점 | 판정 |
|---|---|---|---|
| **zod v3 (기존 dependencies) + 수동 JSON 추출** | discovery-classification.ts에서 검증된 패턴: 응답에서 JSON 추출 → `schema.safeParse` → 실패 시 재시도 → 최종 폴백. 추가 설치 0 | 프롬프트에 출력 형식 명시 필요(기존 모듈들과 동일 비용) | **채택** |
| instructor-js / zod-gpt | 구조화 출력 전용 DX | 신규 의존성. OpenAI 중심 설계로 claude CLI 경로와 불일치. 유지보수 활동 저조 | 배제 |
| typechat (Microsoft) | TS 타입 → 스키마 자동화 | 신규 의존성. zod와 이중 검증 컨벤션. 프로젝트 활동성 낮음 | 배제 |

#### C. 재시도/폴백 제어

| 후보 | 장점 | 단점 | 판정 |
|---|---|---|---|
| **자체 구현 (maxRetries 카운터 + 결정론 폴백)** | discovery-classification.ts의 `maxRetries`(기본 1=총 2회) + 부분 폴백 패턴 그대로. 의존성 0 | 지수 백오프 등 정교함 없음(단일 프로세스 순차 호출이라 불필요) | **채택** |
| p-retry / async-retry | 백오프 정책 내장 | 신규 의존성. 단계당 1~2회 재시도 수준에 과잉 | 배제 |

### 결론

- **신규 외부 의존성 추가 없음.** 8단계 실행기는 기존 `LLMClient` 주입 + 순차 루프 + zod 파싱 + 결정론 폴백의 자체 구현으로 충당.
- 근거:
  1. PRD §8이 정의하는 8단계는 엄격한 선형 순차 파이프라인 — 그래프/병렬/중단재개가 필요 없어 워크플로우 엔진(Mastra/LangGraph)은 과잉이며, l5-core의 "NocoBase·런타임 독립, jest 테스트 가능" 원칙(Rule 2)과 충돌.
  2. repo에 이미 동형 문제를 푼 검증된 선례 2개(discovery-classification의 LLM+zod+폴백, executive-runtime tool-loop의 멀티라운드 루프)가 있어 컨벤션 일관성·리뷰 비용 면에서 자체 구현이 우위.
  3. 프로젝트 규칙: 알 수 없는 패키지 install 금지(§19.1), MVP-critical 기능에 상용/대형 의존성 회피.
- 계층 분담: l5-core의 실행기는 순수 함수형(LLMClient 주입). Mastra(agent-runtime)·NocoBase 플러그인은 후속 WO에서 이 실행기를 **소비**하는 쪽 — WO-2는 l5-core 내부까지만.

### 다음 phase(spec)에 넘기는 결정사항

1. 시그니처 방향: `runTitleDevelopmentSteps(input, deps: { llm?: LLMClient; maxRetries?: number })` — llm 미주입 시 전 단계 결정론 폴백(discovery-classification 컨벤션). 반환은 PRD §19.4 `TitleDevelopmentStepResult[]`(단계별 입력/출력/이유/버린 후보).
2. 모델 선택: 단계별 디벨롭은 사고가 필요한 판단 — discovery-classification처럼 모델 상수 고정(`sonnet` 계열) 선언을 spec에서 확정할 것.
3. LLM 호출 단위: 단계당 1콜(2~8단계 = 7콜) vs 묶음 호출 — 타임라인 UI(§22.2-E)가 단계별 입력/출력/이유를 요구하므로 **단계당 1콜** 기본. 캐시는 claude-cli-client의 LRU가 처리.
4. WO-1 결정론 함수와의 접합: 35자 검사(`isTitleTooLong`)는 각 단계 출력 후처리로, 점수 합산·판정(`scoreFinalTitle`/`recommendFromScore`)은 §21.6 평가에서 LLM 항목점수를 받아 적용. `isAwkward`는 §21.4 LLM 점수에 적용.
5. trace: 각 단계 호출에 `trace_name: 'title-dev-step-N'` 류 부여 (Rule 6).

---

## Phase: spec — 요구사항 명세

### S1. 범위 정의

WO-2는 **LLM 추론 실행기**만 다룬다. 결정론 함수·타입은 WO-1 산출물을 재사용하며 수정하지 않는다.

| PRD §21 함수 | WO-2 포함 | 내용 |
|---|---|---|
| `judgeCombinationAwkwardness` (§21.4) | **포함** | 교차 조합 4개의 어색함을 LLM이 판단(§9.5 기준 5+1항목) → `awkwardness_score`/`awkwardness_reason`/`passed`/`selected_for_next_step` 채움. 임계 판정은 WO-1 `isAwkward` 재사용 |
| `runTitleDevelopmentSteps` (§21.5) | **포함** | 통과 조합의 제목을 2~8단계(§10~§16) 순차 LLM 디벨롭 → `TitleDevelopmentStepResult[]` 7개 (AC-09, AC-10) |
| `evaluateFinalTitles` (§21.6) | **포함** | 최종 후보별 6항목 점수를 LLM이 산정 → WO-1 `scoreFinalTitle`(클램프·합산)·`recommendFromScore`(85/70/69) 적용 → `FinalTitleEvaluation[]` |
| 전체 파이프라인 합성 | **포함** (`runTitleDevelopmentWorkflow`) | 검증(WO-1)→조합(WO-1)→어색함→2~8단계→평가→베스트 선택을 잇는 합성 함수. `TitleDevelopmentWorkflowRun` 반환 |
| UI(§22), proposal 저장 배선(§20), agent-runtime/플러그인 소비 | 제외 | 후속 WO. WO-2는 l5-core 내부까지만 |

### S2. 설계 결정 (research 인계 확정)

- **파일**: 신규 `title-development-llm.ts` — WO-1의 결정론 파일(`title-development.ts`)과 분리(LLM 의존 유무로 모듈 책임 분리, Rule 1).
- **모델**: `export const TITLE_DEVELOPMENT_MODEL = 'claude-sonnet-4-6'` 상수 고정 (discovery-classification 컨벤션).
- **deps 주입**: `interface TitleDevelopmentLLMDeps { llm?: LLMClient; maxRetries?: number }` — maxRetries 기본 1(총 2회 시도). `LLMClient`는 `ceo-orchestration/types` import.
- **호출 단위**: 어색함 1콜 + 단계당 1콜(2~8 = 7콜) + 평가 1콜 = run당 총 9콜.
- **trace**: `trace_name`: `'title-dev-awkwardness'` / `'title-dev-step-{2..8}'` / `'title-dev-final-eval'`. `trace_metadata`에 `pulling_topic` 포함.
- **출력 파싱**: 응답에서 JSON 추출(코드펜스 허용) → zod `safeParse` → 실패 시 재시도 → 최종 실패 시 결정론 폴백. zod 스키마 3개: `AwkwardnessJudgementSchema`, `StepResultLLMSchema`, `FinalEvaluationLLMSchema`.
- **결정론 폴백** (llm 미주입 또는 재시도 소진 — 전체 실패 금지):
  - 어색함: `awkwardness_score=0`, `passed=true`, reason=`'어색함 판단 실패 — 수동 확인 필요'`, 기본 2종 조합만 `selected_for_next_step=true` (PRD §3.1).
  - 단계: 입력 제목 pass-through(`output_titles=input_titles`), `method_explanation`에 폴백 사유 명기, `rejected_titles=[]`.
  - 평가: 6항목 전부 배점의 70% 고정(= revise 구간) — 폴백이 자동 업로드 후보가 되지 않게 보수적으로.
  - 폴백 발생 여부는 결과에 `fallback_count`로 노출.
- **단계명 상수**: `STEP_NAMES: Record<2..8, string>` — §8 순서 그대로 (`'쉬운 단어로 전환'`, `'상위어로 전환'`, `'부정어/반대 구조로 전환'`, `'수식어 추가'`, `'답이 보이는 제목을 질문이 생기게 전환'`, `'핫비디오 구조로 갈아끼우기'`, `'강한 단어로 변경'`).
- **프롬프트**: 단계별 system 프롬프트에 PRD §10~§16의 실행 방법·예시·실패 기준을 요약 주입(P0-8 "8단계 디벨롭 실행 프롬프트 구현"). 5단계 출력은 `isTitleTooLong` 후처리 — 35자 초과 후보는 rejected로 이동(사유: `'35자 초과'`).
- **각 단계 입력**: 직전 단계의 `selected_titles_for_next_step` (2단계 입력은 어색함 통과 조합의 `title_draft`).

### S3. 함수 시그니처 명세

```ts
// title-development-llm.ts
export const TITLE_DEVELOPMENT_MODEL = 'claude-sonnet-4-6';
export const TITLE_DEV_FALLBACK_REASON = '... 실패 — 수동 확인 필요'; // 함수별 한국어 사유

export interface TitleDevelopmentLLMDeps {
  llm?: LLMClient;
  maxRetries?: number; // 기본 1 (총 2회 시도)
}

export interface TitleDevelopmentTopicContext {
  pulling_topic: string;
  target_audience: string;
  business_goal?: string;
}

// §21.4 — 조합 어색함 판단 (1콜, 4조합 배치)
export async function judgeCombinationAwkwardness(
  combinations: TitleThumbnailCombination[],
  context: TitleDevelopmentTopicContext,
  deps?: TitleDevelopmentLLMDeps,
): Promise<{ combinations: TitleThumbnailCombination[]; fallback_count: number }>;
// 입력 배열은 불변(immutable) — 채워진 복사본 반환. passed = !isAwkward(score).

// §21.5 — 2~8단계 순차 디벨롭 (단계당 1콜)
export async function runTitleDevelopmentSteps(
  initialTitles: string[],            // 어색함 통과 조합의 title_draft
  context: TitleDevelopmentTopicContext,
  deps?: TitleDevelopmentLLMDeps,
): Promise<{ step_results: TitleDevelopmentStepResult[]; fallback_count: number }>;
// step_results.length === 7 (step_number 2~8, 순서 보장). 어떤 단계가 폴백돼도 루프는 계속.

// §21.6 — 최종 평가 (1콜, 후보 배치)
export async function evaluateFinalTitles(
  candidates: { title: string; thumbnail_direction: string }[],
  context: TitleDevelopmentTopicContext & { script_summary?: string },
  deps?: TitleDevelopmentLLMDeps,
): Promise<{ evaluations: FinalTitleEvaluation[]; fallback_count: number }>;
// total_score = scoreFinalTitle(LLM 항목점수), recommendation = recommendFromScore(total).

// 합성 파이프라인 — 검증→조합→어색함→2~8단계→평가→베스트 선택
export async function runTitleDevelopmentWorkflow(
  input: {
    video_project_id: string;
    pulling_content_id: string;
    pulling_topic: string;
    target_audience: string;
    business_goal?: string;
    references: [TitleDevelopmentReference, TitleDevelopmentReference];
    script_summary?: string;
  },
  deps?: TitleDevelopmentLLMDeps,
): Promise<
  | { ok: true; run: TitleDevelopmentWorkflowRun; fallback_count: number }
  | { ok: false; next_action: 'request_more_references'; failed_references: { reference_id: string; reasons: string[] }[] }
>;
// 검증 실패 시 LLM 호출 0회로 조기 반환(AC-01~04). 성공 시 run에
// search_terms(WO-1 generateTitleSearchTerms)·combinations·step_results·final_candidates·
// selected_title(최고 total_score)·second_brain_summary(WO-1)·approval_status='draft' 채움(AC-13~15).
```

### S4. 영향 파일 목록

| 파일 | 변경 | 내용 |
|---|---|---|
| `packages/l5-core/src/functions/cmo-strategy/title-development-llm.ts` | 신규 | S3 함수 4개 + 모델/단계명/폴백 상수 + zod 스키마 3개 + 프롬프트 빌더 |
| `packages/l5-core/src/functions/cmo-strategy/__tests__/title-development-llm.test.ts` | 신규 | jest 단위테스트 (S5) — mock LLMClient 주입 |
| `packages/l5-core/src/functions/cmo-strategy/index.ts` | 수정 | `export * from './title-development-llm'` 1줄 추가 |

수정 금지: `title-development.ts`·`title-development-types.ts`(WO-1 계약 불변), `stage-script.ts`, `src/index.ts`(배럴 경유 자동), UI·플러그인·agent-runtime.

### S5. 측정 가능한 acceptance_criteria

모두 `corepack pnpm test`(jest, cwd: packages/l5-core) + `corepack pnpm typecheck`로 검증. LLM은 mock `LLMClient`로 대체(실모델 호출 없음).

| # | 기준 | 측정 방법 |
|---|---|---|
| AC-L1 | S3 함수 4개·상수가 배럴(`src/index`)에서 import 가능, typecheck 통과 | typecheck exit 0 + import 테스트 |
| AC-L2 | mock LLM이 유효 JSON 반환 시 `judgeCombinationAwkwardness`가 4조합의 score/reason/passed/selected를 채우고 `fallback_count=0`; score>0이면 `passed=false`(WO-1 `isAwkward` 일치) | jest |
| AC-L3 | `judgeCombinationAwkwardness`는 입력 배열·원소를 변경하지 않는다(immutability) | jest — 입력 deep-freeze |
| AC-L4 | `runTitleDevelopmentSteps` 결과는 항상 길이 7, `step_number` 2~8 순서, 각각 `step_name`이 S2 상수와 일치 (AC-09) | jest |
| AC-L5 | 각 step_result에 input/output/method_explanation/cmo_reasoning/rejected/selected가 채워지고, N단계 input은 N-1단계 `selected_titles_for_next_step`과 일치 (AC-10) | jest — mock 호출 인자 검사 |
| AC-L6 | LLM 1단계 호출이 2회(maxRetries=1) 모두 형식오류여도 throw하지 않고 해당 단계만 pass-through 폴백, `fallback_count` 증가, 이후 단계는 정상 진행 | jest — 단계 선택적 실패 mock |
| AC-L7 | `llm` 미주입 시 세 함수 모두 LLM 0콜 + 전체 결정론 폴백 + 같은 입력→같은 출력 | jest |
| AC-L8 | 5단계 출력 중 36자 제목은 `rejected_titles`(사유 '35자 초과')로 이동, 35자는 통과 | jest — mock이 35/36자 후보 반환 |
| AC-L9 | `evaluateFinalTitles`: LLM 항목점수가 배점 초과면 클램프 후 합산(WO-1 `scoreFinalTitle`), recommendation 임계 85/70/69 (AC-11) — 만점·84·69 경계 테스트 | jest |
| AC-L10 | 평가 폴백 시 total이 70~84 구간(revise) — 폴백이 upload_candidate가 되지 않음 | jest |
| AC-L11 | `runTitleDevelopmentWorkflow`: §25.1 데이터(8만 Great/Good + 12만 Good/Great) → `ok:true`, combinations 4개·step_results 7개·final_candidates ≥1·selected_title은 최고 total_score 후보·`approval_status='draft'`·second_brain_summary 존재 (AC-13~15) | jest |
| AC-L12 | `runTitleDevelopmentWorkflow`: 레퍼런스 중 1개 조회수 3만(§25.3) → `ok:false`, `next_action='request_more_references'`, LLM 호출 0회 (AC-01~04) | jest — mock 호출수 0 검증 |
| AC-L13 | 모든 LLM 호출에 `trace_name` 전달: awkwardness/step-2..8/final-eval (Rule 6) | jest — mock 호출 인자 검사 |
| AC-L14 | 신규 외부 의존성 0 (package.json 불변) | git diff에 package.json 없음 |
| AC-L15 | WO-1 포함 기존 테스트 회귀 없음 (pre-existing model-routing 4건 제외 기준) | jest 전체 |

### 다음 phase(test)에 넘기는 사항

- mock LLMClient는 `complete` 호출 기록(system/user/trace_name)을 남기는 형태로 작성 — AC-L5/L12/L13이 호출 인자·횟수 검사를 요구.
- LLM 출력 JSON 형태(스키마 3개의 필드 구성)는 test phase에서 mock 응답으로 계약 고정하고, implement는 그 계약을 따른다.
- 환경 주의(WO-1 인계): `pnpm` 단독 없음 → `corepack pnpm`. jest는 `packages/l5-core`에서 실행. pre-existing 실패 4건(model-routing)은 무관.

---

## Phase: test — 실패 테스트 작성 (red)

### 한 일
- 신규 테스트 파일 생성: `packages/l5-core/src/functions/cmo-strategy/__tests__/title-development-llm.test.ts`
- spec S5의 AC-L1~L13 전부 커버: 12 describe / 15 케이스.
  - 호출 기록형 mock LLMClient(`makeMockLLM`) — system/user/trace_name/trace_metadata 기록 + trace_name 라우팅 기본 핸들러(`defaultHandler`).
  - 경계값 고정: 점수 100(클램프)/84/69 · 글자수 35/36 · 단계 7개(2~8) · run당 9콜 · step-4 실패 시 2회 시도(총 8콜).
  - §25.1(정상)·§25.3(조회수 3만 → ok:false + LLM 0콜) 시나리오 반영.

### red 실행 결과 (2026-06-10)
```text
$ corepack pnpm jest src/functions/cmo-strategy/__tests__/title-development-llm.test.ts  (cwd: packages/l5-core)
FAIL src/functions/cmo-strategy/__tests__/title-development-llm.test.ts
  ● Test suite failed to run
    Cannot find module '../title-development-llm' from 'src/functions/cmo-strategy/__tests__/title-development-llm.test.ts'
Test Suites: 1 failed, 1 total
```
구현 파일(`title-development-llm.ts`)이 아직 없어 import 단계에서 실패 — 의도된 red. 커밋 안 함.

### 이번 phase에서 확정한 LLM 출력 JSON 계약 (구현이 따라야 함)
- **awkwardness** (`trace_name='title-dev-awkwardness'`): `[{ index, awkwardness_score, awkwardness_reason, selected_for_next_step }]` — index는 입력 combinations 배열 0-based 순서 (id 추출 불필요하게 index 기반으로 확정).
- **step** (`title-dev-step-{2..8}`): `{ output_titles, method_explanation, cmo_reasoning, rejected_titles:[{title,reason}], selected_titles_for_next_step }` — 단일 객체.
- **final-eval** (`title-dev-final-eval`): `[{ index, target_fit, desire_clarity, problem_sharpness, curiosity_gap, script_match, thumbnail_fit, reason, risks, required_script_additions? }]` — index는 candidates 순서.
- trace_metadata에 `pulling_topic` 필수.

### 테스트가 고정한 세부 동작
- `judgeCombinationAwkwardness`: 불변성(입력 deep-freeze에서 동작, 복사본 반환), `passed = !isAwkward(score)`. 폴백 시 score=0/passed=true + `ref1_thumbnail_ref2_title`·`ref1_title_ref2_thumbnail` 2종만 selected.
- `runTitleDevelopmentSteps`: 2단계 입력=initialTitles, N단계 입력=N-1단계 selected. 단계 폴백 시 output=selected=input, rejected=[], method_explanation에 '실패' 포함. llm 미주입 시 fallback_count=7 + 결정론(같은 입력→같은 출력).
- 5단계만 35자 후처리: 36자 → output/selected에서 제거 + rejected `{title, reason:'35자 초과'}`.
- `evaluateFinalTitles` 폴백: 후보별 total 70~84 + recommendation='revise'.
- `runTitleDevelopmentWorkflow`: 성공 시 calls 9개(어색함1+단계7+평가1), selected_title='최고 total_score 후보', approval_status='draft', second_brain_summary에 선택 제목 포함. 검증 실패 시 `{ok:false, next_action:'request_more_references', failed_references}` + LLM 0콜.

### 다음 phase(구현)가 알아야 할 점
- 위 테스트를 계약으로 `title-development-llm.ts` 구현 + `cmo-strategy/index.ts`에 export 1줄 추가.
- WO-1 함수 재사용: `generateCrossCombinations`/`isAwkward`/`isTitleTooLong`/`scoreFinalTitle`/`recommendFromScore`/`validateTitleReferences`/`generateTitleSearchTerms`/`buildSecondBrainSummary`.
- 환경: `corepack pnpm` 사용(cwd: packages/l5-core). pre-existing 실패 4건(model-routing)은 무관.

---

## Phase: implement — 구현 (green)

### 한 일
- `packages/l5-core/src/functions/cmo-strategy/title-development-llm.ts` 신규 — spec S3 + 테스트 계약 그대로:
  - 상수: `TITLE_DEVELOPMENT_MODEL='claude-sonnet-4-6'`, `STEP_NAMES`(§8 2~8단계), 폴백 사유 3종.
  - 공통: `extractJson`(코드펜스 허용) + `completeJson`(LLM 1콜 + maxRetries 재시도 + zod safeParse, 소진 시 null), `baseSystemPrompt`.
  - `judgeCombinationAwkwardness`: index 기반 배치 1콜, `passed=!isAwkward(score)`, 불변(복사본 반환). 폴백: score 0/passed true + 기본 2종만 선택.
  - `runTitleDevelopmentSteps`: 2~8 순차 단계당 1콜, §10~§16 요약을 단계별 프롬프트 주입(`STEP_GUIDANCE`), N단계 입력=N-1 selected. 5단계만 `isTitleTooLong` 후처리('35자 초과' rejected). 단계별 폴백은 pass-through + 루프 계속. 빈 selected 가드.
  - `evaluateFinalTitles`: index 기반 배치 1콜, 항목 개별 클램프(로컬 SCORE_CAPS) 후 WO-1 `scoreFinalTitle`/`recommendFromScore`. 폴백: 배점 70%(=revise).
  - `runTitleDevelopmentWorkflow`: `validateTitleReferences` 실패 시 LLM 0콜 조기 반환 → 검색어(WO-1)→조합(WO-1)→어색함→7단계→평가→베스트(최고 total) 선택, `approval_status='draft'`, `buildSecondBrainSummary`(WO-1), fallback_count 합산.
- `cmo-strategy/index.ts`에 `export * from './title-development-llm'` 1줄 추가. WO-1 파일·spec 범위 외 파일 미변경, 신규 의존성 0.

### 검증 결과 (2026-06-10)
- 신규 테스트: `jest .../title-development-llm.test.ts` → **16/16 pass (green)**
- `corepack pnpm typecheck` → pass
- 전체 `corepack pnpm test` → **1773 pass / 4 fail** — 실패 4건은 전부 pre-existing `cto-design/model-routing`(WO-1에서 stash로 확인된 env 의존, 이 WO 무관). 신규 회귀 0.
- 변경 파일: 신규 1(`title-development-llm.ts`) + 수정 1(`cmo-strategy/index.ts`) — spec S4 범위 내. 테스트 파일은 직전 phase 커밋에 포함.

### 이번 phase에서 내린 결정
- `completeJson`은 `z.ZodType<T>` 대신 `<S extends z.ZodTypeAny>` 제네릭 — zod `.default()` 출력 타입 보존(typecheck 오류 수정).
- SCORE_CAPS는 WO-1이 export하지 않아(수정 금지) 로컬 상수로 재선언 — 개별 항목 클램프 저장(테스트가 `target_fit=20` 클램프 값 저장을 요구) 때문에 필요.
- LLM 응답에 누락 index가 있으면 부분 채움 대신 콜 전체 폴백(단순성 우선, 어색함/평가는 콜 1회뿐).
- judge에서 `selected_for_next_step = passed && llm.selected` — 어색한 조합이 선택되는 모순 방지.

### 다음 phase(integrate/review)가 알아야 할 점
- worktree pre-existing 미커밋: `docs/reports/videoqa_eval_result.{json,md}` — WO 무관, 불가침.
- 소비자 배선(stage-script/plugin/agent-runtime)은 WO-2 범위 밖 — STAGE_SCRIPT 텍스트는 WO-1에서 이미 8단계 안내로 배선됨. 실행기 호출부 연결은 후속 WO.
- eslint 바이너리는 이 worktree에 미설치(WO-1과 동일) — deps 설치된 환경에서 `pnpm lint` 1회 권장.

---

## Phase: integrate — 통합·배선

### 한 일
1. **CMO 스킬 신규 등록**: `cmo-orchestrator/skills/title-development.ts` — `createTitleDevelopmentSkill(overrides?, deps?)`, skill_id `cmo.title.development`(category content, D2, depends_on `['cmo.pulling.plan']`). WO-2 실행기 `runTitleDevelopmentWorkflow`로 위임하고 결과를 WO-1 `buildTitleDevelopmentProposal`(PRD §20.1/AC-14) 구조 + `insight=second_brain_summary` + `suggested_next=['cmo.script.write']`로 반환. 레퍼런스 <2 / pulling_topic 누락 / 조건 미달은 ok:false.
2. **기존 진입점(레지스트리) 수정**: `cmo-skill-registry.ts` — `createCmoSkills`/`createCmoSkillRegistry`에 옵션 `{ title_development_deps?: TitleDevelopmentLLMDeps }` 추가(기본 무인자 호출 호환 유지) + 신규 스킬 등록(기본 10→11개). **플러그인(`plugin-orchestration/src/server/plugin.ts:96~99`)이 이미 `createCmoSkillRegistry`를 require로 소비**하므로 플러그인 코드 변경 없이 라이브 경로에 연결됨.
3. **배럴 배선**: `cmo-orchestrator/index.ts`에 `export * from './skills/title-development'` 추가.
4. **기존 테스트 정렬**: `cmo-v3-e2e.test.ts`의 기본 스킬 수 단언 10→11 + `cmo.title.development` 포함 단언.
5. **통합 테스트 5개 추가**: `__tests__/title-development-skill.test.ts` — 레지스트리 등록·topo-sort(pulling.plan→title.development), registry deps 옵션으로 LLM 주입 시 실호출 확인, 결정론 폴백 proposal 생성(조합4/단계7/draft), AC-01/§25.3 거절 경로.

### 중복 정렬 판단
- 기존 `cmo.title.thumbnail`(buildThumbnailPlan, 썸네일 후보 생성)과는 **책임이 다름** — 병존이 맞다. 새 스킬 주석에 구분 명시. 대체/위임 대상 구버전 없음(8단계 디벨롭은 신규 능력).

### 검증 결과 (2026-06-10)
- `corepack pnpm typecheck` pass
- cmo-orchestrator suite 13개 전체 pass (신규 5 포함), 신규 스킬 테스트 5/5
- 전체 jest: **1778 pass / 4 fail** — 실패는 pre-existing `model-routing` 4건 그대로. 신규 회귀 0.

### 이번 phase에서 내린 결정
- spec S4의 "수정 금지: 플러그인"은 유지 — 통합 지점을 l5-core 내부의 `createCmoSkillRegistry`(플러그인이 이미 소비하는 registry 진입점)로 선택해 플러그인 무변경으로 라이브 경로 연결. 시그니처는 optional 파라미터라 기존 호출부 호환.
- 스킬 run의 정적 반환 타입은 ToolResult(베이스)라 테스트에서 insight는 캐스트로 접근.

### 다음 phase(review/commit)가 알아야 할 점
- 변경 파일: 신규 2(`skills/title-development.ts`, `__tests__/title-development-skill.test.ts`) + 수정 3(`cmo-skill-registry.ts`, `cmo-orchestrator/index.ts`, `cmo-v3-e2e.test.ts`).
- nocobase 플러그인은 l5-core **dist**를 require — 라이브 반영에는 l5-core 재빌드 + nocobase 재기동 필요(메모리: dist 함정). 소스 레벨 통합은 완료.
- LLM 실주입은 플러그인/agent-runtime에서 `createCmoSkillRegistry({ title_development_deps: { llm } })` 호출만 하면 됨 — 후속 WO.
- worktree pre-existing 미커밋: `docs/reports/videoqa_eval_result.{json,md}` — 불가침 유지.

---

## Phase: review — 리뷰

### 검토 범위
WO-2 diff 전체(커밋 cb129df 기준 worktree): `title-development-llm.ts`(신규 603줄), `__tests__/title-development-llm.test.ts`(신규 506줄), `cmo-orchestrator/skills/title-development.ts`(신규 96줄), `__tests__/title-development-skill.test.ts`(신규 104줄), `cmo-skill-registry.ts`(수정), `cmo-orchestrator/index.ts`(+1줄), `cmo-v3-e2e.test.ts`(수정), `cmo-strategy/index.ts`(+1줄), 진행 노트.

### 리뷰 코멘트 및 처리

| # | 위치 | 심각도 | 내용 | 처리 |
|---|---|---|---|---|
| R1 | title-development-llm.ts:116-120 | minor | `extractJson`의 `Math.min(...[...].map())` — 배열 길이가 2라 성능 무관하지만, 두 char 모두 없으면 `Math.min(Infinity, Infinity)=Infinity`이고 `end=Math.max(-1,-1)=-1` → `end<=start` 가드가 잡으므로 **안전**. 동작 OK | 유지 |
| R2 | title-development-llm.ts:72-80 | trivial | SCORE_CAPS가 WO-1 `title-development.ts:232`의 동일 상수와 중복. 진행 노트에 "WO-1 미export라 로컬 재선언" 근거가 기록돼 있고, WO-1 수정 금지 제약이라 **허용** | 유지 — WO-1이 export하면 소거 가능(후속 리팩터) |
| R3 | title-development-llm.ts:353-365 | nit | 5단계 35자 후처리에서 `isTitleTooLong`을 `output_titles`와 `selected_titles_for_next_step` 양쪽에 2회 호출. 제목 수가 적어(~4개) 성능 무관, 로직 명확 | 유지 |
| R4 | title-development-llm.ts:486 | nit | 폴백 점수 `SCORE_CAPS[key] * 0.7`가 소수(예: curiosity_gap 15*0.7=10.5). `scoreFinalTitle`(WO-1:243)은 `Math.max(0, Math.min(cap, score))`로 클램프하므로 10.5가 그대로 합산 → 총 70점. 테스트(AC-L10)는 70~84 범위를 검증하고 pass하므로 **의도대로 동작**. 단, 실 DB 저장 시 정수 기대면 `Math.round` 필요 | 유지 — l5-core는 JS 내 순수 로직이라 소수 허용. DB 직렬화 시점은 후속 WO |
| R5 | cmo-skill-registry.ts:16-17 | trivial | `createTitleDevelopmentSkill` import가 `createTitleThumbnailSkill` 바로 뒤가 아닌 다음 줄에 있고, `TitleDevelopmentLLMDeps` import가 그 사이에 끼어 있어 그룹핑이 약간 어색 | **수정** → import를 기능 그룹으로 정렬 |
| R6 | skills/title-development.ts:60 | nit | `ctx?.task_id`에서 ctx가 ToolRunContext인데 `task_id` 필드가 실제 타입에 없음(SkillExecutionContext에는 있음). 런타임에 undefined fallback으로 안전하고 테스트도 `as never`로 주입 중 | 유지 — 기존 스킬(title-thumbnail.ts:31)도 동일 패턴 |
| R7 | cmo-v3-e2e.test.ts:100-106 | — | 스킬 수 10→11 업데이트 + `cmo.title.development` 포함 단언. 정확 | — |
| R8 | 배럴(index.ts 양쪽) | — | cmo-strategy와 cmo-orchestrator 배럴에 export 추가. 기존 패턴 일치 | — |
| R9 | 테스트 전체(llm.test.ts + skill.test.ts) | — | AC-L1~L13 + 스킬 통합 5건. mock 계약·경계값·폴백·불변성·trace·조기반환 전부 커버. 지적 없음 | — |
| R10 | PRD/spec 정합 | — | §8 단계명·§9.5 어색함 기준·§10~§16 단계별 가이던스·§17.2 배점·§21.4~21.6 시그니처·§24 AC 전부 일치 | — |

### R5 수정

`cmo-skill-registry.ts` import 그룹핑 정리: skill factory import를 알파벳 순서(title-development → title-thumbnail → script)로 정렬하고 type import(`TitleDevelopmentLLMDeps`)를 마지막으로 이동.

### 판정: **LGTM** (R5 수정 반영 완료)

### 수정 후 재검증
- `corepack pnpm typecheck` pass
- cmo-orchestrator suite 13개 전체 55 pass
- cmo-strategy suite 포함 기존 테스트 회귀 없음(pre-existing model-routing 4건 제외)

### 다음 phase(commit)가 알아야 할 점
- 리뷰 수정 1건(R5)은 import 순서뿐, 시그니처·테스트 계약 불변.
- 미해결 항목 없음.

---

## Phase: commit — 커밋

### 한 일
- 직전 review phase 산출물과 검증 결과를 확인하고, commit phase 작업 기록을 진행 노트에 append.
- 작업 범위는 WO-2 전체 산출물의 커밋 고정이며, 코드/테스트 계약 변경 없음.

### 변경·생성 파일
- 이번 phase 직접 변경: `docs/_acr-progress/wo-2-l5-core-8단계-llm-실행기.md`
- WO-2 산출물(직전 phase까지): `packages/l5-core/src/functions/cmo-strategy/title-development-llm.ts`, `packages/l5-core/src/functions/cmo-strategy/__tests__/title-development-llm.test.ts`, `packages/l5-core/src/functions/cmo-orchestrator/skills/title-development.ts`, `packages/l5-core/src/functions/cmo-orchestrator/__tests__/title-development-skill.test.ts`, 관련 배럴/레지스트리/e2e 테스트.

### 결정
- 커밋 메시지는 요청 spec에 맞춰 `task: WO-2: l5-core 8단계 LLM 실행기`로 사용.
- origin push는 별도 명시가 없고 현재 phase acceptance가 "필요 시"이므로, 로컬 단일 신규 커밋 검증까지만 수행.

### 다음 phase가 알아야 할 점
- 리뷰 phase에서 미해결 항목 0, typecheck pass, cmo-orchestrator 13 suite 55/55 pass.
- 전체 jest의 `model-routing` 4건 실패는 pre-existing env 의존 이슈로 WO-2 신규 회귀가 아님.
