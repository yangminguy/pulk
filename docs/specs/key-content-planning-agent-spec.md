# Spec: Key Content Planning Agent — 11단계 워크플로우 구현

> Phase 2 of CMO Content Strategy v3
> PRD 근거: `docs/prd/cmo-content-strategy-v3.md` §3

---

## 1. 목적

상품의 기능/특징/장점에서 고객 문제를 역으로 도출하고, 소비자 행동 5단계 퍼널에 배치해 자연스러운 판매 논리를 가진 키 콘텐츠 주제를 확정하는 11단계 순수 함수 파이프라인을 구현한다.

---

## 2. 현재 상태 (이미 존재)

| 구분 | 파일 | 내용 |
|------|------|------|
| 타입 전체 | `types.ts` | 10개 산출물 인터페이스 + 보조 타입 (Step 1~11) |
| 후보 빌더 | `key-content.ts` | `createKeyContentCandidate`, `selectKeyContent`, `approveKeyContent` (PRD §7.2/§7.4) |
| Viewtrap 세션 | `viewtrap-research.ts` | `createViewtrapResearchSession`, `addSearchKeywords`, `completeResearchSession` |
| 상태머신 | `state-machine.ts` | `VIDEO_ROOM_FLOW`, `pageForStatus`, `GATE_BY_STATUS` |

---

## 3. 구현 범위

### 3.1 새 파일: `key-content-planning.ts`

11단계 각 step에 대응하는 순수 빌더/검증 함수 + 파이프라인 오케스트레이터.

**설계 원칙:**
- 순수 함수 only (no Date.now, no randomUUID, no side effects)
- 모든 id/timestamp는 caller가 주입
- `types.ts`에서 이미 정의된 인터페이스를 그대로 사용
- l5-core 컨벤션: `requireNonEmpty` 패턴으로 입력 검증

### 3.2 함수 시그니처

```ts
// ── Step 1. 내 아이템 일반화 ──
export function buildItemGeneralization(input: {
  product: ProductBrief;
}): ItemGeneralization;

// ── Step 2. 내 아이템의 기능/특징/장점 정리 ──
export function buildItemFeatureBenefitMap(input: {
  product: ProductBrief;
  features: FeatureBenefit[];
  characteristics: FeatureBenefit[];
  benefits: FeatureBenefit[];
}): ItemFeatureBenefitMap;

// ── Step 3. 카테고리의 기능/특징/장점 정리 ──
export function buildCategoryFeatureBenefitMap(input: {
  generalization: ItemGeneralization;
  features: FeatureBenefit[];
  characteristics: FeatureBenefit[];
  benefits: FeatureBenefit[];
}): CategoryFeatureBenefitMap;

// ── Step 4. 기능/특징/장점이 해결하는 문제 도출 ──
export function deriveProblemMap(input: {
  item_fb: ItemFeatureBenefitMap;
  category_fb: CategoryFeatureBenefitMap;
  item_problems: ProblemCandidate[];
  category_problems: ProblemCandidate[];
  selected_problem_ids: string[];
}): ProblemDerivationMap;

// ── Step 5. 현상/욕구/계획/행동/보상 퍼널 구성 ──
export function buildFunnelPlanningMap(input: {
  phenomenon: FunnelStageItem[];
  desire: FunnelStageItem[];
  plan: FunnelStageItem[];
  action: FunnelStageItem[];
  reward: FunnelStageItem[];
}): FunnelPlanningMap;

// ── Step 6. 키 콘텐츠 진입 단계 결정 ──
export function decideKeyContentEntryStage(input: {
  funnel: FunnelPlanningMap;
  selected_entry_stage: 'phenomenon' | 'desire' | 'plan';
  rationale: string;
}): KeyContentEntryDecision;

// ── Step 7. Viewtrap 검색축 생성 ──
export function generateSearchKeywords(input: {
  generalization: ItemGeneralization;
  item_fb: ItemFeatureBenefitMap;
  category_fb: CategoryFeatureBenefitMap;
  problems: ProblemDerivationMap;
}): KeyContentSearchKeywordSet;

// ── Step 8. Viewtrap으로 키 콘텐츠 후보 검증 ──
export function buildViewtrapValidation(input: {
  validated_keywords: string[];
  candidate_titles: string[];
  performance_score: 'normal' | 'good' | 'great';
  contribution_score: 'normal' | 'good' | 'great';
  growth_status: 'growing' | 'stalled' | 'unknown';
  channel_value_risk: boolean;
  person_value_risk: boolean;
}): KeyContentViewtrapValidation;

// ── Step 9. 판매 가능 콘텐츠 산정 (Step 8 결과 필터) ──
export function filterSalesViableCandidates(
  validations: KeyContentViewtrapValidation[],
): KeyContentViewtrapValidation[];

// ── Step 10. 설득 구조 삽입 ──
export function buildSalesLogicMap(input: {
  problem_statement: string;
  category_feature_benefit: string;
  category_need: string;
  item_feature_benefit: string;
  item_solution_statement: string;
  cta: string;
}): SalesLogicMap;

// ── Step 11. 키 콘텐츠 주제 확정 ──
export function buildApprovedKeyContentTopic(input: {
  title: string;
  thumbnail_promise: string;
  entry_stage: 'phenomenon' | 'desire' | 'plan';
  sales_logic: SalesLogicMap;
  viewtrap_validation: KeyContentViewtrapValidation;
  intro_direction: string;
  body_structure: string[];
  cta: string;
}): ApprovedKeyContentTopic;
```

### 3.3 파이프라인 오케스트레이터

```ts
/** 11단계 전체 산출물을 담는 컨테이너 */
export interface KeyContentPlanningResult {
  step1_generalization: ItemGeneralization;
  step2_item_fb: ItemFeatureBenefitMap;
  step3_category_fb: CategoryFeatureBenefitMap;
  step4_problems: ProblemDerivationMap;
  step5_funnel: FunnelPlanningMap;
  step6_entry_decision: KeyContentEntryDecision;
  step7_search_keywords: KeyContentSearchKeywordSet;
  step8_viewtrap_validation: KeyContentViewtrapValidation;
  step9_viable_candidates: KeyContentViewtrapValidation[];
  step10_sales_logic: SalesLogicMap;
  step11_approved_topic: ApprovedKeyContentTopic;
}

/**
 * 11단계 파이프라인을 한 번에 조립한다.
 * 각 step의 결과가 다음 step의 입력이 되는 순차 흐름.
 * LLM 호출은 이 함수 바깥(agent-runtime)에서 수행하며,
 * 이 함수는 각 step의 산출물을 검증·조립만 한다.
 */
export function assembleKeyContentPlan(
  input: KeyContentPlanningResult,
): KeyContentPlanningResult;
```

### 3.4 검증 규칙 (PRD에서 도출)

| 규칙 | 적용 Step | 검증 |
|------|-----------|------|
| Viewtrap 없이 확정 금지 | Step 11 | `viewtrap_validation.verdict !== 'reject'` 필수 |
| channel_value_risk 제외 | Step 9 | `channel_value_risk === true` → 필터 아웃 |
| person_value_risk 제외 | Step 9 | `person_value_risk === true` → 필터 아웃 |
| 진입 단계 rationale 필수 | Step 6 | `rationale` 비어있으면 throw |
| 문제 후보 1개 이상 선택 | Step 4 | `selected_problem_ids.length > 0` 필수 |
| 퍼널 최소 2단계 채움 | Step 5 | 5단계 중 2개 이상 비어있지 않아야 함 |
| SalesLogicMap 전 필드 필수 | Step 10 | 모든 6개 필드 non-empty |
| body_structure 1개 이상 | Step 11 | `body_structure.length > 0` 필수 |

---

## 4. 테스트 파일: `__tests__/key-content-planning.test.ts`

### 4.1 테스트 범위

| 테스트 | 검증 내용 |
|--------|-----------|
| Step 1 happy path | ProductBrief → ItemGeneralization 정상 생성 |
| Step 2 happy path | features/characteristics/benefits 3배열 조립 |
| Step 3 happy path | category_name이 generalization에서 유래 |
| Step 4 문제 선택 필수 | selected_problem_ids 빈 배열 → throw |
| Step 5 퍼널 최소 채움 | 5단계 모두 빈 배열 → throw |
| Step 6 rationale 필수 | rationale 빈 문자열 → throw |
| Step 7 키워드 자동 추출 | 5축 모두 1개 이상 키워드 생성 |
| Step 8 verdict 판정 | performance good + contribution good → 'use' |
| Step 9 리스크 필터 | channel_value_risk=true → 필터 아웃 |
| Step 10 필드 필수 | cta 빈 문자열 → throw |
| Step 11 Viewtrap reject 차단 | verdict='reject' → throw |
| Pipeline 정합성 | 11개 step 산출물 타입 일치 확인 |

---

## 5. Acceptance Criteria

| # | 기준 | 측정 방법 |
|---|------|-----------|
| AC-1 | `key-content-planning.ts`에 Step 1~11 함수 11개 + pipeline 1개 export | `grep -c 'export function' key-content-planning.ts` ≥ 12 |
| AC-2 | 모든 함수가 `types.ts`의 기존 인터페이스를 반환 타입으로 사용 | `pnpm typecheck` 에러 0 |
| AC-3 | §3.4 검증 규칙 8개 모두 테스트 커버 | `pnpm test -- key-content-planning` PASS, 최소 12 test cases |
| AC-4 | `index.ts`에 `export * from './key-content-planning'` 추가 | grep 확인 |
| AC-5 | 기존 `key-content.ts` 함수는 수정하지 않음 | git diff key-content.ts = 빈 diff |
| AC-6 | `pnpm build` (l5-core) 성공 | exit code 0 |
| AC-7 | 순수 함수 원칙 준수 — Date.now, randomUUID, fs, http 호출 없음 | grep 확인 |

---

## 6. 영향 파일 목록

| 파일 | 변경 유형 | 설명 |
|------|-----------|------|
| `packages/l5-core/src/functions/video-room/key-content-planning.ts` | **신규** | 11개 step 함수 + pipeline |
| `packages/l5-core/src/functions/video-room/__tests__/key-content-planning.test.ts` | **신규** | 단위 테스트 12+ cases |
| `packages/l5-core/src/functions/video-room/index.ts` | **수정** | export 1줄 추가 |
| `packages/l5-core/src/functions/video-room/types.ts` | **수정 없음** | 타입 이미 완비 |
| `packages/l5-core/src/functions/video-room/key-content.ts` | **수정 없음** | 기존 §7.2/§7.4 함수 유지 |

---

## 7. 비채택 결정

### 7.1 설계 결정

| 고려사항 | 결정 | 이유 |
|----------|------|------|
| LLM 호출을 l5-core 안에 넣기 | 배제 | l5-core는 NocoBase 없이 테스트 가능해야 함 (규칙 2). LLM 호출은 agent-runtime에서 수행 |
| XState 도입 | 배제 | 순차 11단계에 과잉. 기존 state-machine.ts로 충분 |
| 새 타입 추가 | 배제 | types.ts에 10개 인터페이스 이미 완비 |
| key-content.ts 리팩터 | 배제 | §7.2/§7.4 함수는 별도 책임. 건드리지 않음 |

### 7.2 오픈소스 라이브러리 조사 결과 (2026-06-07)

3개 카테고리를 조사한 결과, **모두 기존 스택 유지/확장**이 최선으로 판단.

#### Category 1: Pipeline / Composition 라이브러리

| 항목 | plain TS (현재) | neverthrow (~7.5K★) | Effect (~13.5K★) |
|---|---|---|---|
| 번들 크기 | 0 | ~3 KB | ~20 KB |
| 핵심 장점 | 제로 의존성 | 경량 Result 타입 | DI·재시도·관찰성 내장 |
| 핵심 단점 | — | 파이프라인 오케스트레이션 아님 | 학습 곡선 급격, 시스템 전체 통합 필요 |
| **채택?** | **유지** | 조건부 | **배제** (과잉) |

**결정:** plain TS 유지. 동기 순수 함수 11개 체인에 프레임워크 불필요.

#### Category 2: LLM Structured Output (agent-runtime 측)

| 항목 | 수동 JSON.parse (현재) | Vercel AI SDK (~18K★) | instructor-js (~2.5K★) | Mastra 내장 (~13K★) |
|---|---|---|---|---|
| Zod 통합 | 수동 | 완전 네이티브 | 네이티브 | 네이티브 |
| Mastra 호환 | 네이티브 | 이중 클라이언트 문제 | 추가 연동 필요 | 완전 네이티브 |
| **채택?** | — | **배제** | **배제** | **채택** |

**결정:** Mastra `structuredOutput` 전환 + 얇은 retry wrapper 유지.

#### Category 3: Workflow State Persistence

| 항목 | Trigger.dev v3 (기배포) | Inngest (~12K★) | Temporal (~28K★) |
|---|---|---|---|
| 기존 통합 | hermes-runtime에 배포됨 | 추가 서비스 필요 | Worker 별도 운영 |
| **채택?** | **확장** | **배제** | **배제** (과잉) |

**결정:** Trigger.dev v3 확장. 신규 인프라 없이 스텝 재시작 + OTEL 관찰성 확보.

---

## 8. 의존 관계

```text
Step 1 (generalization)
  ↓
Step 2 (item FB) ──────────┐
  ↓                        │
Step 3 (category FB) ──────┤
  ↓                        │
Step 4 (problems) ←────────┘
  ↓
Step 5 (funnel)
  ↓
Step 6 (entry decision)
  ↓
Step 7 (search keywords) ← Step 1, 2, 3, 4
  ↓
Step 8 (viewtrap validation) ← 외부 Viewtrap 결과 주입
  ↓
Step 9 (sales viable filter)
  ↓
Step 10 (sales logic map)
  ↓
Step 11 (approved topic) ← Step 6, 8, 10
```

LLM이 각 step의 내용을 생성하고, 이 파이프라인은 결과를 검증·조립한다.
