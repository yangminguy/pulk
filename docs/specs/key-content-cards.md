# Spec: Key Content Candidate & Selected Key Content Cards

> 작성: 2026-06-04 | 상태: draft

## 목적
CMO 에이전트 등 임원 에이전트가 제안하는 핵심 콘텐츠(Key Content) 후보들을 시각적으로 명확한 카드로 제공하고, 창업자가 그 중 적합한 콘텐츠를 선택하여 확정할 수 있는 UI 컴포넌트 구조를 정의한다. 확정된 콘텐츠는 Selected Key Content 카드로 분리되어 모니터링과 후속 액션이 가능하도록 한다.

## 범위

### In-scope
1. **Key Content Candidate Card 컴포넌트** — 제안된 콘텐츠 후보의 제목, 요약, 예상 효과(ROI/PMF)를 표시
2. **Selected Key Content Card 컴포넌트** — 창업자가 선택하여 확정된 콘텐츠 표시 (진행 상태, 배포 채널 등 포함)
3. **콘텐츠 선택 액션 (Select/Reject)** — 후보 카드에서 '선택' 버튼을 눌러 상태를 확정(Selected)으로 변경
4. **적용 대상 페이지** — 주로 Founder UI의 Chat 패널, Monitor 페이지, 또는 별도의 콘텐츠 리뷰 영역

### Out-of-scope
- 콘텐츠의 실제 배포 및 퍼블리싱 시스템 연동 (별도의 퍼블리싱 파이프라인에서 처리)
- 텍스트/미디어 에디터 기능 (후보를 직접 수정하는 기능은 제외하고 제안된 상태에서 선택/반려만 수행)

## 요구사항 명세 (Requirements)

1. **데이터 소스 연동 및 파싱**:
   - `AgentTask`의 `output` 내 `options` 또는 `recommendation`, 혹은 `founder_deliverables`의 데이터를 기반으로 콘텐츠 후보(Candidate) 목록을 구성한다.
2. **후보 카드 (Key Content Candidate Card) 렌더링**:
   - **타이틀**: 제안된 콘텐츠의 제목 또는 핵심 주제
   - **요약**: 콘텐츠의 주요 메시지 (1~2줄)
   - **근거 및 기대효과**: 해당 콘텐츠를 제안한 이유, 타겟 세그먼트, 예상 PMF/참여도 등
   - **액션**: `[이 콘텐츠 채택 (Select)]` 및 `[거절 (Reject)]` 버튼
3. **선택된 카드 (Selected Key Content Card) 렌더링**:
   - 선택된 콘텐츠의 현재 상태 (예: '준비 완료', '승인됨')를 명시적 색상(예: Joinery 디자인의 긍정 색상)으로 표시
   - 선택 일자 및 연관 비즈니스/프로젝트 정보 표기
   - **후속 액션**: `[실행 파이프라인으로 넘기기]`, `[상세 보기]` 등의 상태 진전 액션
4. **상태 관리 및 즉각적 피드백 (Optimistic Update)**:
   - 선택/거절 액션 발생 시 백엔드 API (예: `approveTask` 또는 커스텀 액션)를 호출한다.
   - API 응답 대기 중에도 UI 상에서 카드가 상태를 즉시 변경하거나 목록에서 이동하는 등의 낙관적 업데이트를 제공하여 UX를 개선한다.

## 영향 파일 (Affected Files & Modules)

| 파일 | 변경 유형 | 설명 |
|------|----------|------|
| `apps/founder-ui/src/components/KeyContentCandidateCard.tsx` | **신규** | 제안된 콘텐츠 후보를 보여주는 UI 컴포넌트 |
| `apps/founder-ui/src/components/SelectedKeyContentCard.tsx` | **신규** | 선택 완료된 핵심 콘텐츠를 보여주는 UI 컴포넌트 |
| `apps/founder-ui/src/app/chat/page.tsx` (또는 해당 영역) | 수정 | 제안된 콘텐츠가 있을 경우 Candidate 카드 목록 렌더링 배선 |
| `apps/founder-ui/src/lib/api.ts` | 수정 | 콘텐츠 선택 및 상태 업데이트를 처리하기 위한 API 함수 추가/확장 |
| `packages/l5-core/src/types/orchestration.ts` | 수정(필요시) | 콘텐츠 후보 메타데이터를 담기 위한 타입 속성 추가 |

## Acceptance Criteria

각 항목은 수동 또는 자동 테스트(E2E)를 통해 검증 가능해야 한다.

| # | 기준 (Criteria) | 검증 방법 (Verification) |
|---|------|----------|
| AC-1 | Key Content Candidate Card가 제안된 콘텐츠 데이터(제목, 요약, 기대효과)를 빠짐없이 렌더링한다. | 렌더링된 컴포넌트에 제목, 1~2줄 요약, 기대효과가 모두 표시되는지 목시 확인 |
| AC-2 | Candidate Card의 [채택] 버튼을 클릭하면 상태 변경 API가 호출되고 카드의 상태가 Selected로 바뀐다. | 버튼 클릭 시 브라우저 네트워크 탭에서 API 호출(예: POST) 성공을 확인 |
| AC-3 | 선택이 완료된 콘텐츠는 Selected Key Content Card의 형태와 디자인 패턴(Joinery 토큰)으로 변경되어 렌더링된다. | 채택 액션 후 해당 카드의 스타일이 확정(Selected) 상태의 디자인 규칙을 따르는지 확인 |
| AC-4 | [거절] 버튼 클릭 시 UI 목록에서 카드가 즉시 제거되거나 거절 상태로 변경된다 (Optimistic Update). | 버튼 클릭 후 100ms 이내에 카드가 목록에서 사라지거나 비활성화 처리되는지 확인 |
| AC-5 | 신규 컴포넌트 추가로 인해 기존 화면(chat, monitor)의 레이아웃이 파손되지 않는다. | `next build` 시 오류가 발생하지 않으며, 페이지 접근 시 콘솔 에러가 없음을 확인 |
| AC-6 | Typescript 타입 안정성이 확보된다. | 프로젝트 루트 또는 `apps/founder-ui`에서 `pnpm typecheck` 실행 시 통과 확인 |
