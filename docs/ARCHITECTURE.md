# ARCHITECTURE — 문서 구조 인덱스

> `docs/` 전체의 진입점. "무엇을 어디서 찾는가"만 다룬다. 시스템 기술 구조는 [TRD.md](./TRD.md) 참고.

## 문서 규칙

1. 문서 1개는 **300줄을 넘지 않는다.**
2. 내용이 늘어나 300줄을 넘겨야 하면, 그 문서는 **인덱스**로 남기고 실제 내용은 같은 이름의 하위 폴더(`docs/<name>/*.md`)로 쪼갠다. 이 문서(ARCHITECTURE.md)에 그 분리 구조를 반드시 반영한다.
3. 새 문서를 추가/분리했다면 이 표를 같이 갱신한다.
4. 문서 언어는 한국어 우선, 코드/타입/API 이름은 원문 그대로.

## 7종 핵심 문서

| 문서 | 다루는 것 | 분리 하위 문서 |
|---|---|---|
| [PRD.md](./PRD.md) | 제품 비전, 문제정의, 원칙, MVP 범위, 성공지표 | — |
| [TRD.md](./TRD.md) | 시스템 레이어, 모노레포 구조, 기술스택, 공통 계약 | `trd/agent-protocol.md`, `trd/orchestration.md`, `trd/workflow-hermes.md`, `trd/data-governance.md` |
| [USER_FLOW.md](./USER_FLOW.md) | 사용자(창업자/운영자) 동선, 승인 게이트, 채팅 인터페이스 흐름 | — |
| [DB_DESIGN.md](./DB_DESIGN.md) | 데이터 소스오브트루스 원칙, 엔티티 요약, 관계도 | `db-design/core-entities.md`, `db-design/runtime-tables.md`, `db-design/video-room-entities.md` |
| [SCREEN.md](./SCREEN.md) | 앱별 화면/라우트 목록 | `screen/bizpt-manager.md`, `screen/founder-ui.md` |
| [TASK.md](./TASK.md) | 현재 진행중/미완료 작업만 (완료 이력은 archive) | — |
| [CODING_CONVENTION.md](./CODING_CONVENTION.md) | 코딩 규칙, 검증 문화, 금지사항 | — |

루트 [CLAUDE.md](../CLAUDE.md)의 Reading Order가 이 7종 문서를 가리킨다.

## 저장소 최상위 구조 (2026-07-15 기준)

```text
apps/
  bizpt-manager/     # 콘텐츠 파이프라인 운영 콘솔 (Next.js, :3003)
  founder-ui/         # 창업자용 메인 콘솔 (Next.js, :3000, Vercel 배포)
  nocobase-app/       # 내부 운영 DB/API shell + @l5 플러그인 (live)
  api-server/         # 렌더 잡 큐 스텁 (bullmq/redis, 초기 단계)
packages/
  l5-core/            # 도메인 판단 로직 (NocoBase 비종속, 테스트 가능해야 함)
  l5-ui/              # 공용 UI 컴포넌트 (현재 앱에서 미배선 상태)
services/
  agent-runtime/      # C-level 가상 임원 에이전트 실행기
  hermes-runtime/     # 스케줄 작업 (승인체크/일일브리핑/감시), launchd 상시실행
  research-engine/    # YouTube 리서치 엔진 (신규, 진행중)
  notion-gateway/      # agent_tasks ↔ Notion 동기화
  telegram-gateway/    # 텔레그램 @executive 명령 라우팅
  youtube/             # YouTube API + 뷰트랩(viewtrap) 크롤링 어댑터
  slack-gateway/       # Slack 임원 멘션 라우팅 (가장 활발히 개발중)
  cmo-insight-loop/    # 일일 유튜브 인사이트 수집→텔레그램 (현재 휴면, TASK.md 참고)
docs/                 # 이 문서 체계
schemas/               # 포터블 엔티티 스키마 (l5_entities.json 등)
archive/               # 코드 레벨 보관 (더 안 쓰는 앱/스크립트)
```

`apps/nocobase`(레거시 스캐폴드)는 6주 이상 미변경 + workspace 제외 + 코드 참조 0건이 확인되어 `archive/apps-2026-07-15/nocobase`로 이동했다. 아직 `nocobase-app`으로 이식되지 않은 8개 플러그인 설계(agent-staffing, bpr-engine, founder-dna, hermes-control-room, memory-room, pmf-experiment, tool-request, workflow-factory)의 참고자료로만 보관.

## 아카이브 정책

- `docs/archive/<날짜>-<주제>/` — 문서 재정리/정리 시 통째로 이동한 과거 문서 묶음.
- `archive/<영역>-<날짜>/` — 저장소 루트 기준, 코드/스크립트/자산 아카이브.
- 실제로는 어떤 파일도 강제 삭제하지 않는다(로컬 기기 브릿지가 rm을 막음). "삭제"로 표현된 정리는 전부 위 archive 경로로 이동한 것이며, 검토 후 사용자가 직접 지운다.
- 2026-07-15 문서 재정리 시 이동한 전체 목록: `docs/archive/2026-07-15-docs-reorg/removed/` (기존 docs/ 100여개 파일 원본 그대로 보존, 새 7종 문서에 핵심만 반영됨). 백업 tarball: `docs/archive/2026-07-15-docs-reorg/pre-reorg-backup.tar.gz`.

## 기존 문서 체계와의 관계

이전에는 `docs/cmo/`, `docs/cto/` 영역별 라우터 + 전역 문서가 병존했다(`docs/README.md`, 이제 archive됨). 2026-07-15부로 전 영역(CMO 콘텐츠 파이프라인, CTO 개발 오케스트레이션 포함)을 이 7종 문서로 통합했다. 영역별로 다시 문서가 커지면 규칙 2에 따라 `docs/<name>/<영역>.md` 형태로 쪼갠다(예: `docs/task/cmo.md`).
