# SCREEN 하위 — bizpt-manager (:3003)

> [SCREEN.md](../SCREEN.md)로 돌아가기. Next.js 단일 라우트(`/`)이며, 화면 전환은 좌측 NAV 기반 클라이언트 사이드 뷰 스위칭(`ViewKey` state)으로 구현된다. 프로젝트 상세는 라우트가 아니라 슬라이드오버 패널이다.

## 라이브 뷰 (실데이터 배선됨)

| 뷰 키 | 화면 | 설명 |
|---|---|---|
| `today` | 오늘 | 승인 대기 게이트 + 자동 진행 중 항목 요약 홈 |
| `approve` | 승인 센터 | 게이트별 필요 리포트 카드 검토 → 승인/반려 |
| `pipe` | 파이프라인 칸반 | 6단계(`PHASE6`) 컬럼 |
| `research` | 리서치 보드 | 뷰트랩 후보 채택/제외 판정 |
| `bench` / `title` / `thumb` / `script` / `upload` / `jobs` / `render` | 단계별 산출물 보드 | `ArtifactBoard.tsx` 공용, `stages` prop만 다름 |

## 정적 시연 뷰 (미배선, v4 프로토타입)

`funnel`, `item`, `calc`, `expand`, `watch`, `dam`, `road`, `routine`, `insight`, `kb`, `me` — v4 HTML 프로토타입을 그대로 주입, "시연 화면" 배너 표시. 실데이터 배선은 [TASK.md](../TASK.md) 항목.

## 프로젝트 상세 (슬라이드오버)

여정 지도(6단계 phase × status) + 산출물 카드 타임라인 + 승인/전진 버튼.

## e2e로 확인된 실동작

- `e2e/smoke-ui.mjs` — 사이드바, 백엔드 연결 배지, 파이프라인 카드, 슬라이드오버, 지식베이스 표 렌더 확인
- `apps/founder-ui/e2e/bizpt-smoke-write.mjs` — 카드 클릭 → 슬라이드오버 → "다음 단계로" → 상태 pill 변경까지 쓰기 경로 관통 테스트
- `e2e/verify-kb-standards.mjs` — 산출물이 지식베이스 기준(제목 35자, 도입부 200자/40~70초, 본론 3000자, 썸네일 후보 3개 이상, 판매논리 5요소, 렌더 mp4 실존) 충족 여부 대조
- `e2e/loop-full-pipeline.mjs` — 신규 프로젝트 생성 → 업로드 승인 직전까지 전체 파이프라인 라이브 E2E(체크포인트 저장·재개 가능)

## 인증/연동

localStorage `bizpt_token` + 401 자동 재로그인 1회. 백엔드는 NocoBase(`NEXT_PUBLIC_API_BASE`, 기본 `http://localhost:13000`). 카드 렌더러가 유튜브(`youtube.com/watch`, `i.ytimg.com`) 링크를 직접 참조.

## 관련 문서

- 데이터: [../db-design/video-room-entities.md](../db-design/video-room-entities.md)
- 동선: [../USER_FLOW.md](../USER_FLOW.md)
