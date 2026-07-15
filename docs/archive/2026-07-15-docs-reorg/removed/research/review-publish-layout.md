# 오픈소스 조사: Review & Publish Page 레이아웃 (좌/중/우)

> 작성: 2026-06-04 | 상태: 완료

## 배경

CMO Video Room 등 콘텐츠 Review & Publish 페이지에 좌(네비/목록)/중(콘텐츠 미리보기)/우(메타·설정·발행) 3-column 레이아웃이 필요하다.

## 프로젝트 제약

- Next.js 14 / React 18 / Tailwind CSS 3
- **UI 라이브러리 0개 원칙** (인라인 스타일 + Joinery CSS 변수)
- 상용 플러그인 금지 (MVP-critical)
- 기존 모든 페이지(Control Room, Memory, Chat 등)가 외부 UI 라이브러리 없이 구현됨

## 후보 비교표

| 기준 | react-resizable-panels | allotment | Native CSS Grid/Flexbox |
|------|----------------------|-----------|------------------------|
| **GitHub Stars** | ~5,300 | ~1,300 | N/A |
| **번들 크기 (min+gz)** | ~12 kB | ~40–50 kB | 0 kB |
| **최신 릴리스** | v4.11.2 (2026-05, 주간 릴리스) | v1.20.5 (2025-12) | N/A |
| **React 18 호환** | O (16.14+) | O | O |
| **Next.js App Router / SSR** | O (`"use client"` + cookie 기반 hydration) | X (브라우저 전용, `ssr: false` 필수) | O (완전 서버 렌더 가능) |
| **키보드 접근성** | O (WAI-ARIA window splitter, 화살표키 리사이즈) | X (마우스/터치만) | 수동 구현 필요 |
| **패널 크기 저장/복원** | O (내장 `autoSaveId` → localStorage) | X (수동 구현) | 수동 구현 |
| **npm 주간 다운로드** | ~33,000,000 | ~243,000 | N/A |
| **라이선스** | MIT | MIT | N/A |
| **드래그 리사이즈** | O | O | X (토글/고정만) |

## 채택 결정: **Native CSS Grid/Flexbox** (라이브러리 추가 없음)

### 채택 근거

1. **프로젝트 원칙 일관성**: founder-ui 전체가 UI 라이브러리 0개 원칙으로 구축됨. 기존 Control Room(CTO 기획 패널 + 로드맵 + 태스크 트리)도 CSS만으로 다중 패널 구현. 이 원칙을 깨는 것은 정당화되지 않음.
2. **Review & Publish에 드래그 리사이즈 불필요**: 좌(목록 240px 고정)/중(flex:1 콘텐츠)/우(설정 320px 고정 또는 토글) — 사용자가 패널 폭을 자유 조절해야 하는 시나리오가 아님. 토글(접기/펴기)이면 충분.
3. **번들 제로**: 12kB라도 MVP에서 단일 페이지 레이아웃을 위해 의존성을 추가하는 것은 과잉.
4. **SSR 완전 호환**: CSS Grid는 서버 렌더 시 레이아웃 시프트 없음.

### 구현 방향

```css
/* 3-column: 인라인 스타일 또는 Tailwind */
display: grid;
grid-template-columns: 240px 1fr 320px;
height: 100%;
```

- 좌패널: 콘텐츠 목록/네비게이션 (고정 240px, 모바일에서 숨김)
- 중패널: 콘텐츠 미리보기 (flex)
- 우패널: 메타데이터·설정·발행 버튼 (고정 320px, 접기 토글 가능)
- 반응형: `@media (max-width: 768px)` → 단일 컬럼 + 탭 전환

### react-resizable-panels — 향후 후보 (현재 배제)

향후 IDE/에디터 스타일 레이아웃(코드 리뷰, 문서 에디터 등)에서 드래그 리사이즈가 필수가 되면 **react-resizable-panels**이 유일한 후보다. allotment은 SSR 미지원 + 접근성 부재로 배제.

| 배제 라이브러리 | 배제 이유 |
|---------------|----------|
| **allotment** | SSR 불가(Next.js App Router 비호환), 키보드 접근성 미지원, 번들 40-50kB, 업데이트 6개월+ 정체 |
| **react-resizable-panels** | 기능 자체는 우수하나, 현재 요구사항(고정폭 3-column)에 드래그 리사이즈 불필요 → 과잉 의존성. 프로젝트 UI 라이브러리 0개 원칙 위반 |
