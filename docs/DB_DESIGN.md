# DB DESIGN — 데이터 모델

> 시스템 구조는 [TRD.md](./TRD.md). 화면에서 쓰는 데이터는 [SCREEN.md](./SCREEN.md) 참고.

## 원칙

- **Source of Truth는 PostgreSQL**(NocoBase collections)이다. Langfuse/Formbricks/Activepieces/LLM 로그는 SoT가 아니다.
- 스키마는 대부분 코드로 정의된다(`db.collection(defineCollection({...}))`), 정적 마이그레이션 SQL은 legacy 방식이라 폐기됨.
- 컬럼 추가보다 기존 경로 재사용을 우선한다 — [CODING_CONVENTION.md](./CODING_CONVENTION.md) 참고.
- 개념 엔티티(도메인 설계)와 런타임 확장 테이블(실제 운영 중 추가된 컬럼)을 구분해서 본다.

## 엔티티 그룹

| 그룹 | 내용 | 문서 |
|---|---|---|
| 코어 엔티티 | FounderDNA, Business, Project, Workflow, Agent, PMFExperiment, MemoryEntry 등 | [db-design/core-entities.md](./db-design/core-entities.md) |
| 런타임 확장 테이블 | FounderDeliverable, self-mod 컬럼, ExecutiveDelegation, native_phase_runs 등 실제 운영 중 추가분 | [db-design/runtime-tables.md](./db-design/runtime-tables.md) |
| Video Room / bizpt 엔티티 | Project/Card/Gate/Artifact/Judgment — CMO 콘텐츠 파이프라인 실사용 데이터 | [db-design/video-room-entities.md](./db-design/video-room-entities.md) |

## 관계 요약

```
BusinessIdea 1 → 0..1 Business
Business 1 → N Project / Workflow / PMFExperiment / AgentAssignment
Project 1 → N ChatMessage / AgentTask / ProjectRoadmapEvent
PMFExperiment 1 → N PMFExperimentMetric
FounderInstruction 1 → 0..1 FounderDeliverable  (instruction_id UNIQUE로 멱등 보장)
AgentTask(ToolRequest) 1 → 0..1 AgentTask(self-mod)
VideoProject 1 → N Card / Gate / Artifact  (bizpt-manager, video-room-entities.md 참고)
```

## 스키마 정의 위치 (코드 기준)

- `packages/l5-core/src/types/entities.ts` — 회사 운영 코어 엔티티 타입
- `packages/l5-core/src/functions/video-room/types.ts` — video-room 엔티티(80+ interface)
- `packages/l5-core/src/schemas/` — governance/scriptplan/slide-deck/snapshot/videoqa-result 등 개별 스키마
- `schemas/l5_entities.json`, `schemas/orchestration.schema.json` — 포터블 엔티티 정의(NocoBase 외부에서도 재사용 가능)
- `apps/nocobase-app/packages/plugins/@l5/plugin-business-portfolio/src/server/collections/*.ts` — NocoBase collection 정의
- `apps/nocobase-app/packages/plugins/@l5/plugin-orchestration/src/server/plugin.ts` — `defineCollection()` 16곳 (미니 모놀리스 상태, 리팩터 후보)

## 관련 문서

- 화면별 사용 데이터: [SCREEN.md](./SCREEN.md)
- 보안/PII 필수 필드: [trd/data-governance.md](./trd/data-governance.md)
