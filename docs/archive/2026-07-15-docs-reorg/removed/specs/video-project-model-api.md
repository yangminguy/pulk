# Spec: VideoProject 모델 & API (CRUD + 상태 전환)

> 작성: 2026-06-04 | 상태: draft

## 목적

CMO의 `video_factory.generate` 도구는 외부 영상 생성기에 job JSON을 쓰고 validate만 수행한다. 생성 요청의 이력이 DB에 남지 않아 Video Room UI에서 "영상 생성 이력 목록"을 표시할 수 없다. VideoProject 엔티티를 추가하여 영상 브리프 → 생성 → 완료/실패의 전체 라이프사이클을 추적한다.

## 현재 구조 분석

| 구성 요소 | 위치 | 역할 |
|-----------|------|------|
| `VideoFactoryTransport` | `l5-core/functions/memory/video-factory.ts` | 순수 인터페이스 (configure/generate/getConfig) |
| `createVideoFactoryTools` | 동일 파일 | CMO 전용 ExecutiveTool 3개 생성 |
| `makeVideoFactoryTransport` | `plugin-orchestration/server/video-factory-transport.ts` | 실제 transport: job JSON 파일 쓰기 + validate |
| `createInMemoryVideoFactoryTransport` | l5-core 내 | 테스트/fallback용 in-memory transport |

**문제**: generate()의 결과가 파일 시스템에만 존재. DB 레코드 없음 → UI 조회 불가.

## 범위

### In-scope

1. **`VideoProject` 타입 + 순수 상태 머신** — `l5-core`에 consultation 패턴 복제
2. **`video_projects` 컬렉션** — `plugin-orchestration`에 defineCollection + CREATE TABLE
3. **REST API** — `video-project` 리소스 (list, create, advance, fail)
4. **Transport 연동** — generate() 호출 시 DB 레코드 자동 생성 (transport wrapper)

### Out-of-scope

- 외부 영상 생성기 실제 연동 변경 (현재 mock transport 유지)
- Video Room UI 구현 (별도 태스크)
- 영상 파일 업로드/저장 (output_url은 외부 시스템이 채움)

## 데이터 모델

```ts
type VideoProjectStatus = 'draft' | 'generating' | 'completed' | 'failed';

type VideoProject = {
  id: string;
  business_id: string | null;
  topic: string;                    // 영상 주제 (필수)
  angle: string | null;             // 접근 각도
  format: string | null;            // short-form, long-form, reel 등
  status: VideoProjectStatus;
  config_snapshot: {                 // 생성 시점의 전략 스냅샷
    strategy?: string;
    content_style?: string;
    notes?: string;
  } | null;
  output_url: string | null;        // 완성된 영상 URL (외부 시스템이 채움)
  output_metadata: unknown | null;  // 외부 시스템 응답 전체
  error: string | null;             // 실패 시 에러 메시지
  job_path: string | null;          // 로컬 job JSON 경로
  createdAt?: string;               // NocoBase 관리 (camelCase)
  updatedAt?: string;
};
```

## 상태 전환 다이어그램

```
  ┌───────┐
  │ draft │──── advanceToGenerating() ───→ ┌────────────┐
  └───────┘                                │ generating  │
                                           └─────┬──────┘
                                    ┌─────────────┼──────────────┐
                          complete()│             │              │fail()
                                    ▼             │              ▼
                            ┌───────────┐         │      ┌────────┐
                            │ completed │         │      │ failed │
                            └───────────┘         │      └────────┘
                                                  │
                                          (retry = fail → 새 draft 생성)
```

**전환 규칙**:
- `draft` → `generating`: advanceToGenerating() — validate 통과 후
- `generating` → `completed`: completeVideoProject() — output_url 필수
- `generating` → `failed`: failVideoProject() — error 필수
- retry는 새 VideoProject 생성 (기존 건은 failed 유지)

## l5-core 순수 함수 (consultation 패턴)

```ts
// packages/l5-core/src/functions/video-project/index.ts

// 1. createVideoProject(req) → VideoProject (status: 'draft')
//    - topic 필수, 빈 문자열 시 throw
//    - id는 호출자 공급 (플러그인에서 randomUUID)

// 2. advanceToGenerating(rec) → VideoProject (status: 'generating')
//    - draft만 전환 가능, 그 외 throw
//    - job_path 선택 주입

// 3. completeVideoProject(rec, output_url, output_metadata?) → VideoProject
//    - generating만 전환 가능, 그 외 throw
//    - output_url 빈 문자열 시 throw

// 4. failVideoProject(rec, error) → VideoProject
//    - generating만 전환 가능, 그 외 throw
//    - error 빈 문자열 시 throw
```

**설계 원칙**: I/O 없음. new Date()만 사용. 플러그인이 DB 영속화 담당.

## 컬렉션 & 테이블

`plugin-orchestration/src/server/plugin.ts`에 추가:

### ensureOrchestrationColumns 내

```sql
CREATE TABLE IF NOT EXISTS video_projects (
  id text PRIMARY KEY,
  business_id text,
  topic text NOT NULL,
  angle text,
  format text,
  status text NOT NULL DEFAULT 'draft',
  config_snapshot jsonb,
  output_url text,
  output_metadata jsonb,
  error text,
  job_path text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
```

### registerCollections 내

```ts
db.collection(defineCollection({
  name: 'video_projects',
  title: 'Video Projects',
  fields: [
    { name: 'id', type: 'uuid', primaryKey: true },
    { name: 'business_id', type: 'string' },
    { name: 'topic', type: 'text', allowNull: false },
    { name: 'angle', type: 'string' },
    { name: 'format', type: 'string' },
    { name: 'status', type: 'string', allowNull: false, defaultValue: 'draft' },
    { name: 'config_snapshot', type: 'json' },
    { name: 'output_url', type: 'text' },
    { name: 'output_metadata', type: 'json' },
    { name: 'error', type: 'text' },
    { name: 'job_path', type: 'string' },
  ],
}));
```

## REST API

`registerVideoProjectResource(app, db)` — 기존 registerCrudResources / registerConsultationResource 패턴.

| 엔드포인트 | 메서드 | 설명 |
|-----------|--------|------|
| `/api/video-project:list` | GET | 목록 조회 (business_id 필터, createdAt DESC) |
| `/api/video-project:create` | POST | 새 브리프 생성 (status: draft) |
| `/api/video-project:advance` | POST | draft → generating 전환 (+ transport.generate 호출) |
| `/api/video-project:complete` | POST | generating → completed (output_url 필수) |
| `/api/video-project:fail` | POST | generating → failed (error 필수) |

### ACL

```ts
this.app.acl.allow('video-project', ['list', 'create', 'advance', 'complete', 'fail'], 'loggedIn');
```

### advance 액션 흐름

```
1. DB에서 해당 video_project 조회
2. l5-core advanceToGenerating() 호출 (상태 검증)
3. transport.generate(brief) 호출
4. 성공 시: status='generating', job_path 저장 → DB update
5. transport 실패 시: status='failed', error 저장 → DB update
```

## Transport Wrapper 변경

현재 `video_factory.generate` ExecutiveTool의 `run()`은 transport.generate()만 호출. VideoProject DB 레코드 생성을 위해 두 가지 접근 가능:

**채택: 플러그인 레이어에서 래핑** — ExecutiveTool.run() 내부에서 transport 호출 전후에 DB insert/update. l5-core의 순수 함수는 건드리지 않음.

```
// plugin-orchestration에서 createVideoFactoryTools 호출 시,
// transport를 wrapping하여 generate() 전후에 video_projects 레코드 관리
```

**배제: l5-core에서 직접 DB 접근** — Development Rule #2 위반 (l5-core는 NocoBase 없이 테스트 가능해야 함).

## 영향 파일

| 파일 | 변경 유형 | 설명 |
|------|----------|------|
| `packages/l5-core/src/functions/video-project/index.ts` | **신규** | VideoProject 타입 + 순수 상태 전환 함수 |
| `packages/l5-core/src/functions/video-project/__tests__/video-project.test.ts` | **신규** | 상태 전환 단위 테스트 |
| `packages/l5-core/src/index.ts` | 수정 | video-project 재수출 추가 |
| `apps/nocobase-app/packages/plugins/@l5/plugin-orchestration/src/server/plugin.ts` | 수정 | CREATE TABLE + defineCollection + registerVideoProjectResource + ACL |
| `docs/DATA_MODEL.md` | 수정 | VideoProject 엔티티 문서화 |

## Acceptance Criteria

| # | 기준 | 검증 방법 |
|---|------|----------|
| AC-1 | `createVideoProject({ id, topic, business_id })` 호출 시 status='draft'인 VideoProject 반환 | 단위 테스트: 반환 객체의 status === 'draft', topic === 입력값 |
| AC-2 | topic이 빈 문자열이면 createVideoProject가 throw | 단위 테스트: `expect(() => createVideoProject({...})).toThrow()` |
| AC-3 | `advanceToGenerating(draftRec)` 호출 시 status='generating' 반환 | 단위 테스트 |
| AC-4 | draft가 아닌 레코드에 advanceToGenerating 호출 시 throw | 단위 테스트: generating/completed/failed 각각 throw 확인 |
| AC-5 | `completeVideoProject(generatingRec, url)` 호출 시 status='completed', output_url 설정 | 단위 테스트 |
| AC-6 | output_url 빈 문자열이면 completeVideoProject가 throw | 단위 테스트 |
| AC-7 | `failVideoProject(generatingRec, error)` 호출 시 status='failed', error 설정 | 단위 테스트 |
| AC-8 | generating이 아닌 레코드에 complete/fail 호출 시 throw | 단위 테스트 |
| AC-9 | NocoBase 기동 시 `video_projects` 테이블 자동 생성 (CREATE TABLE IF NOT EXISTS) | 기동 로그에 에러 없음 확인 |
| AC-10 | `GET /api/video-project:list` 호출 시 200 + 배열 반환 | curl 또는 HTTP 테스트 |
| AC-11 | `POST /api/video-project:create` 호출 시 draft 레코드 생성, 201 반환 | curl 테스트 |
| AC-12 | `POST /api/video-project:advance` 호출 시 generating으로 전환 + transport.generate() 실행 | curl 테스트 + job JSON 파일 생성 확인 |
| AC-13 | l5-core 모듈은 NocoBase import 없이 단독 테스트 통과 | `pnpm --filter l5-core test -- video-project` |
| AC-14 | DATA_MODEL.md에 VideoProject 엔티티 문서화 | 파일 내 VideoProject 섹션 존재 확인 |

## 기술 결정

| 결정 | 근거 |
|------|------|
| 외부 상태 머신 라이브러리 미사용 | 상태 4개, 전환 3개 — consultation 패턴(순수 함수) 복제로 충분. XState/Robot은 의존성만 증가 (이전 조사 참조) |
| l5-core에 순수 함수, 플러그인에 영속성 | Development Rule #2 (l5-core는 NocoBase 없이 테스트 가능) |
| retry = 새 레코드 생성 | failed 레코드를 재활용하면 이력 손실. 새 draft가 이력 보존에 유리 |
| config_snapshot 저장 | 생성 시점의 전략을 기록해야 "이 영상이 어떤 전략으로 만들어졌는지" 추적 가능 |

## 구현 순서 (제안)

1. `l5-core/functions/video-project/index.ts` — 타입 + 순수 함수 4개
2. `l5-core/functions/video-project/__tests__/video-project.test.ts` — 단위 테스트
3. `l5-core/src/index.ts` — 재수출
4. `plugin-orchestration/plugin.ts` — CREATE TABLE + defineCollection
5. `plugin-orchestration/plugin.ts` — registerVideoProjectResource (REST API)
6. `docs/DATA_MODEL.md` — VideoProject 엔티티 추가
7. 기동 + curl 검증
