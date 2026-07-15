# DB DESIGN 하위 — Video Room / bizpt-manager 엔티티

> [DB_DESIGN.md](../DB_DESIGN.md)로 돌아가기. `apps/bizpt-manager`가 소비하는 실사용 데이터. 원본 타입: `packages/l5-core/src/functions/video-room/types.ts`(80+ interface).

## Project

`id, title, status, current_page, tiger_enabled, createdAt, updatedAt`

`status`는 23개 상태값(`statuses.ts`)을 6개 Phase(기획/훅/원고/영상/업로드/성과)로 그룹핑한다. `_approval`로 끝나는 상태 = 승인 게이트.

## Card

`id, stage, card_type, title, content, createdAt`

`card_type`(≈29종, `CardRenderers.tsx`의 `CARD_NAMES`): `product_definition`, `key_content_report`, `key_content_plan_doc`, `title_development`, `thumbnail_plan`, `script_draft`, `qa`, `upload_draft`, `research_judgments`, `revision_request` 등.

## Gate

`id, gate_type, status, decision`

게이트는 필요한 리포트 카드가 전부 존재해야 승인 버튼이 열린다([USER_FLOW.md](../USER_FLOW.md) 참고).

## Artifact

`id, video_project_id, stage, summary, data, project_title, project_status, key_topic_title`

`listArtifacts` API의 조인 응답 형태 — Project와 Card를 합쳐서 화면에 필요한 형태로 반환.

## Judgment

`video_id, verdict('adopt' | 'exclude'), reason`

뷰트랩 리서치 후보에 대한 채택/제외 판정 기록.

## API 액션 매핑 (NocoBase 커스텀 액션, `cmo:` 네임스페이스)

- `cmo:listProjects`, `cmo:getProject`, `cmo:createProject`
- `cmo:advanceStatus`, `cmo:approveStageGate`, `cmo:rejectStageGate`, `cmo:decideGate`
- `cmo:listArtifacts` (stage/project_id 필터)
- `cmo:decideResearchCandidate`
- `cmo:getRenderStatus`

전체 API 목록은 `apps/founder-ui/src/lib/api.ts`(약 1,700줄)에 있으며, CMO 그룹만 50개 이상의 액션이 있다 — 상세는 코드 참조.

## 관련 문서

- 화면: [../screen/bizpt-manager.md](../screen/bizpt-manager.md), [../screen/founder-ui.md](../screen/founder-ui.md)
- 사용자 동선: [../USER_FLOW.md](../USER_FLOW.md)
