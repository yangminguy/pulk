# OSS Research: Reference Candidate Card & Visualization

## 배경 및 목적
`docs/specs/key-content-cards.md` 명세에 따라 CMO/임원이 제안한 Key Content Candidate Card의 인터랙션(낙관적 상태 업데이트) 및 예상 효과(ROI/PMF) 데이터 시각화를 구현하기 위한 오픈소스 라이브러리를 조사합니다.

## 후보 라이브러리 비교표

| 라이브러리 | 주요 용도 | 장점 | 단점 | GitHub Stars | 라이선스 | 상태 |
| --- | --- | --- | --- | --- | --- | --- |
| **Framer Motion** | UI 애니메이션 및 상태 전이 (Candidate Card의 Optimistic Update) | React 생태계 표준, 선언적 애니메이션 레이아웃 이동(AnimatePresence 등) 처리에 탁월함 | 번들 사이즈가 상대적으로 큼 | 22k+ | MIT | 채택 |
| **Recharts** | 예상 ROI/PMF 시각화 (데이터 차트) | 선언형 컴포넌트 기반으로 사용하기 쉽고 커스터마이징이 용이함 | 복잡한 인터랙티브 차트 구현시 한계 존재 | 21k+ | MIT | 채택 |
| **dnd-kit** | 카드 드래그 앤 드롭 파이프라인 | 가볍고 접근성(a11y)이 뛰어나며, 상태 관리와 UI가 분리됨 | 초기 학습 곡선 존재, 현재 스펙에서는 드래그 앤 드롭보다 클릭 액션(Select) 위주임 | 9k+ | MIT | 배제(보류) |
| **Visx (by Airbnb)** | 저수준 커스텀 데이터 시각화 | D3 기반으로 극도의 커스터마이징 가능 | 단순한 ROI 지표 표시에 쓰기에는 오버엔지니어링 | 18k+ | MIT | 배제 |

## 채택 근거 및 배제 이유

### 1. Framer Motion (채택)
- **채택 근거**: Candidate Card 스펙 중 `AC-4` ("거절 버튼 클릭 시 UI 목록에서 카드가 즉시 제거되거나 거절 상태로 변경된다")를 구현할 때, 카드가 사라지면서 남은 카드들이 부드럽게 재배치되는 레이아웃 애니메이션(`layout` prop 및 `<AnimatePresence>`)을 가장 쉽게 구현할 수 있습니다. 

### 2. Recharts (채택)
- **채택 근거**: Candidate Card에 예상 PMF나 ROI 지표를 미니 차트(스파크라인 또는 방사형 차트)로 직관적으로 보여주기 위해 채택합니다. React에 가장 최적화된 선언형 컴포넌트를 제공하며, 기본 제공 테마를 L5 Business OS의 Joinery 디자인 시스템 색상으로 쉽게 덮어씌울 수 있습니다.

### 3. dnd-kit (배제 / 추후 보류)
- **배제 이유**: 현재 명세(`key-content-cards.md`)의 범위는 클릭 액션(`[채택]`, `[거절]`) 위주의 상태 변경이며, 아직 Kanban 스타일의 파이프라인 카드 드래그 앤 드롭(Drag & Drop) 요구사항이 명시되어 있지 않아 현 단계에서는 도입을 배제합니다. 향후 파이프라인 뷰 추가 시 재검토합니다.

### 4. Visx (배제)
- **배제 이유**: 높은 자유도를 제공하지만 초기 설정과 컴포넌트 조합에 많은 코드가 필요합니다. 카드의 좁은 영역에 들어갈 단순 지표 시각화 용도로는 오버엔지니어링입니다.

---

**결론**: Joinery CSS로 Card 기본 뼈대(`j-card`, `j-btn`)를 구성하고, 상호작용 애니메이션은 **Framer Motion**, 내부 지표 시각화는 **Recharts**를 조합하여 Reference Candidate Card를 구현할 것을 추천합니다.
