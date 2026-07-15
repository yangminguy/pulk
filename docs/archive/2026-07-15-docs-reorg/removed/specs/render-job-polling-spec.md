# RenderJob 상태 폴링 & 완료 처리 기능 명세서

## 1. 개요 (Overview)
본 명세는 무겁고 오래 걸리는 비동기 작업인 렌더링(RenderJob)의 상태 폴링 및 완료 처리를 위한 시스템 요구사항 및 설계 방향을 정의합니다. 사전 오픈소스 조사 결과에 따라 기능적 요구사항과 성능(빈번한 상태 갱신 I/O 병목 방지)을 가장 잘 만족하는 **BullMQ(Redis 백엔드)**를 채택하여 구현합니다.

## 2. 요구사항 명세 (Requirements)

### 기능적 요구사항 (Functional Requirements)
- **작업 등록**: RenderJob 생성 시 비동기 큐(Queue)에 작업을 등록하고, 클라이언트에게 Job ID를 반환해야 한다.
- **상태 조회 (Polling)**: 클라이언트 또는 서버는 Job ID를 통해 렌더링 작업의 현재 상태(`waiting`, `active`, `completed`, `failed` 등)와 진행률(1% ~ 100%)을 조회할 수 있어야 한다.
- **완료 및 실패 처리**: 렌더링 작업이 완료되거나 실패했을 때 메인 API 서버 또는 클라이언트가 즉각적으로 상태 변화 이벤트를 수신할 수 있어야 한다.
- **관심사 분리**: 메인 API 서버의 부하를 줄이기 위해 렌더링 처리를 수행하는 워커(Worker) 노드는 별도로 분리되어 비동기로 동작해야 한다.

### 비기능적 요구사항 (Non-functional Requirements)
- **성능 (I/O 병목 최소화)**: 렌더링 진행률(Progress)은 초당 여러 번 빈번하게 업데이트될 수 있으므로, 메인 RDBMS(PostgreSQL 등)의 I/O 부하를 유발하지 않도록 인메모리 스토어(Redis) 기반으로 상태를 관리해야 한다.
- **확장성**: 향후 렌더링 작업량 증가에 대비하여 메인 서버와 렌더링 전용 워커 머신을 각각 독립적으로 스케일 아웃할 수 있는 구조여야 한다.

## 3. 아키텍처 및 설계 방향 (Architecture & Design)

- **기술 스택**: Node.js / TypeScript, BullMQ, Redis
- **작업 등록 (Producer)**: 클라이언트의 렌더링 요청이 들어오면 메인 서버는 BullMQ 큐에 Job을 적재하고 Job ID를 즉시 응답한다.
- **작업 처리 및 갱신 (Worker)**: 분리된 렌더링 워커 노드가 Redis 큐에서 Job을 컨슘(Consume)하여 렌더링 작업을 수행한다. 수행 중 BullMQ의 `job.updateProgress()` API를 호출하여 진행 상태를 갱신한다.
- **완료 알림 (Event Listener)**: API 서버는 BullMQ의 `QueueEvents` 인스턴스를 활용해 특정 큐의 `completed`, `failed` 이벤트를 실시간으로 구독하며, 이벤트 발생 시 필요한 후속 로직(예: DB 최종 상태 업데이트, 클라이언트에 웹소켓 알림 등)을 수행한다.

## 4. 인수 조건 (Acceptance Criteria)
다음 조건들이 모두 충족되어야 기능 구현이 완료된 것으로 간주한다.

- [ ] **Job 등록 및 반환**: RenderJob 등록 API 호출 시 200/201 응답과 함께 고유한 Job ID가 반환되며, 작업이 성공적으로 BullMQ 큐에 적재된다.
- [ ] **Worker 비동기 처리**: 별도로 구동된 Worker 인스턴스가 큐에서 Job을 정상적으로 수신하여 처리를 시작하고 종료할 수 있다.
- [ ] **진행률(Progress) 갱신 및 조회**: Worker가 작업 진행 중 1초에 1회 이상 진행률을 업데이트할 때, API 서버를 통해 해당 Job의 진행률(1%~100%)을 1초 이내의 지연으로 정상 조회(Polling)할 수 있다.
- [ ] **실시간 이벤트 수신**: Job이 `completed` 또는 `failed` 상태로 변경될 경우, API 서버가 `QueueEvents`를 통해 즉시(1초 이내) 이벤트를 수신하여 콘솔에 로그를 남기고 후속 처리를 트리거할 수 있다.
- [ ] **부하 테스트 및 DB 격리**: 100개의 더미 RenderJob을 동시 등록하고 각 Job이 100회의 진행률 업데이트를 수행하는 부하 테스트 환경에서 메인 RDBMS(PostgreSQL 등)에 추가적인 부하(I/O 스파이크)가 발생하지 않으며, Redis 메모리 내에서 안정적으로 처리된다.

## 5. 영향을 받는 파일 및 모듈 목록 (Affected Files & Modules)
본 작업을 수행할 때 다음과 같은 파일 및 모듈의 생성 또는 수정이 필요하다. (디렉토리 구조는 프로젝트 환경에 따라 변동 가능)

- **의존성 (Dependencies)**
  - `package.json` / `pnpm-lock.yaml`: `bullmq`, `ioredis` 라이브러리 추가
- **인프라 환경 (Infrastructure)**
  - `docker-compose.yml`: 개발 및 테스트용 Redis 컨테이너 서비스 추가 (존재하지 않을 경우)
- **메인 API 서버 모듈 (Producer & Listener)**
  - `apps/api-server/src/modules/queue/`: BullMQ 큐 초기화, Redis 연결 관리 모듈 추가
  - `apps/api-server/src/modules/queue/events.ts`: `QueueEvents`를 활용한 `completed`, `failed` 글로벌 이벤트 리스너 추가
  - `apps/api-server/src/modules/render/`: 렌더링 요청을 처리하여 큐에 Job을 등록(Produce)하는 컨트롤러 및 서비스 계층 수정
  - `apps/api-server/src/modules/render/` (Polling API): Job ID를 받아 현재 상태 및 진행률을 반환하는 Polling API 라우트 추가
- **워커 모듈 (Worker)**
  - `apps/render-worker/src/index.ts` (또는 관련 워커 스크립트): BullMQ Worker 인스턴스를 초기화하고, 큐에서 Job을 꺼내어 실제 렌더링 로직(또는 더미 로직)을 수행한 뒤 `job.updateProgress()`를 호출하는 로직 추가
