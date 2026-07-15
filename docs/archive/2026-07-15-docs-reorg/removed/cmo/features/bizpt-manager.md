# 비즈니스PT 매니저 (bizpt-manager) — 기능 정본

> 사장님이 비즈니스 PT 방법론(지식베이스 12문서)대로 콘텐츠 수익화를 운영하는 **별도 콘솔 앱**.
> founder-ui와 분리(기능 비대 방지) — founder-ui 사이드바에서 링크로만 이동.
> 최종 갱신: 2026-07-12 (앱 라이브 + 실가동 루프 5회 완료).

## 한 줄 정의

`http://localhost:3003` — NocoBase `cmo:*` 백엔드 위에 얹힌 사장님용 운영 UI. 승인 큐·파이프라인(한국어 6단계)·프로젝트 상세(여정 지도)를 실데이터로, 나머지 정보 뷰는 v4 프로토타입 시연분으로 제공.

## 위치 · 실행 · 배포

| 항목 | 값 |
|---|---|
| 앱 | `apps/bizpt-manager/` (Next.js 14.2.29 · React 18 · TS) |
| 포트 | **3003** (3001=구 ACR · 3002=founder-ui · 13000=NocoBase) |
| 패키지 매니저 | **pnpm `--ignore-workspace` 독립 설치** — 루트 pnpm 워크스페이스와 분리(자체 lockfile). nocobase-app(yarn)과 동일한 격리 패턴 |
| dev | `corepack pnpm dev` (next dev -p 3003) |
| prod | `corepack pnpm build` → launchd `com.l5.bizpt-manager` (RunAtLoad+KeepAlive) |
| launchd 함정 | ProgramArguments는 **`/usr/local/bin/node` + `node_modules/next/dist/bin/next` 직접 실행** — `.bin/next` 심링크는 launchd에서 `Operation not permitted`(exit 126). founder-ui plist와 동일 패턴 |
| 재배포 | 소스 수정 → `corepack pnpm build` → `launchctl kickstart -k gui/501/com.l5.bizpt-manager` (prod라 HMR 없음) |
| founder-ui 링크 | `founder-ui/src/components/Sidebar.tsx` NAV_TOOLS → `http://localhost:3003` (변경 시 founder-ui 재빌드 필요) |

## 소스 구조

```text
apps/bizpt-manager/src/
├── app/page.tsx        # 메인 콘솔(단일 클라이언트 페이지): 사이드바 22뷰 + 슬라이드오버
├── app/globals.css     # v4 디자인 시스템 (프로토타입 <style> 추출본)
├── lib/api.ts          # NocoBase cmo:* REST 클라이언트 (admin 자동 signIn, 401 재로그인 1회)
├── lib/statuses.ts     # 상태머신 23단계 → 한국어 라벨 + 6단계(기획→훅→원고→영상→업로드→성과) 매핑
└── lib/static-views.ts # v4 프로토타입에서 추출한 정적 뷰 20종 (자동 생성물 — 시연 배너 표시)
```

- **라이브 뷰 11종** (2026-07-12 확장): `today`(승인 큐) · `approve`(**승인 센터** — 게이트 리포트 인라인 검토→승인/반려) · `pipe`(6단계 칸반) · `research`(뷰트랩 후보 판정: 썸네일+채택/제외) · `bench`·`title`·`thumb`·`script`·`upload`·`jobs`·`render`(산출물 보드 — 식별 헤더+콘텐츠 필터, `cmo:listArtifacts` 서버 join) · 슬라이드오버(한국어 카드 렌더러 + 진행 타임라인). 20초 폴링.
- **정적 뷰 12종**: funnel·item·calc·expand·watch·diag·dam·road·routine·insight·kb·me — "시연 화면(P3 배선 예정)" 배너.
- 도메인 로직 없음(표시+액션 호출만) — 전역 규칙 준수. 컴포넌트: `src/components/`(ArtifactBoard·ApprovalCenter·ResearchBoard·CardRenderers).
- **카드 본문 필드는 `data`** (`content` 아님) — video_room_cards 스키마.
- **승인 게이트 강제**: 6개 게이트는 대응 리포트 카드(`key_content_plan_doc`/`pulling_plan_doc`/`title_development`+`thumbnail_plan`/`script_draft`/`qa`/`upload_draft`) 없이는 승인 불가(l5-core `missingGateReports` + plugin 강제). "바로 승인" 버튼 제거.

## 지식베이스 (정본 기준)

- `docs/cmo/prd/bizpt-kb/` 00~11 — 강의 방법론 정본. UI 뷰·검증 기준·프롬프트 규칙의 근거.
- UI의 "근거: NN" 배지가 이 문서 번호를 가리킴.
- 핵심 수치: 정량 4요소(조회 1000 · 지속 35%/4분 · 도입부 60%/30초 · CTR 10%) · 객단가 25만↑ · 시장 1억뷰↑ · 제목 35자 · 도입부 200자 · 본론 3,000자 · 썸네일 45/45/10 · 교체창 7일.

## E2E · 검증 도구 (`apps/bizpt-manager/e2e/`)

| 도구 | 용도 |
|---|---|
| `loop-full-pipeline.mjs` | 전 구간 라이브 E2E(미용실 상품 입력) — createProject→…→실 렌더→upload_approval. founder-ui full-pipeline-live.mjs 변형(상태 파일 `/tmp/bizpt-loop-state.json`, 체크포인트 재개) |
| `verify-kb-standards.mjs <project_id>` | 산출물 ↔ 지식베이스 기준 자동 대조(제목 35자·도입부 200자·본론 분량·신뢰도 흔적·썸네일 3+·판매논리·렌더 QA). 단어 휴리스틱 기반이라 FAIL은 육안 재확인 |
| `inspect-video.sh <mp4>` | ffprobe 메타 + 프레임 추출 육안 QA. ⚠️ **경계초(0/20/40/60s) 프레임은 슬라이드 전환 페이드라 빈 화면으로 보임** — 중간초(10/30/50/70s)로 뽑을 것 |
| `smoke-ui.mjs` / `bizpt-smoke-write.mjs` | Playwright 스모크(founder-ui e2e에 복사본 — playwright 의존성 위치 때문). 렌더 검증 + UI 클릭→백엔드 전진 관통 |

## 실가동 루프 5회 이력 (2026-07-12) — 요약

| 루프 | 프로젝트 | 결과 | 수정 |
|---|---|---|---|
| 1 | 4d6c0b03 | ❌ titledev 400 | NocoBase 복구(모듈 소실) · **SDK 키 부재→CLI(OAuth) 폴백** · viewtrap 탭 확보 |
| 2 | 9cd3a587 | ❌ pulling 404 | 검색 키워드 **일반명사화 규칙**(06 §4-3) + 후보 0건 재검색 1회 |
| 3 | 4f9983bf | ✅ 관통+렌더 | 원고 껍데기 규명(haiku 경로) — 영상은 나오나 내용 빈약 |
| 4 | a2e38634 | ✅ 관통+렌더 | **LLM 정책 buildLLMClient 단일화** → 클러스터링 정상·풀링 3주제 |
| 5 | cd3bcdcd | ✅ **최종** | l5-core 원고 **LLM 생성+거절문/분량 가드** + 슬라이드 실원고 배선 → 도입부 185자·본론 2,249자·9.8MB 영상, KB 대조 PASS 11/FAIL 3(휴리스틱 한계) |

관련 백엔드 수정 상세는 [HANDOFF](../HANDOFF.md) 2026-07-12 항목.

## 잔여 (우선순위 순, 2026-07-12 오후 갱신)

1. 훅 정렬 `insufficient_data` 해소(도입부 강화 후 재평가).
2. 정적 12뷰(funnel·item·calc·expand·watch·diag·dam·road·routine·insight·kb·me) 실데이터 배선.
3. 씬 헤드라인 요약형(현재 본문 첫 문장과 동일 — LLM 요약 단계 필요) + CTA 씬 부재.
4. 테스트용 루프 프로젝트 정리 여부(사장님 결정 — L1~L5 + 점검테스트, 파이프라인에 표시 중).
5. YouTube API 쿼터 리셋 후 API 경로 자동 복귀 확인(현재 429 시 CDP ytInitialData 폴백으로 무중단).

> 해결됨(2026-07-12 오후): ~~영상 표현(headline 중복·[viewer emotion] 노출·본문 1장 압축)~~ · ~~sendBriefToFactory 400~~(200/sent) · ~~e2e 8초 테스트 음성~~(실원고 TTS+실측 duration) · ~~P3 일부~~(라이브 11뷰).
