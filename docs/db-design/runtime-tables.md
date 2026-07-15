# DB DESIGN 하위 — 런타임 확장 테이블

> [DB_DESIGN.md](../DB_DESIGN.md)로 돌아가기. 실제 운영 중 코어 엔티티에 추가된 테이블/컬럼(camelCase `createdAt`/`updatedAt` 컨벤션 사용).

## FounderDeliverable (P1, 2026-06-03)

지시 하나가 끝나면 Chief of Staff가 생성하는 종합 산출물 카드.

- `instruction_id` — **UNIQUE**, 같은 지시로 중복 생성 방지(멱등)
- `decision_summary`, `contributions[]`, `open_gaps[]`, `next_actions[]`

## AgentTask — self-mod 확장 컬럼 (P3-4)

- `self_mod_origin`, `self_mod_status`, `acr_branch`, `acr_diff`, `acr_pr_url`

## MemoryEntry(founder_memory) — 큐레이션 컬럼 (P3-2)

- `curation_decision`, `discard_reason`, `discarded_at`, `purge_at` (폐기 후 30일 유예, cron으로 실제 퍼지)

## ExecutiveConsultation (M4)

임원이 창업자에게 질문할 때 쓰는 테이블.

- `task_id`, `from_agent`, `question`, `status`(`awaiting_founder` | `resolved`), `founder_response`

## ExecutiveDelegation (M6)

임원 간 위임(`ask_executive`) 루프 상태.

- `from_agent`, `to_agent`, `origin_task_id`, `work_task_id`, `objective`, `acceptance_criteria`
- `status`, `round`, `max_rounds`(1-5, 기본 3), `last_feedback`

## 2026-06 이후 추가된 테이블/컬럼

- `native_phase_runs` — Native Orchestration에서 phase 단위 실행 모니터용으로 신설(기존 `agent_tasks` 재사용 대신 별도 테이블, 2026-06-11 결정)
- `video_room_projects.tiger_enabled` — Tiger 자가개선 루프 토글(2026-06-12)
- `agent_tasks.notion_page_id` — Notion 동기화 매핑 키(2026-07-08)
- `video_performance_metrics` — 영상 성과 재학습(R7)용

## AgentTask / AgentHandoff 상세

**AgentTask**: `phase` enum(direction_alignment ~ scale_automation), `status` enum(queued/running/blocked/needs_review/done/killed), `risk_level`(D1-D5)

**AgentHandoff**: `task_id`, `from_agent`, `to_agent`, `context`, `next_action`, `blocker`, `approval_required`

## 관련 문서

- 코어 엔티티: [core-entities.md](./core-entities.md)
- 위험도/승인 규칙: [../trd/agent-protocol.md](../trd/agent-protocol.md)
