## 리뷰 내역 (ScriptPlan Card & 원고 기획 구조)

**결과: 수정 요청 (Changes Requested)**

스펙(`SCRIPTPLAN_CARD_SPEC.md`)에 명시된 데이터 모델과 순수 로직 테스트는 훌륭하게 반영되었으나, 가장 핵심적인 UI 컴포넌트 구현이 누락되었습니다. 아래 항목들을 수정 및 보완해 주시기 바랍니다.

### 1. `packages/l5-core/src/schemas/scriptplan.ts`
- **LGTM**: `cardSchema`, `sceneSchema`, `scriptPlanSchema`의 계층 구조 정의가 스펙 요구사항(에피소드 > 씬 > 카드)을 잘 반영하고 있으며 테스트도 통과합니다.

### 2. `packages/l5-ui/src/hooks/useScriptPlanDnd.ts`
- **수정 필요**: 현재 상태 계산을 위한 순수 함수(`moveCard`)만 구현되어 있습니다. 스펙에 명시된 "드래그 시작, 이동, 종료(DragEnd) 이벤트를 처리하는 비즈니스 로직(커스텀 훅)" 요구사항에 맞게, dnd-kit의 드래그 이벤트(`onDragStart`, `onDragOver`, `onDragEnd`)를 핸들링하여 상태를 업데이트하는 실제 React 커스텀 훅(`useScriptPlanDnd`) 구현을 추가해 주세요.
- **권장 사항 (Line 19-24)**: 동일한 씬 내부에서 카드의 순서를 변경하는 경우, 직접 `splice`를 사용하기보다 `@dnd-kit/sortable`에서 제공하는 `arrayMove` 유틸리티를 활용하면 보다 안전하고 일관된 정렬이 가능합니다.

### 3. UI 컴포넌트 완전 누락 (신규 구현 필요)
스펙 3항("영향을 받는 파일 및 모듈 목록") 및 4항 인수 조건에 명시된 아래 프론트엔드 UI/UX 요구사항이 전혀 구현되지 않았습니다. 해당 디렉토리 및 파일들을 생성하고 dnd-kit을 연동해 주세요.
- `packages/l5-ui/src/components/scriptplan/ScriptBoard.tsx`: 전체 보드 레이아웃 및 `DndContext`, 센서 연동 로직
- `packages/l5-ui/src/components/scriptplan/SceneColumn.tsx`: `SortableContext`를 포함한 씬 컨테이너
- `packages/l5-ui/src/components/scriptplan/ScriptCard.tsx`: 카드를 나타내는 Draggable/Sortable 단위 컴포넌트
- **수정 필요**: 위 컴포넌트들을 구현하면서 인수 조건인 **접근성(a11y) 구조 검증**(스크린 리더, KeyboardSensor 설정 등)을 렌더링 로직 내에 누락 없이 포함해야 합니다. (현재 작성된 테스트의 `verify dnd-kit dependencies`만으로는 UI 렌더링 요건을 충족할 수 없습니다.)
