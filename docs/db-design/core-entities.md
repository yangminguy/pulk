# DB DESIGN 하위 — 코어 엔티티

> [DB_DESIGN.md](../DB_DESIGN.md)로 돌아가기. 타입 정의 원본: `packages/l5-core/src/types/entities.ts`.

## 창업자/전략

- **FounderDNA** — 창업자 성향/문화 프로필
- **FounderDNAUpdateSuggestion** — DNA 업데이트 제안(Agent 생성)

## 사업/프로젝트

- **BusinessIdea** — status: `idea → scoring → pmf_experiment → killed → converted_to_business`
- **Business** — 10단계 status (PRD.md의 Business Portfolio Board 참고)
- **Project** — Business 하위 실행 단위
- **VideoProject** — CMO 콘텐츠 파이프라인 전용, [video-room-entities.md](./video-room-entities.md) 참고
- **ChatMessage** — 채팅 기록
- **ProjectRoadmapEvent** — 로드맵 이벤트 로그

## 워크플로우/에이전트

- **Workflow / WorkflowStep** — Workflow Factory 산출물
- **Agent** — role, autonomy_level(L1-L5)
- **AgentAssignment** — Business ↔ Agent 배정

## PMF/의사결정

- **PMFExperiment / PMFExperimentMetric** — PMF 실험과 측정치
- **HermesAlert** — 스케줄러 감시 알림
- **DecisionQueue** — 승인 대기 의사결정
- **BPRLog** — BPR 단계 전이 로그
- **ToolRequest** — 툴 제작 요청(PMF 신호 필요)

## 지식/고객

- **MemoryEntry** — `pii_level`, `allowed_usage` 포함, 재사용 가능 인사이트
- **CustomerProfile / CustomerConsent** — 고객 PII, MemoryEntry와 분리 저장
- **BusinessInsight** — 고객 데이터에서 파생된 재사용 가능 인사이트(PII 제거됨)

## 관련 문서

- 런타임 확장 테이블: [runtime-tables.md](./runtime-tables.md)
- 필수 필드/거버넌스: [../trd/data-governance.md](../trd/data-governance.md)
