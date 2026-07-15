# SPEC: Product Strategy Card (상품/타깃/문제/목표 정의)

> 상태: draft | 작성: 2026-06-04
> OSS 조사 결과: [product-strategy-card-oss-research.md](./product-strategy-card-oss-research.md) — 새 라이브러리 추가 불필요

## 1. 배경 및 문제

CMO가 사업별 상품 전략(상품·타깃 고객·해결할 문제·달성 목표)을 `agent_tasks.output`에 기록하지만, `AgentOutputDetail`에 전용 패널이 없어 **구조화된 전략 정보가 범용 텍스트(goal/recommendation)로 흩어져** Founder가 한눈에 파악하기 어렵다.

| 현재 상태 | 문제 |
|-----------|------|
| CMO 전략 산출물이 `goal` + `recommendation` + `action_items`로 분산 | 상품/타깃/문제/목표 4축이 명확히 구분되지 않음 |
| `AgentOutputDetail`에 intro_analysis(차트), strategy_decision(옵션 카드) 전용 패널 존재 | product_strategy 전용 패널 없음 |
| Founder가 전략을 수정하려면 별도 채널 필요 | 카드 내 인라인 편집 불가 |

## 2. 목표

CMO가 `agent_tasks.output.product_strategy`에 기록한 상품 전략을 **구조화된 4-필드 카드**로 렌더링하고, Founder가 카드 내에서 직접 수정·저장할 수 있게 한다.

## 3. 데이터 모델

### 3.1 `ProductStrategyData` (AgentOutputLite 확장)

CMO가 `agent_tasks.output`에 기록하는 상품 전략 구조. 기존 `AgentOutputLite`에 optional 필드로 추가한다.

```typescript
// apps/founder-ui/src/lib/api.ts — AgentOutputLite에 추가
export type ProductStrategyData = {
  product: string       // 상품/서비스 정의 (무엇을 제공하는가)
  target: string        // 타깃 고객 (누구에게)
  problem: string       // 해결할 문제 (왜 필요한가)
  goal: string          // 달성 목표 (성공 기준)
  confidence?: number   // 0–100, CMO의 전략 확신도 (optional)
  rationale?: string    // 전략 도출 근거 요약 (optional)
}
```

```typescript
// AgentOutputLite 확장
export type AgentOutputLite = {
  // ... 기존 필드 ...
  intro_analysis?: IntroAnalysisData
  product_strategy?: ProductStrategyData  // ← 추가
}
```

### 3.2 저장 경로

- **읽기**: `agent_tasks.output.product_strategy` 존재 여부로 패널 분기
- **쓰기** (Founder 수정): `PATCH /api/agent_tasks:update` — `output.product_strategy` 필드만 부분 갱신
  - 기존 `api.ts`의 `request` 함수 + NocoBase REST 패턴 사용
  - 새 백엔드 액션 불필요 (NocoBase 기본 CRUD로 충분)

## 4. 요구사항

### 4.1 ProductStrategyPanel (읽기 모드)

**위치**: `AgentOutputDetail` 내 세 번째 분기 — `product_strategy` 필드 존재 시 렌더링

| 요소 | 설명 |
|------|------|
| 헤더 | `j-overline` "상품 전략" + Agent 배지 (기존 IntroAnalysisPanel 패턴) |
| 4-필드 그리드 | 상품 / 타깃 / 문제 / 목표 — 각각 라벨 + 값 텍스트 |
| 확신도 (optional) | `confidence` 존재 시 수치 배지 (훅 스코어와 동일 3단계 색상) |
| 근거 (optional) | `rationale` 존재 시 접이식(details) 텍스트 |
| 편집 버튼 | 우측 상단 "수정" 토글 — 편집 모드 전환 |

**4-필드 레이아웃**:

```
┌─────────────────────────────────────┐
│ 상품 전략              CMO  [수정]  │
├──────────────┬──────────────────────┤
│ 🎯 상품      │ 🎯 타깃              │
│ (텍스트)      │ (텍스트)             │
├──────────────┼──────────────────────┤
│ 🎯 문제      │ 🎯 목표              │
│ (텍스트)      │ (텍스트)             │
├──────────────┴──────────────────────┤
│ 확신도 72/100                       │
│ ▸ 도출 근거 (접이식)                 │
└─────────────────────────────────────┘
```

- 모바일(≤480px): 2열 → 1열 세로 스택 (기존 MobileShell 반응형 패턴)
- 각 필드 라벨: `j-overline` 스타일 (font-mono 10.5px uppercase)
- 각 필드 값: `pStyle` (12.5px ink-1, pre-wrap)

### 4.2 편집 모드

Founder가 "수정" 버튼 클릭 시:

| 요소 | 동작 |
|------|------|
| 4개 필드 | 텍스트 → textarea 전환 (ConsultationCard 패턴: `j-input j-textarea`) |
| 저장 버튼 | "저장" 클릭 → `PATCH agent_tasks:update` → 읽기 모드 복귀 |
| 취소 버튼 | 수정 전 값으로 롤백 → 읽기 모드 복귀 |
| 상태 관리 | `useState` 4개 필드 + `editing: boolean` + `saving: boolean` |
| 저장 중 | 버튼 비활성 + opacity 0.5 (ConsultationCard의 submitting 패턴) |

### 4.3 AgentOutputDetail 분기 로직

```typescript
// AgentOutputDetail 내 분기 순서 (기존 + 추가)
const hasIntroAnalysis = Boolean(introAnalysis && typeof introAnalysis.hook_score === 'number')
const hasProductStrategy = Boolean(output.product_strategy && output.product_strategy.product)
// ...
if (hasIntroAnalysis) return <IntroAnalysisPanel ... />
if (hasProductStrategy) return <ProductStrategyPanel ... />
// 기존 범용 렌더링 계속
```

### 4.4 API 함수

```typescript
// api.ts에 추가
updateTaskOutput: (taskId: string, output: Partial<AgentOutputLite>) =>
  request<{ data: unknown }>('/api/agent_tasks:update', {
    method: 'POST',
    body: JSON.stringify({ filterByTk: taskId, values: { output } }),
  }).then(r => r.data),
```

## 5. 스타일 규격

기존 inline style + CSS 변수 패턴 엄수. 새 CSS 파일·클래스 추가 없음.

| 요소 | 스타일 |
|------|--------|
| 외곽 카드 | `border: 1px solid var(--silver-2)`, `borderRadius: 6`, `overflow: hidden` |
| 헤더 바 | `background: var(--paper-elevated)`, `borderBottom: 1px solid var(--silver-1)` |
| 필드 라벨 | `className="j-overline"` (font-mono 10.5px uppercase) |
| 필드 값 | `pStyle` (fontSize 12.5, color ink-1, pre-wrap) — AgentOutputDetail 기존 상수 재사용 |
| 확신도 배지 | 3단계 색상 — ≥70 green, ≥40 amber, <40 red (getHookScoreStyle 재사용) |
| 그리드 | `display: grid; gridTemplateColumns: 1fr 1fr; gap: 10px` + `@media (max-width: 480px) 1fr` |
| textarea | `j-input j-textarea`, minHeight 60, maxHeight 120, fontSize 12.5 |

## 6. Acceptance Criteria

| # | 기준 | 검증 방법 |
|---|------|----------|
| AC1 | `ProductStrategyData` 타입이 `api.ts`에 정의되고 `AgentOutputLite`에 optional 필드로 추가됨 | `grep 'product_strategy' api.ts` — 타입 존재 |
| AC2 | `AgentOutputDetail`에서 `output.product_strategy.product` 존재 시 `ProductStrategyPanel` 렌더링 | 목 데이터로 카드 렌더링 확인 (product_strategy 있을 때 패널 표시, 없을 때 기존 렌더링) |
| AC3 | 읽기 모드: 4개 필드(상품/타깃/문제/목표)가 라벨+값 형태로 표시됨 | 브라우저에서 4개 필드 텍스트 노출 확인 |
| AC4 | 편집 모드: "수정" 클릭 → 4개 textarea 전환 → "저장" 클릭 → API 호출 → 읽기 모드 복귀 | Playwright E2E 또는 수동: 수정 버튼 → textarea 노출 → 저장 → API 호출 확인 |
| AC5 | `confidence` 존재 시 3단계 색상 배지 표시, 미존재 시 숨김 | confidence 있는/없는 목 데이터로 각각 확인 |
| AC6 | 모바일(≤480px)에서 2열 → 1열 세로 스택 | 브라우저 DevTools 모바일 뷰포트에서 확인 |
| AC7 | `pnpm --filter @l5/founder-ui typecheck` 통과 | CLI 실행 exit 0 |
| AC8 | 기존 intro_analysis, strategy_decision 패널 동작 변경 없음 | intro_analysis 목 데이터 렌더링 정상 확인 |

## 7. 영향 파일

| 파일 | 변경 유형 | 설명 |
|------|----------|------|
| `apps/founder-ui/src/lib/api.ts` | 수정 | `ProductStrategyData` 타입 추가, `AgentOutputLite` 확장, `updateTaskOutput` API 함수 추가 |
| `apps/founder-ui/src/components/AgentOutputDetail.tsx` | 수정 | `ProductStrategyPanel` 컴포넌트 추가, 분기 로직 추가 |

**총 2개 파일 수정. 신규 파일 없음.**

## 8. 범위 밖 (Not in scope)

- CMO가 `product_strategy`를 생성하는 에이전트 로직 (agent-runtime 영역)
- 상품 전략 히스토리/버전 관리
- 여러 사업 간 전략 비교 뷰
- 전략 필드 밸리데이션 (빈값 허용 — CMO가 점진적으로 채워가는 구조)
