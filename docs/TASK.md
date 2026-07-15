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
