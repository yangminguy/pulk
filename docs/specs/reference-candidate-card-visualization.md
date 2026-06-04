# Spec: Reference Candidate Card & Visualization

> 작성: 2026-06-04 | 상태: draft

## 목적
CMO 등 에이전트가 제안하는 핵심 콘텐츠 후보(Reference Candidate Card)들을 시각적으로 명확하게 제공하고, 선택/거절 시의 인터랙션(Optimistic Update)과 예상 PMF/ROI 지표 시각화를 고도화하기 위한 UI/UX 구현 명세이다. 최근 수행된 오픈소스 조사(`docs/reports/oss_research_candidate_card.md`)를 바탕으로 Framer Motion과 Recharts를 도입하여 시각적 완성도를 높인다.

## 범위

### In-scope
1. **상호작용 애니메이션 (Framer Motion)**
   - 카드 목록 렌더링 시 AnimatePresence를 활용한 등장 애니메이션 적용
   - [채택] 또는 [거절] 버튼 클릭 시, 해당 카드가 사라지고 남은 카드들이 부드럽게 재배치되는 레이아웃 애니메이션 (Optimistic Update) 구현
2. **지표 시각화 (Recharts)**
   - 제안된 콘텐츠의 예상 PMF, ROI 지표를 시각화하기 위한 미니 차트(스파크라인 또는 방사형 차트) 렌더링
   - Joinery 디자인 시스템 색상을 Recharts 테마에 연동
3. **Optimistic Update 기반 상태 관리**
   - 사용자 액션 발생 시 UI 상태를 즉각 반영하고, 백엔드 API 결과와 동기화

### Out-of-scope
- Drag & Drop 방식의 파이프라인(Kanban) 인터랙션 (추후 과제)
- 매우 복잡한 인터랙티브 데이터 탐색 뷰 (단순화된 지표 시각화에 집중)

## 요구사항 명세 (Requirements)

1. **상호작용 애니메이션 (Optimistic Update)**:
   - 사용자가 후보 카드에서 [채택(Select)] 또는 [거절(Reject)]을 선택하면, 서버 응답을 대기하지 않고 UI에서 카드의 상태를 즉시 변경하거나 목록에서 제거한다.
   - 이때 Framer Motion을 사용하여 카드가 사라지는 애니메이션(fade-out / scale-down)을 재생하고, 주변 카드들의 위치가 부드럽게 재정렬되도록 `layout` 속성을 적용한다.
2. **데이터 시각화 (Recharts)**:
   - 각 후보 카드는 내부적으로 Recharts 기반의 소형 차트(미니 바 차트 또는 스파크라인 등)를 표시하여 예상 트래픽 획득률이나 PMF 점수를 시각적으로 제공한다.
   - 차트에 사용되는 색상은 L5 Joinery CSS의 변수(Primary/Secondary 색상 토큰)를 주입받아 애플리케이션 일관성을 유지한다.
3. **컴포넌트 구조화**:
   - 기존 `KeyContentCandidateCard.tsx` 내부 또는 하위 컴포넌트로 시각화 전용 컴포넌트(예: `CandidateMetricsChart`)를 분리하여 재사용성과 유지보수성을 높인다.
   - Framer Motion의 래퍼 컴포넌트를 사용하여 카드 리스트 자체의 AnimatePresence를 관리한다.

## 영향 파일 (Affected Files & Modules)

| 파일 | 변경 유형 | 설명 |
|------|----------|------|
| `apps/founder-ui/package.json` | 수정 | `framer-motion`, `recharts` 패키지 의존성 추가 |
| `apps/founder-ui/src/components/KeyContentCandidateCard.tsx` | 수정/확장 | Framer Motion을 활용한 애니메이션 래핑 및 Recharts 차트 연동 |
| `apps/founder-ui/src/components/CandidateMetricsChart.tsx` (가칭) | 신규 | Recharts를 활용하여 PMF/ROI 지표를 표시하는 미니 차트 컴포넌트 |
| `apps/founder-ui/src/app/chat/page.tsx` (또는 해당 영역) | 수정 | 카드 목록(`<ul>` 또는 `<div>`)에 `<AnimatePresence>` 및 `layout` 애니메이션 적용 |

## Acceptance Criteria

각 항목은 수동 또는 자동 테스트(E2E)를 통해 검증 가능해야 한다.

| # | 기준 (Criteria) | 검증 방법 (Verification) |
|---|------|----------|
| AC-1 | UI에서 [채택] 또는 [거절] 버튼 클릭 시, 페이지 새로고침 없이 즉시 애니메이션(fade out 등)과 함께 카드가 사라진다. | 클릭 후 100~300ms 내외로 카드가 부드럽게 사라지는지 브라우저에서 목시 확인 |
| AC-2 | 특정 카드가 사라질 때, 나머지 카드들의 레이아웃이 빈 공간을 채우기 위해 부드럽게 이동(Layout Animation)한다. | Framer Motion `layout` prop 동작을 통해 카드들이 즉시 점프하지 않고 이동하는지 확인 |
| AC-3 | 후보 카드 내에 Recharts를 활용한 지표(예상 PMF/ROI)가 렌더링되어 표시된다. | 카드 내에 SVG 기반의 차트가 정상적으로 그려지는지 렌더링 확인 |
| AC-4 | Recharts 차트의 색상이 하드코딩된 색상이 아닌, L5 Business OS (Joinery) 디자인 시스템 테마에 맞는 색상을 사용한다. | 브라우저 검사기(DevTools)로 차트 요소를 찍어보고, 테마 색상(예: `var(--color-primary)`) 기반의 헥스값이 사용되는지 확인 |
| AC-5 | `framer-motion`과 `recharts` 모듈 설치 후 전체 빌드가 성공적으로 수행된다. | `pnpm build --filter founder-ui` 명령어를 실행하여 오류가 없는지 확인 |
