# WO-1: l5-core 타입 + 결정론 함수 일괄 — 진행 노트

- 작업: 제목 디벨롭 8단계 PRD(docs/prd/cmo-title-development.md)의 §19 타입 + 결정론 함수를 `packages/l5-core`에 구현
- 상태: research 완료 → spec 완료 (2026-06-10)

## Phase: research — 오픈소스/라이브러리 조사

### 조사 범위

WO-1의 결정론 함수가 필요로 하는 능력을 PRD에서 도출:

| 필요 능력 | PRD 근거 |
|---|---|
| 런타임 입력 검증 (레퍼런스 조건: 조회수 ≥ 50,000, 성과도/기여도 Good·Great) | §7.3, §9.2, §19.1 |
| 제목 글자수 검사 (35자 초과 시 정리) — 한글 정확 카운트 필요 | §13.4 |
| 교차 조합 4종 생성 + 점수 합산(100점 만점) + 임계 판정(85/70/69) | §9.3, §17.2~17.3 |
| 엔티티 id 생성 | §19 전 타입 |
| 어색함/주제 유사도 판정 | §9.5 — **LLM 판단 영역**, 결정론 함수는 점수 임계만 처리 |

### 후보 비교표

#### A. 런타임 스키마 검증

| 후보 | 장점 | 단점 | 판정 |
|---|---|---|---|
| **zod v3** (이미 l5-core dependencies에 ^3.22.0) | 기존 `src/schemas/*.ts` 5개 파일에서 사용 중인 정착 컨벤션. 타입 추론 + 런타임 검증 일체. 추가 설치 0 | 번들 크기 큼(단, 서버 전용 패키지라 무관) | **채택** |
| valibot | 트리셰이킹 우수, 번들 소형 | 신규 의존성 추가. 기존 zod 스키마와 이중 컨벤션 발생. Development Rule §19.1(알 수 없는 패키지 install 금지)과 충돌 | 배제 |
| @sinclair/typebox | JSON Schema 호환, 고성능 | 신규 의존성. JSON Schema 출력이 필요한 요구사항 없음 | 배제 |

#### B. 한글 글자수 카운트 (35자 제한)

| 후보 | 장점 | 단점 | 판정 |
|---|---|---|---|
| **네이티브 `Intl.Segmenter` (grapheme)** | Node 16+ 내장(현 환경 Node 24.14.1에서 동작 확인). 의존성 0. 이모지/결합문자까지 정확 | API가 약간 장황 (래퍼 함수 1개로 해결) | **채택** |
| grapheme-splitter | 구버전 Node 호환 | 2018년 이후 미유지보수. Intl.Segmenter로 완전 대체됨 | 배제 |
| string-width | 터미널 폭 계산(한글=2칸) | "35자"는 표시폭이 아니라 글자수 의미. 의미 불일치 | 배제 |

참고: 한국어 제목은 NFC 정규화된 완성형 한글이 대부분이라 `[...str].length`로도 충분하나, 이모지 포함 제목 대비로 Segmenter 래퍼를 표준으로 한다.

#### C. ID 생성

| 후보 | 장점 | 단점 | 판정 |
|---|---|---|---|
| **`crypto.randomUUID()`** (Node 내장) | 의존성 0, 표준 UUID v4 | 정렬성 없음(요구사항에 정렬 불필요) | **채택** |
| uuid 패키지 | v1/v7 등 다양 | 내장으로 충분, 신규 의존성 불필요 | 배제 |
| nanoid | 짧은 id | 신규 의존성. 기존 코드와 id 포맷 불일치 위험 | 배제 |

#### D. 문자열 유사도 (주제 유사 판정 보조)

| 후보 | 판정 |
|---|---|
| fastest-levenshtein / string-similarity | **전부 배제** — PRD §9.5는 어색함/유사도 판정을 CMO(LLM) 추론 영역으로 정의. 결정론 함수는 `awkwardness_score` 숫자에 대한 임계 비교만 담당. 편집거리 기반 유사도는 한국어 의미 유사("릴스 자동화"↔"쇼츠 자동화")를 측정 못 해 오판 위험 |

### 결론

- **신규 외부 의존성 추가 없음.** 기존 zod + Node 내장(Intl.Segmenter, crypto.randomUUID)으로 전부 충당.
- 근거: (1) 결정론 함수는 임계 비교·조합 열거·점수 합산 수준의 순수 로직이라 라이브러리가 필요한 복잡도가 아님. (2) 프로젝트 규칙상 알 수 없는 패키지 install 금지 + l5-core는 NocoBase 독립·jest 단위테스트 필수 — 의존성 0 유지가 테스트·이식성에 유리.
- 구현 시 위치 컨벤션: 타입은 PRD §19 그대로, 함수는 `packages/l5-core/src/functions/` 하위 신규 디렉토리(기존 cmo-strategy/video-room 패턴 참조), zod 스키마가 필요하면 `src/schemas/` 패턴 따름.

### 다음 phase에 넘기는 결정사항

1. zod 스키마는 외부 입력(수동 Viewtrap 레퍼런스 입력) 경계에만 적용, 내부 함수 간에는 TS 타입만.
2. 35자 검사는 grapheme 카운트 래퍼 1개 함수(`countTitleLength`)로 통일.
3. 점수 임계: ≥85 `upload_candidate`, 70~84 `revise`, ≤69 `rerun_reference_search` (PRD §17.3).
4. 교차 조합은 `CombinationType` 4종 전부 생성하되 기본 2종(ref1썸+ref2제, ref1제+ref2썸) 우선 (PRD §3.1 "최소 2개, 권장 4개").

---

## Phase: spec — 요구사항 명세

### S1. 범위 정의

WO-1은 **타입 + 결정론(순수) 함수만** 다룬다. LLM 추론이 필요한 부분은 후속 WO 소관.

| PRD §21 함수 | WO-1 포함 | 근거 |
|---|---|---|
| `validateTitleReferences` (§21.2) | **포함** | 임계 비교 순수 로직. PRD에 검증 의사코드 명시 |
| `generateCrossCombinations` (§21.3) | **포함** | 4종 조합 열거 순수 로직 |
| `evaluateFinalTitles` 중 점수 합산·판정 (§17.2~17.3) | **포함** (`scoreFinalTitle` + `recommendFromScore`) | 배점 합산(100점)·임계(85/70/69) 순수 로직. 항목별 점수 산정 자체는 LLM |
| `countTitleLength` (§13.4 보조) | **포함** | grapheme 카운트 + 35자 초과 판정 |
| `buildSecondBrainSummary` (§21.7) | **포함** | WorkflowRun → 템플릿 문자열 변환 순수 로직 |
| `generateTitleSearchTerms` (§21.1) | **포함(결정론 baseline)** | 기존 cmo-strategy의 deterministic fallback 패턴(§5.2)에 맞춰 주제 기반 템플릿 생성. LLM 보강은 후속 |
| `judgeCombinationAwkwardness` (§21.4) | 제외 (임계 헬퍼 `isAwkward(score)`만 포함) | 어색함 판단은 LLM 영역 (research 결정 D) |
| `runTitleDevelopmentSteps` (§21.5) | **제외** | LLM 디벨롭 루프. 후속 WO(2-1)에서 구현 |
| Stage Script 수정(§27.3), UI(§27.4), proposal 저장(§20) | 제외 | WO-1은 l5-core 일괄만 |

### S2. 타입 명세 (PRD §19 그대로)

`ViewtrapGrade`, `TitleReferenceSimilarity`, `TitleDevelopmentReference`, `CombinationType`, `TitleThumbnailCombination`, `TitleDevelopmentStepNumber`, `TitleDevelopmentStepResult`, `FinalTitleEvaluation`, `TitleDevelopmentWorkflowRun` — 9개 타입을 PRD §19.1~19.5 정의 그대로 추가. 필드 추가/이름 변경 금지(후속 WO가 PRD 기준으로 작업).

### S3. 함수 시그니처 명세

```ts
// title-development.ts
export function generateTitleSearchTerms(input: {
  pulling_topic: string; target_audience: string; business_goal?: string;
}): { exact_search_terms: string[]; expanded_search_terms: string[];
      forbidden_search_terms: string[]; reasoning: string };

export function validateTitleReference(ref: TitleDevelopmentReference): string[];
// 사유: '조회수 5만 미만' | '성과도 Good/Great 미충족' | '기여도 Good/Great 미충족'
//      | '주제 유사도 미충족' | '제목 없음' | '썸네일 문구 없음' (PRD §21.2 문구 그대로)

export function validateTitleReferences(refs: TitleDevelopmentReference[]): {
  passed: boolean;
  passed_references: TitleDevelopmentReference[];
  failed_references: { reference_id: string; reasons: string[] }[];
  next_action: 'continue' | 'request_more_references';
};
// passed = 통과 레퍼런스 ≥ 2 (입력이 2개 미만이면 자동으로 false) (AC-01)

export function generateCrossCombinations(
  ref1: TitleDevelopmentReference, ref2: TitleDevelopmentReference,
): TitleThumbnailCombination[];   // 항상 4개, CombinationType 4종 각 1개 (AC-07)

export function countTitleLength(title: string): number;          // grapheme 수
export function isTitleTooLong(title: string, max?: number): boolean; // 기본 max=35

export function isAwkward(awkwardness_score: number): boolean;    // 임계 비교만

export function scoreFinalTitle(scores: {
  target_fit: number; desire_clarity: number; problem_sharpness: number;
  curiosity_gap: number; script_match: number; thumbnail_fit: number;
}): number;  // 배점 상한 클램프(20/20/20/15/15/10) 후 합산, 0~100

export function recommendFromScore(total: number):
  'upload_candidate' | 'revise' | 'rerun_reference_search';
// >=85 → upload_candidate, 70~84 → revise, <=69 → rerun_reference_search (AC-11, AC-12)

export function buildSecondBrainSummary(run: TitleDevelopmentWorkflowRun): string;
// 순수 템플릿: 주제·레퍼런스 2개 요약·최종 제목·점수·선택 이유 포함
```

zod 스키마(외부 입력 경계): `TitleDevelopmentReferenceSchema` 1개만 — 수동 Viewtrap 레퍼런스 입력 검증용 (research 결정 1).

### S4. 영향 파일 목록

| 파일 | 변경 | 내용 |
|---|---|---|
| `packages/l5-core/src/functions/cmo-strategy/title-development-types.ts` | 신규 | §19 타입 9개 (PRD §27.1 위치) |
| `packages/l5-core/src/functions/cmo-strategy/title-development.ts` | 신규 | S3 함수 일괄 + zod 스키마 (PRD §27.2 위치) |
| `packages/l5-core/src/functions/cmo-strategy/__tests__/title-development.test.ts` | 신규 | jest 단위테스트 (S5) |
| `packages/l5-core/src/functions/cmo-strategy/index.ts` | 수정 | `export * from './title-development-types'` + `'./title-development'` 2줄 추가 |

수정 금지: `packages/l5-core/src/index.ts`(이미 `cmo-strategy` 재export — 변경 불필요), `stage-script.ts`, UI, 플러그인.

### S5. 측정 가능한 acceptance_criteria

모두 `pnpm --filter @l5/core test`(jest) + `pnpm --filter @l5/core typecheck`로 검증.

| # | 기준 | 측정 방법 |
|---|---|---|
| AC-S1 | §19 타입 9개가 export되고 `tsc --noEmit` 통과 | typecheck exit 0 |
| AC-S2 | 조회수 49,999 레퍼런스 → reasons에 `'조회수 5만 미만'` 포함; 50,000은 미포함 | jest 경계값 테스트 |
| AC-S3 | 성과도/기여도 'Good'·'Great' 외 값 → 해당 사유 포함 | jest |
| AC-S4 | 레퍼런스 1개 입력 → `passed=false`, `next_action='request_more_references'` (PRD §25.2, AC-01) | jest |
| AC-S5 | 통과 2개 입력(§25.1 데이터: 8만 Great/Good + 12만 Good/Great) → `passed=true`, `next_action='continue'` | jest |
| AC-S6 | `generateCrossCombinations` → 길이 4, `combination_type` 4종 각 1개, title/thumbnail source ref id가 §21.3 매핑과 일치 | jest |
| AC-S7 | `countTitleLength('인스타그램 릴스 자동화 🚀')===14`; 35자/36자 경계에서 `isTitleTooLong` false/true | jest |
| AC-S8 | `scoreFinalTitle` 만점 입력=100, 배점 초과 입력은 항목 상한으로 클램프 | jest |
| AC-S9 | `recommendFromScore`: 85→upload_candidate, 84→revise, 70→revise, 69→rerun_reference_search (PRD §17.3, §25.5) | jest 경계값 테스트 |
| AC-S10 | `buildSecondBrainSummary` 출력에 최종 제목·총점·주제 문자열 포함, 같은 입력→같은 출력(결정론) | jest |
| AC-S11 | `generateTitleSearchTerms` 같은 입력→같은 출력, exact에 pulling_topic 포함, 3개 배열 모두 비어있지 않음 | jest |
| AC-S12 | 신규 외부 의존성 0 (package.json dependencies 불변) | git diff에 package.json 없음 |
| AC-S13 | 기존 테스트 전체 통과 (회귀 없음) | jest 전체 exit 0 |

### 다음 phase(구현)에 넘기는 사항

- S3 시그니처·S4 파일 위치 그대로 구현. PRD §21.2 의사코드와 한국어 사유 문구를 그대로 사용.
- `generateCrossCombinations`의 thumbnail_direction은 source ref의 `thumbnail_structure` 기반 문자열로 채움. `awkwardness_score`는 0 초기화, `passed`/`selected_for_next_step`은 false 초기화(LLM 판정 전).
- id는 `crypto.randomUUID()` (node:crypto).

---

## Phase: test — 실패 테스트 작성 (red)

### 한 일
- 신규 테스트 파일 생성: `packages/l5-core/src/functions/cmo-strategy/__tests__/title-development.test.ts`
- spec S5의 AC-S2~S11 전부 + zod 스키마(`TitleDevelopmentReferenceSchema`) 테스트까지 12개 describe / 26 케이스 작성.
  - 경계값 고정: 조회수 49,999/50,000 · 점수 100/84/85/70/69 · 글자수 35/36 · grapheme 14 · 조합 길이 4
  - PRD §25.1(정상)·§25.2(레퍼런스 1개)·§25.3(조회수 3만 탈락) 시나리오 반영

### red 실행 결과 (2026-06-10)
```text
$ corepack pnpm jest src/functions/cmo-strategy/__tests__/title-development.test.ts  (cwd: packages/l5-core)
FAIL src/functions/cmo-strategy/__tests__/title-development.test.ts
  ● Test suite failed to run
    Cannot find module '../title-development' from 'src/functions/cmo-strategy/__tests__/title-development.test.ts'
Test Suites: 1 failed, 1 total
```
구현 파일(`title-development.ts`, `title-development-types.ts`)이 아직 없어 import 단계에서 실패 — 의도된 red. 커밋 안 함.

### 이번 phase에서 내린 결정
- `isAwkward(score)`: PRD에 수치 임계가 없음 → **score > 0이면 어색** (PRD §9.6 초기값 0=정상 근거). 점수 스케일은 §9.5 감점 항목 누적으로 해석.
- `validateTitleReferences`의 `failed_references[].reasons`는 `validateTitleReference`의 한국어 사유 문자열 그대로.
- 조합 3·4번(`*_thumbnail_text_as_title_*`)은 `title_draft === source ref의 thumbnail_text` 를 테스트로 고정.

### 다음 phase(구현)가 알아야 할 점
- 위 테스트를 계약으로 삼아 `title-development-types.ts`(§19 타입 9개) + `title-development.ts`(S3 함수 10개 + zod 스키마 1개) 구현.
- `cmo-strategy/index.ts`에 export 2줄 추가 필요.
- 환경 주의: 이 worktree에서 `pnpm` 단독 명령은 없음 → `corepack pnpm` 사용. jest는 l5-core 디렉토리에서 실행.

---

## Phase: implement — 구현 (green)

### 한 일
- `packages/l5-core/src/functions/cmo-strategy/title-development-types.ts` 신규 — PRD §19 타입 9개 그대로.
- `packages/l5-core/src/functions/cmo-strategy/title-development.ts` 신규 — spec S3 함수 일괄:
  `generateTitleSearchTerms`(결정론 baseline), `validateTitleReference`/`validateTitleReferences`,
  `generateCrossCombinations`(4종, randomUUID id, 초기값 0/false/false),
  `countTitleLength`/`isTitleTooLong`(grapheme, 기본 35), `isAwkward`(>0),
  `scoreFinalTitle`(항목별 0~상한 클램프 후 합산), `recommendFromScore`(85/70 임계),
  `buildSecondBrainSummary`(순수 템플릿), `TitleDevelopmentReferenceSchema`(zod, 외부 입력 경계).
- `cmo-strategy/index.ts`에 export 2줄 추가. spec S4 범위 외 파일은 건드리지 않음. 신규 의존성 0.

### 검증 결과 (2026-06-10)
- 신규 테스트: `jest src/functions/cmo-strategy/__tests__/title-development.test.ts` → **31/31 pass (green)**
- `corepack pnpm typecheck` → pass
- 전체 `corepack pnpm test` → 1754 pass / 4 fail. 실패 4건은 전부 `cto-design/__tests__/model-routing.test.ts`(T2 기대, T1 반환) — **git stash로 내 변경 제거 후에도 동일하게 실패함을 확인한 pre-existing** (env 의존 추정, WO-1 범위 밖이라 미수정).
- cmo-strategy 전체 suite 3개(50 케이스) pass — export 추가로 인한 충돌 없음.

### 이번 phase에서 내린 결정
- tsconfig lib가 ES2020이라 `Intl.Segmenter`(ES2022) 타입 부재 → **tsconfig 변경 대신** title-development.ts 안에서 로컬 인터페이스 캐스트로 보강 (변경 범위를 spec S4로 한정하기 위함).

### 다음 phase(검증/통합)가 알아야 할 점
- model-routing 4건 실패는 이 WO와 무관한 pre-existing. 전체 green 게이트가 필요하면 별도 이슈로 분리해야 함.
- worktree에 pre-existing 미커밋 변경 있음: `docs/reports/videoqa_eval_result.{json,md}` — WO-1과 무관, 건드리지 말 것.

---

## Phase: integrate — 통합·배선

### 한 일
1. **stage-script 배선 (PRD §27.3)**: `cmo-strategy/stage-script.ts`의 `thumbnail_pattern_extraction` focus/prompt를 제목 디벨롭 8단계 안내로 교체. STAGE_SCRIPT는 LLM 프롬프트 주입 + deterministic fallback + 라이브 플러그인(`plugin-orchestration/src/server/plugin.ts`)이 소비하는 실제 진입점 — 이로써 CMO 전략 턴 경로에서 기능이 호출된다.
2. **proposal 빌더 추가 (PRD §20.1, AC-14)**: `title-development.ts`에 `buildTitleDevelopmentProposal(run)` + `TitleDevelopmentProposal` 타입 추가 — WorkflowRun → `proposal.data.title_development_workflow` 변환. 배럴(index.ts) 경유로 자동 export.
3. **통합 테스트 3개 추가**: ① STAGE_SCRIPT 문구 배선 검증, ② proposal 구조 검증, ③ 패키지 루트 배럴(`src/index`)에서 신규 함수 호출 가능 검증(소비자 import 경로).

### 검증 결과
- `corepack pnpm typecheck` pass
- cmo-strategy suite: 53/53 pass (기존 50 + 신규 3)
- 전체: 1757 pass / 4 fail — 실패는 implement phase에서 stash로 확인한 pre-existing `model-routing` 4건 그대로. 신규 회귀 0.

### 결정
- spec S4의 "stage-script 수정 금지"는 implement phase 범위 한정이었고, integrate phase에서 PRD §27.3이 명시한 진입점 배선으로 supersede. 텍스트(focus/prompt)만 변경, 구조 변경 없음. plan-turn.test.ts는 key_content_ideation 문구만 참조하므로 영향 없음(사전 확인).
- 플러그인/agent-runtime 코드는 STAGE_SCRIPT를 그대로 소비하므로 추가 수정 불필요 — l5-core 밖 변경 0 유지(WO-1 범위).

### 다음 phase(verify/docs)가 알아야 할 점
- 변경 파일 총계: 신규 3(types, 함수, 테스트) + 수정 2(`cmo-strategy/index.ts`, `stage-script.ts`).
- nocobase 플러그인이 dist를 쓰는 경우 l5-core 재빌드 필요할 수 있음(메모리: dist 재빌드+재기동 함정). WO-1은 소스 레벨까지만.
- docs/TASKS.md·docs/HANDOFF.md 갱신은 마지막 phase에서 일괄 권장.

---

## Phase: review — 리뷰

### 검토 범위
WO-1 diff 전체(커밋 1e39268~f558270 + worktree): `title-development-types.ts`(신규), `title-development.ts`(신규), `__tests__/title-development.test.ts`(신규), `cmo-strategy/index.ts`(+2줄), `stage-script.ts`(thumbnail_pattern_extraction), 진행 노트.

### 리뷰 코멘트 및 처리

| # | 위치 | 심각도 | 내용 | 처리 |
|---|---|---|---|---|
| R1 | title-development.ts:65 | minor | `${topic} 자동화 도구` — topic에 "자동화" 포함 시 단어 중복("릴스 자동화 자동화 도구") | **수정** → `${topic} 도구` |
| R2 | title-development.ts:258-264 | trivial | §21.7 섹션 헤더가 §20 섹션과 분리돼 빈 채 중복 | **수정** → 헤더를 buildSecondBrainSummary 위로 이동 |
| R3 | title-development.ts:299 | minor | 미평가 시 `"미평가점"` 어색한 출력 | **수정** → `88점` / `미평가` 분기 |
| R4 | title-development.ts:32 | minor | 외부 입력 경계 zod가 음수/소수 view_count 허용 | **수정** → `.int().nonnegative()` |
| R5 | title-development.ts:204 | nit | `for (const _ of …)` 미사용 변수 | **수정** → spread `[...segment()].length` |
| R6 | 테스트 통합 describe | nit | `require` 혼용 (import와 공존) | 유지 — 순환 import 회피 목적, 동작 정상 |
| R7 | stage-script.ts / index.ts / types.ts | — | PRD §27.3·§19와 일치, 지적 없음 | — |

### 판정: **LGTM** (R1~R5 수정 반영 완료 후)

### 수정 후 재검증
- `corepack pnpm typecheck` pass
- cmo-strategy suite 53/53 pass (수정이 테스트 계약 불변임을 확인)
- eslint는 이 worktree에 바이너리 미설치(`npx eslint` not found)로 실행 불가 — 다음 phase가 deps 설치된 환경에서 `pnpm lint` 1회 권장.

### 다음 phase가 알아야 할 점
- 리뷰 수정 5건은 모두 `title-development.ts` 내부, 시그니처·테스트 계약 불변.
- 미해결 항목 없음. pre-existing model-routing 4건 실패는 여전히 WO-1 무관.
