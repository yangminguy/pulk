# SPEC: Second Brain Insight Merge Card (인사이트 병합 카드)

> 상태: draft | 작성: 2026-06-04

## 1. 배경 및 문제

현재 P3-2 Memory Curation 과정에서, 기존 Second Brain 카드와 유사도가 높은(`maxSimilarity`) 새로운 인사이트가 발견될 경우, 이를 자동 저장하거나 자동 폐기하는 규칙만 존재합니다. 하지만 유사도가 애매하게 높거나 두 인사이트의 내용을 합쳐야만 더 큰 가치를 지니는 경우, Founder가 수동으로 두 카드를 비교하고 병합(Merge)할 수 있는 UI 수단이 부족합니다.
결과적으로 가치 있는 지식이 파편화되거나, 중복으로 저장되어 Second Brain의 품질을 저하시킬 수 있습니다.

| 현재 상태 | 문제 |
|-----------|------|
| 유사도가 높은 인사이트가 큐에 쌓이거나 자동 폐기됨 | 두 인사이트의 핵심 정보를 조합해 더 나은 인사이트를 도출할 기회 상실 |
| Founder UI에 수동 리뷰용 기본 카드만 존재 | 기존 카드와 신규 카드를 비교 대조(Diff)하고 병합할 수 있는 전용 컴포넌트 부재 |

## 2. 목표

Founder UI에 **SecondBrainInsightMergeCard** 컴포넌트를 추가하여, 기존 Second Brain의 인사이트와 새롭게 획득한 인사이트를 나란히 비교하고, Founder가 두 내용을 편집 및 병합하여 하나의 완성된 인사이트로 Second Brain에 덮어쓰기(또는 신규 저장 후 기존 폐기)할 수 있도록 합니다.

## 3. 데이터 모델

### 3.1 `InsightMergeData`

병합을 위해 클라이언트로 전달되는 데이터 구조입니다.

```typescript
// apps/founder-ui/src/lib/api.ts 또는 관련 타입 정의 파일에 추가
export type InsightMergeData = {
  candidate_id: string;
  incoming: {
    insight: string;          // 신규 인사이트 내용
    source_agent?: string;    // 출처 에이전트
    phase?: string;
  };
  existing: {
    card_id: string;          // Second Brain 내 기존 카드 ID
    insight: string;          // 기존 카드 내용
  };
  similarity_score: number;   // 0~1 사이의 코사인 유사도
  suggested_merge?: string;   // (옵션) LLM이 제안하는 병합된 텍스트
}
```

## 4. 컴포넌트 설계

### 4.1 `SecondBrainInsightMergeCard.tsx`

- **화면 구성**:
  - 상단: `similarity_score`를 뱃지로 표시 (예: "유사도 85%").
  - 좌측 패널: `incoming` (신규 인사이트) 표시 (읽기 전용).
  - 우측 패널: `existing` (기존 인사이트) 표시 (읽기 전용).
  - 하단 편집기: Founder가 직접 병합 텍스트를 작성하거나 `suggested_merge`를 채택할 수 있는 텍스트 에어리어.
- **액션 버튼**:
  - **[병합하여 저장]**: 편집기의 내용을 기존 카드를 대체하거나 새로운 카드로 저장하고, 큐에서 `candidate_id`를 처리(완료) 상태로 변경.
  - **[신규 건 폐기]**: 병합 없이 신규 인사이트를 버림.
  - **[각각 분리 저장]**: 유사도가 높지만 별개의 정보로 판단하여 둘 다 유지.

## 5. 영향을 받는 파일 및 모듈 목록

- `apps/founder-ui/src/lib/api.ts`: `InsightMergeData` 타입 정의 및 병합 API 호출 함수(`mergeInsight()`) 추가
- `apps/founder-ui/src/components/memory/SecondBrainInsightMergeCard.tsx`: 신규 컴포넌트 생성
- `apps/founder-ui/src/app/memory/page.tsx`: 큐에 있는 Candidate의 `maxSimilarity`가 특정 임계치(예: 0.7~0.9) 사이일 경우 `SecondBrainInsightMergeCard`를 렌더링하도록 조건부 로직 추가
- `packages/l5-core/src/functions/memory/types.ts`: `MemoryCandidate` 등에 관련 메타데이터 속성 확장 여부 검토
- `plugin-executive-monitor/src/server/plugin.ts` (NocoBase): 병합 액션을 처리하는 백엔드 라우트(`POST /api/memory/merge`) 추가

## 6. Acceptance Criteria (인수 조건)

이 스펙은 다음의 측정 가능한 기준을 충족해야 합니다.

1. **문서화**: 본 문서(`docs/specs/second-brain-insight-merge-card-spec.md`)가 생성되어 문제, 목표, 데이터 모델, 컴포넌트 설계가 기술되어야 한다.
2. **영향도 식별**: 컴포넌트 구현 및 API 연동을 위해 수정이 필요한 파일 경로와 모듈 이름이 5절에 최소 4개 이상 명시되어야 한다.
3. **객관적 측정 가능성**: 
   - `SecondBrainInsightMergeCard` 컴포넌트에 '병합하여 저장', '신규 건 폐기', '각각 분리 저장'의 3가지 액션 버튼이 정의되어 있는지 확인할 수 있다.
   - `InsightMergeData` 타입에 신규 데이터(`incoming`)와 기존 데이터(`existing`)를 담는 필드가 명시적으로 선언되어 있는지 타입 체커(TypeScript)를 통해 검증 가능하다.
   - UI 상에 `similarity_score`가 숫자로 노출되도록 컴포넌트 설계에 명시되어 있는지 확인할 수 있다.

## 7. 오픈소스/라이브러리 조사 (React Diff/Merge UI)

SecondBrainInsightMergeCard의 핵심인 '나란히 비교하고 편집 및 병합' 기능을 구현하기 위한 라이브러리 후보군 비교표입니다.

| 라이브러리 / 솔루션 | 장점 | 단점 | 채택 여부 및 근거 |
|---|---|---|---|
| **@monaco-editor/react**<br/>(Monaco Editor Diff) | - VS Code와 동일한 강력한 Diff 및 에디팅 경험 제공<br/>- 양방향 비교 및 실시간 편집, 코드/텍스트 하이라이팅 완벽 지원<br/>- 유지보수가 매우 활발함 | - 번들 사이즈가 상대적으로 크고 무거움<br/>- 단순 텍스트 비교용으로는 오버엔지니어링일 수 있음 | **채택 (1순위)**<br/>Founder가 직접 텍스트를 수정하고 병합(Merge)하는 '에디팅' 기능이 필수적이므로, 단순 뷰어를 넘어 강력한 편집 환경을 제공하는 Monaco의 Diff Editor가 가장 적합함. |
| **react-diff-viewer-continued** | - React 생태계에서 널리 쓰이며 설정이 매우 간단함<br/>- 인라인(Inline) 및 스플릿(Split) 뷰 등 직관적인 UI 제공<br/>- 가벼움 | - 읽기 전용(Read-only) 뷰어 역할에 국한됨<br/>- 화면 내에서 직접 수정하거나 병합하는 에디터 기능 부재 | **배제**<br/>'비교 대조'에는 좋으나, 스펙 상의 "Founder가 두 내용을 편집 및 병합"하는 인터랙션을 한 컴포넌트 안에서 소화하기 어려움. 하단에 별도 Textarea를 두어야 하는 UX적 한계가 있음. |
| **mergely-react** | - 텍스트의 양방향 비교 및 부분 클릭 병합(Merge) 기능 특화<br/>- 브라우저 단에서 무거운 diff 연산 처리 | - 오래된 jQuery 기반 의존성이 있거나 React 최신 환경과의 매끄러운 통합이 어려울 수 있음<br/>- UI 커스터마이징이 모던(Tailwind/Shadcn) 환경과 이질적임 | **배제**<br/>모던 React 스택(Next.js 등)과의 호환성 및 유지보수성 측면에서 리스크가 있으며, UI 일관성을 맞추기 까다로움. |

**최종 결론**: 
단순 텍스트 차이를 보여주는 것을 넘어 '병합(Merge) 및 수정'이 필요하므로 **@monaco-editor/react**의 Diff Editor 기능을 채택하는 것을 권장합니다. 만약 번들 크기가 크리티컬한 이슈라면, `diff-match-patch` 코어 라이브러리를 사용해 커스텀 UI(Headless)를 직접 구현하는 것을 대안으로 고려할 수 있습니다.
