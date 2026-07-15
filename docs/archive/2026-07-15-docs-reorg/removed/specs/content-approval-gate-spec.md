# Spec: ContentApprovalGate 모델 & 로직

> 작성일: 2026-06-04
> OSS 조사 결과: [content-approval-gate-oss-research.md](./content-approval-gate-oss-research.md) — 새 라이브러리 추가 불필요

## 배경

현재 `packages/l5-core/src/functions/approval.ts`에 ApprovalGate 모델이 존재하나 다음 결함이 있다:

1. **주석/코드 불일치**: D3 주석이 "CEO approval"이지만 실제 값은 `cto_autonomous`
2. **테스트 description 불일치**: `'D3 should require CEO approval'`이지만 assertion은 `cto_autonomous`
3. **dead type variant**: `ceo_only`가 유니온 타입에 남아있으나 코드 전체에서 사용처 0건
4. **content 전용 게이트 부재**: `DECISION_TYPES`에 `CONTENT_PUBLICATION`이 있으나, 콘텐츠 발행에 특화된 승인 흐름(초안→검토→발행)이 없음
5. **`approveTask`의 비순수성**: 주석에 "Pure function"이나 내부에서 `new Date()` 호출

## 요구사항

### R1. 기존 ApprovalGate 정합성 수정

| ID | 변경 | 상세 |
|----|------|------|
| R1.1 | D3 주석 수정 | `approval.ts:20` — "CEO approval" → "CTO autonomous" |
| R1.2 | `ceo_only` 제거 | `ApprovalGate.approval_level` 유니온에서 dead variant 제거 |
| R1.3 | 테스트 description 수정 | `rules.test.ts:15` — "CEO approval" → "CTO autonomous approval" |
| R1.4 | `approveTask` 순수화 | `now: Date` 파라미터 추가, 내부 `new Date()` 제거. `rejectTask` 동일. |

### R2. ContentApprovalGate 모델

콘텐츠 발행(블로그, SNS, 광고 등)에 특화된 승인 게이트를 추가한다.

```typescript
export interface ContentApprovalGate extends ApprovalGate {
  content_type: ContentType;
  channel: ContentChannel;
  requires_brand_review: boolean;
  auto_approvable: boolean;
}

export type ContentType = 'blog_post' | 'social_media' | 'ad_copy' | 'email_campaign' | 'press_release';
export type ContentChannel = 'internal' | 'owned_media' | 'paid_media' | 'earned_media';
```

### R3. 콘텐츠 리스크 라우팅 함수

```typescript
export function routeContentApproval(
  contentType: ContentType,
  channel: ContentChannel,
): ContentApprovalGate;
```

라우팅 규칙:

| channel | contentType | risk_level | approval_level | auto_approvable |
|---------|-------------|------------|----------------|-----------------|
| internal | 모두 | D1 | none | true |
| owned_media | blog_post, social_media | D3 | cto_autonomous | true |
| owned_media | email_campaign | D4 | founder_only | false |
| paid_media | 모두 | D4 | founder_only | false |
| earned_media | press_release | D5 | founder_and_legal | false |
| earned_media | 기타 | D4 | founder_only | false |

- `requires_brand_review`: `channel !== 'internal'`이면 `true`
- `decision_type`: 항상 `CONTENT_PUBLICATION`

### R4. 콘텐츠 승인 상태 전환

`ContentApprovalStatus` 상태 머신 (STATE_MACHINE_VALIDATION_SPEC.md 패턴 준수):

```
draft → in_review → approved → published
draft → in_review → revision_requested → draft
draft → killed
in_review → killed
approved → killed
```

상태 5개, 전환 8개. `createTransitionValidator`(기존 팩토리)로 생성.

### R5. 기존 소비자 호환성

- `requiresFounderApproval()`의 시그니처와 반환 타입은 변경하지 않음
- `routeContentApproval()`은 별도 함수로 추가 — 기존 호출 코드에 영향 없음
- `approveTask`/`rejectTask`에 `now` 파라미터 추가 시, 기존 호출부(2곳)도 함께 수정

## Acceptance Criteria

| # | 기준 | 측정 방법 |
|---|------|----------|
| AC1 | D3 주석이 "CTO autonomous"로 수정됨 | `approval.ts:20` 문자열 검사 |
| AC2 | `ceo_only`가 `ApprovalGate` 타입에서 제거됨 | `grep 'ceo_only' approval.ts` 결과 0건 |
| AC3 | 테스트 description이 assertion과 일치 | `rules.test.ts:15`에 "CTO autonomous" 포함 |
| AC4 | `routeContentApproval` 함수가 존재하고 export됨 | `import { routeContentApproval } from '@l5/core'` 컴파일 성공 |
| AC5 | R3 라우팅 테이블 6행 모두 단위 테스트 통과 | 각 (channel, contentType) 조합별 1개 이상 테스트 |
| AC6 | `ContentApprovalStatus` 전환 validator가 유효/무효 판정 | 유효 전환 최소 4개 + 무효 전환 최소 2개 테스트 |
| AC7 | `approveTask(task, req, now)` 시그니처로 변경됨 | 기존 호출부 2곳 (`approval-checker.ts`, `approval-queue.ts`) 컴파일 통과 |
| AC8 | `pnpm --filter @l5/core test` 전체 통과 | exit code 0, 기존 테스트 regression 없음 |
| AC9 | `pnpm --filter @l5/core typecheck` 통과 | tsc 에러 0 |
| AC10 | `l5-core/src/index.ts`에서 새 타입/함수 re-export | import 가능 확인 |

## 영향 파일

| 파일 | 변경 유형 | 상세 |
|------|----------|------|
| `packages/l5-core/src/functions/approval.ts` | **수정** | R1.1 주석, R1.2 타입, R2 인터페이스, R3 함수 |
| `packages/l5-core/src/functions/approval/__tests__/rules.test.ts` | **수정** | R1.3 description, R3/R4 신규 테스트 |
| `packages/l5-core/src/functions/approval/__tests__/content-gate.test.ts` | **신규** | `routeContentApproval` + 상태 전환 테스트 |
| `packages/l5-core/src/index.ts` | **수정** | 새 타입/함수 re-export |
| `services/hermes-runtime/src/api/approval-queue.ts` | **수정** | R1.4 `approveTask`/`rejectTask` 시그니처 |
| `services/hermes-runtime/src/tasks/approval-checker.ts` | **수정** | `approveTask` 호출부에 `now` 전달 |

## 영향받지 않는 파일

- `plugin-business-portfolio/src/server/plugin.ts` — `requiresFounderApproval` 시그니처 불변이므로 변경 없음
- `scripts/demo-mvp-loop.ts` — 동일 이유
- `plugin-orchestration`, `plugin-executive-monitor` — 이 스펙 범위 밖

## 설계 결정

1. **별도 함수 추가, 기존 함수 미변경** — `routeContentApproval`은 `requiresFounderApproval`과 독립. 기존 소비자 3곳을 건드리지 않음.
2. **외부 라이브러리 없음** — OSS 조사 결론 준수. 순수 TypeScript 함수 + 기존 `createTransitionValidator` 팩토리 재사용.
3. **`approveTask` 순수화는 이 스펙에 포함** — hermes-runtime 호출부가 2곳뿐이므로 범위 내에서 해결 가능.
