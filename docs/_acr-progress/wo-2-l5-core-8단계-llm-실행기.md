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
