# Research: CMO Video Room — 오픈소스 라이브러리 조사

> 조사일: 2026-06-04 | 대상: Video Room 메뉴 & 라우터 추가에 필요한 프론트엔드 라이브러리

## 프로젝트 현황

| 항목 | 현황 |
|------|------|
| 프론트엔드 스택 | Next.js 14.2.29 + React 18 + Tailwind CSS 3 |
| UI 라이브러리 | **없음** — 전 페이지 인라인 스타일 + Joinery CSS 변수 (`globals.css`) |
| 폼 관리 | `useState` 직접 사용. 폼 라이브러리 없음 |
| 런타임 의존성 | `next`, `react`, `react-dom` — 3개뿐 |
| 백엔드 | `l5-core` Video Factory 도구 3개 구현 완료 (configure, generate, get_config) |
| Video Factory 출력 | file URL 반환 (외부 영상 생성기 → URL). YouTube/Vimeo 등 멀티소스 불필요 |

## 조사 영역 1: 비디오 플레이어

Video Factory가 생성한 영상을 미리보기/재생할 컴포넌트.

| 기준 | **react-player** | **video.js** (+ react wrapper) | **HTML5 `<video>` (네이티브)** |
|------|-------------------|-------------------------------|-------------------------------|
| 번들 크기 (gzip) | ~40 KB | ~150 KB+ | **0 KB** |
| 멀티소스 지원 | O (YouTube, Vimeo, file URL 자동 감지) | O (플러그인 방식) | X (file URL만) |
| 커스텀 스킨 | CSS 가능하나 제한적, 자체 UI 존재 | 완전 커스텀 가능 | **완전 자유** (인라인 스타일 호환) |
| React 18 호환 | O | △ (공식 React 래퍼 부재, 커뮤니티 래퍼) | **O** |
| npm 주간 다운로드 | ~1.5M | ~800K | N/A (내장) |
| Joinery 스타일 호환 | △ (자체 컨트롤 UI가 Joinery와 충돌) | X (자체 테마 시스템, 무거움) | **O** (인라인 스타일 패턴 일치) |
| 유지보수 부담 | 낮음 | 높음 (설정 복잡) | **없음** |
| 라이선스 | MIT | Apache-2.0 | N/A |

### 채택: HTML5 `<video>` 네이티브

**근거:**
- Video Factory 출력은 **file URL**만 반환. YouTube/Vimeo 멀티소스 지원이 불필요.
- 프로젝트 전체가 **런타임 의존성 3개** 원칙. react-player(+40KB)나 video.js(+150KB) 도입은 이 원칙을 깨뜨림.
- 재생/일시정지/탐색 등 기본 컨트롤은 `<video controls>` 하나로 충분.
- Joinery CSS 변수와 인라인 스타일로 감싸기만 하면 기존 디자인 시스템과 완벽 호환.

### 배제 근거

| 라이브러리 | 배제 이유 |
|-----------|----------|
| **react-player** | 멀티소스 자동 감지가 장점이나, Video Factory는 file URL만 반환하므로 핵심 장점이 무의미. 자체 컨트롤 UI가 Joinery 디자인 시스템과 불일치. +40KB 불필요한 번들 추가. |
| **video.js** | 엔터프라이즈급 플레이어로 이 MVP 규모에 과잉. +150KB 번들, React 공식 래퍼 부재(커뮤니티 의존), 자체 테마 시스템이 인라인 스타일 패턴과 충돌. 커스텀 스킨 작업이 네이티브보다 오히려 무거움. |

## 조사 영역 2: 폼 관리

Video Brief 작성 폼(topic, angle, format)과 전략 설정 폼(strategy, content_style, notes) 관리.

| 기준 | **react-hook-form** | **formik** | **useState 직접 관리** |
|------|---------------------|-----------|----------------------|
| 번들 크기 (gzip) | ~9 KB | ~13 KB | **0 KB** |
| 검증 (validation) | O (Zod/Yup 연동) | O (Yup 연동) | 수동 작성 |
| 러닝커브 | 낮음 | 중간 | **없음** |
| 프로젝트 기존 패턴 | 미사용 | 미사용 | **전 페이지 사용 중** |

### 채택: useState 직접 관리

**근거:**
- 폼 필드가 각각 **3개** 수준 (브리프: topic/angle/format, 전략: strategy/content_style/notes).
- 기존 프로젝트 전 페이지(Sidebar 모달, CTO 기획 패널 `CtoPlanningPanel`, 사업/프로젝트 생성 폼)가 모두 `useState`로 관리.
- 복잡한 유효성 검증이 불필요 (topic 필수만 체크).

### 배제 근거

| 라이브러리 | 배제 이유 |
|-----------|----------|
| **react-hook-form** | 필드 3개 폼에 폼 라이브러리 도입은 과잉. 기존 패턴과 불일치. 새 의존성 추가 불필요. |
| **formik** | 같은 이유 + react-hook-form보다 번들이 크고, 프로젝트에서 사용 전례 없음. |

## 조사 영역 3: UI 컴포넌트 라이브러리

| 기준 | **shadcn/ui** | **Radix Primitives** | **기존 Joinery 인라인 스타일** |
|------|-------------|---------------------|-------------------------------|
| 번들 영향 | 컴포넌트별 ~2-5 KB | 컴포넌트별 ~1-3 KB | **0 KB** |
| 스타일 시스템 | Tailwind 기반 | unstyled | **인라인 + CSS 변수** |
| 기존 패턴 호환 | △ (Tailwind 사용하나 클래스 패턴 다름) | O (unstyled → 인라인 적용 가능) | **완벽** |
| 접근성 | O | O | 수동 작성 |

### 채택: 기존 Joinery 인라인 스타일 유지

**근거:**
- 프로젝트 전체(10+ 페이지, 15+ 컴포넌트)가 Joinery CSS 변수 + 인라인 스타일로 통일.
- Video Room은 정보 표시 + 간단 폼 수준. 복잡한 UI 컴포넌트(모달, 드롭다운 등) 불필요.
- 새 UI 라이브러리 도입은 스타일 불일치와 유지보수 부담 야기.

## 최종 결론

| 영역 | 채택 | 신규 의존성 |
|------|------|-----------|
| 비디오 플레이어 | HTML5 `<video>` 네이티브 | 없음 |
| 폼 관리 | useState 직접 관리 | 없음 |
| UI 컴포넌트 | Joinery 인라인 스타일 유지 | 없음 |

**신규 라이브러리 추가 0개.** 기존 스택만으로 구현 가능. 향후 멀티소스(YouTube 등) 임베드가 필요해지면 그때 react-player 도입을 재검토한다.
