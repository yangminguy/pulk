# EXECUTIVE_DELEGATION_SPEC — L5 Business OS

> 작성: 2026-06-02 · 마일스톤 **M6** · 상태: ✅ **D1–D6 전부 완료** (라이브 통과: advance 122s → resolved/round1, origin task 재개)
> 배경 대화: 창업자 요청 — "CEO를 거친 임원↔임원 위임 오케스트레이션 + CMO↔CTO 검증 반복 루프(매번 CEO 안 거치게)".

## 1. Purpose

임원(예: CMO)이 산출 도중 **다른 임원(예: CTO)의 작업이 필요하다고 판단**하면,
CEO를 통해 그 작업을 위임하고, 결과가 **자기 의도대로 나올 때까지 검증-수정 루프**를 자동으로 반복한다.
핵심 원칙:

- **CEO = 게이트(진입/이탈)**: 위임 시작 승인과 루프 막힘 시 에스컬레이션에만 개입. 매 반복마다 CEO LLM을 태우지 않는다.
- **루프 본체 = 결정론적 컨트롤러**: CTO 제작 → CMO 검증(pass/fail) → fail이면 피드백과 함께 CTO 재실행. CEO 미개입.
- **창업자 = 최종 승인자**: 위임·실행 게이트는 기존 승인 모델(아웃바운드/결제/고위험) 유지. [[l5-founder-approval-model]]
- **무한루프 금지**: 루프 예산(max rounds) + 수용 기준(acceptance criteria) 필수.

비범위(별도 건): CEO 채팅에 여러 임원을 불러 라운드테이블 대화 — `docs/TASKS.md` M7로 분리.

## 2. 현재 한계 → 재사용 부품

| 필요 능력 | 현재 | 재사용 |
|---|---|---|
| 임원이 다른 임원에게 위임 | ❌ 없음(임원 `created_tasks: []`, CEO만 1회 분배) | `decomposer`/`assigner`(CEO가 task 생성), `ask_founder` 도구 패턴 |
| 위임 요청 채널 | ⚠️ 창업자용(`ask_founder`)만 | `consultation/tool.ts` 복제 → `ask_executive` |
| 교차 검증(임원이 임원 결과 채점) | ❌ 없음(CEO가 1회 review) | `reviewExecutiveOutput` 구조, handoff 레코드 |
| 반복 루프 + 종료조건 | ❌ 없음(CEO review는 단발 finalize) | self-healing 루프 골격(plugin-orchestration), tool-loop |

## 3. 설계 — 3개 축

### 3.1 `ask_executive` 도구 (l5-core, 순수)
`createAskExecutiveTool({ propose })` — `ask_founder`의 정확한 복제, propose 콜백만 다름.

```ts
// 임원이 tool-loop 도중 호출
{ "tool_call": { "name": "ask_executive", "args": {
    "to_agent": "CTO",
    "objective": "영상 생성기를 이 프리셋대로 수정",
    "acceptance_criteria": ["preset.json에 brand_color 반영", "generate가 9:16 출력"],
    "max_rounds": 3
}}}
```
- `allowed_roles: 'all'`, `permission: 'write'`.
- 반환 `ToolResult.data.delegation_opened = true` → tool-loop가 감지, plugin이 위임 레코드 생성 후 현재 task를 `needs_review`(blocker=`awaiting_delegation:<id>`)로 일시중단. (ask_founder의 needs_review 패턴과 동일)
- **검증**: `to_agent`가 유효 역할인지, 자기 자신 위임 금지, `max_rounds` 1–5 범위.

### 3.2 CEO 위임 오케스트레이션 (plugin)
위임 레코드(`executive_delegations`)가 열리면 CEO 오케스트레이터가:
1. (게이트) 위임이 정책상 허용인지 1회 판단 — 고위험/아웃바운드면 창업자 승인 토큰 발행.
2. `decomposer`/`assigner` 재사용으로 **CTO task 생성**(rationale=objective, acceptance_criteria 첨부, business_id 승계).
3. CTO task가 done 되면 → **검증 루프 컨트롤러**(3.3)로 진입.

### 3.3 검증 반복 루프 컨트롤러 (l5-core 순수 + plugin 구동)
`runDelegationLoop(delegation, deps)` — **CEO LLM 미개입**, 결정론적:

```
round = 0
while round < max_rounds:
  ctoResult = executeAgentTaskLive(ctoTask, ...)          # 제작 (도구 루프)
  verdict   = verifyByRequester(cmo, ctoResult, criteria) # CMO가 채점 (도구 루프, 가벼운 검증)
  if verdict.pass: return RESOLVED(ctoResult)
  ctoTask = reissue(ctoTask, feedback=verdict.feedback)    # 피드백 재투입
  round++
return ESCALATE_FOUNDER(lastResult, "max_rounds 소진")     # CEO/창업자에게 올림
```
- `verifyByRequester`: 요청 임원(CMO)이 `acceptance_criteria` 대비 pass/fail + feedback 산출. 풀 산출물 생성이 아니라 **체크리스트 검증**이므로 짧고 빠름.
- 종료: ① pass → resolved, 원래 CMO task 재개(결과 주입) ② 예산 소진 → `escalate_founder`.
- **결정론**: 루프 제어·종료는 코드, LLM은 "제작"과 "채점"에만. → 매 반복 CEO 비용 0.

## 4. 데이터 모델 — `executive_delegations`
```
id              uuid pk
from_agent      text            # 요청 임원 (CMO)
to_agent        text            # 수행 임원 (CTO)
origin_task_id  uuid            # CMO 원래 task (재개 대상)
work_task_id    uuid            # 생성된 CTO task (round마다 reissue)
objective       text
acceptance_criteria jsonb       # string[]
status          text            # open | in_progress | awaiting_founder | resolved | escalated
round           int  default 0
max_rounds      int  default 3
last_feedback   text
business_id     text
created_at / updated_at
```
- `CREATE TABLE IF NOT EXISTS` 자동(기존 `executive_consultations` 패턴).
- resolved 시 origin task에 결과를 recalledInsights로 주입해 CMO 재개.

## 5. 안전장치
- **루프 예산** `max_rounds`(기본 3, 상한 5) — 무한루프·비용 폭주 차단.
- **수용 기준 필수** — 없으면 위임 거부(검증 기준 없는 무한 수정 방지).
- **승인 게이트 유지** — 위임이 외부 실행/결제/고위험을 유발하면 창업자 승인 후에만 진행.
- **계측** `L5_DELEGATION_DEBUG=1` → 라운드별 verdict/feedback stderr (tool-loop 계측과 동일 패턴).
- **격리** — 모든 LLM 호출은 기존 claude-cli(MCP off) 경유. [[l5-claude-cli-tool-loop]]

## 6. 구현 슬라이스 (의존순)
- **D1** `ask_executive` 도구 (l5-core 순수 + 단위 테스트) — ask_founder 복제. ← **착수**
- **D2** `executive_delegations` 컬렉션 + plugin propose 콜백(위임 레코드 생성 + origin task needs_review).
- **D3** CEO 위임 오케스트레이션: 레코드 → CTO task 생성(decomposer 재사용) + 승인 게이트.
- **D4** `runDelegationLoop` 컨트롤러 (l5-core 순수, 결정론, 예산/종료) + `verifyByRequester` + 단위 테스트.
- **D5** plugin 구동: CTO done → 루프 컨트롤러 → resolved 시 origin task 재개, escalate 시 창업자 알림.
- **D6** E2E + 라이브 검증(CMO→ask_executive→CTO 제작→CMO 검증→재개), 문서 업데이트.

## 7. Done When
각 슬라이스: 단위 테스트 통과 + tsc 0 + (plugin이면) node --check. M6 전체: 라이브로 1회 위임 루프가 pass 또는 예산소진까지 도는 것 확인 + `docs/HANDOFF.md`/`docs/DECISIONS.md` 갱신.
