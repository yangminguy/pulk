# ScriptPlan Card & 원고 기획 구조 Specification

## 1. 개요 (Overview)
본 문서는 사전 오픈소스 조사 결과(`dnd-kit` 채택)를 바탕으로, 복잡한 계층(에피소드 > 씬 > 카드)을 가지는 원고 기획 및 작성 도구(ScriptPlan)의 프론트엔드 UI/UX 요구사항과 아키텍처 스펙을 정의합니다.

## 2. 요구사항 명세 (Requirement Specification)
1. **드래그 앤 드롭 지원 (Drag and Drop Interaction)**:
   - `@dnd-kit/core` 및 관련 패키지를 활용하여 카드, 씬 단위의 드래그 앤 드롭 정렬 기능을 구현합니다.
   - 키보드 내비게이션 및 스크린 리더 접근성(a11y)을 완벽하게 지원해야 합니다.
2. **다차원 중첩 구조 (Nested Structure Handling)**:
   - 에피소드 안에 씬, 씬 안에 여러 카드가 존재하는 중첩(Nested)된 트리 및 칸반(Kanban) 구조를 효과적으로 관리할 수 있어야 합니다.
3. **데이터 모델 연동 (Data Model Binding)**:
   - UI 상의 위치 변경 이벤트(DragEnd)가 발생할 경우, 전역 상태 및 백엔드 데이터 모델의 순서 및 소속 관계 업데이트 로직과 동기화되어야 합니다.
4. **모듈형 아키텍처 (Modular Architecture)**:
   - `dnd-kit`의 모듈형 구조를 살려, 드래그 센서(Pointer, Keyboard 등), 충돌 감지(Collision Detection), 정렬 컨텍스트(SortableContext) 등을 명확히 분리하여 유지보수성을 높입니다.

## 3. 영향을 받는 파일 및 모듈 목록 (Affected Files & Modules)
- `packages/l5-ui/src/components/scriptplan/ScriptBoard.tsx` (신규): 전체 원고 기획 칸반 보드 레이아웃 (dnd-kit DndContext 포함).
- `packages/l5-ui/src/components/scriptplan/SceneColumn.tsx` (신규): 개별 씬을 나타내는 컨테이너 컴포넌트 (SortableContext 포함).
- `packages/l5-ui/src/components/scriptplan/ScriptCard.tsx` (신규): 개별 원고 카드를 나타내는 Draggable/Sortable 컴포넌트.
- `packages/l5-ui/src/hooks/useScriptPlanDnd.ts` (신규): 드래그 시작, 이동, 종료(DragEnd) 이벤트를 처리하는 비즈니스 로직(커스텀 훅).
- `packages/l5-core/src/schemas/scriptplan.ts` (신규): 원고 구조(Episode, Scene, Card)에 대한 Zod 스키마 및 TypeScript 타입 정의.
- `packages/l5-ui/package.json` (수정): `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` 의존성 추가.

## 4. 인수 조건 (Acceptance Criteria)
다음 조건들은 테스트 코드를 통해 객관적으로 측정 및 검증 가능해야 합니다.

- [ ] **의존성 충돌 제로**:
  - `package.json`에 `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` 패키지 추가 후 `pnpm install` 수행 시 에러나 경고 없이 설치가 완료되며 프로젝트 전역 빌드가 성공한다.
- [ ] **데이터 이동(Move) 로직 테스트**:
  - `useScriptPlanDnd`와 연계된 상태 업데이트 로직(또는 Reducer) 단위 테스트에서, 특정 카드를 다른 씬으로 이동하는 이벤트를 모의(Mock) 전달했을 때, 소스(Source) 씬과 대상(Destination) 씬의 배열 상태가 정확하게 재계산되어 반환된다.
- [ ] **스키마 검증 (Validation)**:
  - `scriptplan.ts`에 정의된 Zod 스키마에 대해, 최소 2단계 이상의 중첩(에피소드 > 씬 > 다수의 카드)을 가진 유효한 목업(Mock) 데이터를 주입했을 때 성공적으로 파싱된다. 잘못된 타입이나 필수값 누락 시 명확한 에러를 반환한다.
- [ ] **접근성(a11y) 구조 검증**:
  - 스크린 리더 및 키보드 네비게이션을 위한 `dnd-kit`의 기본 `aria-` 속성과 `KeyboardSensor` 관련 설정 코드가 UI 렌더링 로직 내에 누락 없이 포함되어 있다.
