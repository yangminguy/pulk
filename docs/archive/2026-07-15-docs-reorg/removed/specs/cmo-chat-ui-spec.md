# CMO Chat UI — 구현 스펙

> 작성일: 2026-06-04
> 선행 조사: `docs/research/cmo-chat-ui-comparison.md`
> 채택 방식: 기존 CEO Chat 패턴 확장 (의존성 추가 없음)

---

## 1. 목적

Founder가 CMO Agent와 **직접** 대화하며 마케팅 전략(포지셔닝, PMF 메시지, 콘텐츠 실험 등)을 기획하는 전용 Chat UI.

현재 CEO Chat(`/chat`)은 CEO Agent를 경유해 임원에게 지시를 배분하는 구조다. CMO Chat은 CTO Planning Panel(`CtoPlanningPanel` in `/control-room`)과 동일한 패턴으로, Founder↔CMO 간 **직접 대화 + 결과 카드 + 승인** 플로우를 제공한다.

---

## 2. 선행 패턴 참조

| 참조 | 위치 | 차용 포인트 |
|------|------|------------|
| CEO Chat | `src/app/chat/page.tsx` | 메시지 버블 구조, AgentChip, 승인/거절 CTA, 로딩 인디케이터 |
| CTO Planning Panel | `src/app/control-room/page.tsx:606` | `threadId` 기반 멀티턴 대화, `api.ctoPlanMessage`→plan 카드→`ctoApprovePlan` 플로우 |
| AgentOutputDetail | `src/components/AgentOutputDetail.tsx` | ProductStrategyPanel, IntroAnalysisPanel 등 CMO 산출물 렌더링 |

---

## 3. UI 구조

### 3.1 라우트

`/cmo` — 사이드바 `NAV_TOOLS`에 추가 (`{ href: '/cmo', label: 'CMO 마케팅', icon: 'megaphone' }`)

### 3.2 페이지 레이아웃

```
┌─────────────────────────────────────────────┐
│  CMO Agent 마케팅    [비즈니스 컨텍스트 라벨]  │  ← PageHeader
├─────────────────────────────────────────────┤
│  [대화]  [CMO 과제]                          │  ← TabLayout (2탭)
├─────────────────────────────────────────────┤
│                                             │
│  대화 탭: 메시지 버블 + CMO 결과 카드          │
│  CMO 과제 탭: CMO assigned_agent 필터 인박스   │
│                                             │
├─────────────────────────────────────────────┤
│  [입력창]                         [전송 버튼]  │
└─────────────────────────────────────────────┘
```

### 3.3 대화 탭 (`CmoChatTab`)

- **Founder 버블**: 오른쪽 정렬, `paper-elevated` 배경, 기존 CEO Chat 스타일 동일
- **CMO 버블**: 왼쪽 정렬, `paper-surface` 배경, `borderLeft: 4px solid var(--wood-3)` (CMO 색상)
  - `AgentChip agent="CMO"` 라벨
  - 텍스트 메시지 (`reply`)
  - CMO 결과 카드 (§3.4) — plan이 있을 때만 렌더
- **로딩 인디케이터**: "CMO Agent가 분석 중..." (CTO 패턴과 동일)
- **에러 표시**: red-tint 배경 인라인 에러 (CEO Chat 패턴)

### 3.4 CMO 결과 카드 (`CmoResultCard`)

CMO Agent가 마케팅 계획을 반환하면 메시지 아래 카드로 렌더링.

```typescript
type CmoMarketingPlan = {
  decision: string        // 무엇을 결정했는지
  reasoning: string       // 왜 이 접근인지 (PMF 가설/타겟 참조)
  next_action: string     // 즉시 내부 다음 스텝
  risk_level: string      // D1-D5
  requires_founder_approval: boolean
  // 확장 필드 (향후)
  positioning_variants?: Array<{ label: string; copy: string; target: string }>
  experiment_plan?: { hypothesis: string; channel: string; metric: string; duration: string }
}
```

카드 구조:
1. **결정 (Decision)** — `decision` 텍스트, 굵은 글씨
2. **판단 근거 (Reasoning)** — `reasoning`, `ink-2` 색상
3. **다음 액션** — `next_action`, green-tint 배경 강조 카드 (기존 InboxTab 패턴)
4. **리스크 배지** — `j-badge j-risk-{level}`
5. **승인 CTA** — `requires_founder_approval: true`일 때만 표시
   - "승인" 버튼 (`j-btn j-btn-primary j-btn-sm`)
   - "수정 요청" 버튼 (`j-btn j-btn-danger j-btn-sm`)

### 3.5 CMO 과제 탭 (`CmoTasksTab`)

기존 InboxTab을 `assigned_agent='CMO'`로 필터링한 읽기전용 뷰. 기존 InboxTab 로직의 **별도 간소화 버전** — 목록 + 상세 master-detail.

---

## 4. 백엔드 API

CTO Planning 패턴(`ctoPlanMessage`/`ctoApprovePlan`)을 CMO에 미러링.

### 4.1 `api.cmoChatMessage`

```typescript
// lib/api.ts에 추가
cmoChatMessage: (
  thread_id: string,
  founder_message: string,
  opts?: { business_id?: string | null; project_id?: string | null },
) =>
  request<{ data: { ok: boolean; data: CmoChatMessageResult } }>('/api/cmo:chatMessage', {
    method: 'POST',
    body: JSON.stringify({ thread_id, founder_message, ...(opts ?? {}) }),
  }).then(r => unwrap(r)) as Promise<CmoChatMessageResult>
```

응답 타입:
```typescript
type CmoChatMessageResult = {
  reply: string                    // CMO의 텍스트 응답
  plan: CmoMarketingPlan | null    // 계획이 있으면 카드 렌더
  cmo_message_id: string           // 승인 시 참조용
}
```

### 4.2 `api.cmoApprovePlan`

```typescript
cmoApprovePlan: (cmo_message_id: string) =>
  request<{ data: { ok: boolean; data: { approved: boolean; task_ids: string[] } } }>('/api/cmo:approvePlan', {
    method: 'POST',
    body: JSON.stringify({ cmo_message_id }),
  }).then(r => unwrap(r))
```

### 4.3 백엔드 구현 범위

NocoBase plugin-orchestration에 `cmo:chatMessage`, `cmo:approvePlan` 액션 추가. 내부적으로 `services/agent-runtime/src/agents/cmo.ts`의 `runCMOAgent`를 호출하되, 멀티턴 컨텍스트(`thread_id` 기반 `cmo_chat_messages` 테이블/메모리)를 주입.

> **주의**: 백엔드 상세 구현은 이 스펙의 범위 밖 — 프론트엔드 UI 스펙이 주 산출물. 백엔드 API 형태만 정의하고 실 구현은 별도 task.

---

## 5. 영향받는 파일 및 모듈

### 신규 생성

| 파일 | 역할 |
|------|------|
| `src/app/cmo/page.tsx` | CMO Chat 페이지 (CmoChatTab + CmoTasksTab) |

### 수정

| 파일 | 변경 내용 |
|------|----------|
| `src/components/Sidebar.tsx` | `NAV_TOOLS`에 `/cmo` 항목 추가 |
| `src/lib/api.ts` | `CmoChatMessageResult` 타입 + `cmoChatMessage`, `cmoApprovePlan` 메서드 추가 |

### 재사용 (변경 없음)

| 파일 | 재사용 요소 |
|------|------------|
| `src/components/Icon.tsx` | 아이콘 렌더링 |
| `src/components/TabLayout.tsx` | 2탭 레이아웃 (커스텀 tabs prop) |
| `src/components/AuthGate.tsx` | 인증 래퍼 |
| `src/components/AgentOutputDetail.tsx` | CMO 산출물 상세 렌더 (ProductStrategyPanel 등) |
| `src/lib/business-context.tsx` | `useBusiness` 훅 (selectedId, selectedProjectId) |

---

## 6. Acceptance Criteria

| # | 기준 | 측정 방법 |
|---|------|----------|
| AC-1 | `/cmo` 경로에 CMO Chat 페이지가 렌더링된다 | 브라우저에서 `/cmo` 접근 시 페이지 로드 확인 |
| AC-2 | 사이드바에 "CMO 마케팅" 네비게이션 항목이 표시되고 클릭 시 `/cmo`로 이동한다 | Sidebar에서 항목 클릭 → URL 변경 확인 |
| AC-3 | Founder 메시지 입력 → 전송 → CMO Agent 응답이 버블로 표시된다 | 텍스트 입력 후 전송 버튼 클릭 → CMO 버블 렌더 확인 |
| AC-4 | CMO 응답에 plan이 있으면 CmoResultCard가 메시지 아래에 렌더된다 | plan 포함 응답 시 decision/reasoning/next_action/risk 카드 표시 확인 |
| AC-5 | `requires_founder_approval: true`인 plan에 승인/수정요청 버튼이 표시된다 | 카드 하단 CTA 버튼 존재 확인 |
| AC-6 | 승인 버튼 클릭 시 `api.cmoApprovePlan`이 호출되고 카드가 "승인됨" 상태로 변경된다 | 승인 후 카드 상태 변경 확인 (green-tint 배경 + 체크 아이콘) |
| AC-7 | CMO 과제 탭에서 `assigned_agent='CMO'`인 태스크만 목록에 표시된다 | 탭 전환 후 CMO 태스크만 리스트에 존재 확인 |
| AC-8 | `AuthGate`로 감싸져 로그인 없이 접근 불가하다 | 미인증 상태에서 `/cmo` 접근 → 로그인 폼 표시 |
| AC-9 | `tsc --noEmit` 통과 (타입 에러 제로) | `pnpm --filter @l5/founder-ui typecheck` exit code 0 |
| AC-10 | Joinery 디자인 시스템 일관성 — CMO 색상(`--wood-3`), `j-*` 클래스 사용 | 코드 리뷰에서 인라인 스타일이 Joinery 토큰 사용 확인 |

---

## 7. 범위 밖 (Out of Scope)

- 백엔드 `cmo:chatMessage`, `cmo:approvePlan` 액션 구현 (별도 task)
- CMO 확장 필드 (`positioning_variants`, `experiment_plan`) 카드 UI — 기본 plan 카드로 시작, 향후 확장
- 스트리밍 응답 — CMO Agent가 구조화 JSON 반환이므로 불필요 (조사 결론)
- 기존 CEO Chat(`/chat`) 수정 — 독립 경로로 분리

---

## 8. 구현 순서 (권장)

1. `src/lib/api.ts`에 타입 + API 메서드 추가 (백엔드 미구현 시 catch fallback)
2. `src/app/cmo/page.tsx` 생성 — CmoChatTab (대화) + CmoTasksTab (과제)
3. `src/components/Sidebar.tsx`에 `/cmo` 네비게이션 항목 추가
4. 타입체크 통과 확인
