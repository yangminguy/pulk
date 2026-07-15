# CMO Chat UI — 오픈소스 후보 비교 분석

> 작성일: 2026-06-04
> 목적: CMO Agent 전용 Chat UI 구현 방식 선정
> 제약: Next.js 14 + React 18 + Tailwind + Joinery 디자인 시스템 · 프로덕션 의존성 3개(next/react/react-dom) · 상업 플러그인 MVP 금지

---

## 현재 프로젝트 상황

| 항목 | 현재 상태 |
|------|-----------|
| 프론트엔드 스택 | Next.js 14.2 + React 18 + Tailwind 3 |
| UI 라이브러리 | **없음** (순수 React + Joinery CSS 토큰) |
| 기존 Chat 패턴 | CEO Chat (`/chat`) — 완전 커스텀 ~1400줄, 버블/카드/승인 UI 포함 |
| CMO Agent 백엔드 | `services/agent-runtime/src/agents/cmo.ts` — 구조화 JSON 반환 (비스트리밍) |
| API 통신 | NocoBase REST API → `lib/api.ts` fetch 래퍼 |
| 디자인 시스템 | Joinery — CSS 변수 기반 (`--paper-*`, `--ink-*`, `--green-*`), `j-btn`/`j-badge`/`j-input` 클래스 |

---

## 후보 3개 비교표

| 기준 | A. Vercel AI SDK (`ai` + `@ai-sdk/react`) | B. @assistant-ui/react | C. 기존 CEO Chat 패턴 확장 |
|------|------------------------------------------|----------------------|--------------------------|
| **라이선스** | Apache-2.0 | MIT | N/A (자체 코드) |
| **GitHub Stars** | ~24.6k | ~8.5k | N/A |
| **npm 주간 다운로드** | ~5.4M (`@ai-sdk/react`) | ~973K | N/A |
| **번들 크기** | ~25KB gzipped (client React bundle) | ~40KB+ gzipped | 0 KB (추가 없음) |
| **최신 버전** | AI SDK 6 (2025-12, 활발) | v0.14.x (2026-06, 활발, 1.0 미만) | N/A |
| **핵심 기능** | `useChat` 훅, 스트리밍, 메시지 상태, 도구 호출 UI | 헤드리스 Chat 컴포넌트, 스레드/메시지/입력 분리, 스트리밍 | 버블 UI, 해석 패널, 태스크 카드, 승인/거절 플로우 |
| **스트리밍 지원** | 핵심 기능 (SSE/RSC 기반) | 핵심 기능 | 없음 (JSON 응답 기반) |
| **커스텀 스타일링** | 훅 기반 → UI 자유 | 헤드리스 → UI 자유 | Joinery 네이티브 |
| **커스텀 메시지 카드** | 직접 렌더러 구현 | 커스텀 MessagePrimitive 지원 | 이미 구현됨 (ProposedTasksPanel, SynthesisCard 등) |
| **백엔드 요구사항** | AI SDK 호환 API Route 필수 (스트리밍 엔드포인트) | AI SDK 호환 또는 커스텀 런타임 어댑터 | 기존 NocoBase REST API 그대로 사용 |
| **Joinery 통합** | ★★★ (훅만 제공, UI 자유) | ★★☆ (헤드리스이나 내부 DOM 구조 존재) | ★★★ 완벽 (네이티브) |
| **기존 코드 재사용** | ★☆☆ (메시지 모델 재설계 필요) | ★☆☆ (런타임 어댑터 + 컴포넌트 재작성) | ★★★ (AgentChip, InterpretationPanel, SynthesisCard 등 그대로) |
| **학습 곡선** | 중간 (AI SDK 컨벤션, 스트리밍 프로토콜) | 높음 (Primitive 패턴, 런타임 어댑터 설계) | 낮음 (기존 패턴 동일) |
| **유지보수 부담** | 중간 (SDK 버전 추적 + 백엔드 어댑터) | 높음 (빠른 API 변경, 아직 1.0 미만) | 낮음 (자체 코드, 의존성 없음) |

---

## 후보별 상세 분석

### A. Vercel AI SDK (`ai` + `@ai-sdk/react`)

**개요**: Vercel이 만든 AI 챗 애플리케이션 프레임워크. `useChat` 훅으로 스트리밍 메시지, 도구 호출, 첨부파일 등을 관리.

**장점**
- Next.js와 네이티브 통합 (App Router, Server Actions, Edge Runtime)
- `useChat` 훅이 메시지 상태, 입력, 로딩, 에러를 원스톱 관리
- 스트리밍 UX가 핵심 — 긴 응답도 점진적 렌더링
- 도구 호출(`experimental_toolCallUI`) 지원 — 에이전트 도구 실행 결과 인라인 표시 가능
- 훅 기반이라 UI는 완전히 자유 (Joinery 스타일 적용 가능)

**단점**
- **백엔드 변경 필수**: 현재 CMO Agent는 `callHaikuJson` → 구조화 JSON 1회 반환. AI SDK는 스트리밍 엔드포인트(`/api/chat`)를 요구하므로 `streamText`/`streamObject` 래퍼 신규 구현 필요
- 기존 CEO Chat의 `api.submitInstruction` → `api.chatHistory` 패턴과 호환 안 됨 — 메시지 모델 재설계
- `ProposedTasksPanel`, `SynthesisCard` 같은 비표준 카드형 메시지를 SDK 메시지 모델에 끼워맞추기 어려움
- 의존성 2개 추가 (`ai`, `@ai-sdk/react`) — 극소화 컨벤션과 긴장

**적합 시나리오**: LLM 스트리밍이 핵심이고, 백엔드를 AI SDK 규격으로 설계하는 신규 프로젝트

---

### B. @assistant-ui/react

**개요**: AI 어시스턴트 UI 전문 헤드리스 컴포넌트 라이브러리. Thread/Message/Composer Primitive 패턴으로 구성.

**장점**
- 헤드리스(Primitive) 패턴 → 마크업/스타일 자유도 높음
- 스레드 관리, 메시지 분기, 편집 등 어시스턴트 특화 기능
- Vercel AI SDK 런타임 어댑터 제공 (`@assistant-ui/react-ai-sdk`)
- 마크다운 렌더링, 코드 하이라이트, 도구 호출 UI 빌트인

**단점**
- **아직 1.0 미만** — API 변경 빈번, 프로덕션 안정성 미검증
- 런타임 어댑터 패턴 학습 비용 높음 — 커스텀 백엔드(NocoBase REST)용 어댑터를 직접 작성해야 함
- 의존성 체인이 깊음 (`@assistant-ui/react` → 다수 피어 디펜던시)
- L5 CEO Chat의 비표준 UI 패턴(승인/거절 플로우, 태스크 배정 카드, Synthesis 카드)을 Primitive에 맞추려면 **사실상 재작성**
- 번들 40KB+ — 기존 프로덕션 의존성 3개 프로젝트에 부담

**적합 시나리오**: 범용 AI 어시스턴트 채팅을 처음부터 만들되, 디자인 커스터마이징이 중요한 경우

---

### C. 기존 CEO Chat 패턴 확장 (커스텀)

**개요**: 현재 `/chat` 페이지의 CEO Chat 구조(`ChatTab` 컴포넌트)를 CMO 전용으로 포크/확장. 공통 컴포넌트(`AgentChip`, `InterpretationPanel`, `Icon`)를 재사용하고, CMO 특화 카드(포지셔닝 비교, PMF 실험 결과 등)만 추가.

**장점**
- **의존성 추가 제로** — 프로젝트 극소화 컨벤션 완벽 부합
- 기존 검증된 패턴 그대로 — `api.submitInstruction`/`api.chatHistory` 플로우, NocoBase REST 호환
- Joinery 디자인 시스템 **네이티브** — CSS 변수, `j-*` 클래스 충돌 없음
- 공통 컴포넌트 즉시 재사용: `AgentChip`, `InterpretationPanel`, `ProposedTasksPanel`, `SynthesisCard`, `Icon`
- CMO Agent가 구조화 JSON을 반환하므로 스트리밍 불필요 — 기존 fetch→setState 패턴이 정확히 맞음
- 팀 학습 비용 제로 (기존 패턴 동일)

**단점**
- 스트리밍 UX 없음 — 응답 완료까지 "분석 중…" 표시만 (현재 CEO Chat과 동일)
- Chat 관련 공통 로직(메시지 렌더링, 입력 바, 스크롤) 중복 가능성 — 향후 공통 훅/컴포넌트 추출 필요할 수 있음
- 복잡한 멀티턴 대화 기능(스레드 분기, 메시지 편집, 재생성)은 직접 구현

**적합 시나리오**: 기존 CEO Chat과 동일한 UX 패턴, 구조화 JSON 백엔드, Joinery 디자인 시스템 유지 필수

---

## 채택 권고: C. 기존 CEO Chat 패턴 확장

### 근거

| 판단 기준 | 결론 |
|-----------|------|
| **백엔드 호환성** | CMO Agent는 구조화 JSON 반환 + NocoBase REST API. A/B는 스트리밍 엔드포인트 또는 런타임 어댑터 신규 구현 필요 → **백엔드 변경 범위가 과도** |
| **의존성 정책** | 프로덕션 의존성 3개 컨벤션 유지. A는 +2, B는 +다수 → C만 제로 추가 |
| **기존 코드 재사용** | CEO Chat의 `AgentChip`, `InterpretationPanel`, `Icon`, 메시지 버블 스타일, 승인/거절 플로우 등 **즉시 재사용 가능**. A/B는 메시지 모델부터 재설계 |
| **Joinery 통합** | C는 네이티브. A는 훅 기반이라 가능하지만 메시지 모델 재설계 동반. B는 Primitive DOM 구조와 Joinery 클래스 간 마찰 |
| **스트리밍 필요성** | CMO Agent 응답은 구조화 JSON 1회 반환 (~2-5초). 스트리밍 UX의 가치가 낮음 — CEO Chat도 동일 방식으로 이미 운영 중 |
| **MVP 원칙** | "PMF 신호 전 도구 금지" — 검증된 패턴 재사용이 최소 리스크 |

### 배제 근거

| 후보 | 배제 이유 |
|------|-----------|
| **A. Vercel AI SDK** | 스트리밍 엔드포인트 신규 구축 필요 + 기존 NocoBase REST 플로우와 비호환 + 비표준 카드 메시지(태스크 배정, Synthesis)를 SDK 메시지 모델에 맞추기 곤란. **백엔드 변경 비용 대비 UX 개선 미미** (CMO 응답 2-5초에 스트리밍 가치 낮음) |
| **B. @assistant-ui/react** | 1.0 미만 불안정 + 커스텀 런타임 어댑터 구현 필요 + 의존성 체인 깊음 + 기존 L5 UI 패턴(승인 플로우, 태스크 카드)을 Primitive에 맞추면 **사실상 재작성**. 학습 비용 대비 얻는 것이 적음 |

### 구현 방향 (참고용)

1. CEO Chat의 공통 컴포넌트(`AgentChip`, `InterpretationPanel`, `Icon`, 메시지 버블 스타일)를 공유 모듈로 분리
2. CMO 전용 `ChatTab` 생성 — CEO 버전을 베이스로 `AGENT_COLOR['CMO']`, CMO 특화 카드 추가
3. CMO 특화 UI: 포지셔닝 비교 카드, PMF 실험 결과 카드, 콘텐츠 드래프트 프리뷰
4. 기존 `lib/api.ts` 패턴으로 CMO 엔드포인트 연동

---

## 요약

```
채택: C. 기존 CEO Chat 패턴 확장 (커스텀)
이유: 백엔드 변경 제로 + 의존성 추가 제로 + 기존 컴포넌트 재사용 + Joinery 네이티브 + CMO JSON 응답에 스트리밍 불필요
```
