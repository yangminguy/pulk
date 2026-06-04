# SPEC: Pulling Content Set Card (5개 구조)

> 상태: draft | 작성: 2026-06-04
> OSS 조사 결과: [pulling-content-set-card-oss-research.md](./pulling-content-set-card-oss-research.md) — 새 외부 라이브러리 추가 불필요 (dnd-kit 등은 추후 조건부 도입)

## 1. 배경 및 문제

CMO 에이전트가 인바운드 마케팅 및 전환을 위해 기획한 **끌어당기는 콘텐츠 세트 (Pulling Content Set)**는 5개의 핵심 구조(Hook, Problem, Solution, Benefit, CTA)로 구성된다. 하지만 현재 `AgentOutputDetail`에는 이 5개 구조를 분리해서 렌더링하고 편집할 수 있는 전용 패널이 없으며, 범용 텍스트 필드에 혼재되어 표시될 경우 가독성과 수정 편의성이 크게 떨어진다.

| 현재 상태 | 문제 |
|-----------|------|
| 콘텐츠 구조가 `goal`, `recommendation` 등 범용 필드에 텍스트 형태로 병합되어 기록될 수 있음. | Hook, Problem 등의 각 5개 뼈대가 시각적으로 구분되지 않음. |
| 콘텐츠 텍스트의 미세한 문구(Copy)를 Founder가 직접 다듬고 싶을 때 직관적인 UI가 없음. | 카드 내 인라인 편집 불가능. 에이전트에게 텍스트로 재요청해야 하는 번거로움. |

## 2. 목표

CMO가 `agent_tasks.output.pulling_content_set`에 기록한 5개 구조의 콘텐츠를 **구조화된 5-필드 카드 UI**로 렌더링하고, Founder가 카드 내에서 직접 문구를 수정 및 저장할 수 있도록 한다. 이를 통해 콘텐츠 초안 검토와 최종 승인(발행 전) 과정을 단축한다.

## 3. 데이터 모델

### 3.1 `PullingContentSetData` (AgentOutputLite 확장)

CMO가 기록하는 5개 구조. 기존 `AgentOutputLite`에 optional 필드로 추가한다.

```typescript
// apps/founder-ui/src/lib/api.ts — AgentOutputLite 위에 추가
export type PullingContentSetData = {
  hook: string       // 후킹 문구 (주의 끌기)
  problem: string    // 문제 제기 및 공감
  solution: string   // 해결책 제시 (우리의 상품/서비스)
  benefit: string    // 고객이 얻을 수 있는 이점/결과
  cta: string        // 행동 촉구 (Call To Action)
}
```

```typescript
// AgentOutputLite 확장
export type AgentOutputLite = {
  // ... 기존 필드 ...
  product_strategy?: ProductStrategyData
  pulling_content_set?: PullingContentSetData  // ← 추가
}
```

### 3.2 저장 경로

- **읽기**: `agent_tasks.output.pulling_content_set` 존재 여부로 패널 렌더링 분기
- **쓰기** (Founder 수정): `PATCH /api/agent_tasks:update` — `output.pulling_content_set` 필드 갱신
  - 기존 `updateTaskOutput` 함수(api.ts) 재사용

## 4. 요구사항

### 4.1 PullingContentSetPanel (읽기 모드)

**위치**: `AgentOutputDetail` 내 조건부 렌더링 (데이터 존재 시 표시)

| 요소 | 설명 |
|------|------|
| 헤더 | `j-overline` "콘텐츠 구조 (5단계)" + Agent 배지 |
| 5-필드 리스트 | Hook / Problem / Solution / Benefit / CTA 순서로 라벨 + 값 텍스트 세로 스택 |
| 편집 버튼 | 우측 상단 "수정" 버튼 — 편집 모드로 토글 |

**레이아웃 예시**:

```
┌─────────────────────────────────────┐
│ 콘텐츠 구조 (5단계)      CMO  [수정] │
├─────────────────────────────────────┤
│ 💡 Hook (후킹)                       │
│ (텍스트 내용...)                      │
├─────────────────────────────────────┤
│ 🚨 Problem (문제 제기)               │
│ (텍스트 내용...)                      │
├─────────────────────────────────────┤
│ 🔑 Solution (해결책)                 │
│ (텍스트 내용...)                      │
├─────────────────────────────────────┤
│ ✨ Benefit (기대 효과)               │
│ (텍스트 내용...)                      │
├─────────────────────────────────────┤
│ 🎯 CTA (행동 촉구)                   │
│ (텍스트 내용...)                      │
└─────────────────────────────────────┘
```

- 각 구조의 텍스트 길이를 고려하여 그리드보다는 **세로 1열 스택(Vertical Stack)**으로 배치한다.
- 필드 라벨: `j-overline` 스타일 (아이콘 + 영문/한글 혼용)
- 필드 값: `pStyle` (12.5px ink-1, pre-wrap 적용하여 줄바꿈 유지)

### 4.2 편집 모드 (인라인 폼)

Founder가 "수정" 버튼 클릭 시:

| 요소 | 동작 |
|------|------|
| 5개 텍스트 필드 | 평문 표시 영역이 `textarea`로 전환 (`j-input j-textarea` 스타일 적용) |
| 상태 관리 | OSS 조사 결론에 따라 `react-hook-form` 대신 **단순 `useState`**로 5개 필드 상태 관리 |
| 액션 버튼 | 하단 또는 우측 상단에 "저장", "취소" 버튼 노출 |
| 저장 처리 | "저장" 클릭 시 `updateTaskOutput` 호출 → 로딩 상태 표시(submitting) → 완료 시 읽기 모드로 복귀 |
| 취소 처리 | 수정 전 초기 값으로 롤백 후 읽기 모드로 복귀 |

### 4.3 AgentOutputDetail 분기 로직

```typescript
// AgentOutputDetail 내 분기 처리
const hasPullingContent = Boolean(output.pulling_content_set && output.pulling_content_set.hook)

if (hasPullingContent) return <PullingContentSetPanel ... />
// ... 기존 다른 패널 분기 로직과 병렬로 배치 (우선순위에 따라 순서 결정)
```

## 5. 스타일 규격

OSS 조사 결과에 따라 shadcn/ui나 Tailwind 등 무거운 외부 라이브러리 없이 기존 inline style + CSS 변수 패턴을 엄수한다.

| 요소 | 스타일 |
|------|--------|
| 외곽 카드 | `border: 1px solid var(--silver-2)`, `borderRadius: 6`, `overflow: hidden` |
| 헤더 바 | `background: var(--paper-elevated)`, `borderBottom: 1px solid var(--silver-1)` |
| 필드 래퍼 | 상하 padding 부여, 필드 간 구분선(`borderBottom: 1px solid var(--silver-1)`) 추가로 가독성 확보 |
| 필드 라벨 | `className="j-overline"` (font-mono 10.5px uppercase, var(--ink-3)) |
| 필드 값 | fontSize 12.5, color var(--ink-1), pre-wrap |
| textarea | `className="j-input j-textarea"`, minHeight 60, width 100%, 폰트 크기 12.5 |

## 6. Acceptance Criteria (인수 조건)

| # | 기준 | 검증 방법 |
|---|------|----------|
| AC1 | `PullingContentSetData` 타입이 `api.ts`에 정의되고 `AgentOutputLite`에 optional 필드로 포함되어 있다. | 코드 리뷰 및 타입 정의 존재 확인 (`grep 'pulling_content_set' api.ts`) |
| AC2 | `AgentOutputDetail`에서 `output.pulling_content_set` 존재 시 `PullingContentSetPanel`이 렌더링된다. | 목(mock) 데이터를 주입하여 패널 표시 여부 브라우저 확인 |
| AC3 | 읽기 모드: Hook, Problem, Solution, Benefit, CTA 등 5개 필드의 라벨과 텍스트가 명확히 분리되어 표시된다. | UI 육안 확인 (5개 필드가 텍스트 깨짐 없이 노출) |
| AC4 | 편집 모드 토글: "수정" 버튼 클릭 시 5개 필드가 `textarea` 폼으로 전환되며 기존 텍스트가 바인딩된다. | 브라우저에서 수정 버튼 클릭 시 입력 창 전환 확인 |
| AC5 | 데이터 저장: 편집 모드에서 내용을 수정하고 "저장" 클릭 시, `api.ts`의 업데이트 함수가 호출되며, 수정된 내용이 읽기 뷰에 반영된다. | 네트워크 패널에서 `PATCH /api/agent_tasks:update` API 호출 확인 및 페이로드(`pulling_content_set`) 검증 |
| AC6 | 외부 라이브러리 미사용: UI 렌더링 및 폼 관리에 외부 컴포넌트(shadcn, react-hook-form 등)가 새로 추가되지 않았다. | `package.json` 변경 없음 확인 및 컴포넌트 내 `useState` 사용 확인 |
| AC7 | 타입 검사 통과: 패널 추가 후 TypeScript 타입 에러가 없다. | `pnpm --filter @l5/founder-ui typecheck` 실행 시 exit code 0 |

## 7. 영향 파일 목록

| 파일 | 변경 유형 | 설명 |
|------|----------|------|
| `apps/founder-ui/src/lib/api.ts` | 수정 | `PullingContentSetData` 타입 추가, `AgentOutputLite` 확장 |
| `apps/founder-ui/src/components/AgentOutputDetail.tsx` | 수정 | `PullingContentSetPanel` 컴포넌트 구현 및 렌더링 분기 추가 |

## 8. 범위 밖 (Out of Scope)

- **구조 순서 변경 (Drag and Drop):** 현재는 Hook → CTA까지 고정된 순서로 제공되며, 순서를 사용자가 임의로 섞는 기능(dnd-kit 도입)은 이번 스펙에서 제외한다.
- **리치 텍스트 서식 (Bold, Italic 등):** 평문(plain text)만 지원하며 Tiptap 등의 에디터는 도입하지 않는다.
- CMO가 이 데이터 구조를 생성하도록 하는 백엔드(Agent Runtime) 프롬프트 및 로직 수정은 본 UI 컴포넌트 스펙 범위 밖이다.
