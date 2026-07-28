# TASK — 해야 하는 일

> 완료된 작업 이력은 담지 않는다. 과거 이력은 `docs/archive/2026-07-15-docs-reorg/removed/`의 옛 `HANDOFF.md`/`TASKS.md`(각 2960/1639줄) 참고. 이 문서는 재정리 시점(2026-07-15) 기준 진행중/미착수 항목만 담는다.

## 콘텐츠 파이프라인 (bizpt-manager / CMO)

- [ ] 훅 정렬(hook alignment) `insufficient_data` 케이스 해소
- [ ] 정적 12개 시연 뷰 실데이터 배선 (funnel/item/calc/expand/watch/dam/road/routine/insight/kb/me — [screen/bizpt-manager.md](./screen/bizpt-manager.md))
- [ ] 씬 헤드라인이 본문 첫 문장과 동일한 문제 — LLM 요약 필요
- [ ] CTA 씬 부재 보완
- [ ] YouTube API 쿼터 리셋 후 API 경로 자동 복귀 확인
- [ ] 테스트 프로젝트 5개(L1~L5) 정리 여부 — 사장님 결정 필요
- [ ] 제목/썸네일 후속: ① `proposeTitleDevelopment` 자동발굴 배선 ② 승인 단계에서 제목+썸네일 통합 승인뷰 ③ 성과수집(M5) 경로에 교체 알림 연결 ④ 검수 UI 경고 표시
- [ ] Reporting API 노출수/CTR — 리포트 백필 대기 중(구글 비동기 생성)
- [~] **콘텐츠 기획 단계 스킬 전환** — 병목=프롬프트가 거대 TS 파일에 하드코딩(key-content-draft 796·pulling-content-report 832·thumbnail-develop 1010) + 파일별 JSON 파서 난립 + 도구 없는 한방 프롬프트. 전환 판정: 생성/판단(키콘텐츠·풀링·제목·썸네일·원고)→스킬, 검증/게이트(validate-artifact·missingGateReports)→후크, 상태머신/승인로직/phases→코드 유지. 진단 보고서: `deliverables/phase0-skill-bridge-work-order.md` + 아티팩트(2026-07-17).
  - [x] **Phase 0** — 스킬 실행 브릿지 `services/agent-runtime/src/video-production/skill-executor.ts`(+`-node.ts` 실배선) 구현. SKILL.md 로드→claude headless→아티팩트 파일 읽기·정규화. IO 주입식 순수함수, 단위테스트 12 PASS + agent-runtime 전체 65 PASS.
  - [x] **Phase 1/2** — content-planning 스킬 5종(키/풀링/제목/썸네일/원고) + 오케스트레이터 + validate-planning-artifact.mjs 저작(dynamic workflow, 소스 대비 self-verify 전부 ok). `services/agent-runtime/skills/content-planning/`.
  - [x] **QA** — 유저플로우 통합테스트(`content-planning-flow.test.ts`): 실제 브릿지×실제 SKILL.md 로딩 + 실제 state-machine 게이트 불변식(리포트없는 승인 차단, 2카드 훅게이트, stage 커버리지 100%). 70/70 PASS.
  - [x] **계약 통일** — `content_planning_v1` envelope 도입(gate_stage 최상위 + data 래핑). 브릿지(contract 파라미터)·validator(schema_version 강제)·5 SKILL.md STRICT(artifact-contract.md 포인터) 정렬. 단위테스트.
  - [x] **라이브 스모크** — `createDefaultSkillExecutor`(MCP off + acceptEdits + --add-dir)로 실제 claude headless content-key-plan 1회 실행 성공(~50s). schema_version/gate_stage 최상위/checksum 라운드트립 + 스킬 블로킹 규칙 정상 동작(실데이터 없어 status:blocked = 정상). ESM dir-import 버그 1건 스모크가 발견·수정(`/index.js`).
  - [x] **Phase 3(배선)** — `content-planning-runner.ts`(runContentPlanning): 기획 스킬 체인을 브릿지로 구동, blocked 비중단 기록, presentCardStages 수집(→ l5-core 게이트 로직 입력). 러너 테스트 포함. 전체 76 PASS.
  - [x] **Phase 3(스위치 설치) — ①** — `runContentPlanningSkillPreview` 액션을 플러그인 cmo 리소스에 비파괴 배선(src+dist 패치, ACL 등록). 스위치 `CONTENT_PLANNING_SKILLS`(기본 off): on일 때만 스킬 체인 프리뷰 실행 → `content_planning_skill_preview` 카드에 저장(기존 라이브 핸들러 proposeKeyContentReport/proposeScriptDraft 등 **미변경**). 실데이터(product/customer_problem/second_brain_insights)는 라이브 핸들러와 동일 소스 로드. agent-runtime(ESM)은 loadYoutube 컨벤션(동적 import)으로 로드. 검증: dist node --check + ESM×CJS×workspace 해상도 스모크(5스킬 체인) + skillsRoot/SKILL.md 존재 확인.
  - [x] **Phase 3(라이브 회귀) — ②** — 동일 상품·동일 실 YouTube 데이터로 OLD(committed TS) vs NEW(스킬) 승인 보고서(key_content_plan_doc) 실측 비교 완료. 산출물: `docs/reports/content-planning-skill-vs-ts-2026-07-17/`(old/new-approval-report.html + compare-index.html + raw-data.json) + 아티팩트 3종. 결과: OLD는 중간 LLM 스텝 60s 타임아웃으로 후보 정체성 분석 누락(조회수 폴백), NEW는 클린 완주+영상별 정체성 분석+풀링 키워드 3개. 사장님 품질 승인 → ③ 진행.
  - [x] **Phase 3(추론층 스킬 라우팅) — ③** — key-content 스테이지의 라이브 핸들러(proposeKeyContentReport)에 스위치(`CONTENT_PLANNING_SKILLS=1`) 배선: OLD 데이터층(발굴·시장 계산기 report.market/candidates)은 유지하고 **추론 산출물(applied_sales_logic·recommendation_reason·후보별 정체성/퍼널·pulling_keyword_plan)만 스킬 결과로 오버레이** → 기존 buildKeyContentPlanDoc 렌더러로 동일 카드 생성. 스킬 실패/블록 시 OLD 자동 폴백, **off면 현행 100% 동일**(src+dist 패치, node --check OK). 오버레이 로직은 비교 스크립트로 실증(new-approval-report.html이 그 산출물).
  - [x] **Phase 3(라이브 ON + in-app 실행) — ④** — nocobase(:13000)를 `CONTENT_PLANNING_SKILLS=1`로 재기동(health 200, serving worker env flag 확인). ⚠️ 재기동 함정: macOS `setsid` 부재 + nocobase gateway.sock/CLI supervisor 자동재생성 → CLI supervisor 먼저 KILL → 포트/소켓 해제 대기 → stale sock 제거 후 기동해야 함(restart-nocobase-flag3.sh 방식). 실 프로젝트(미용실 047e44af) 대상 flag-on 경로 end-to-end 실행 완료: 실 YouTube 발굴(후보3/시장6키) → OLD → 스킬 추론 오버레이(status draft, skillOverlay=yes) → `key_content_plan_doc__skill_run` 카드 기록(비파괴). 스킬이 조회수 더 높은 how-to 영상을 mismatch로 탈락, 원장 호명 결과영상을 톱픽 선정(정체성>조회수 독트린 적용). 아티팩트: old/new/compare/live-miyeongsil 4종.
  - [ ] **Phase 3(잔여) — 프롬프트 물리 archive/ 나머지 스테이지** — ⓐ 플래그는 현재 프로세스 env로만 ON(.env 미수정 — 금지) → 사장님이 nocobase 수동 재기동 시 off로 회귀. 영속화하려면 `.env`에 `CONTENT_PLANNING_SKILLS=1` 추가(사장님 결정). ⓑ 거대 기획 TS는 프롬프트+계산기+도구 배선이 한 파일에 섞여 있고 off 시 OLD가 fallback이라, 프롬프트 물리 strip은 스위치 default+운영 검증 뒤에만 안전(현재는 토글 은퇴). ⓒ pulling/title/thumbnail/script 스테이지도 key-content와 동일하게 추론층 스킬 라우팅 배선(현재 key-content만). ⓓ 결정론 스코어링(computeMarketMetrics·videoScore·decideGrade)+테스트+렌더러는 **영구 유지**.

## 안정성 (ACR Work Order 대상, 미착수)

- [ ] S2: CDP RPC 자동 재연결
- [ ] S4: `rebuild-plugin.mjs` 정규화
- [ ] Q1: Viewtrap Skill을 파이프라인 내부로 통합
- [ ] Q4: 말투 변환 Voice Style Agent

## 인프라 / 오퍼레이션

- [ ] **`services/cmo-insight-loop` 스케줄 재등록** — 문서상 "매일 21시 자동화"이나, 2026-06-12 1회 실행 후 등록된 스케줄(Routine)이 없어 실제로는 한 달 이상 휴면 상태. 재등록 또는 폐기 결정 필요.
- [ ] `services/youtube/.credentials.json` 평문 자격증명 정리 — `.gitignore` 등록 및 로테이션
- [ ] Slack 게이트웨이 라이브 배선(사장님 작업) — 6개 토큰 env 주입, `install.sh` 실행, 채널별 invite. 후속: 임원 페르소나 보강, 아침 브리핑 스케줄러, 봇 자동조인
- [ ] Tiger 자가개선 collector 신호필터 튜닝(정상 로그 오탐 이슈), 구조화 실패로그(jsonl) 적재
- [ ] 호랑이 영상룸 회고 라이브 검증(NocoBase 재기동 후): 토글 영속 / 회고카드 생성 / `@CTO` 플랜승인→실행 / 새 대화 후 이전 대화 미노출

## 코드 정리 후보 (이번 재정리에서 확인, 검토만 하고 손대지 않음)

- [ ] `apps/founder-ui/src/app/workflow/page.tsx` — 어디서도 링크되지 않는 고아 라우트
- [ ] `apps/founder-ui/src/app/control-room/page.tsx`(1,253줄) — ACR 은퇴로 메뉴에서 숨김, 코드는 의도적 보존. 완전 삭제 여부 재검토
- [ ] `apps/founder-ui/src/app/cmo/page.tsx` — `/video-room`과 CMO UX 중복 가능성, 확인 필요
- [ ] `apps/bizpt-manager/src/lib/static-views.ts`의 `bench/title/thumb/script/upload/jobs/research/render` 키 — 라이브 뷰 전환 후 도달 불가능한 잔재 코드
- [ ] `services/agent-runtime/src/agents/ceo.ts` — "Mastra로 구현 예정" TODO만 있는 미완성 placeholder, native-orchestrator 경로로 대체된 것으로 보임
- [ ] `apps/founder-ui/e2e/`, `apps/founder-ui/scripts/`의 약 30개 스크립트 — package.json `e2e` 스크립트가 참조하지 않는 수동 실행용 디버그 스크립트. CI 등록 여부 확인 필요

## 문서 정리 후속

- [ ] `TRD.md`의 Agent Runtime(Mastra)/Hermes Runtime(Trigger.dev) 표기를 실제 구현(자체 구현)에 맞춰 재검토 — 원 설계 의도대로 갈지, 실제 구현대로 문서를 남길지 결정 필요
- [ ] `trd/data-governance.md`의 데이터 카테고리별 접근권한 매트릭스 세부 표를 archive 원본(`docs/archive/2026-07-15-docs-reorg/removed/SECURITY_DATA_GOVERNANCE.md`)에서 필요분만 옮겨오기

## 관련 문서

- 아키텍처/문서 구조: [ARCHITECTURE.md](./ARCHITECTURE.md)
- 코딩 규칙: [CODING_CONVENTION.md](./CODING_CONVENTION.md)
