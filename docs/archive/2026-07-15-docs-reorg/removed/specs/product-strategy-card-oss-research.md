# 오픈소스 조사: Product Strategy Card (상품/타깃/문제/목표 정의)

> 조사일: 2026-06-04

## 요구사항 요약

Product Strategy Card는 CMO가 정의한 상품 전략(상품·타깃·문제·목표)을 구조화된 카드 형태로 표시하고, 필요시 Founder가 직접 편집할 수 있는 UI 컴포넌트다.

| # | 요구사항 | 비고 |
|---|---------|------|
| 1 | 4개 필드(상품/타깃/문제/목표) 구조화 표시 | 읽기 전용 카드 + 편집 모드 토글 |
| 2 | 인라인 편집 (textarea / input) | 기존 ConsultationCard textarea 패턴과 동일 |
| 3 | 기존 디자인 시스템 일관성 | inline style + CSS 변수 (var(--ink-1) 등) |
| 4 | 모바일 반응형 | 기존 MobileShell 내 렌더링 |

## 도메인 1: UI 컴포넌트 라이브러리 (카드/레이아웃)

| 기준 | shadcn/ui (Radix 기반) | Radix Primitives | 자체 구현 (기존 패턴) |
|------|----------------------|------------------|---------------------|
| **라이선스** | MIT | MIT | — |
| **번들 크기** | ~15-30kB (트리셰이킹) | ~5-10kB (개별 패키지) | 0 |
| **스타일 방식** | Tailwind utility class | 무스타일 (unstyled) | inline style + CSS 변수 |
| **기존 패턴 호환** | ❌ 충돌 — 프로젝트 전체가 inline style + CSS 변수, Tailwind utility class 미사용 | △ 무스타일이나 도입 이점 미미 | ✅ 완전 호환 |
| **학습/도입 비용** | 높음 (전역 스타일 전환 필요) | 중간 | 없음 |
| **카드 4개 필드 표시** | 과잉 — Card 1개 + 4 TextField에 라이브러리 전체 도입 | 과잉 | div + inline style로 충분 |

### 채택: **자체 구현 (기존 inline style 패턴)**

- 프로젝트의 모든 카드(BusinessContextSnapshotCard, ConsultationCard, SynthesisCard, AgentOutputDetail)가 inline style + CSS 변수 패턴
- 공통 Header & Mini Roadmap 조사(2026-06-04)에서도 Radix/shadcn 배제 결정 (기존 패턴 충돌·번들 과다)
- Product Strategy Card는 4개 텍스트 필드를 표시/편집하는 단순 카드 — UI 라이브러리 도입 대비 이점 없음

### 배제: shadcn/ui, Radix Primitives

- 기존 inline style 컨벤션과 충돌하며, 이 하나의 카드를 위해 스타일 시스템 전환은 비합리적
- 공통 Header 조사에서 이미 동일 결론 도출

## 도메인 2: 폼 관리 라이브러리

| 기준 | react-hook-form v7 | Formik v2 | 자체 구현 (useState) |
|------|-------------------|-----------|---------------------|
| **라이선스** | MIT | Apache 2.0 | — |
| **번들 크기** | ~9kB | ~13kB | 0 |
| **TypeScript 지원** | 강함 (제네릭 추론) | 보통 | 직접 타이핑 |
| **필드 수 대비 이점** | 10+ 필드, 동적 폼, 복잡 밸리데이션 시 유리 | 동일 | 4개 필드에 최적 |
| **기존 코드 패턴** | 미사용 — ConsultationCard도 useState 직접 관리 | 미사용 | ✅ 기존 패턴 |
| **밸리데이션 요구** | 없음 (CMO가 생성, Founder가 확인/수정) | 없음 | 단순 빈값 체크로 충분 |

### 채택: **자체 구현 (useState)**

- 4개 텍스트 필드(상품/타깃/문제/목표)는 react-hook-form의 proxy 기반 구독 최적화가 불필요한 규모
- ConsultationCard가 동일한 패턴(useState + textarea)으로 이미 구현되어 있음
- 밸리데이션 요구사항이 단순하여 Yup/Zod 스키마 도입 근거 없음

### 배제: react-hook-form, Formik

- 필드 4개짜리 폼에 폼 라이브러리는 과잉 — 오히려 register/control 보일러플레이트가 useState보다 많음
- 향후 10+ 필드 복합 폼이 생기면 재검토 (현재 MVP에는 해당 없음)

## 도메인 3: 리치 텍스트 편집기

| 기준 | Tiptap v2 (ProseMirror) | Lexical (Meta) | 일반 textarea |
|------|------------------------|----------------|---------------|
| **라이선스** | MIT | MIT | — |
| **번들 크기** | ~150kB+ (ProseMirror 코어 포함) | ~50kB | 0 |
| **기능** | WYSIWYG, 마크다운, 협업 편집 | WYSIWYG, 확장성 높음 | 단순 텍스트 입력 |
| **필요성** | 전략 필드에 볼드/리스트/링크 등 서식 필요시 | 동일 | 현재 요구사항은 plain text |
| **기존 코드 패턴** | 미사용 | 미사용 | ✅ ConsultationCard textarea |

### 채택: **일반 textarea**

- Product Strategy Card의 4개 필드(상품/타깃/문제/목표)는 1-3문장 수준의 plain text
- CMO가 LLM으로 생성한 텍스트를 Founder가 확인/미세 수정하는 용도 — 서식 편집 불필요
- 150kB+ 리치 텍스트 에디터는 이 용도에 과잉

### 배제: Tiptap, Lexical

- plain text 필드에 WYSIWYG 에디터는 번들 대비 이점 없음
- PMF 확인 후 마케팅 콘텐츠 편집 등 리치 텍스트 수요가 생기면 재검토

## 종합 결론

| 도메인 | 채택 | 배제 (이유) | 번들 추가 | 통합 시점 |
|--------|------|-------------|-----------|-----------|
| UI 컴포넌트 | **자체 구현** (inline style + CSS 변수) | shadcn/ui(기존 패턴 충돌), Radix(과잉) | 0 | 카드 구현 시 |
| 폼 관리 | **useState** (기존 패턴) | react-hook-form(4필드에 과잉), Formik(동일) | 0 | 카드 구현 시 |
| 텍스트 편집 | **textarea** (plain text) | Tiptap(150kB+, 과잉), Lexical(동일) | 0 | 카드 구현 시 |

**새 라이브러리 추가 불필요.** 기존 프로젝트 패턴(inline style + CSS 변수 + useState + textarea)으로 Product Strategy Card의 모든 요구사항을 충족할 수 있다. 이는 공통 Header & Mini Roadmap 조사(2026-06-04)의 결론과도 일치한다.
