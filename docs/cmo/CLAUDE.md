# CMO — 영역 라우터

> CMO(콘텐츠 마케팅) 영역의 개발 문서 인덱스. 새 세션은 이 파일부터 읽고 필요한 문서로 분기한다.
> 문서 1개는 250~300줄 이내로 유지. 넘으면 쪼개고 여기서 링크만 건다.

## CMO가 하는 일 (한 줄)

Founder의 상품·타깃을 받아 **키 콘텐츠 → 풀링 콘텐츠 → 콘텐츠 제작 → 영상 제작 → 성과 재학습**을 반자동으로 돌리는 콘텐츠 마케팅 운영 체계. 정본 도메인 = `packages/l5-core/src/functions/video-room/`.

## 문서 맵

| 문서 | 무엇 | 언제 본다 |
|---|---|---|
| [HANDOFF](./HANDOFF.md) | CMO 현재 상태 요약 | 세션 시작 시 "지금 어디까지 됐나" |
| [TASKS](./TASKS.md) | 개발 계획 M1~M8 + 우선순위 | "다음 뭐 할까" |
| [features/youtube-viewtrap-discovery](./features/youtube-viewtrap-discovery.md) | YouTube API + Viewtrap CDP 발굴 자동화 | 발굴/지표/크롤링 작업 시 |

## 기획서 / 스펙 (이 디렉토리에 함께 있음)

코드 아니라 의사결정 근거·시각 자료. 전부 `docs/cmo/`.

**최신 기획 (2026-06-10):**
- `CMO_MASTER_PLAN.html` — 종합 기획서(발굴 워크플로우 + 미구현 M1~M8)
- `CMO_WORKFLOWS.html` — 4대 워크플로우 실제 스텝(키/풀링/제작/영상)
- `CMO_VIEWTRAP_PLAN.html` · `CMO_PULLING_VIEWTRAP_PLAN.html` — 키/풀링 × Viewtrap 활용
- `CMO_ROADMAP_MAP.html` — 전체 로드맵/아키텍처(R1~R7 완료 현황)

**스펙 (md):** `CMO_SCRIPT_ROOM_PRD.md` · `CMO_TO_FACTORY_CONTRACT.md`(cmo_to_factory_v2 계약) · `CMO_SCRIPT_ROOM_EXECUTION_PLAN.md` · `CMO_DEV_SPEED_STRATEGY.md` · `CMO_SPEED_OPTIMIZATION_PLAN.md`

**구버전 아키텍처/리포트 (참고):** `CMO_V3_ARCHITECTURE.html` · `CMO_VIDEO_ROOM_ARCHITECTURE.html` · `CMO_FACTORY_ARCHITECTURE.html` · `CMO_FACTORY_FEATURES.html` · `CMO_SLIDE_FACTORY_STATUS.html` · `CMO_WORKFLOW_FINAL.html` · `CMO_WORKFLOW_MANUAL_VS_AUTO.html` · `CMO_KEY_CONTENT_REPORT.html` · `CMO_REMAINING_DEV_PLAN.html`

## 핵심 원칙 (CMO 전용)

- **분류 LLM = Claude Sonnet** 고정 (의도 분류/판매논리 판단은 "생각"이 필요).
- **발굴 = YouTube**(검색 한도 없음), **지표 검증 = Viewtrap**(한도 있음). 역할 분담.
- 도메인 로직은 `l5-core/video-room`에. plugin/UI에 하드코딩 금지(전역 CLAUDE.md 규칙).
- 각 단계 패턴 = **[최소입력 → 스텝 순차 자동초안 → 후보 N개 → HTML 보고서 → 승인/선택]**.
- LLM 스텝은 실패 시 **그 스텝만** 결정론 폴백(전체 폴백 아님).

## CMO 도메인 구조 (정본 = video-room/)

| 단계 | 파일 | 상태 |
|---|---|---|
| 키 콘텐츠 기획 | `key-content-draft.ts`(11스텝) · `key-content-candidates.ts`(3후보) | 라이브 |
| 풀링 콘텐츠 기획 | `pulling-content-planning.ts`(12스텝) · `pulling-candidates.ts` | 라이브 |
| 콘텐츠 제작 | `content-production.ts`(제목/썸네일/원고) | 구현완료 |
| 영상 제작 | `content-strategy-package.ts` → `video-execution-brief.ts` → `factory-handoff.ts` | Brief 전달까지 |
| 성과 재학습 | `performance-ingestion.ts` · `completion-insight-extraction.ts` | 코드완료(수동입력) |
| Viewtrap 도구 | `viewtrap-tools.ts` · `reference-adapters.ts`(심) | 심만 |

## 외부 자격증명

- YouTube API 키 + OAuth(refresh_token) = `services/youtube/.credentials.json` (gitignore, 커밋 금지).
- 대상 채널 = "디립다 dripda"(firstpulk0543@gmail.com). 상세 = [features/youtube-viewtrap-discovery](./features/youtube-viewtrap-discovery.md).

## 작업 완료 시

- CMO 작업이면 이 디렉토리의 `HANDOFF.md`·`TASKS.md`를 갱신(전역 docs/ 아님).
- 구조 결정은 전역 `docs/DECISIONS.md`에 한 줄.
- 문서가 300줄 넘으면 쪼개고 여기 문서 맵에 링크 추가.
