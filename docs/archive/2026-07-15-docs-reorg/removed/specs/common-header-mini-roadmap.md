# SPEC: 공통 Header & Mini Roadmap UI

> 상태: draft | 작성: 2026-06-04

## 1. 배경 및 문제

founder-ui의 각 페이지가 **자체 헤더를 inline으로 중복 구현**하고 있다:

| 페이지 | 헤더 구현 | 문제 |
|---|---|---|
| `monitor/page.tsx:681-718` | Overline + h1 + 범위 라벨 + 컨트롤 | 페이지 전용 |
| `projects/page.tsx:88-117` | h1 + meta + 새로고침 | 패턴 유사하나 별도 구현 |
| `chat/page.tsx` | TabLayout 직접 사용 | 헤더 개념 없음 |

**Icon 컴포넌트가 4곳에 중복** 정의:
- `Sidebar.tsx` — ICONS (12개) + Icon
- `RoadmapMiniCard.tsx` — ICONS (4개) + Icon
- `monitor/page.tsx` — ICONS (8개) + Icon
- `chat/page.tsx` — ICONS (10개) + Icon

**Agent 배지 컬러맵이 2곳에 중복** 정의:
- `monitor/page.tsx` — AGENT_PASTEL + AgentBadge
- `RoadmapTimeline.tsx` — AGENT_CHIP + AgentChip

## 2. 목표

공통 PageHeader 컴포넌트와 공유 Icon/AgentBadge 모듈을 만들어 중복을 제거하고 일관된 페이지 레이아웃을 확보한다.

## 3. 오픈소스 조사 결론

| 후보 | 결정 | 근거 |
|---|---|---|
| 라이브러리 없음 (현행 유지) | **채택** | 기존 400줄+ inline style + CSS 변수 패턴과 완벽 호환. 번들 0 KB 추가. |
| Radix UI Primitives | 배제 | Header/Roadmap 범위에서 드롭다운/툴팁 불필요. 복잡한 a11y 요구시 부분 도입 재검토. |
| shadcn/ui | 배제 | className 기반 설계가 기존 inline style 패턴과 충돌. 전체 마이그레이션 비용 과다. |

## 4. 요구사항

### 4.1 공통 PageHeader 컴포넌트

**파일:** `src/components/PageHeader.tsx` (신규)

```typescript
interface PageHeaderProps {
  overline?: string        // 상단 카테고리 (예: "도구", "메인")
  title: string            // 페이지 제목 (예: "현황 모니터")
  subtitle?: string        // 부제 또는 범위 라벨
  actions?: React.ReactNode // 오른쪽 영역 (새로고침, 토글 등)
}
```

**스타일 규격** (monitor/page.tsx:681-718 기존 패턴 추출):
- Overline: `font-mono 10.5px uppercase letter-spacing 0.12em color ink-3`
- Title: `font-serif weight-500 30px color ink-1 letter-spacing -0.015em`
- Subtitle: `font-mono 12px color ink-3`
- actions: `margin-left: auto`, flex 우측 배치

### 4.2 공유 Icon 모듈

**파일:** `src/components/Icon.tsx` (신규)

- 기존 4곳의 ICONS Record를 합집합(union)으로 통합 (~20개)
- 동일한 SVG Icon 컴포넌트 export
- 기존 파일의 로컬 ICONS + Icon 정의 제거 → import 교체

### 4.3 공유 AgentBadge 모듈

**파일:** `src/components/AgentBadge.tsx` (신규)

- `monitor/page.tsx`의 AGENT_PASTEL + AgentBadge 통합
- `RoadmapTimeline.tsx`의 AGENT_CHIP + AgentChip 통합
- `variant` prop (`badge` | `chip`)으로 두 스타일 분기, 또는 스타일 차이가 미미하면 하나로 통일

### 4.4 Header에 Mini Roadmap 컨텍스트 (선택)

PageHeader 아래 또는 내부에 현재 BPR Phase + 진행 바를 표시할 수 있는 `children` slot 제공. 기존 PhaseTransitionPanel의 진행 바 패턴(`phase_index / total_phases`) 재사용.

## 5. 영향 파일 목록

| 파일 | 변경 |
|---|---|
| `src/components/PageHeader.tsx` | **신규** |
| `src/components/Icon.tsx` | **신규** |
| `src/components/AgentBadge.tsx` | **신규** |
| `src/app/monitor/page.tsx` | 로컬 Icon/ICONS/AgentBadge 제거 → import. 인라인 헤더 → PageHeader 교체 |
| `src/app/projects/page.tsx` | 인라인 헤더 → PageHeader 교체 |
| `src/app/chat/page.tsx` | 로컬 Icon/ICONS 제거 → import |
| `src/components/Sidebar.tsx` | 로컬 Icon/ICONS 제거 → import |
| `src/components/RoadmapMiniCard.tsx` | 로컬 Icon/ICONS 제거 → import |
| `src/components/RoadmapTimeline.tsx` | 로컬 AGENT_CHIP/AgentChip 제거 → import |

## 6. Acceptance Criteria

| # | 기준 | 검증 방법 |
|---|---|---|
| AC-1 | `PageHeader` 컴포넌트가 존재하고 `monitor`와 `projects` 페이지에서 사용된다 | `grep -r "PageHeader" src/app/` — 2개 이상 매치 |
| AC-2 | `Icon.tsx`에 통합 ICONS Record가 존재하고 기존 4개 파일의 로컬 ICONS 정의가 제거되었다 | `grep -r "const ICONS" src/` — `Icon.tsx` 1곳만 매치 |
| AC-3 | `AgentBadge.tsx`에 통합 컬러맵이 존재하고 기존 2개 파일의 로컬 정의가 제거되었다 | `grep -r "AGENT_PASTEL\|AGENT_CHIP" src/` — `AgentBadge.tsx` 1곳만 매치 |
| AC-4 | 모든 페이지의 시각적 렌더링이 변경 전과 동일하다 (regression 없음) | `/monitor`, `/projects`, `/chat` 3개 페이지 브라우저 수동 확인 |
| AC-5 | `pnpm typecheck` 통과 | `corepack pnpm --filter @l5/founder-ui typecheck` exit 0 |
| AC-6 | 기존 스타일 패턴 유지: inline style + CSS 변수, 외부 UI 라이브러리 추가 없음 | `package.json` dependencies에 새 항목 없음 |

## 7. 구현 제외 (Out of Scope)

- RoadmapMiniCard / RoadmapTimeline 기능 변경
- Sidebar 구조·네비게이션 변경
- 새로운 외부 라이브러리 도입
- 디자인 토큰 변경
- control-room/page.tsx 헤더 (자체 패널 구조가 달라 별도 판단 필요)
