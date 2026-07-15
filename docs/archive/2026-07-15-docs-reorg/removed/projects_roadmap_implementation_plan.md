# Implementation Plan — Multi-Layer Projects, Chat History, Task Archival, and Visual Roadmap

본 계획은 창업자(Founder)와 CEO 에이전트 간의 대화형 기획 과정 강화, 사업-프로젝트 다중 레이어 도입, 완료된 태스크의 자동 아카이빙(1주일 후 삭제 및 로드맵 보존), 그리고 프로젝트별 시각적 분기형 로드맵 구현을 위한 설계 및 구현을 목표로 합니다.

## User Review Required

> [!IMPORTANT]
> **핵심 설계 결정 사항**
> 1. **기획 대화의 유지**: 기존 단발성 지시 해석 방식에서 벗어나, 대화를 데이터베이스(`chat_messages`)에 영속적으로 저장하고 페이지 전환 시에도 대화 흐름이 유지되도록 합니다.
> 2. **사업(Business) ↔ 프로젝트(Project) 다중 레이어**: '사업'은 장기적인 비전 및 영구 작업장(git repo) 단위이며, 그 하위에 여러 실무 단위인 '프로젝트'가 생성됩니다. 대화 및 로드맵은 프로젝트 단위로 스코핑됩니다.
> 3. **태스크 1주일 후 삭제**: 완료/실패된 태스크는 7일이 지나면 `agent_tasks` 테이블에서 물리적으로 삭제되어 DB 용량과 큐를 가볍게 유지합니다. 대신 로드맵에 흔적을 남기기 위해 `project_roadmap_events` 테이블에 핵심 내용(누가 수행했고, 결과 요약이 무엇인지)을 백업합니다.

---

## Proposed Changes

```mermaid
graph TD
    subgraph Database (PostgreSQL / NocoBase)
        B[businesses] -->|1 : N| P[projects]
        P -->|1 : N| CM[chat_messages]
        P -->|1 : N| T[agent_tasks]
        P -->|1 : N| RE[project_roadmap_events]
    end
    subgraph Backend Services
        CS[chat:submitInstruction] -->|대화 흐름 분석 및 계획 제안| LLM((OpenAI/Claude))
        CH[chat:history] -->|과거 대화 복구| CM
        TA[task-archiver Cron] -->|7일 지난 태스크 이관 & 삭제| RE
    end
    subgraph Founder UI (Next.js)
        SB[Sidebar] -->|사업 및 하위 프로젝트 생성 & 전환| PD[Project Dashboard]
        CP[Chat Page] -->|프로젝트별 대화형 기획| CS
        RM[Project Roadmap] -->|가로 줄기형 분기 로드맵 시각화| RE
    end
```

---

### 1. Database Schema Expansion (NocoBase)

사업 및 프로젝트 레이어 다중화와 대화 기록 보존, 태스크 아카이브를 위한 테이블 및 릴레이션을 정의합니다.

#### [NEW] [projects.ts](file:///Users/wonminyang/Desktop/pulk/apps/nocobase-app/packages/plugins/@l5/plugin-business-portfolio/src/server/collections/projects.ts)
- 사업 하위의 개별 프로젝트(스프린트/기획 단위)를 정의합니다.
- 필드 구성:
  - `id`: UUID (Primary Key)
  - `business_id`: String (FK to `businesses.id`)
  - `title`: String
  - `description`: Text
  - `status`: String (defaultValue: 'active' | 'completed' | 'killed')
  - `repo_path`: String (프로젝트별 작업 경로)

#### [NEW] [chat_messages.ts](file:///Users/wonminyang/Desktop/pulk/apps/nocobase-app/packages/plugins/@l5/plugin-orchestration/src/server/collections/chat_messages.ts)
- 프로젝트별 창업자-CEO 대화 기록을 보존합니다.
- 필드 구성:
  - `id`: UUID (Primary Key)
  - `project_id`: String (FK to `projects.id`)
  - `role`: String ('founder' | 'ceo')
  - `text`: Text
  - `metadata`: JSON (해당 시점 제안된 태스크 플랜, 해석 정보 등 보관)

#### [NEW] [project_roadmap_events.ts](file:///Users/wonminyang/Desktop/pulk/apps/nocobase-app/packages/plugins/@l5/plugin-orchestration/src/server/collections/project_roadmap_events.ts)
- 완료/종료 후 삭제된 태스크의 로드맵 표시용 아카이브 기록입니다.
- 필드 구성:
  - `id`: UUID (Primary Key)
  - `project_id`: String (FK to `projects.id`)
  - `task_id`: String (원본 태스크 ID)
  - `title`: String
  - `assigned_agent`: String (CMO, CTO, CRO 등)
  - `status`: String ('done' | 'killed')
  - `risk_level`: String
  - `phase`: String (BPR 단계)
  - `rationale`: Text
  - `output_summary`: Text (실제 수행 결과 요약)
  - `completed_at`: Date (완료 일자)

---

### 2. Multi-turn Chat & CEO Dialogue Expansion (L5 Core & Backend)

단발성 태스크 생성이 아닌, 대화형으로 기획을 다듬고 로드맵을 발전시키는 비즈니스 로직을 구축합니다.

#### [MODIFY] [plugin.ts](file:///Users/wonminyang/Desktop/pulk/apps/nocobase-app/packages/plugins/@l5/plugin-orchestration/src/server/plugin.ts)
- `chat:submitInstruction` 액션 변경:
  - `project_id` 수신 및 해당 프로젝트의 과거 `chat_messages` 내역 로드.
  - CEO LLM 해석기 호출 시 과거 대화 Context를 프롬프트에 포함하여 다년 대화(Multi-turn) 지원.
  - LLM 응답을 파싱하여 대화 텍스트는 `chat_messages`로 저장하고, 최종 계획 합의가 되었거나 명시적 제안이 포함된 경우에만 `proposedTasks`와 `interpretation`을 반환.
- `chat:history` 액션 신설:
  - `project_id` 기반 과거 대화 리스트 조회 및 반환.
- `project` 리소스 CRUD 액션 등록:
  - 프로젝트 생성 및 특정 사업 하위 프로젝트 목록 조회 지원.

#### [MODIFY] [interpreter.ts](file:///Users/wonminyang/Desktop/pulk/packages/l5-core/src/functions/ceo-orchestration/interpreter.ts)
- `interpretFounderInstruction`에 `chatHistory` 매개변수 추가.
- CEO 시스템 프롬프트를 대화형 기획에 맞춰 보강:
  - 창업자의 구체적인 아이디어가 정교화될 때까지 되묻거나 의견을 제시하는 모드 활성화.
  - 기획 및 방향성이 구체화되면 제안 태스크 목록(`proposed_tasks`)을 JSON 필드로 함께 제공하도록 유도.

---

### 3. Task Archival Daemon (Hermes Runtime)

1주일이 지난 완료 태스크를 정리하여 성능을 최적화하고 흔적만 로드맵 아카이브로 남깁니다.

#### [NEW] [task-archiver.ts](file:///Users/wonminyang/Desktop/pulk/services/hermes-runtime/src/tasks/task-archiver.ts)
- 1주일 경과 태스크 자동 아카이브 및 삭제 데몬.
- 로직 흐름:
  1. `status IN ('done', 'killed')` 이며 `updatedAt <= NOW - 7 days` 인 `agent_tasks` 조회.
  2. 조회된 태스크 정보를 `project_roadmap_events`에 아카이브 생성 (기존 태스크의 output/blocker 요약 보존).
  3. 아카이빙 성공 시 `agent_tasks`에서 해당 행 제거.
  4. (옵션) 7일이 지난 임시 기획성 `chat_messages` 정리.

#### [MODIFY] [gateway.ts](file:///Users/wonminyang/Desktop/pulk/services/hermes-runtime/src/gateway.ts)
- `task-archiver` 태스크 러너 등록 및 주기적 실행 스케줄 정의 (예: 매일 01:00).
- `install-launchd.sh`에 `com.l5.hermes.task-archiver.plist` 추가.

---

### 4. Founder UI Redesign (apps/founder-ui)

프로젝트 단위로 채팅이 분리되고, 대화가 저장되며, 세련된 가로 분기형 로드맵을 제공하는 UI 컴포넌트를 구축합니다.

#### [MODIFY] [Sidebar.tsx](file:///Users/wonminyang/Desktop/pulk/apps/founder-ui/src/components/Sidebar.tsx)
- 사업 선택 시 하단에 **프로젝트 목록** 아코디언/네비게이션 노출.
- "사업 생성" 및 "프로젝트 생성" 대화상자 추가.
- 프로젝트 클릭 시 활성 스코프가 해당 프로젝트로 지정되어 채팅 및 로드맵 탭이 해당 프로젝트 기준으로 동적 변경됨.

#### [MODIFY] [page.tsx](file:///Users/wonminyang/Desktop/pulk/apps/founder-ui/src/app/chat/page.tsx)
- 컴포넌트 마운트 시 `api.chatHistory(projectId)`를 호출하여 과거 대화 복구.
- 대화 중 CEO의 단순 대화 텍스트와 계획 제안(Proposed Plan) 패널을 구분하여 유연한 렌더링 지원.
- 페이지 전환 및 복귀 시 대화 내용 복원 확인.

#### [NEW] [RoadmapTimeline.tsx](file:///Users/wonminyang/Desktop/pulk/apps/founder-ui/src/components/RoadmapTimeline.tsx)
- 프리미엄 가로 스크롤형 타임라인 뷰 컴포넌트.
- **디자인 가이드라인 (Premium Dark Theme)**:
  - 가로로 길게 뻗은 중앙 핵심 메인 줄기(Core Spine): BPR 6단계(`방향정렬` → `PMF진단` → `실행빌드` → `세일즈` → `제품화` → `스케일`) 노드로 분할.
  - 노드는 현재 진행 여부에 따라 상태 표시(과거는 밝은 그린, 현재는 반짝이는 네온 블루, 예정은 점선/반투명 그레이).
  - 핵심 줄기에서 상/하로 갈래(Branch Line)가 뻗어나감:
    - **위쪽 갈래 (Past Tasks)**: 이미 완료되어 삭제되었거나(`project_roadmap_events` 소스) 완료 상태로 유지 중인 과거 태스크 카드를 표시. 카드 내 담당 임원 배지(CTO, CMO 등), 태스크 요약, 날짜 시각화.
    - **아래쪽 갈래 (Active/Future Tasks)**: 현재 진행 중이거나 차단(Blocked), 혹은 예정된 태스크들을 점선 연결선과 함께 표시.

---

## Verification Plan

### Automated Tests
- `@l5/core`에 신규 추가될 `task-archiver` 로직 및 `chat-history` 유닛 테스트 작성.
  - `pnpm --filter @l5/core test` 수행.
- Hermes `task-archiver` 데몬 동작 유닛 테스트 작성.
  - `pnpm --filter @l5/hermes-runtime test` 수행.

### Manual Verification
1. **사업/프로젝트 생성**: Founder UI에서 새로운 사업 및 그 하위 프로젝트를 정상 생성하는지 검증.
2. **멀티턴 대화형 기획**: 채팅에서 질문을 던지고 CEO가 계획 생성 단계 이전에 질문에 답변하며 대화를 이어가는지 확인.
3. **대화 영속성**: 채팅 중 다른 탭(현황 모니터 등)으로 이동했다가 복귀 시 이전 대화 기록이 백엔드에서 복구되는지 확인.
4. **아카이빙**: 특정 태스크를 완료 상태로 두고 DB 상 강제 `updatedAt` 7일 전으로 수정 후, archiver 데몬 실행 시 `agent_tasks`에서 삭제되면서 `project_roadmap_events`에 기록 보존되는지 검증.
5. **로드맵 시각화**: 가로 줄기형 타임라인 컴포넌트에서 완료된 아카이브 태스크와 현재 태스크, 예정된 태스크들이 일목요연하게 표시되는지 Visual 검증.
