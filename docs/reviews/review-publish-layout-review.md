# Review: Review & Publish Page 레이아웃 (좌/중/우)

> 리뷰: 2026-06-04 | 대상 브랜치 diff: `main..HEAD` (50 files, +1765 -2861)

## 판정: Conditional LGTM — 버그 1건 수정 필요, 나머지 LGTM

---

## 1. 오픈소스 조사 (`docs/research/review-publish-layout.md`) — LGTM

- 후보 3개(react-resizable-panels / allotment / Native CSS Grid) 비교표 완비
- 채택 근거(UI 라이브러리 0개 원칙, 드래그 리사이즈 불필요, 번들 0kB)가 프로젝트 제약과 정합
- 배제 이유(allotment SSR 불가, react-resizable-panels 과잉 의존성)가 구체적
- 향후 재검토 경로(드래그 리사이즈 필수 시 react-resizable-panels)도 명시

## 2. 스펙 (`docs/specs/review-publish-layout.md`) — LGTM

- AC 9개 전부 측정 가능 (grid-template-columns 값, typecheck, next build, package.json diff 등)
- 영향 파일 2개(신규 `ThreeColumnLayout.tsx` + 수정 `video-room/page.tsx`)로 최소 범위
- Out-of-scope(API 연동, VideoProject CRUD, 기존 페이지 변경)이 명확히 분리됨
- 반응형 전략(768px 이하 → JS 기반 탭)이 기존 MobileShell 패턴과 일관적

## 3. l5-core `video-project/index.ts` — LGTM

- 순수 함수 4개, I/O 없음, consultation 패턴 정확히 복제
- `requireNonEmpty` 헬퍼로 빈 문자열/공백 검증 일관 처리
- 불변 패턴(`{ ...project, status: '...' }`) 올바름
- 상태 전환 규칙(draft→generating→completed/failed) 명확하고 방어적

## 4. 테스트 (`video-project/__tests__/video-project.test.ts`) — LGTM

- 12개 케이스: happy path 4 + validation throw 4 + 잘못된 상태 전환 throw 4 (`.each`로 전 상태 커버)
- `makeDraft()` 헬퍼로 중복 최소화
- 가독성 우수

## 5. `video-room/page.tsx` — LGTM

- AuthGate 래핑, Joinery CSS 변수, 기존 패턴 일치
- 빈 셸 상태 — ThreeColumnLayout 적용은 다음 구현 태스크 스코프

## 6. plugin-orchestration `registerVideoProjectResource` — **버그 1건**

### BUG-1: `advance` 액션에서 `advanceToGenerating` 이중 호출 (severity: high)

**파일**: `plugin-orchestration/src/server/plugin.ts` advance 액션
**라인**: diff +147, +179 (advance 액션 내부)

```
+147: const advanced = advanceToGenerating(asPlainRecord(existing));
      // ... transport.generate() 호출 ...
+179: const generating = advanceToGenerating(asPlainRecord(existing), jobPath);
```

**문제**: `advanceToGenerating`이 **같은 원본 레코드(`existing`)**에 대해 두 번 호출된다.
- 1차 호출(L147): 상태 검증 + transport 호출용 → `advanced` 변수 생성
- 2차 호출(L179): DB 업데이트용 → `generating` 변수 생성
- 현재는 **둘 다 `existing`(draft 상태)**에서 호출하므로 throw는 안 나지만, 1차 호출 결과(`advanced`)를 버리고 원본에서 다시 전환하는 것은 의미론적 오류.
- 만약 1차 호출이 부작용을 갖게 되거나, 검증 로직이 변경되면 불일치 위험.

**수정안**: 1차 호출 결과를 재사용하되 `job_path`만 업데이트:

```ts
const advanced = advanceToGenerating(asPlainRecord(existing));
// ... transport.generate() ...
const generating = { ...advanced, job_path: jobPath };
```

또는 더 단순하게: `advanceToGenerating(asPlainRecord(existing), jobPath)` 1회만 호출하고, transport 호출 전 상태 검증은 `if (existing.status !== 'draft') ctx.throw(400, ...)` 직접 체크.

### 동일 패턴: `createTrackedVideoFactoryTransport.generate()` 내부

**라인**: diff +273, +284

```
+273: const advanced = advanceToGenerating(draft);
+284: const generating = advanceToGenerating(draft, jobPath);
```

같은 이중 호출 패턴. `draft`는 방금 생성한 객체라 throw는 안 나지만, `advanced` 변수가 사용되지 않는 dead code.

## 7. 기타 변경사항 — LGTM

| 영역 | 판정 | 비고 |
|------|------|------|
| 삭제된 파일들 (AgentBadge, Icon, PageHeader, BusinessContextSnapshotCard, state-machine 등) | OK | diff에서 import 참조 없음 확인. 이전 ACR phase에서 정리된 dead code |
| `l5-core/src/index.ts` | OK | `state-machine/transitions` 제거 + `video-project` 추가. 일관적 |
| `Sidebar.tsx` Video Room 메뉴 추가 | OK | 기존 패턴(ICONS, NAV_TOOLS) 따름 |
| `pnpm-lock.yaml` 축소 (-208줄) | OK | 의존성 제거 방향 |
| `docs/DATA_MODEL.md` VideoProject 추가 | OK | 스펙과 정합 |
| `docs/TASKS.md`, `docs/HANDOFF.md` 축소 | OK | stale 내용 정리 |
| `video-project-contract.test.ts` | OK | plugin↔l5-core 계약 테스트 |

## 수정 요청 요약

| # | 심각도 | 파일 | 내용 |
|---|--------|------|------|
| BUG-1 | High | `plugin-orchestration/src/server/plugin.ts` advance 액션 L+147,179 | `advanceToGenerating` 이중 호출 — 1차 결과 재사용 또는 단일 호출로 통합 |
| BUG-1b | Low | 동일 파일 `createTrackedVideoFactoryTransport.generate()` L+273,284 | 동일 패턴 — `advanced` 변수 미사용 dead code 제거 |

BUG-1 수정 후 LGTM.
