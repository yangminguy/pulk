# Research: VideoProject 모델 & API — 오픈소스 라이브러리 조사

> 조사일: 2026-06-04 | 대상: VideoProject CRUD + 상태 전환에 필요한 백엔드/도메인 라이브러리

## 프로젝트 현황

| 항목 | 현황 |
|------|------|
| 도메인 로직 위치 | `packages/l5-core` — 순수 TypeScript, 외부 의존성 0개 |
| 기존 상태 머신 패턴 | `consultation/index.ts` — 순수 함수 (`openConsultation` → `resolveConsultation`), I/O 없음 |
| CRUD/영속성 | NocoBase `defineCollection` + `app.resourcer.define` REST 액션 |
| DB | PostgreSQL (NocoBase 관리 스키마, `ensureOrchestrationColumns`로 테이블 생성) |
| VideoProject 상태 수 | 4개 (`draft` → `generating` → `completed` / `failed`) |
| 개발 규칙 | Rule #2: l5-core는 NocoBase 없이 테스트 가능해야 함 |

## 조사 영역 1: 상태 전환 라이브러리

| 기준 | **XState v5** | **Robot** | **순수 함수 (현행 패턴)** |
|------|--------------|-----------|------------------------|
| 번들 크기 | ~40KB (tree-shake 후 ~15KB) | ~3KB | **0KB** |
| 타입 안전성 | 매우 강력 (typegen) | 보통 | 직접 제어 (완전) |
| 학습 곡선 | 높음 (statecharts, actors, guards) | 낮음 | **없음** |
| 시각화 도구 | Stately Inspector | 없음 | 없음 |
| 직렬화/영속성 | 내장 (snapshot/restore) | 없음 | 직접 구현 (이미 패턴 존재) |
| 기존 코드 호환 | NocoBase 플러그인 구조와 별도 어댑터 필요 | 어댑터 필요 | **consultation 패턴 그대로 복제** |
| 테스트 용이성 | 좋음 (모델 기반) | 좋음 | **최고 (순수 함수, mock 불필요)** |
| npm 의존성 추가 | 1개+ | 1개 | **없음** |
| 라이선스 | MIT | MIT | N/A |

### 채택: 순수 함수 상태 머신 (consultation 패턴 복제)

**근거:**
- 상태 4개, 전환 3개 — XState의 statecharts/actors/guards는 복잡도 불일치 (과잉 설계).
- `l5-core`는 외부 의존성 0개 원칙 (Development Rule #2). XState/Robot 도입은 이 원칙 위반.
- `consultation/index.ts`가 이미 동일 패턴으로 동작 중. `openConsultation()` → `resolveConsultation()` 구조를 `createVideoProject()` → `advanceToGenerating()` → `completeVideoProject()` / `failVideoProject()`로 복제하면 함수 4개로 충분.
- 순수 함수는 mock 없이 단위 테스트 가능 — 테스트 용이성 최고.

### 배제 근거

| 라이브러리 | 배제 이유 |
|-----------|----------|
| **XState v5** | 상태 4개에 statecharts 엔진 도입은 과잉. ~15KB 번들 추가. l5-core 의존성 0개 원칙 위반. NocoBase 플러그인 구조와 통합에 별도 어댑터 필요. XState의 강점(복잡 상태 시각화, 병렬 상태, 계층적 상태)이 이 규모에서 발휘되지 않음. |
| **Robot** | 경량이지만 순수 함수 대비 추가 가치 없음. 의존성만 증가. 직렬화/영속성 미지원으로 NocoBase DB 연동에 이점 없음. |

## 조사 영역 2: CRUD / 모델 레이어 (ORM)

| 기준 | **Drizzle ORM** | **Prisma** | **NocoBase 컬렉션 (현행)** |
|------|----------------|-----------|--------------------------|
| 번들 크기 | ~50KB | CLI + runtime 수백KB | **이미 포함** |
| NocoBase 호환 | 별도 DB 연결 필요, 스키마 충돌 위험 | 마이그레이션 충돌 | **네이티브** |
| 타입 생성 | 스키마에서 자동 | 자동 | defineCollection 기반 |
| l5-core 분리 | 가능 | 가능 | **TypeScript 타입만 l5-core에, 영속성은 플러그인에** |
| 마이그레이션 관리 | Drizzle Kit | Prisma Migrate | ensureOrchestrationColumns (raw SQL) |

### 채택: NocoBase defineCollection + REST 액션 (현행)

**근거:**
- NocoBase가 이미 PostgreSQL 스키마를 관리. 별도 ORM 도입 시 이중 스키마 관리 + 마이그레이션 충돌 위험.
- 기존 모든 엔티티(`executive_consultations`, `executive_delegations`, `founder_deliverables` 등)가 `defineCollection` + `app.resourcer.define` 패턴으로 CRUD 처리 중.
- l5-core 분리는 TypeScript 인터페이스만으로 해결 — 순수 타입을 l5-core에 두고, 영속성은 plugin 레이어에서 처리 (현행 패턴).

### 배제 근거

| 라이브러리 | 배제 이유 |
|-----------|----------|
| **Drizzle ORM** | NocoBase가 이미 DB 스키마 관리 중. 별도 Drizzle 연결 시 이중 연결 + 스키마 충돌. 기존 10+ 컬렉션과 패턴 불일치. |
| **Prisma** | 동일 이유 + Prisma Migrate와 NocoBase의 `ensureOrchestrationColumns` 충돌. CLI 의존성 무거움. |

## 최종 결론

| 영역 | 채택 | 신규 의존성 |
|------|------|-----------|
| 상태 전환 | 순수 함수 상태 머신 (consultation 패턴 복제) | 없음 |
| CRUD / 모델 | NocoBase defineCollection + REST 액션 | 없음 |
| 모델 타입 | l5-core에 TypeScript 인터페이스 | 없음 |

**신규 라이브러리 추가 0개.** `consultation/index.ts` 패턴을 `video-project/index.ts`로 복제하여 `createVideoProject()` / `advanceToGenerating()` / `completeVideoProject()` / `failVideoProject()` 순수 함수로 구현. 향후 상태가 10개 이상으로 복잡해지면 XState 재검토.
