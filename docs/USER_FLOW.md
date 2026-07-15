# USER FLOW — 사용자 동선

> 화면 목록은 [SCREEN.md](./SCREEN.md), 데이터 구조는 [DB_DESIGN.md](./DB_DESIGN.md).

사용자는 사실상 한 명(창업자/운영자, 문서 내 호칭 "사장님")이며, 두 개의 콘솔(`founder-ui`, `bizpt-manager`)과 두 개의 채팅 게이트웨이(Slack, Telegram)로 접근한다.

## 1. Founder 콘솔 루프 (founder-ui, 메인)

```
지시 입력(/chat) → CTO/CEO가 플랜 제안 → 승인(/approval 또는 채팅 내) → 태스크 실행
→ 실시간 모니터링(/monitor) → 종합 산출물(FounderDeliverable) → 다음 지시
```

- `/chat`에서 `@CTO ...` 형태로 인라인 멘션 시, CTO 버블 + Phase 플랜 카드(승인 버튼)가 뜨고, 승인하면 `agent_tasks`에 queued되어 task-dispatcher가 자동 실행한다.
- "새 대화(보관)" 버튼으로 채팅 스레드를 회전시킬 수 있다.
- 모니터링은 지시별로 그룹핑되어 8초 폴링으로 상태점(조사중/대화중/대기/검토중)을 갱신한다.
- 이상 발생 시 `/incidents`(Tiger 감시) → CTO 수정 제안 → `/tool-requests`에서 self-mod 승인/롤백.
- 지식은 `/memory`에서 큐레이션 후보를 저장/폐기한다.

## 2. CMO 콘텐츠 파이프라인 (핵심 실사용 플로우, 22단계)

```
전략대화 시작 → PT 컨텍스트 로딩 → 상품/문제 정의
→ 키 콘텐츠 후보 기획 → Viewtrap 키 리서치 → 키 콘텐츠 승인(게이트)
→ Viewtrap 풀링 리서치 → 풀링 5개 선별 → 풀링 세트 승인(게이트)
→ 썸네일 구성 → 도입부 30초 → 제목/썸네일/도입부 승인(게이트, "훅" 통합)
→ 원고 기획 → 원고 작성 → 원고 승인(게이트)
→ 녹음 → 슬라이드 스펙 생성 → 렌더링 → QA
→ 업로드 초안 → 업로드 승인(게이트) → 완료 → 성과 수집·재학습
```

승인 게이트는 총 6개소(키/풀링/훅/원고/영상/게시)이며, 각 게이트는 **필요한 리포트 카드가 전부 있어야만 승인 버튼이 열린다**(2026-07-12 결정: "바로 승인" UI 제거). Viewtrap은 독립 단계가 아니라 키/풀링 기획 내부에서 호출되는 검증 스킬이다.

이 흐름은 `founder-ui`의 `/video-room`(전략/제작/검토발행 3보드)과 `bizpt-manager`(승인/파이프라인/산출물 보드)에서 각각 다른 관점으로 조작할 수 있다 — 상세는 [SCREEN.md](./SCREEN.md).

## 3. 비즈니스PT 매니저 콘솔 동선 (bizpt-manager, :3003)

```
오늘(today, 승인 대기 요약) → 승인 센터(approve) → 파이프라인 칸반(pipe, 6단계)
→ 카드 클릭 → 슬라이드오버(여정 지도 + 산출물 타임라인) → 승인 또는 수동 전진
```

- 리서치(research) 뷰에서 뷰트랩 후보 영상을 채택/제외 판정한다.
- 단계별 산출물 보드(bench/title/thumb/script/upload/jobs/render)에서 프로젝트 필터로 특정 콘텐츠 결과물만 조회한다.
- 정적 시연 뷰(퍼널/아이템/목표역산/로드맵 등 11개)는 아직 실데이터 미배선 상태로, 클릭 시 "시연 화면" 안내만 뜬다.

## 4. 사업/프로젝트 관리 동선

```
사업 생성 → 프로젝트 생성 → 로드맵/의사결정 기록 확인(/projects/[id])
→ Agent Activity 확인 → 진행에 따라 BPR 단계 전이
```

## 5. 채팅 게이트웨이 동선 (Slack / Telegram)

- Slack: 채널별 `@CEO`/`@CMO`/`@CTO` 멘션 → 헤드리스 claude 서브에이전트 실행 → 스레드로 회신, 필요 시 파일 업로드. 채널 구성: boardroom / exec-ceo / exec-cmo / exec-cto / approvals / acr-runs.
- Telegram: `@executive` 명령 → 서브에이전트 라우팅 → 결과/파일 응답.

두 채널 모두 founder-ui 밖에서 짧은 지시나 승인을 처리하기 위한 보조 동선이다.

## 6. 자가개선(Tiger) 동선

```
Tiger가 로그/실행 이력에서 이상·회고 신호 감지 → 개선 카드 생성
→ /self-improve 승인 큐 → 승인 시 self-mod 적용(diff 검토 포함, /tool-requests)
```

## 관련 문서

- 화면 목록: [SCREEN.md](./SCREEN.md)
- 에이전트 위험도/승인 규칙: [trd/agent-protocol.md](./trd/agent-protocol.md)
- 진행중 작업: [TASK.md](./TASK.md)
