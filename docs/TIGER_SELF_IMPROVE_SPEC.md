# TIGER_SELF_IMPROVE_SPEC — 호랑이(Tiger) 자가개선 루프

> 정식 기획·기술 SPEC. Nous Hermes 외부 에이전트의 "데이터가 알아서 축적되고 알아서 개선되는" 자가개선 루프를 **OpenAI 의존 없이** L5 Business OS(pulk) 안에서 재현한다. 코드네임 **호랑이(Tiger)**.
>
> 본 문서는 subagent team 병렬 설계(6개 영역) 산출물을 종합한 것이다. 작성 2026-06-11.

## 0. 개요 · 확정 결정

### 0.0 최상위 원칙 — 무인 자율(zero-touch) ★ 1순위 가치
사장님이 매번 설정·개입하지 않아도 회복 루프가 **알아서 굴러가는 것**이 이 기능의 최우선 가치(2026-06-11 사장님 명시). 모든 설계 결정은 이 원칙에 종속한다.
- 매일 03:00 launchd 자동 실행. 어떤 단계가 실패해도 죽지 않고 다음날 재가동(never-throw, `cmo-strategy-watch` 패턴).
- 새 도구는 **레지스트리에 1줄 등록**하면 수집·분석·디스패치 전 경로에 자동 편입(레지스트리 주도 설계).
- 사장님 개입은 **'개선 카드 일괄 승인' 한 지점에만.** 그 외 수집·분석·실행·검증·학습축적은 전부 자동.
- 수집은 **A(도구에 구조화 실패로그 심기) + B(있는 산출물/태스크/제보) 둘 다.** 도구 수가 적어 A도 가능 → A로 수동 제보 의존을 줄여 자율성을 높인다.

### 0.1 한 줄 루프 (하루 1바퀴)
1. 전 임원(CEO·CMO·CTO·CFO·CRO·CPO·COO…)이 각자 워크플로우/도구를 실행하며 오류·병목이 발생
2. **[수집기]** cross-repo 수집기가 도구 레지스트리를 순회하며 임원·도구·repo별 병목 후보를 모음
3. **[호랑이 두뇌]** Claude가 후보를 분석해 "문제 → 근본원인 → 해결예정 → 예상공수 → 대상repo" 개선 카드를 작성
4. **[UI]** founder-ui 사이드바 '🐯 자가개선' 메뉴에 카드로 노출(문제/해결안/대상repo/체크박스)
5. 사장님이 카드를 체크박스로 다중선택 → **일괄 승인** (이 게이트 전엔 코딩 시작 안 함)
6. 승인분이 대상 repo와 함께 CTO로 전달 → CTO가 **repo별 병렬 코딩 → merge 게이트 → e2e → QA**
7. 결과(성공/실패)를 `MemoryEntry(category: bpr/failure)`로 축적 → 다음날 3의 분석 입력 품질을 높임 (자가개선)

### 0.2 확정 결정사항
| 항목 | 결정 |
|---|---|
| 판단 두뇌 | **B안 = Claude 전담.** OpenAI 절대 미사용(토큰 0). Claude CLI 무제한 허용. |
| 수집 범위 | 전 임원 · 워크플로우 전체 · **cross-repo** (다른 repo의 외부 도구까지 개선 대상) |
| 수집 소스 | (1) 각 도구 repo의 로그/실행기록 어댑터 + (2) 사장님 수동 제보. 호랑이가 repo를 풀스캔하지는 않음 |
| 승인 | 체크박스 다중선택 → 일괄 승인. 위험도 D1~D2. |
| 실행기 | **Native Orchestration(Claude CLI 직접 spawn).** ★ ACR(agent_control_room_docs)은 은퇴 — 개선 대상·실행기 어디에도 넣지 않음 |
| 수집 1차 범위 | **B 즉시가동 + A 병행** (2026-06-11 확정). B=있는 산출물(outputs/jobs)+agent_tasks 실패+native_phase_runs+수동제보로 첫날 cross-repo 가동. A=도구가 적으니 각 도구에 구조화 실패로그(jsonl) 심어 수동 의존 제거(무인 자율↑). 둘 다 M1~M2에 |
| 야간 분석 시각 | **새벽 03:00** (2026-06-11 확정). 밤사이 누적 분석 → 아침 기상 시 개선 카드 준비됨. launchd `com.l5.hermes.night-bpr-loop` |
| 분석 모델 | **적응형** (2026-06-11 확정). 후보 난이도 휴리스틱으로 어려우면 opus, 쉬우면 sonnet 선택. night-bpr-loop가 후보 수/근본원인 복잡도로 판정 |

### 0.3 재활용하는 기존 인프라 (새로 만들지 않음, 연결만)
- 데이터 모델: `packages/l5-core/src/types/entities.ts` (BPRLog, WorkflowImprovementProposal, MemoryEntry, HermesAlert)
- 승인→CTO 전송: `apps/founder-ui/src/app/tool-requests/page.tsx` self_mod_status → `services/hermes-runtime` task-dispatcher
- 임의 repo 병렬 실행+검증: `services/agent-runtime/src/orchestrator/native-orchestrator.ts` (intent.project_path, parallel_patch_queue, qa 런타임, worktree 격리+merge 게이트)
- 사이드바: `apps/founder-ui/src/components/Sidebar.tsx` NAV_TOOLS
- cron: launchd `com.l5.hermes.*`
- "감지→카드→텔레그램" 본보기: `services/hermes-runtime/src/tasks/cmo-strategy-watch.ts`
- 호랑이 두뇌 자리(현재 TODO 스텁): `services/hermes-runtime/src/loops/night-bpr-loop.ts`

### 0.4 신규 4개
1. 임원→도구→repo 레지스트리  2. cross-repo 수집기  3. 호랑이 분석 엔진(night-bpr-loop 본체)  4. 자가개선 페이지(/self-improve)

---

---

## 호랑이 도구 레지스트리 (Improvement Target Registry)

호랑이 루프 2단계(cross-repo 수집기)가 "어떤 임원의 어떤 도구가, 어느 repo에 살고, 어느 로그/실행기록을 긁어야 하는지"를 알아야 한다. 이 레지스트리가 그 단일 진실원(static source of truth)이다. NocoBase 컬렉션이 아니라 **l5-core의 순수 타입 + 상수 배열**로 둔다(확정 목록이고, 코드가 함께 배포되며, 단위테스트로 무결성을 검증할 수 있기 때문).

### 1. 위치 / 네이밍 (프로젝트 컨벤션 준수)

실재하는 코드를 확인해 다음에 맞췄다.

- 타입은 모두 `packages/l5-core/src/types/entities.ts`에 `interface ... extends CommonFields` 형태로 모여 있다. 단, 이 레지스트리 엔트리는 DB 행이 아니라 정적 카탈로그이므로 `CommonFields`(id/created_at/updated_at)를 **상속하지 않는다**. 대신 `RepetitionDetection` 류와 동일하게 "Scoring/판단용 plain interface"로 둔다.
- 임원 role 타입은 신규로 만들지 않고 **기존 `AgentRole`을 재사용**한다 (`packages/l5-core/src/types/orchestration.ts`, 값: `'CEO' | 'ChiefOfStaff' | 'CMO' | 'CRO' | 'CPO' | 'CTO' | 'COO' | 'CFO' | 'RiskQA' | 'Culture'`).
- 정적 상수 배열의 선례는 `packages/l5-core/src/functions/cmo-orchestrator/skill-registry.ts`, `.../executive-runtime/tools/registry.ts`다. 동일 패턴으로 `functions/tiger/tool-registry.ts`에 둔다.

| 산출물 | 경로 |
|---|---|
| 엔트리 타입 `ImprovementTargetEntry` | `packages/l5-core/src/types/entities.ts` (기존 엔티티 옆) |
| 등록 상수 `IMPROVEMENT_TARGET_REGISTRY` + 조회 헬퍼 | `packages/l5-core/src/functions/tiger/tool-registry.ts` |
| 무결성 단위테스트 | `packages/l5-core/src/functions/tiger/__tests__/tool-registry.test.ts` |
| index re-export | `packages/l5-core/src/index.ts`에 `export * from './functions/tiger';` 추가 |

### 2. 엔트리 타입 정의

```ts
// packages/l5-core/src/types/entities.ts
import type { AgentRole } from './orchestration';

/** repo_path 해석 규칙: 'pulk-relative'는 pulk 레포 루트 기준 상대경로,
 *  'absolute'는 호스트 절대경로(외부 repo). 수집기/CTO 디스패치가
 *  cwd를 결정할 때 이 구분으로 절대경로를 만든다. */
export type RepoPathKind = 'pulk-relative' | 'absolute';

export interface ImprovementTargetEntry {
  /** 안정적 식별자(스네이크). MemoryEntry.searchable_tags, BPRLog 연결에 사용. */
  id: string;
  /** 담당 임원 role (기존 AgentRole 재사용). */
  owner: AgentRole;
  /** 사람이 읽는 도구명. founder-ui 카드 라벨로 노출. */
  tool: string;
  /** 'pulk-relative' | 'absolute' — repo_path 해석 규칙. */
  repo_path_kind: RepoPathKind;
  /** kind에 따라 pulk 루트 상대경로 또는 호스트 절대경로. */
  repo_path: string;
  /** 수집기가 긁을 로그/실행기록 경로 패턴(repo_path 기준 상대 glob). */
  error_sources: string[];
  /** 사장님 수동 제보만 받는 도구인지(자동 로그 어댑터 없음). */
  manual_intake: boolean;
}
```

설계 메모:
- `error_sources`는 **repo_path 기준 상대 glob 배열**로 둔다. 절대경로 중복을 피하고, `repo_path_kind`로 한 번만 절대화한다.
- `manual_intake: true`인 엔트리는 자동 로그 어댑터가 없어 사장님 수동 제보(수집 소스 2)로만 후보가 들어온다. `error_sources`가 비어도 유효.
- 외부 액션 위험도(D1~D2)는 엔트리가 아니라 카드 생성 단계(WorkflowImprovementProposal/AgentTask)에 부여한다 — 레지스트리는 정적 카탈로그라 위험도 필드를 갖지 않는다.

### 3. 조회 헬퍼 (tool-registry.ts)

```ts
export function listImprovementTargets(): ImprovementTargetEntry[];
export function getImprovementTarget(id: string): ImprovementTargetEntry | undefined;
export function targetsForOwner(owner: AgentRole): ImprovementTargetEntry[];
/** repo_path_kind를 반영해 절대 repo 경로로 변환. pulkRoot는 호출측이 주입. */
export function resolveRepoAbsPath(entry: ImprovementTargetEntry, pulkRoot: string): string;
```

`resolveRepoAbsPath`: `kind==='absolute'`면 `repo_path` 그대로, `'pulk-relative'`면 `path.join(pulkRoot, repo_path)`. 수집기와 CTO 디스패치가 동일 규칙을 쓰도록 한 곳에 둔다(NocoBase 비의존, `path`만 import).

### 4. `fetchBusinessRepoPaths`와의 관계 정리 (중복 아님, 직교)

실재 코드 확인(`services/hermes-runtime/src/api/nocobase-client.ts:142`):

```ts
// business_id → repo_path 동적 맵. CTO dispatch cwd 해석용.
export async function fetchBusinessRepoPaths(): Promise<Record<string, string>>
```

두 매핑은 키도 출처도 다르다 — 합치지 않는다.

| 항목 | `fetchBusinessRepoPaths()` | `IMPROVEMENT_TARGET_REGISTRY` |
|---|---|---|
| 키 | `business_id`(NocoBase `businesses` 행) | `id`(임원·도구 단위, 정적) |
| 출처 | 런타임 DB(`/api/businesses:list`) | 코드 상수(l5-core) |
| 단위 | 비즈니스 1개 = repo 1개 | 도구 1개 = repo 1개(여러 도구가 같은 repo 공유 가능) |
| 가변성 | 사장님이 NocoBase에서 수정 | 코드 배포로만 변경 |
| 용도 | 기존 CTO 디스패치 cwd | 호랑이 수집 대상 + 개선 후 CTO 디스패치 cwd |

연결 규칙(승인분이 CTO로 넘어갈 때):
1. 호랑이가 만든 카드는 `target_id`(레지스트리 id)를 보유.
2. 디스패처가 카드 → AgentTask/ACRIntent 변환 시, **`resolveRepoAbsPath(entry, pulkRoot)`로 절대경로를 산출해 `ACRIntent.project_path`에 직접 싣는다**(`packages/l5-core/src/types/acr-intent.ts:36`, "Absolute path to the project working directory"). 이 경로가 있으면 `native-orchestrator.ts:445`의 `const repo = intent.project_path`가 그대로 cwd로 사용한다.
3. 따라서 호랑이 경로는 `business_id` 매핑을 **거치지 않는다**. 외부 repo(`ai-slide-video-factory` 등)는 `businesses` 행이 없으므로 `fetchBusinessRepoPaths`로는 애초에 해석 불가 — 레지스트리가 그 공백을 메운다.

> 정합성 단위테스트: 모든 `repo_path_kind==='pulk-relative'` 엔트리의 경로가 실재 디렉터리인지(레포 내), `'absolute'` 엔트리가 절대경로 형식인지, `owner`가 `AgentRole` 멤버인지, `id` 유일성을 검증.

### 5. 등록 초안 테이블 (9개 도구, ACR 제외)

`error_sources`는 repo_path 기준 상대경로. 실제 로그 위치가 아직 미확정인 항목은 open question으로 분리.

| id | owner | tool | repo_path_kind | repo_path | error_sources (repo 상대) | manual_intake |
|---|---|---|---|---|---|---|
| `cmo_slide_video_factory` | CMO | AI 슬라이드/영상 팩토리 | absolute | `/Users/wonminyang/ai-slide-video-factory` | `outputs/**/*.json`, `jobs/**/*.json` (표준 logs/ 없음 — 산출물/잡 상태 어댑터 필요) | true |
| `cmo_viewtrap_youtube` | CMO | viewtrap/유튜브 발굴 | pulk-relative | `services/youtube` | `logs/**/*.log`, `.l5/cdp/*.log` | true |
| `cmo_video_room` | CMO | 영상룸 | pulk-relative | `apps/founder-ui` | `.next/trace`, `e2e/artifacts/**/error*` | false |
| `cmo_key_content_report` | CMO | 키 콘텐츠 보고서 | pulk-relative | `packages/l5-core` | `**/__tests__/**/*video-room*`, (런타임 trace 미정) | false |
| `cto_native_orchestration` | CTO | Native Orchestration | pulk-relative | `services/agent-runtime` | `**/orchestrator/runs/**/*.json`, `logs/native-orch-*.log` | false |
| `cto_hermes_runtime` | CTO | Hermes 런타임 | pulk-relative | `services/hermes-runtime` | `logs/hermes-*.log`, `**/loops/**/*.result.json` | false |
| `ceo_daily_brief` | CEO | 데일리 브리프 | pulk-relative | `services/hermes-runtime` | `logs/daily-brief-*.log` | false |
| `cfo_cost_metrics` | CFO | 비용/지표 집계 | pulk-relative | `packages/l5-core` | `**/__tests__/**/*cost*`, (집계 런타임 로그 미정) | true |
| `cro_signal_intake` | CRO | (확장 슬롯) | pulk-relative | `packages/l5-core` | — | true |

> 주: 확정 목록은 8개 도구 + CRO 확장 슬롯이다. CRO 도구가 아직 미지정이라 `manual_intake:true`로만 두고 자동 어댑터는 비활성. CPO/COO는 도구가 확정될 때 같은 형식으로 append.

### 6. 다음 영역(수집기·호랑이 두뇌)으로의 계약

- 수집기는 `listImprovementTargets()` → 각 엔트리에 대해 `resolveRepoAbsPath` + `error_sources` glob 스캔(자동) + 수동 제보 병합. 산출 후보는 `BPRLog`(bottleneck_description/root_cause/proposed_solution) 또는 `HermesAlert(alert_type:'bpr_required')`로 적재.
- 호랑이 두뇌(`services/hermes-runtime/src/loops/night-bpr-loop.ts`, 현재 TODO 스텁)가 후보 → 개선 카드(`WorkflowImprovementProposal`)로 승격. 카드에 `target_id`(레지스트리 id)를 실어 디스패치 단계에서 `project_path`를 재해석할 수 있게 한다.


---

## 1. 목적과 경계

호랑이 루프의 2단계("cross-repo 수집기가 레지스트리를 순회하며 임원·도구·repo별 오류·병목 후보를 모음")를 담당한다. 이 수집기는 **판단하지 않는다** — 원시 신호(로그/태스크/제보)를 표준 형태의 *병목 후보(BottleneckCandidate)* 리스트로 정규화·중복제거·집계하는 데서 멈춘다. "문제→근본원인→해결예정→공수→대상repo" 개선 카드 작성은 다음 단계(3, Claude 두뇌, `night-bpr-loop.ts`)의 입력으로 넘긴다.

설계 원칙(CLAUDE.md 준수):
- **순수 도메인 로직은 `packages/l5-core`** 에 둔다. NocoBase·fs·fetch 비의존, 입력은 배열, 출력은 배열. 모든 집계/스코어 룰은 단위테스트.
- **I/O는 hermes-runtime 어댑터**가 담당(repo별 로그 읽기, agent_tasks fetch, 수동 제보 읽기). `cmo-strategy-watch.ts`의 `deps` 주입 + graceful(never throw) 패턴을 그대로 따른다.
- ACR(agent_control_room_docs)은 레지스트리·소스 어디에도 넣지 않는다(은퇴 확정).

이 영역은 **수집기까지만** 설계한다. 호랑이 두뇌(분석)·카드 UI·승인→CTO 전송은 다른 영역 담당.

## 2. 데이터 흐름 (한 장)

```
[레지스트리 ToolRegistry]
   │  순회
   ▼
[I/O 어댑터들 (hermes)]                         [l5-core 순수함수]
  collectToolLogs(adapter) ─ 원시 RawSignal[] ─┐
  fetchAgentTasks() (기존) ─ AgentTask[] ──────┼─► collectBottlenecks(input) ─► BottleneckCandidate[]
  readManualReports()      ─ ManualReport[] ───┘        (정규화·dedup·집계·우선순위)
                                                              │
                                                              ▼
                                              night-bpr-loop.ts (호랑이 두뇌, 다음 단계 입력)
```

## 3. l5-core 순수함수 (신규 모듈: `tiger-collector`)

신규 디렉터리 `packages/l5-core/src/functions/tiger-collector/` (기존 `cmo-strategy/`, `monitor/` 구조와 동일: `index.ts` + `types.ts` + 로직 + `__tests__/`). `src/index.ts`에 `export * from './functions/tiger-collector'` 추가.

### 3.1 입력 타입

```ts
// 도구별 어댑터가 로그를 정규화해 내보내는 단일 원시 신호.
// 로그 경로/포맷이 제각각인 문제를 "어댑터가 RawSignal로 변환"하는 것으로 흡수한다.
export interface RawSignal {
  source: 'tool_log' | 'agent_task' | 'manual_report';
  tool_id: string;            // ToolRegistry.id (예: 'ai-slide-video-factory')
  executive: ExecutiveRole;   // 'CEO'|'CMO'|'CTO'|'CFO'|'CRO'|'CPO'|'COO'
  repo: string;               // 절대경로 또는 'pulk' (project_path 매핑 키)
  kind: 'error' | 'bottleneck' | 'retry' | 'stall' | 'manual';
  message: string;            // 사람이 읽는 한 줄 요약
  detail?: string;            // 스택트레이스/추가맥락 (PII 분리 위해 raw는 여기만)
  occurred_at: string;        // ISO
  fingerprint?: string;       // 어댑터가 줄 수 있으면; 없으면 함수가 계산
  pii_level?: PIILevel;       // 기본 'none'. high면 detail 마스킹 후 다음단계 전달
  ref?: string;               // 원본 위치(로그라인/task id/제보 id)
}

export interface CollectBottlenecksInput {
  signals: RawSignal[];       // 모든 어댑터 출력 합본
  agentTasks: AgentTask[];    // 기존 fetchAgentTasks() 결과 (l5-core AgentTask)
  now: string;               // 결정론용 현재시각 ISO (stalled-task-detector와 동일 관례)
  overdueThresholdMs?: number; // 기본 24h (stalled-task-detector OVERDUE_THRESHOLD_MS 재사용)
  minOccurrences?: number;    // 집계 시 후보로 승격할 최소 발생 수 (기본 1)
}
```

`AgentTask`(`@l5/core`, `orchestration.ts`)는 `status: 'queued'|'running'|'blocked'|'needs_review'|'done'|'killed'`, `assigned_agent: AgentRole`, `business_id`, `updated_at` 보유 → `agentTasks`를 함수 내부에서 RawSignal(kind `stall`/`retry`)로 변환하므로 어댑터가 별도로 만들 필요 없음. `blocked` + `updated_at` 24h 초과 판정은 `stalled-task-detector.ts` 로직(`now - lastActivity > threshold`)을 그대로 차용.

### 3.2 출력 타입

```ts
export interface BottleneckCandidate {
  fingerprint: string;        // dedup 키 (tool_id + normalized message)
  executive: ExecutiveRole;
  tool_id: string;
  repo: string;
  kind: RawSignal['kind'];
  title: string;              // 대표 메시지
  occurrences: number;        // 묶인 신호 수
  first_seen: string;
  last_seen: string;
  sources: Array<{ source: RawSignal['source']; ref?: string }>;
  sample_detail?: string;     // PII 마스킹된 대표 detail (호랑이 분석 입력)
  max_pii_level: PIILevel;
  priority_score: number;     // 0~100, 결정론적
  related_task_ids: string[]; // agent_task 기반이면 채움
  related_business_ids: string[];
}

export interface CollectBottlenecksResult {
  collected_at: string;
  total_signals: number;
  candidates: BottleneckCandidate[]; // priority_score desc 정렬
  by_executive: Record<string, number>;
  dropped_pii: number;        // pii_level=high로 detail 마스킹된 신호 수(관측용)
}

export function collectBottlenecks(
  input: CollectBottlenecksInput,
): CollectBottlenecksResult;
```

### 3.3 핵심 룰 (전부 단위테스트 필수)

1. **정규화**: agentTasks → RawSignal 변환. `blocked` → kind `stall`(`message`=blocker || title), `updated_at` 24h 초과 & 미완료 → kind `stall`(reason overdue). `needs_review` 반복(재시도 흔적)은 kind `retry`. `done`/`killed`는 제외(stalled-task-detector와 동일 필터).
2. **fingerprint**: `fingerprint` 미지정 시 `tool_id + '|' + normalize(message)`. normalize = 소문자화 + 숫자/UUID/경로/타임스탬프를 플레이스홀더로 치환(동일 에러의 변수부 제거). → 같은 근본원인 신호가 한 후보로 묶임.
3. **집계**: fingerprint로 group → occurrences/first_seen/last_seen/sources 합산. `minOccurrences` 미만은 후보에서 제외.
4. **priority_score** (결정론, 0~100): `kind` 가중(error/stall > retry > manual·bottleneck) + `occurrences` 로그스케일 + `recency`(last_seen가 now에 가까울수록↑) + `max_pii_level` 미세 감점(고PII는 신중). 가중치는 모듈 상수 + 테이블 테스트.
5. **PII 분리**(CLAUDE.md): `pii_level='high'` 신호의 `detail`은 `sample_detail`에 그대로 싣지 않고 마스킹 후 싣는다. `max_pii_level`로 다음단계가 LLM 전송여부 판단(고객 PII를 Claude로 보내지 않음). `dropped_pii` 카운트.
6. **manual_report**는 항상 후보로 승격(사장님 제보는 노이즈 아님), priority 가산.

## 4. I/O 어댑터 추상화 (hermes-runtime, "경로 제각각" 문제 해결)

도구별 로그가 (a) jsonl 파일 (b) 디렉터리 (c) pulk DB(agent_tasks) (d) 없음(수동만)으로 제각각 → **어댑터 인터페이스 하나 + 도구별 구현 + 레지스트리**로 흡수. `cmo-strategy-watch.ts`의 "deps 주입 + 경로는 env override + 실패해도 throw 안 함" 패턴을 그대로 적용.

### 4.1 레지스트리 (신규: `services/hermes-runtime/src/tiger/registry.ts`)

확정 도구 목록을 코드 상수로. ACR 제외.

```ts
export interface ToolRegistryEntry {
  id: string;                 // 'ai-slide-video-factory' 등
  executive: ExecutiveRole;
  repo: string;               // 절대경로 또는 'pulk'
  workflow: string;           // 'AI 슬라이드/영상 팩토리' 등 (카드 표시용)
  adapter: LogAdapterKind;    // 어떤 어댑터로 읽는가
  logPathEnv?: string;        // 경로 override env 키 (cmo-strategy-watch 관례)
  defaultLogPath?: string;    // 기본 로그 경로 (jsonl/dir)
}
export type LogAdapterKind = 'jsonl' | 'dir-scan' | 'agent-tasks' | 'none';
```

레지스트리 시드(확정 목록 그대로): ai-slide-video-factory(CMO, `/Users/wonminyang/Desktop/ai-slide-video-factory`), youtube-viewtrap(CMO, pulk·services/youtube), video-room(CMO, pulk·apps/founder-ui), key-content-report(CMO, pulk·packages/l5-core), native-orchestration(CTO, pulk·services/agent-runtime), hermes-runtime(CTO, pulk·services/hermes-runtime), daily-brief(CEO, pulk·services/hermes-runtime), cost-metrics(CFO, pulk·packages/l5-core). 신규 도구는 이 배열에 한 줄 추가로 확장.

### 4.2 어댑터 인터페이스

```ts
export interface LogAdapter {
  kind: LogAdapterKind;
  /** 레지스트리 엔트리를 받아 RawSignal[]로. 절대 throw 금지 → [] 폴백 + errors 누적. */
  collect(entry: ToolRegistryEntry, ctx: AdapterCtx): Promise<RawSignal[]>;
}
export interface AdapterCtx {
  since: string;   // 이 시각 이후 신호만 (마지막 수집 스냅샷; 일 1회 윈도우)
  now: string;
}
```

구현 4종:
- **JsonlLogAdapter** (`jsonl`): 한 줄=한 이벤트인 로그를 읽어 `level in {error,warn}` 또는 `kind`/`retry` 필드를 RawSignal로 매핑. 파일 없으면 `[]`(cmo-strategy-watch의 "missing file → no-op").
- **DirScanLogAdapter** (`dir-scan`): 디렉터리 내 최신 N개 로그 파일 tail만 스캔(예: ai-slide-video-factory 외부 repo). 경로 부재 graceful.
- **AgentTasksAdapter** (`agent-tasks`): pulk DB는 기존 `fetchAgentTasks()`(`nocobase-client.ts`)를 1회만 호출해 전체를 받고, `repo==='pulk'` 도구들에 공유. (도구별 N회 호출 금지 — 태스크는 도구별로 나뉘지 않으므로 `collectBottlenecks`가 agentTasks를 통째로 받아 처리. 즉 이 어댑터는 실제로는 함수 입력으로 합류시키는 얇은 패스스루.)
- **NoneAdapter** (`none`): 항상 `[]`. 수동 제보만 있는 도구.

도구가 자체 로그 포맷을 바꾸거나 새 위치가 생기면 **어댑터 구현이 아니라 레지스트리의 `defaultLogPath`/`logPathEnv`만** 바꾼다. 포맷이 근본적으로 다르면 새 `LogAdapterKind` 한 종 추가. → "경로 제각각"이 호랑이 두뇌나 순수함수로 새지 않는다.

### 4.3 수동 제보 소스

`readManualReports()`(신규, hermes). 소스는 단순하게: 사장→텔레그램/UI가 적재하는 jsonl 한 파일(`HERMES_DIR/.omc/state/tiger-manual-reports.jsonl`, cmo-strategy-watch의 stateDir 관례 재사용). 각 줄을 `RawSignal{source:'manual_report', kind:'manual'}`로. 파일 없으면 `[]`.

### 4.4 오케스트레이션 (신규 hermes task: `tiger-collector.ts`)

`cmo-strategy-watch.ts`와 동형 구조:
```
runTigerCollector(deps):
  1. registry 순회 → 각 entry.adapter로 collect() (graceful, errors[] 누적)
  2. readManualReports()
  3. fetchAgentTasks() 1회
  4. collectBottlenecks({ signals, agentTasks, now, ... })  ← l5-core 순수함수
  5. result.candidates를 .omc/state/tiger-candidates.json + 스냅샷(since 진행)에 영속화
  6. 텔레그램 요약 1건(D1, dedupKey `tiger-collector:<date>`) — cmo-strategy-watch와 동일
  7. (다음 단계) night-bpr-loop가 tiger-candidates.json을 읽어 카드 작성
```
launchd `com.l5.hermes.*` 야간 잡으로 등록(일 1회). 위험도 D1(읽기+상태파일+알림 1건, 코드변경 없음).

## 5. 다음 단계와의 인터페이스(경계 명시)

수집기의 산출물 = `tiger-candidates.json`(`CollectBottlenecksResult`). 호랑이 두뇌(`night-bpr-loop.ts`)는 이를 입력으로 받아 Claude CLI로 분석→`BPRLog`/`WorkflowImprovementProposal`(둘 다 `entities.ts`에 이미 존재) 형태의 개선 카드 작성. 수집기는 카드 스키마·LLM 호출·승인·CTO 전송에 **관여하지 않는다**.

## 6. 미해결/결정 필요 항목은 open_questions 참조.


---

## 호랑이 분석 엔진 — `night-bpr-loop` 본체

이 영역은 수집기가 모은 **병목 후보**를 입력으로 받아, **Claude(B안 전담, OpenAI 토큰 0)**가 분석한 **개선 카드**를 생성하고, 이를 `BPRLog` + `WorkflowImprovementProposal`로 NocoBase에 저장한 뒤 텔레그램으로 알리는 야간 루프다. 승인 게이트 이전 단계이므로 **코드는 한 줄도 바꾸지 않는다**(D1: 읽기 + 카드 생성 + 알림).

현재 `services/hermes-runtime/src/loops/night-bpr-loop.ts`는 `skipped`만 반환하는 TODO 스텁이다. 아래 설계로 본체를 채운다.

### 1. 책임 경계 (CLAUDE.md 준수)

| 계층 | 위치 | 역할 |
|---|---|---|
| 순수 판단 로직 | `packages/l5-core/src/functions/tiger/*` | 후보 정규화·중복 억제·프롬프트 빌드·Claude 출력 파싱→카드 매핑 (NocoBase 비의존, 단위테스트 필수) |
| Claude 실행기 | `services/agent-runtime` 의 `buildAgentCommand`+`runAgentCommand` 재사용 | 헤드리스 Claude CLI spawn (MCP off) |
| 배선/IO | `services/hermes-runtime/src/loops/night-bpr-loop.ts` | 후보 로드 → Claude 호출 → 카드 영속화 → 텔레그램 |
| 영속화 어댑터 | `services/hermes-runtime/src/api/nocobase-client.ts` | `createBPRLog` / `createWorkflowImprovementProposal` 신규 추가 |

판단 로직(프롬프트 구성, 출력 파싱, 카드 매핑)은 전부 `l5-core/tiger`에 두고, 루프 파일은 IO 와이어링만 한다. `cmo-strategy-watch.ts`가 `cmoStrategyWatch`(l5-core) 호출 + IO만 하는 구조를 그대로 따른다.

### 2. 입출력 타입 (`packages/l5-core/src/functions/tiger/types.ts`)

수집기 영역과의 계약. 수집기가 채워주는 `BottleneckCandidate[]`를 입력으로 받는다.

```ts
// 수집기가 제공하는 병목 후보 (이 영역은 소비만; 정의는 공유)
export interface BottleneckCandidate {
  candidate_id: string;          // 안정적 dedup 키 (예: "cmo:slide-factory:render-timeout")
  executive: 'CEO'|'CMO'|'CTO'|'CFO'|'CRO'|'CPO'|'COO';
  tool: string;                  // 레지스트리 도구명 (예: "ai-slide-video-factory")
  repo_path: string;             // 대상 repo 절대경로 (cross-repo)
  source: 'log_adapter' | 'founder_manual';  // 수집 소스
  signal: string;                // 관측된 오류/병목 요지 (raw, PII 마스킹 후)
  evidence: string[];            // 로그 tail / 실행기록 발췌 (최대 N줄, 토큰 절약)
  occurrences?: number;          // 최근 발생 횟수(빈도 가중)
  first_seen?: string;
  last_seen?: string;
}

// Claude가 분석해 만든 개선 카드 (이 영역의 산출물)
export interface ImprovementCard {
  candidate_id: string;          // 출처 후보와 1:1 (dedup·역추적)
  executive: BottleneckCandidate['executive'];
  tool: string;
  repo_path: string;
  problem: string;               // 문제
  root_cause: string;            // 근본원인
  planned_fix: string;           // 해결예정
  effort_estimate: string;       // 예상공수 (예: "S/M/L" 또는 "~2h")
  impact: 'high'|'medium'|'low'; // 영향도
  risk_level: 'D1'|'D2';         // 확정: 자가개선은 D1~D2
  confidence: number;            // 0..1, Claude 자가평가
}
```

### 3. l5-core 순수 함수 (단위테스트 대상)

```ts
// prepareCandidates: 정규화 + 중복 억제 + 프롬프트 입력 슬라이스
//   - 이전 스냅샷(이미 카드화된 candidate_id)과 diff → 새/재발 후보만 통과
//   - occurrences·impact 추정으로 정렬, 상위 K개만 Claude에 투입(토큰 상한)
//   - evidence 줄수 truncate
export function prepareCandidates(
  candidates: BottleneckCandidate[],
  knownCardIds: Set<string>,
  opts?: { maxCards?: number; maxEvidenceLines?: number },
): BottleneckCandidate[];

// buildTigerPrompt: 후보 묶음 → Claude 단일 프롬프트(JSON-only 출력 강제)
export function buildTigerPrompt(candidates: BottleneckCandidate[]): string;

// parseTigerOutput: Claude stdout(JSON) → ImprovementCard[]
//   - 코드펜스/잡텍스트 제거 후 JSON 배열 추출, 스키마 검증, 잘못된 항목 drop
//   - repo_path는 후보값을 신뢰(Claude 환각 방지: 카드의 repo_path를 입력 후보로 override)
export function parseTigerOutput(
  raw: string,
  candidates: BottleneckCandidate[],
): { cards: ImprovementCard[]; dropped: number };

// cardToBPRLog / cardToProposal: 카드 → 저장 엔티티 매핑
export function cardToBPRLog(card: ImprovementCard):
  Omit<BPRLog, keyof CommonFields>;
export function cardToProposal(card: ImprovementCard):
  Omit<WorkflowImprovementProposal, keyof CommonFields>;
```

`buildTigerPrompt`는 **JSON-only**를 강제한다(파싱 안정성). 프롬프트 골자:

```
당신은 L5의 "호랑이" 자가개선 분석가다. 아래 병목 후보들을 분석해
각 후보별로 개선 카드를 JSON 배열로만 출력하라. 산문/설명 금지.
각 카드: { candidate_id, problem, root_cause, planned_fix,
  effort_estimate, impact(high|medium|low), risk_level(D1|D2), confidence(0~1) }
규칙: candidate_id는 입력값 그대로. 근본원인은 evidence에 근거. 추측이면 confidence를 낮춰라.
후보: <JSON으로 직렬화된 BottleneckCandidate[]>
```

### 4. Claude 호출 (agent-runtime spawn 패턴 재사용, OpenAI 금지)

`services/agent-runtime/src/orchestrator/spawn-agent.ts`의 `runAgentCommand`와 `packages/l5-core/.../cto-native/cli-command.ts`의 `buildAgentCommand`를 **그대로 재사용**한다. claude-code 경로는 `cmd:'claude', args:['-p', prompt], stdinNull:false`로 spawn된다(이미 검증된 헤드리스 패턴, claude 자체 3s stdin 타임아웃으로 진행).

루프 내 호출:

```ts
import { buildAgentCommand } from '@l5/core/dist/functions/cto-native/cli-command.js';
import { runAgentCommand } from '../../../agent-runtime/dist/orchestrator/spawn-agent.js';
// (또는 spawn-agent를 hermes에서 import할 수 있게 얕은 wrapper를 hermes/src/api/claude-cli.ts로 둔다)

const cmd = buildAgentCommand({
  agent: 'claude-code',
  prompt: buildTigerPrompt(slice),
  cwd: process.env.PULK_ROOT ?? process.cwd(), // 분석 전용 — 코드 안 건드림
  // model 생략 시 CLI 기본. 분석은 가벼우니 model: 'claude-sonnet-4-6' 권장(비용↓)
});
const { exitCode, stdout, stderr } = await runAgentCommand(cmd, {
  timeoutMs: 180_000,
  onLog: (l) => console.log('[tiger]', l),
});
```

- **MCP off / 헤드리스**: `claude -p`는 비대화형 단발 실행이라 슬래시커맨드·인터랙티브 없음. MCP는 spawn env에서 비활성(기존 메모리 "claude CLI는 MCP off로 spawn" 준수). 필요 시 spawn env에 MCP 비활성 플래그를 cli-command 레이어가 아닌 hermes wrapper에서 주입.
- **never-throw**: `runAgentCommand`는 reject하지 않고 `exitCode`로 환원(124=timeout, 1=spawn 실패). 루프는 exitCode≠0이면 카드 0개로 graceful skip + 에러 누적.
- **OpenAI 절대 미사용**: 호출 경로 어디에도 OpenAI SDK/엔드포인트 없음. 판단 두뇌는 Claude CLI 단일.
- **import 경계 주의**: hermes가 agent-runtime의 `spawn-agent`를 직접 dist import하면 monorepo 의존이 늘어난다. **권장**: `runAgentCommand`를 ~50줄로 hermes `src/api/claude-cli.ts`에 그대로 이식(spawn-agent.ts는 의존성 없는 순수 child_process). 이는 cto-native가 ACR spawn-runner를 이식한 선례와 동일 패턴. (open question 참조)

### 5. 영속화 — BPRLog + WorkflowImprovementProposal

`nocobase-client.ts`에 두 create 어댑터를 **신규 추가**(현재 없음). 기존 `createAgentTask`/`saveFounderMemory`의 `apiFetch + randomUUID + created_at/updated_at` 패턴을 그대로 따른다. NocoBase camelCase 함정 회피를 위해 `createdAt/updatedAt`도 함께 보낸다.

```ts
export async function createBPRLog(
  payload: Omit<BPRLog, 'id'|'created_at'|'updated_at'>,
): Promise<string> {
  const now = new Date().toISOString();
  const data = await apiFetch('/api/bpr_logs:create', {
    method: 'POST',
    body: JSON.stringify({ id: randomUUID(), ...payload,
      created_at: now, updated_at: now, createdAt: now, updatedAt: now }),
  });
  return data.data?.id ?? data.id;
}

export async function createWorkflowImprovementProposal(
  payload: Omit<WorkflowImprovementProposal, 'id'|'created_at'|'updated_at'>,
): Promise<string> { /* 동일 패턴, /api/workflow_improvement_proposals:create */ }
```

카드→엔티티 매핑(l5-core `cardToBPRLog`/`cardToProposal`):

| ImprovementCard | BPRLog | WorkflowImprovementProposal |
|---|---|---|
| `problem` | `bottleneck_description` | `identified_bottleneck` |
| `root_cause` | `root_cause` | (current_process에 컨텍스트) |
| `planned_fix` | `proposed_solution` | `proposed_improvement` |
| `impact` | `impact` | (effort_to_implement 옆 메모) |
| `effort_estimate` | — | `effort_to_implement` |
| `executive` | `owner_agent_id` | `suggested_by_agent_id`='Tiger' |
| `candidate_id` | (status='identified') | (status='proposed') |
| `repo_path` | — | `related_workflow_id`로는 부적합 → 카드 메타로 별도 보관 |

`repo_path`는 승인→CTO 전송 시 `intent.project_path`로 native-orchestrator에 전달되어야 하는 핵심 값이다. 두 엔티티 스키마 모두 repo_path 필드가 없으므로, **승인 흐름이 읽을 수 있도록 카드 원본을 state 파일**(`tiger-cards-<date>.json`, candidate_id↔repo_path 맵 포함)로 저장한다. cmo-strategy-watch가 `discoveryPath`에 raw diff를 남기는 선례와 동일. (open question 참조 — repo_path를 어디에 정규화 저장할지)

생성된 카드는 founder-ui '🐯 자가개선' 메뉴(다른 영역 담당)가 `WorkflowImprovementProposal`(status='proposed') 목록으로 렌더한다.

### 6. MemoryEntry 피드백 (다음날 분석 품질↑)

루프 시작 시 전날 결과를 학습 입력으로 받는다:
- 입력: `MemoryEntry`(category `bpr`/`failure`)를 NocoBase에서 로드 → 프롬프트에 "과거에 같은 후보가 이렇게 해결/실패했다" 컨텍스트로 주입(`prepareCandidates`가 knownCardIds + 과거 결과를 받음).
- 출력: 이번 루프가 카드를 생성하면 즉시 `MemoryEntry`(category `bpr`, `reusability_score` 채움, `pii_level='none'`, `approval_status='pending'`)도 같이 적재 → 7단계 학습 루프 폐회로. (실제 성공/실패 결과 적재는 CTO 실행 후 별도 영역; 여기서는 "카드 발행" 사실만 기록)

### 7. 루프 본체 흐름 (`night-bpr-loop.ts` — cmo-strategy-watch 골격)

deps 주입형(테스트 가능). `runNightBPRLoop(context)`는 내부에서 `runTigerAnalysis(deps)`를 호출하고 `LoopResult`로 환원.

```
1. 후보 로드        수집기 산출 state 파일 읽기 (없으면 graceful skip)
2. 과거 학습 로드   MemoryEntry(bpr/failure) + 전날 카드 state(knownCardIds)
3. prepareCandidates → 새/재발 후보 상위 K개 (없으면 silent skip)
4. buildTigerPrompt → runAgentCommand(claude) → stdout
5. parseTigerOutput → ImprovementCard[] (repo_path는 후보값으로 override)
6. 각 카드: createBPRLog + createWorkflowImprovementProposal + (선택)MemoryEntry
7. tiger-cards-<date>.json state 저장(candidate_id↔repo_path)
8. 텔레그램: 카드 N건 요약 + "🐯 자가개선에서 승인하세요" (dedupKey `tiger:<date>`)
9. LoopResult{ status, summary, actions: ['await-founder-approval'] }
```

`runNightBPRLoop`의 `LoopResult` 매핑: 카드 생성=`ok`, 후보 없음=`skipped`, Claude/IO 에러 누적=`error`. 모든 IO는 try/guard(never-throw), 오프라인 안전.

### 8. 스케줄 (launchd 야간 잡)

기존 `com.l5.hermes.*` launchd에 야간 슬롯 추가. 수집기가 먼저 돌고(병목 후보 적재), 그 다음 호랑이가 분석하도록 **수집기 직후** 순서 보장(예: 02:00 수집 → 02:10 night-bpr-loop). cmo-strategy-watch가 09:05(self-learning 직후)에 배치된 선례와 동일한 순서 의존 패턴.

### 9. 검증 (40-verification-policy: API 유형)

- `pnpm typecheck` · `pnpm build`
- l5-core `tiger` 단위테스트 **필수**(scoring/판단 룰): `prepareCandidates`(dedup·정렬·truncate), `parseTigerOutput`(JSON 추출/스키마검증/repo_path override/잡텍스트 내성), `cardToBPRLog`/`cardToProposal` 매핑.
- 루프 테스트: deps mock(가짜 후보 + 가짜 Claude stdout + 메모리 telegram/create stub)으로 cmo-strategy-watch.test.ts 패턴 재사용 — 카드 생성/skip/error 경로 + never-throw.
- Claude 호출은 단위테스트에서 `runAgentCommand`를 주입형 deps로 stub(실제 spawn 금지).


---

## 자가개선 사이드바 페이지 (`/self-improve`)

호랑이(Claude) 두뇌가 작성한 개선 카드를 **표시 → 다중선택 → 일괄 승인하여 CTO Native Orchestration으로 dispatch**하는 화면. 도메인 로직은 일절 넣지 않는다(카드 생성/근본원인 분석/공수추정은 모두 백엔드 호랑이 루프 소산). 이 페이지의 책임은 **표시(badge) · 선택(checkbox) · 전송(bulk dispatch)** 뿐이다. 기존 `tool-requests/page.tsx`의 `self_mod_status` 단건 흐름을 N건 일괄로 일반화한 것이다.

### 1. 데이터 형태 — `SelfImproveCard`

호랑이 루프가 `WorkflowImprovementProposal`(packages/l5-core entities) 단위로 카드를 적재한다. UI는 아래 평탄화된 read 타입만 소비한다(도메인 필드를 UI에서 가공하지 않음). 기존 `ToolRequestItem`을 본떠 `apps/founder-ui/src/lib/api.ts`에 추가:

```ts
// 호랑이 자가개선 카드 — 호랑이 루프가 생성, UI는 표시/선택/전송만.
// shape는 l5-core WorkflowImprovementProposal 도메인 계약의 평탄화 read 뷰.
export type SelfImproveCard = {
  proposal_id: string            // = WorkflowImprovementProposal.id (dispatch 키)
  executive: string              // 'CMO' | 'CTO' | 'CFO' | 'CRO' | 'CEO' | 'COO' | ...
  tool_label: string             // 레지스트리상 도구명 e.g. 'AI 슬라이드/영상 팩토리'
  problem: string                // identified_bottleneck (현상)
  root_cause: string | null      // 호랑이 분석 근본원인
  proposed_fix: string           // proposed_improvement (해결예정)
  effort_estimate: string | null // effort_to_implement e.g. '~2h', 'C2'
  // ── cross-repo 타겟 (★ 단건 sendToCTO는 origin task에서 project_id를 끌어왔지만
  //    자가개선은 다른 repo를 고치므로 카드가 명시적 절대경로를 들고 있어야 한다)
  target_repo: string            // 절대경로 e.g. '/Users/.../ai-slide-video-factory' | '<pulk-root>'
  target_repo_label: string      // 표시용 e.g. 'ai-slide-video-factory' | 'pulk · services/youtube'
  risk_level: 'D1' | 'D2'        // 자가개선은 D1~D2 고정(확정 결정사항)
  source: 'log_adapter' | 'founder_report'  // 수집 소스 배지
  self_mod_status?: string | null  // null=미전송 | 'sent' | 'in_progress' | 'applied' | 'rejected'
  created_at: string
}
```

> 함정 메모: NocoBase 정렬은 `createdAt`(camelCase). 백엔드 list 핸들러는 `sort=-createdAt`. `created_at`로 정렬하면 조용히 빈 배열(rule 60-nocobase). UI는 `created_at`을 읽기만 함.

### 2. API 계약 — `api.ts`에 2개 추가

기존 `listToolRequests` / `sendToolRequestToCTO` 패턴을 그대로 따른다. `unwrap()` 사용, 실패 시 빈 배열 fallback.

```ts
// 호랑이 자가개선 카드 목록 (미해결 status만 default).
listSelfImproveCards: (status?: string) =>
  request<{ data: { ok: boolean; data: SelfImproveCard[] } }>(
    `/api/monitor:selfImproveCards${status && status !== 'all' ? `?status=${encodeURIComponent(status)}` : ''}`
  )
    .then(r => unwrap(r) as SelfImproveCard[])
    .catch(() => [] as SelfImproveCard[]),

// ★ 일괄 승인 → CTO. 선택된 모든 카드를 target_repo와 함께 한 번에 dispatch.
// 단건 sendToCTO와 달리 proposal_id + target_repo 쌍을 배열로 보낸다(cross-repo 필수).
bulkApproveSelfImprove: (items: Array<{ proposal_id: string; target_repo: string }>) =>
  request<{ data: { ok: boolean; data: BulkApproveResult } }>('/api/monitor:bulkApproveSelfImprove', {
    method: 'POST',
    body: JSON.stringify({ items }),
  }).then(r => unwrap(r)) as Promise<BulkApproveResult>,
```

```ts
export type BulkApproveResult = {
  dispatched: Array<{ proposal_id: string; self_mod_task_id: string; status: 'sent' }>
  // intent 게이트(보호영역 수정 시사)에 걸려 차단된 카드 — UI는 빨강 배지로 표시
  blocked: Array<{ proposal_id: string; reason: string; denied_by?: string }>
}
```

**백엔드 계약 (이 영역 밖, 명시만):** `bulkApproveSelfImprove`는 기존 `sendToCTO`(plugin-executive-monitor `src/server/plugin.ts:614`) 로직을 N회 반복하되, **`target_repo`를 dispatch intent의 `project_path`로 주입**(native-orchestrator가 임의 repo 타겟). 각 카드마다 `checkSelfModIntentForbidden` 게이트를 통과한 것만 `[자가수정]` task로 INSERT + `self_mod_status='sent'` 처리하고, 게이트에 걸린 것은 `blocked[]`로 회수한다. 트랜잭션 단위가 아니라 카드별 best-effort(일부 성공/일부 차단 허용).

### 3. 클라이언트 흐름 (page.tsx)

```text
1. mount → api.listSelfImproveCards() → cards[]  (30초 autoRefresh, tool-requests와 동일)
2. 각 카드 = 좌측 체크박스 + [임원][도구][위험도 D1/D2][소스] 배지 + 문제/근본원인/해결예정 + [📦 대상repo] 배지
3. 헤더에 '전체 선택' 체크박스 (선택가능 카드만 = self_mod_status가 null/rejected인 것)
4. selectedIds: Set<string> 로컬 상태. 카드/전체 토글
5. 하단 sticky 액션바: "선택 N건 일괄 승인 → CTO" 버튼 (N=0이면 disabled)
6. 클릭 → 확인(선택 카드의 target_repo_label 목록 보여줌) →
   api.bulkApproveSelfImprove(selected.map(c => ({ proposal_id, target_repo })))
7. optimistic: dispatched 카드 self_mod_status='sent', selectedIds 비움
8. blocked[] 있으면 해당 카드에 빨강 'intent 차단' 배지 + 사유 인라인 표시
9. 'CTO 작업 보기 →' 링크로 /control-room 안내 (실행 진척은 거기서)
```

선택 가능 여부 헬퍼(기존 `canSendToCTO` 재사용 개념):
```ts
function isSelectable(status?: string | null): boolean {
  return !status || status === 'rejected'
}
```

### 4. 페이지 컴포넌트 골격 (`apps/founder-ui/src/app/self-improve/page.tsx`)

`tool-requests/page.tsx`를 변형. `AuthGate` 래핑, 같은 디자인 토큰(`--green-tint` 등), 같은 `j-card`/`j-btn` 클래스, 같은 `RISK_STYLES`/`relativeTime` 헬퍼 재사용.

```tsx
'use client'
import { useEffect, useState, useCallback } from 'react'
import AuthGate from '@/components/AuthGate'
import { api, SelfImproveCard } from '@/lib/api'

const SOURCE_LABEL: Record<string, string> = {
  log_adapter:    '로그 자동수집',
  founder_report: '사장님 제보',
}
const RISK_STYLES: Record<string, { bg: string; fg: string }> = {
  D1: { bg: 'var(--green-tint)', fg: 'var(--green-press)' },
  D2: { bg: 'var(--p-butter)',   fg: 'var(--pi-butter)'   },
}

function SelfImproveContent() {
  const [cards, setCards] = useState<SelfImproveCard[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [blocked, setBlocked] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    try { setCards(await api.listSelfImproveCards()) }
    catch { setCards([]) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t) }, [load])

  const selectableIds = cards.filter(c => isSelectable(c.self_mod_status)).map(c => c.proposal_id)
  const allSelected = selectableIds.length > 0 && selectableIds.every(id => selected.has(id))

  const toggle = (id: string) =>
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(selectableIds))

  const bulkApprove = useCallback(async () => {
    const picked = cards.filter(c => selected.has(c.proposal_id))
    if (picked.length === 0) return
    setSubmitting(true)
    // optimistic
    setCards(prev => prev.map(c =>
      selected.has(c.proposal_id) ? { ...c, self_mod_status: 'sent' } : c))
    try {
      const res = await api.bulkApproveSelfImprove(
        picked.map(c => ({ proposal_id: c.proposal_id, target_repo: c.target_repo })))
      const b: Record<string, string> = {}
      res.blocked.forEach(x => { b[x.proposal_id] = x.reason })
      setBlocked(b)
      // 차단분은 optimistic 되돌림
      setCards(prev => prev.map(c =>
        b[c.proposal_id] ? { ...c, self_mod_status: null } : c))
      setSelected(new Set())
    } catch {
      setCards(prev => prev.map(c =>
        selected.has(c.proposal_id) ? { ...c, self_mod_status: null } : c))
    } finally { setSubmitting(false) }
  }, [cards, selected])

  // ... 렌더: 카드마다 체크박스 + 배지행 + sticky 액션바 (아래 5절)
}

export default function SelfImprovePage() {
  return <AuthGate><SelfImproveContent /></AuthGate>
}
```

### 5. 카드 + 액션바 마크업 (핵심 부분)

```tsx
{/* 카드 배지행 — tool-requests 패턴 재사용 */}
<div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
  <input type="checkbox"
    checked={selected.has(card.proposal_id)}
    disabled={!isSelectable(card.self_mod_status)}
    onChange={() => toggle(card.proposal_id)}
    style={{ accentColor:'var(--green)', cursor:'pointer' }} />

  {/* 임원 chip */}
  <span style={{ fontFamily:'var(--font-mono)', fontSize:10.5, fontWeight:600,
    color:'var(--green-press)', background:'var(--green-tint)', padding:'2px 8px', borderRadius:4 }}>
    {card.executive}
  </span>
  {/* 도구 */}
  <span style={{ fontSize:11.5, color:'var(--ink-2)' }}>{card.tool_label}</span>
  {/* 위험도 D1/D2 */}
  <span style={{ ...RISK_STYLES[card.risk_level], padding:'2px 8px', borderRadius:4,
    fontSize:11.5, fontWeight:600, fontFamily:'var(--font-mono)' }}>{card.risk_level}</span>
  {/* 수집 소스 */}
  <span style={{ fontSize:11, color:'var(--ink-3)', background:'var(--silver-1)',
    padding:'2px 8px', borderRadius:999 }}>{SOURCE_LABEL[card.source] ?? card.source}</span>
  {card.self_mod_status === 'sent' && <SentChip />}
  {blocked[card.proposal_id] && <BlockedChip reason={blocked[card.proposal_id]} />}
</div>

{/* 문제 / 근본원인 / 해결예정 */}
<div style={{ fontWeight:600, fontSize:14 }}>{card.problem}</div>
{card.root_cause && <p style={{ fontSize:12.5, color:'var(--ink-3)' }}>근본원인: {card.root_cause}</p>}
<p style={{ fontSize:12.5, color:'var(--ink-2)' }}>해결예정: {card.proposed_fix}</p>

{/* 📦 대상 repo 배지 — cross-repo 핵심 표시 */}
<div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
  <span style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--ink-2)',
    background:'var(--silver-1)', padding:'3px 9px', borderRadius:5 }}>
    📦 {card.target_repo_label}
  </span>
  {card.effort_estimate &&
    <span style={{ fontSize:11.5, color:'var(--ink-3)' }}>예상공수 {card.effort_estimate}</span>}
</div>
```

```tsx
{/* sticky 일괄 액션바 (페이지 하단 고정) */}
<div style={{ position:'sticky', bottom:0, display:'flex', alignItems:'center', gap:12,
  padding:'12px 16px', background:'var(--paper-surface)', borderTop:'1px solid var(--silver-2)' }}>
  <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:12.5 }}>
    <input type="checkbox" checked={allSelected} onChange={toggleAll}
      style={{ accentColor:'var(--green)' }} /> 전체 선택
  </label>
  <span style={{ marginLeft:'auto', fontSize:12.5, color:'var(--ink-3)' }}>
    {selected.size}건 선택됨
  </span>
  <button onClick={bulkApprove} disabled={selected.size === 0 || submitting}
    className="j-btn j-btn-primary">
    선택 {selected.size}건 일괄 승인 → CTO
  </button>
</div>
```

### 6. NAV_TOOLS에 🐯 자가개선 추가

**파일**: `apps/founder-ui/src/components/Sidebar.tsx` **19~26행 `NAV_TOOLS` 배열**. `Tool Requests` 항목 바로 아래에 1줄 추가(아이콘은 emoji가 아니라 기존 `Icon` 컴포넌트 name — `zap`/`refresh-cw` 류; 라벨에 🐯 텍스트를 넣어 사이드바에서 식별):

```ts
const NAV_TOOLS = [
  { href: '/cmo', label: 'CMO 마케팅', icon: 'megaphone' },
  { href: '/video-room', label: '영상룸', icon: 'video' },
  { href: '/monitor', label: '현황 모니터', icon: 'activity' },
  { href: '/memory', label: '지식', icon: 'database' },
  { href: '/control-room', label: 'Control Room', icon: 'sliders' },
  { href: '/tool-requests', label: 'Tool Requests', icon: 'wrench' },
  { href: '/self-improve', label: '🐯 자가개선', icon: 'zap' },   // ← 추가
]
```

> `icon` 값은 `components/Icon.tsx`에 존재하는 name이어야 한다(존재하지 않으면 빈 렌더). 구현 시 `Icon.tsx`에서 사용 가능한 name을 grep으로 확인 후 결정(예: `zap`, `refresh`, `activity`). 라벨 앞 🐯로 시각 식별 보장하므로 아이콘은 보조.

### 7. 경계/규칙 준수

- 이 페이지는 **표시·선택·전송만**. 근본원인 분석·공수추정·repo 매핑은 호랑이 루프(백엔드)가 카드에 담아 내려준다. UI에서 BPR/개선 판단 로직 금지(CLAUDE.md Forbidden).
- 위험도 D1~D2 고정 표시. 승인 전엔 dispatch 호출 자체가 일어나지 않음(승인 게이트 = 일괄 승인 버튼).
- intent 보호영역(승인/게이트/시크릿/프로세스) 카드는 백엔드 `checkSelfModIntentForbidden`이 `blocked[]`로 반려 → UI는 빨강 배지로만 노출, 절대 dispatch되지 않음.
- ACR 미언급. dispatch는 Native Orchestration(`target_repo` → native-orchestrator `project_path`)로만.


---

## 목적

일괄 승인된 N개 개선 카드(여러 repo가 섞여 있음)를 받아, CTO가 **대상 repo로 그룹핑 → repo별 격리 worktree에서 병렬 코딩 → verify/merge 게이트 → repo별 e2e → 최종 QA**까지 한 흐름으로 처리한다. ACR은 은퇴했으므로 실행기는 오직 **Native Orchestration(`dispatchToNativeOrchestrator`, Claude CLI 직접 spawn)** 이다. 외부 repo(`/Users/wonminyang/Desktop/ai-slide-video-factory`)도 pulk repo와 동일한 worktree 격리/검증 경로를 탄다.

## 실재 코드 사실 (설계 근거)

이 설계는 추측이 아니라 다음 실재 시그니처에 정확히 맞춘다.

| 자산 | 경로 | 핵심 시그니처/계약 |
|---|---|---|
| 단일 intent 실행기 | `services/agent-runtime/src/orchestrator/native-orchestrator.ts` | `dispatchToNativeOrchestrator(intent: ACRIntent, deps?: NativeOrchestratorDeps): Promise<NativeRunSummary>` |
| intent/phase 타입 | `packages/l5-core/src/types/acr-intent.ts` | `ACRIntent`(`project_path?`, `phases`, `l5_approved?`, `business_id?`, `allowed_files?`, `blocked_files?`), `CTOPhase`(`name`, `runtime`, `depends_on?`, `verify_command?`, `l5_approval_required`, `risk_level`) |
| 레벨 위상정렬 | `packages/l5-core/src/functions/cto-native/parallelize.ts` | `planPhaseLevels(phases): CTOPhase[][]` — depends_on 미지정 시 직전 phase 암묵 의존(순차) |
| 풀/백오프 | `packages/l5-core/src/functions/cto-native/budget.ts` | `applyPoolOutcome(pools, agent, 'ok'|'exhausted', nowIso, backoffMin?)` |
| 인계 판단 | `cto-native/recovery.ts` | `decideRecovery({task, pools, nowIso}) → {action:'handoff'|'wait'|...}` |
| worktree | `orchestrator/worktree.ts` | `createPhaseWorktree(repo, phaseId)`, `mergePhaseWorktree(repo, branch)`, `removePhaseWorktree(repo, path)` — branch `l5/phase-{slug}`, worktree `{repo부모}/.l5-worktrees/{repoName}-{slug}` |
| 풀 기본값 | native-orchestrator | `ALL_AVAILABLE: AgentPoolState[]` = claude-code/codex/antigravity |

**핵심 제약 (반드시 준수):** `dispatchToNativeOrchestrator`는 **intent 1개 = `project_path` 1개**를 처리한다. 따라서 "여러 repo가 섞인 카드 묶음"은 **하나의 큰 intent로 만들면 안 된다** — repo별로 별도 ACRIntent를 만들어 각각 호출해야 한다. 이게 이 영역 설계의 중심축이다.

## 전체 흐름

```
호랑이 승인분(WorkflowImprovementProposal[] status=approved, target_repo 포함)
   │
   ▼  [신규] buildBatchPlan()  — l5-core 순수 함수
그룹핑: target_repo 별로 카드 묶음 → RepoGroup[]
   │  (각 RepoGroup = 한 repo + 그 repo 카드들 → 1개 ACRIntent)
   ▼  [신규] runApprovedBatch()  — agent-runtime 부작용 오케스트레이터
세마포어(동시성 = max(1, coreCount-2))로 RepoGroup 병렬 실행
   │
   ├─ RepoGroup A (pulk)                    → dispatchToNativeOrchestrator(intentA, deps)
   ├─ RepoGroup B (ai-slide-video-factory)  → dispatchToNativeOrchestrator(intentB, deps)
   └─ RepoGroup C (services/youtube …)      → dispatchToNativeOrchestrator(intentC, deps)
        각 intent 내부(기존 native-orchestrator 그대로):
          planPhaseLevels → 레벨별 worktree 병렬 → verify_command 게이트
          → 순차 merge → (QA phase) e2e/QA verify_command
   │
   ▼  applyPoolOutcome 으로 pools 갱신(exhaustedAgents 회수) → 다음 그룹에 전달
결과 집계: 카드별 merged/held/failed + 보류 사유 → 호랑이로 회수
   │
   ▼  WorkflowImprovementProposal.status 패치 (implemented | proposed 잔류) +
      MemoryEntry(category bpr/failure) 축적 (영역 외, 호랑이 회수부가 소비)
```

## 1. 그룹핑 — `buildBatchPlan()` (l5-core 순수 함수, 단위테스트 필수)

신규 파일 `packages/l5-core/src/functions/cto-native/batch-plan.ts`.

승인 카드는 `target_repo`(절대경로)를 갖는다. `WorkflowImprovementProposal`에는 현재 `target_repo` 필드가 없으므로 **additive로 추가**하거나(권장), 호랑이가 카드 작성 시 채운 값을 `BatchCard` 입력 타입으로 받는다.

```ts
export interface BatchCard {
  proposal_id: string;            // WorkflowImprovementProposal.id
  target_repo: string;            // 절대경로. 예 /Users/.../ai-slide-video-factory
  business_id?: string;
  phases: CTOPhase[];             // CTO Brain이 카드별로 분할한 phase들(verify_command 포함)
  depends_on_repos?: string[];    // 드묾: repo 간 순서가 필요한 경우만
}

export interface RepoGroup {
  project_path: string;
  card_ids: string[];
  intent: ACRIntent;              // 이 repo 전용 단일 intent
}

export interface BatchPlan {
  groups: RepoGroup[];            // repo 간 위상 순서대로 정렬됨
  concurrency: number;            // 호출부가 주입한 동시성 상한
}

export function buildBatchPlan(
  cards: BatchCard[],
  opts: { concurrency: number; nowIso: string },
): BatchPlan;
```

규칙:
1. **repo 단위 그룹핑.** `target_repo`가 같은 카드들은 한 `RepoGroup` = 한 `ACRIntent`로 합친다. 한 repo 안의 여러 카드 phase는 `name`을 카드 prefix(`{proposal_id}:{phase.name}`)로 유니크화해 합치고, `planPhaseLevels`가 카드 내부 `depends_on`은 보존하되 **서로 다른 카드는 기본적으로 독립 레벨**(병렬)이 되게 한다.
2. **intent 합성.** 각 그룹의 `ACRIntent`는 `{ l5_task_id: "tiger:{batchId}:{repoName}", task_title, phases, project_path: target_repo, l5_approved: true(승인 게이트 이미 통과), business_id }`. `l5_approved:true`는 native-orchestrator가 `l5_approval_required` phase를 실행하게 하는 단일 진실원이다(코드: 457~465행).
3. **repo 간 순서.** 기본은 repo 간 의존 없음 → 전부 병렬 후보. `depends_on_repos`가 있으면 그룹을 위상정렬해 선행 그룹 merge 완료 후 후행 그룹을 시작한다(드문 경로).
4. **위험도.** 호랑이 루프는 D1~D2 확정. 카드 phase의 `risk_level`/`l5_approval_required`는 그대로 두되, 배치 진입 자체가 "일괄 승인" 게이트를 이미 통과했으므로 intent `l5_approved:true`.

순수 함수이므로 `nowIso` 주입, `Date.now`/I/O 금지. 단위테스트: 단일repo·다중repo·카드 phase 이름 충돌·repo간 의존·빈 입력.

## 2. repo별 병렬 실행 + 동시성 제한 — `runApprovedBatch()` (agent-runtime)

신규 파일 `services/agent-runtime/src/orchestrator/batch-runner.ts`. 부작용 전담(순수 판단은 `buildBatchPlan`에 위임).

```ts
import os from 'node:os';
import { dispatchToNativeOrchestrator, type NativeRunSummary } from './native-orchestrator.js';
import { applyPoolOutcome, ALL_AVAILABLE } from '@l5/core/dist/functions/cto-native/index.js';

export interface BatchRunResult {
  group_results: Array<{
    project_path: string;
    card_ids: string[];
    summary: NativeRunSummary;       // {waited, exhaustedAgents, mergedPhases}
    status: 'completed' | 'partial' | 'held';
  }>;
  exhausted_agents: MainAgent[];
}

export async function runApprovedBatch(plan: BatchPlan, deps?: NativeOrchestratorDeps): Promise<BatchRunResult>;
```

동작:
1. **동시성 상한 = `Math.max(1, os.cpus().length - 2)`.** 코어수-2 세마포어로 동시에 실행되는 `RepoGroup` 수를 제한한다. (intent **내부**의 phase 레벨 병렬은 기존 `Promise.all`이 담당 — 여기서는 건드리지 않고 **그룹 간** 동시성만 제한한다. 두 레벨이 곱해지면 코어 폭주하므로 그룹 동시성 상한이 안전판이다.) `plan.concurrency`를 우선하되 코어수-2로 클램프.
2. **풀 공유.** 모든 그룹이 같은 `AgentPoolState[]`(claude-code/codex/antigravity 토큰 풀)를 공유한다. 한 그룹이 끝날 때 `summary.exhaustedAgents`를 `applyPoolOutcome(pools, agent, 'exhausted', nowIso)`로 반영하고, 성공 그룹은 `'ok'`로 복원해 **다음 그룹·다음 레벨이 소진된 에이전트를 피하도록** pools를 업데이트한 뒤 다음 `dispatchToNativeOrchestrator(intent, { pools, nowIso, persist })`에 넘긴다. native-orchestrator는 이미 phase 단위로 `decideRecovery`(handoff/wait)를 수행하므로(237·293행) 그룹 단위 갱신이 그 위에 얹힌다.
3. **repo 간 위상 순서.** `depends_on_repos`가 있으면 선행 그룹 완료 후 후행을 시작(세마포어 안에서 의존 충족 그룹만 디스패치). 없으면 전부 동시 후보.
4. **graceful.** `dispatchToNativeOrchestrator`는 throw하지 않고 `NativeRunSummary`를 반환하도록 이미 설계됨(graceful, console.warn). batch-runner도 그룹 1개 실패가 전체를 죽이지 않게 `Promise.allSettled` 패턴으로 감싼다.

## 3. 외부 repo(ai-slide-video-factory) 동일 격리 보장

외부 repo도 **추가 분기 없이** 동일 경로를 탄다. 근거:
- `createPhaseWorktree(repo, phaseId)`는 `repo` 절대경로만 받으면 `{repo부모}/.l5-worktrees/{repoName}-{slug}`에 worktree와 `l5/phase-{slug}` 브랜치를 만든다(`worktree.ts` 35~59행). `ai-slide-video-factory`도 git repo이므로 그대로 동작.
- `verify_command`는 worktree `cwd`에서 `/bin/sh -c`로 실행(`spawn-agent.ts runShellCommand`)되므로 그 repo의 빌드/테스트(`npm test`, `pnpm build` 등)를 카드 phase의 `verify_command`로 지정하면 된다.
- merge는 `mergePhaseWorktree(repo, branch)`가 그 repo 안에서 `git merge --no-edit`로 수행. 외부 repo의 base branch를 직접 더럽히지 않게, native-orchestrator는 HEAD에서 분기→worktree 작업→레벨 종료 후 순차 merge하므로 격리가 유지된다.

**전제 조건(반드시 명시):** 외부 repo는 (a) git repo여야 하고, (b) clean working tree여야 하며(미커밋 변경 있으면 worktree add는 되지만 merge 충돌 위험), (c) `target_repo` 절대경로가 호스트에 실재해야 한다. batch-runner는 그룹 시작 전 `git -C {repo} rev-parse --is-inside-work-tree`로 사전 점검하고, 실패 시 그 그룹을 `held`로 보류(사유 회수)하고 다음 그룹으로 진행한다.

## 4. verify merge 게이트 + repo별 e2e + 최종 QA

별도 "QA 런타임"은 신규로 만들지 않는다 — **기존 native-orchestrator의 2단 게이트를 그대로 쓴다**:

1. **휴리스틱 verdict** (`verifyCTOPhaseDeterministic`, 313행): exit_code/diff/expected_output로 1차 판정.
2. **실제 검증** (`verify_command`, 327~337행): pass여도 phase에 `verify_command`가 있으면 worktree에서 실제 실행, exit≠0이면 **merge 차단**.

이 위에 e2e/QA를 **phase로 표현**한다 (호랑이/CTO Brain이 카드 phase 분할 시 채움):
- **코딩 phase**: `runtime` = tier별(claude/codex/antigravity), `verify_command` = `tsc --noEmit && jest <unit>`.
- **e2e phase**: 코딩 phase들에 `depends_on`으로 매달아 같은 intent의 다음 레벨로 배치. `verify_command` = 그 repo의 e2e(`pnpm test:e2e` 또는 founder-ui의 `corepack pnpm exec node e2e/*.mjs`).
- **최종 QA phase**: `runtime: 'codex'`(→ `agentToTaskKind`가 `'qa'` 매핑, 124행) 또는 명시 QA. `verify_command` = repo 전체 `pnpm typecheck && pnpm test && pnpm build`. 이 phase가 마지막 레벨이므로 앞 단계 merge가 끝난 base에서 최종 통과를 본다.

즉 **e2e/QA는 intent의 후행 레벨 phase + verify_command merge 게이트**로 자연 배선된다. 별도 런타임 매핑 추가 불필요.

## 5. 실패분 보류 + 사유 회수

native-orchestrator의 `finalizePhase`는 이미 phase별 종착 상태를 만든다: `merged | held | failed | waited`(371~426행). batch-runner는 이를 카드 단위로 집계한다:

| phase 종착 | 의미 | 카드 처리 |
|---|---|---|
| `merged` | 검증 통과 + merge 완료 | 카드 성공 후보 |
| `held` | merge 충돌/worktree 에러로 보류 | 카드 보류, 사유 = git 충돌 메시지 |
| `failed` | verify_command/verdict 실패 | 카드 실패, 사유 = `verdictReason`(verify exit + tail 400자) |
| `waited` | 토큰 소진/풀 불가용 | 카드 보류, **재시도 대상**(다음 야간 루프) |

`PhaseRunSink`(72행, `start`/`finish`)를 통해 phase별 `verdict`/`output`/`diff_summary`가 영속화되므로, batch-runner는 그룹 `NativeRunSummary` + sink 레코드로 **카드별 보류/실패 사유**를 모은다. 이 사유는 호랑이 회수부(영역 외)가:
- 성공 카드 → `WorkflowImprovementProposal.status = 'implemented'`,
- 실패/보류 카드 → status `proposed` 잔류 + `MemoryEntry(category: 'failure')`에 사유 축적(다음날 호랑이 분석 입력 품질 향상),
로 처리한다. 이 영역 산출물은 **카드별 `{proposal_id, status, reason}` 배열**까지다(NocoBase 패치/Memory 적재는 호랑이 회수 영역이 소비).

## 6. 배선 진입점 (호출 체인)

- **트리거**: 야간 루프 `services/hermes-runtime/src/loops/night-bpr-loop.ts`(현재 TODO 스텁) 또는 founder-ui 일괄 승인 핸들러 → 승인 카드 조회 → `buildBatchPlan(cards, {concurrency, nowIso})` → `runApprovedBatch(plan, {pools, nowIso, persist})`.
- **기존 단일 CTO 경로 불변**: `services/agent-runtime/src/agents/cto.ts` 649~651행의 `dispatchToNativeOrchestrator(acrIntent)` 단건 경로는 그대로 둔다. 배치는 그 위에 얹는 **새 진입점**이며 같은 실행기를 재사용한다(중복 구현 금지).
- **NATIVE_ORCHESTRATION 플래그**: 기존 분기(`process.env["NATIVE_ORCHESTRATION"] === "on"`)와 동일하게 배치도 native만 사용. ACR 분기(`dispatchToACR`)는 호출하지 않는다.

## 미해결/주의

- `WorkflowImprovementProposal`에 `target_repo` 필드가 없음 → additive 추가 필요(권장) 또는 `related_workflow_id`→repo 매핑 테이블 경유. 사장님/호랑이 영역과 필드 계약을 맞춰야 함.
- 그룹 동시성과 intent-내부 레벨 병렬이 곱해지는 위험 → 그룹 동시성 상한(코어수-2)이 1차 안전판이지만, 한 그룹의 레벨이 매우 넓으면(예: 카드 10개 동시) 여전히 spawn 폭주 가능. 필요 시 native-orchestrator의 레벨 `Promise.all`도 동일 세마포어로 감싸는 2차 상한을 추후 검토(현 영역에서는 그룹 상한만 도입).


---

## 0. 전제 (실재 코드 기준)

이 섹션은 추측이 아니라 다음 실재 자산에 배선한다(읽어서 확인함):
- 타입: `packages/l5-core/src/types/entities.ts` — `BPRLog`(L141), `WorkflowImprovementProposal`(L190), `MemoryEntry`(L163). `packages/l5-core/src/types/orchestration.ts` — `AgentTask`(L62). `packages/l5-core/src/types/acr-intent.ts` — `ACRIntent`/`CTOPhase`(`l5_approval_required`, `l5_approved`, `project_path`, `allowed_files`, `blocked_files`).
- 실행기: `services/agent-runtime/src/orchestrator/native-orchestrator.ts` `dispatchToNativeOrchestrator(intent, deps)` — phase별 worktree 격리 + 승인게이트 + merge 게이트 + `verify_command`. **ACR은 은퇴, 호출하지 않음.**
- 경계검사: `packages/l5-core/src/functions/cto-harness/boundary-check.ts` `checkBoundary(changed, allowed, blocked)` + `DEFAULT_BLOCKED`(`.env`/lockfile/node_modules/.git).
- 디스패치: `services/hermes-runtime/src/tasks/task-dispatcher.ts` `runTaskDispatcher`(queued + `approval_required=false`만 처리), `self_mod_status` 흐름(`apps/founder-ui/src/app/tool-requests/page.tsx`).
- 두뇌 자리: `services/hermes-runtime/src/loops/night-bpr-loop.ts`(TODO 스텁), 본보기 `services/hermes-runtime/src/tasks/cmo-strategy-watch.ts`.
- 등록: `services/hermes-runtime/src/gateway.ts` `TASK_RUNNERS`, launchd `~/Library/LaunchAgents/com.l5.hermes.*.plist`.

호랑이 도메인 판단(분석/카드작성/매핑/스코어)은 **`packages/l5-core`(NocoBase 비의존, 단위테스트 필수)**, I/O·spawn·git은 hermes/agent-runtime에 둔다(UI에 도메인 로직 금지).

---

## 1. 안전·승인 게이트

### 1.1 위험도 — 항상 D1~D2

호랑이가 만드는 모든 액션은 D1~D2로 고정한다.
- **D1**: 후보 수집(읽기 전용 로그/제보 read), 카드 생성, 텔레그램 알림, MemoryEntry 기록. 부작용 없음.
- **D2**: 승인된 카드를 CTO로 디스패치 → 내부 코드 수정(worktree 격리 + merge 게이트). 외부 고객 발송·결제 없음.

D3+는 호랑이 스코프 밖이다. 만약 후보 분석 결과 외부 발송/결제/스키마 마이그레이션/`.env` 변경이 필요하다고 판단되면, 카드를 자동 디스패치하지 않고 `approval_required=true` + `risk_level='D4'`로 승격하여 기존 `/approval` 큐(`DecisionQueue`)로만 보낸다(코딩 미시작).

### 1.2 승인 게이트 — 승인 전 코딩 절대 금지

게이트는 **이미 존재하는 두 겹**을 그대로 쓴다(새 게이트 만들지 않음):

1. **디스패처 게이트** (`runTaskDispatcher` L63): `task.status !== 'queued' || task.approval_required` 이면 skip. 호랑이 카드는 생성 시 `status='queued'`, **`approval_required=true`** 로 만든다 → 디스패처가 절대 집어가지 않음. 사장님이 '일괄 승인'을 누르면 그때 카드의 `approval_required`를 `false`로 내리고 `self_mod_status='sent'`로 전이 → 다음 디스패처 틱이 CTO로 보냄.
2. **Native Orchestrator phase 게이트** (`native-orchestrator.ts` L457): `phase.l5_approval_required && !intent.l5_approved` 면 그 phase를 보류. 호랑이가 만든 `ACRIntent`는 승인 전 `l5_approved=false`로 둔다 → spawn 자체가 안 일어남. 승인 시 `l5_approved=true`로 dispatch.

즉 코딩 시작의 단일 진실원천은 **사장님 일괄 승인 1회**다. 승인 신호가 두 레이어(`approval_required=false` + `l5_approved=true`)를 동시에 켜야만 `runAgentCommand`(spawn)가 호출된다.

```
[수집 D1] → [카드 status=queued, approval_required=true]  ← 디스패처가 안 봄
        ↓ 사장님 체크박스 다중선택 → 일괄 승인 (단일 게이트)
[카드 approval_required=false, self_mod_status=sent]
        ↓ task-dispatcher 틱 (60s)
[ACRIntent { l5_approved=true, project_path=대상repo }]
        ↓ dispatchToNativeOrchestrator
[phase별 worktree → spawn → verify → merge 게이트]
```

### 1.3 외부 repo 수정도 worktree 격리

`dispatchToNativeOrchestrator`는 `intent.project_path`를 base repo로 받아 `createPhaseWorktree(repo, phase.name)`로 phase마다 독립 worktree를 만든다. **이 메커니즘은 repo가 pulk 밖이어도 동일하게 동작**한다(예: `/Users/wonminyang/Desktop/ai-slide-video-factory`). 따라서 cross-repo 개선의 격리는 추가 구현 없이 `project_path`만 레지스트리에서 정확히 주입하면 된다.

규칙(`.claude/rules/30-worktree-policy.md` 준수):
- 호랑이는 main repo를 직접 수정하지 않는다. 모든 변경은 `agent/{taskId}-{phase}` worktree 안에서만.
- git 커밋/머지는 오케스트레이터(`dispatchToNativeOrchestrator` → `mergePhaseWorktree`) 소유. 에이전트는 금지.
- 외부 repo 레지스트리는 **허용 목록(allowlist)** 방식. 레지스트리에 없는 경로는 `project_path`로 주입 불가 → 임의 repo 수정 차단.

### 1.4 경계 위반 처리 (`.claude/rules/40-verification-policy.md` 준수)

각 phase의 `allowed_files`/`blocked_files`는 `ACRIntent`에 실어 보내고, merge 전에 `checkBoundary`로 검사한다. **현재 `native-orchestrator`는 `collectDiff`로 changed 파일을 이미 수집하지만 `checkBoundary`를 호출하지 않는다** → 호랑이 경로에서는 merge 직전 boundary 게이트를 명시적으로 추가한다(M2 작업 항목).

| 위반 종류 | 탐지 | 처리 |
|---|---|---|
| `blocked_files` 매칭(`.env`/lockfile/node_modules/.git, `DEFAULT_BLOCKED`) | `checkBoundary().blocked` 비어있지 않음 | merge **보류**, phase `status='held'`, `verdict='boundary_violation'`, 해당 카드 `self_mod_status='awaiting_apply'`로 두고 사장님 리뷰 |
| `allowed_files` 밖(`outOfScope`) | `checkBoundary().outOfScope` | 동일하게 merge 보류 + human review |
| `verify_command` 실패(tsc/jest exit≠0) | 기존 L327~ 로직 | merge 보류(`held`) — 이미 구현됨 |
| `project_path`가 레지스트리 밖 | 디스패치 전 allowlist 검사 | `status='boundary_violation'`, 디스패치 중단 |

핵심: **위반은 throw 없이 graceful 보류** — base repo는 절대 오염되지 않고(merge만 차단), 카드는 사람 검토 상태로 남는다.

---

## 2. 데이터모델 매핑

호랑이 루프의 각 단계가 **기존 엔티티에 정확히 어떤 필드로** 매핑되는지. 새 엔티티는 만들지 않는다(필드 의미만 약속).

### 2.1 후보 → `BPRLog` (수집·근본원인)

cross-repo 수집기가 모은 오류·병목 후보 1건 = `BPRLog` 1행.

| `BPRLog` 필드 | 호랑이 카드 의미 | 값/규칙 |
|---|---|---|
| `business_id?` | 후보가 속한 사업(공통이면 생략) | 레지스트리 매핑 |
| `bottleneck_description` | "무엇이 문제인가" | 수집기가 로그/제보에서 추출한 증상 |
| `impact` | 영향도 | `high`/`medium`/`low` — 발생빈도·차단성으로 호랑이가 스코어 |
| `root_cause?` | "근본원인" | 호랑이(Claude)가 분석 단계에서 채움 |
| `proposed_solution` | "해결예정" | 호랑이가 작성 |
| `owner_agent_id?` | 대상 임원 | CMO/CTO/CFO… (레지스트리의 도구→임원) |
| `status` | 카드 수명주기 | `identified`→`under_review`(분석완료)→`solution_planned`(승인)→`solution_implemented`(merge)→`closed` |

대상 repo 경로는 `BPRLog`에 필드가 없으므로 **`source_ref`(CommonFields)** 에 `tiger:<repo_key>` 형태로 싣고, 디스패치 시 레지스트리 키→절대경로로 해석한다.

### 2.2 카드 상세 → `WorkflowImprovementProposal` (문제→해결→공수)

사이드바 '🐯 자가개선' 카드 본문(문제/해결안/공수/대상repo)은 `WorkflowImprovementProposal`에 1:1 매핑된다.

| `WorkflowImprovementProposal` 필드 | 호랑이 카드 |
|---|---|
| `related_workflow_id?` | 대상 임원 워크플로우(레지스트리) |
| `related_business_id?` | 사업 |
| `current_process` | 현재 동작/병목 맥락 |
| `identified_bottleneck` | 문제(= `BPRLog.bottleneck_description` 미러) |
| `proposed_improvement` | 해결안 |
| `impact_on_timeline?` | 기대 효과 |
| `effort_to_implement?` | **예상 공수**(`S`/`M`/`L` 또는 "~2h") |
| `suggested_by_agent_id` | 항상 `'tiger'`(호랑이 두뇌) |
| `status` | `proposed`→`under_review`→`approved`(일괄승인)→`implemented`/`rejected` |

`BPRLog`(수집·근본원인 원천)와 `WorkflowImprovementProposal`(승인·실행 카드)을 1:1로 연결하기 위해 proposal의 `source_ref`에 `bpr:<bprLogId>`를 싣는다. 대상 repo 키도 `source_ref` 또는 `current_process` 머리말에 `[repo:<key>]`로 둔다.

### 2.3 승인된 카드 → `AgentTask` (CTO 디스패치)

일괄 승인 시 proposal → `AgentTask`로 변환(기존 `cmoStrategyWatch`의 `ToolRequestPayload` 패턴 재사용).

| `AgentTask` 필드 | 값 |
|---|---|
| `assigned_agent` | `'CTO'` |
| `title` | proposal `proposed_improvement` 요약 |
| `rationale` | `identified_bottleneck` + `root_cause` |
| `expected_output` | "해당 repo에서 문제 수정 + 검증 통과" |
| `status` | `'queued'` |
| `approval_required` | 승인 전 `true` → 승인 시 `false` |
| `risk_level` | `'D2'` |
| `phase` | `'scale_automation'`(자가개선은 운영 스케일 단계) |
| `source_ref` | `tiger:<proposalId>:<repo_key>` (결과 회수 키) |
| `business_id?` | 사업 또는 `null`(공통) |

CTO 에이전트(`runCTOAgent`)가 이 task에서 `project_path`(레지스트리 해석) + `allowed_files`/`blocked_files`를 채운 `ACRIntent`(`l5_approved=true`)를 만들어 `dispatchToNativeOrchestrator`로 넘긴다.

### 2.4 결과 → `MemoryEntry` (학습 축적)

CTO 실행 결과 1건 = `MemoryEntry` 1행. 성공/실패에 따라 `category` 분기(요구된 핵심).

| `MemoryEntry` 필드 | 성공 | 실패 |
|---|---|---|
| `category` | `'bpr'` | `'failure'` |
| `content` | "문제 X를 repo Y에서 해결: <diff_summary>" | "문제 X 해결 시도 실패: <verdict/보류 사유>" |
| `related_entity_id` | proposal id | proposal id |
| `related_entity_type` | `'workflow_improvement_proposal'` | 동일 |
| `related_business_id?` | 사업 | 사업 |
| `pii_level` | `'none'`(내부 엔지니어링) | `'none'` |
| `contains_pii` | `false` | `false` |
| `searchable_tags` | `[repo_key, owner_agent, 'tiger', 'merged']` | `[repo_key, owner_agent, 'tiger', 'held'\|'failed']` |
| `reusability_score?` | 호랑이가 0~100 스코어(다음날 우선순위 입력) | 동일 |
| `approval_status` | `'approved'`(자동 — 내부 학습, PII 없음) | `'approved'` |
| `source_task_id` | `AgentTask.id` | `AgentTask.id` |
| `reusable_context?` | "동일 패턴 재발 시 적용할 핵심 단서" | "이 접근은 실패 — 다음엔 회피" |

`NativeRunSummary`(`mergedPhases`/`waited`/`exhaustedAgents`)와 phase별 `verdict`/`diff_summary`(이미 `PhaseRunPatch`로 회수됨)를 `content`/`tags` 소스로 쓴다.

---

## 3. 학습 축적 루프 (결과 → 다음날 입력)

`night-bpr-loop.ts`(현재 TODO 스텁)를 호랑이 두뇌로 채운다. 하루 1바퀴, 다음 순서:

```
1. [수집] cross-repo 수집기 → 후보 목록            verify: 단위테스트(파서)
2. [분석] tigerAnalyze(candidates, pastMemory)     verify: 단위테스트(스코어 룰)
          → BPRLog[] + WorkflowImprovementProposal[]
   ★ pastMemory = 어제까지의 MemoryEntry(category bpr/failure) 주입
3. [카드] proposal 영속화 + 텔레그램 1건            verify: I/O 가드(cmo-watch 패턴)
4. [대기] 사장님 일괄 승인 (게이트, 비동기)
5. [실행] 승인분 → AgentTask → dispatchToNativeOrchestrator (별도 디스패처 틱)
6. [회수] PhaseRunPatch/NativeRunSummary → MemoryEntry(bpr/failure) 기록
7. [순환] 다음날 step 2의 pastMemory 입력으로 자동 합류
```

핵심 폐루프: **step 6의 `MemoryEntry`가 step 2의 입력**이 된다. `tigerAnalyze`는 과거 `failure` 메모리를 받아 (a) 이미 실패한 접근을 같은 후보에 다시 제안하지 않고, (b) 성공한 `bpr` 메모리의 `reusable_context`를 유사 후보에 재적용하며, (c) `reusability_score`로 카드 우선순위를 정렬한다. 이로써 "데이터가 축적되며 분석 품질이 올라가는" Nous Hermes식 루프가 OpenAI 없이(Claude 전담) 재현된다.

도메인 함수(`packages/l5-core/src/functions/tiger/`):
- `collectCandidates(adapters, manualReports)` — 순수 병합/정규화.
- `tigerAnalyze({ candidates, pastMemory, registry, nowIso })` → `{ bprLogs, proposals }`. **여기에 스코어/중복제거/실패회피 룰** → 단위테스트 필수(CLAUDE.md 개발규칙 3).
- `proposalToAgentTask(proposal, registry)` → `AgentTask` payload.
- `phaseResultToMemory(patch, summary, proposal)` → `MemoryEntry`(bpr/failure 분기).

Claude 호출(분석 본체)은 `services/agent-runtime`의 spawn 패턴(`spawn-agent.ts`)으로 격리 실행, l5-core는 LLM 결과를 받아 결정론적으로 후처리만 한다(테스트 가능 유지).

---

## 4. 구현 로드맵 M1~M4

각 마일스톤은 `.claude/rules/40-verification-policy.md` 검증을 통과해야 완료다.

### M1 — 데이터·도메인 골격 (l5-core)
- `packages/l5-core/src/functions/tiger/` 신설: `collectCandidates`, `tigerAnalyze`(스코어/실패회피/dedup), `proposalToAgentTask`, `phaseResultToMemory`. 매핑은 §2 표 그대로.
- 레지스트리 상수: `tiger-registry.ts`(도구키→{repo 절대경로, owner_agent, business_id?}). **allowlist 역할 겸함.**
- **검증**: `pnpm --filter @l5/core typecheck` + `pnpm --filter @l5/core test`(신규 스코어/매핑 단위테스트, 모든 판단 룰 커버) + `pnpm --filter @l5/core build`.

### M2 — 안전 게이트 배선 (agent-runtime)
- `native-orchestrator`에 merge 직전 `checkBoundary(changed, intent.allowed_files, intent.blocked_files)` 호출 추가 → 위반 시 `held`+`boundary_violation`(§1.4). graceful, throw 금지.
- CTO 경로에서 `project_path` allowlist 검사(레지스트리 밖이면 디스패치 중단).
- **검증**: `pnpm --filter @l5/agent-runtime typecheck` + 신규 orchestrator 단위테스트(boundary 위반 시 merge 안 됨, allowlist 밖 차단) + build. (`.claude/rules/40` runner/ACR 행: unit + local run sim + boundary)

### M3 — 야간 루프 + 디스패치 + 회수 (hermes-runtime)
- `night-bpr-loop.ts` 구현: §3 step1~3,6. `cmo-strategy-watch.ts` 패턴(graceful I/O, 텔레그램, state 파일) 재사용. `createBPRLog`/`createProposal`/`createMemoryEntry` updater 주입(NocoBase 비의존 → 테스트 가능).
- `gateway.ts` `TASK_RUNNERS`에 `"night-bpr-loop": runNightBPRLoopLive` 추가, `runner.ts`에 live 래퍼.
- 승인→`AgentTask` 변환 + 결과 회수(`PhaseRunSink`로 `MemoryEntry` 기록)를 task-dispatcher 또는 전용 회수 틱에 배선.
- **검증**: `pnpm --filter @l5/hermes-runtime typecheck` + 루프 단위테스트(baseline/no-change/카드생성, offline-safe) + build. (`.claude/rules/40` API 행: typecheck+unit+build)

### M4 — UI '🐯 자가개선' + 일괄 승인 + e2e
- `Sidebar.tsx` `NAV_TOOLS`에 `{ href: '/self-improve', label: '🐯 자가개선', icon: 'shield' }` 추가.
- `/self-improve` 페이지: proposal 카드 목록 + 체크박스 다중선택 + '일괄 승인' 버튼. **도메인 로직 금지** — `api.listImprovements()`/`api.bulkApproveImprovements(ids)`만 호출(tool-requests 페이지의 `self_mod_status` 패턴 그대로). 일괄 승인 = 선택 proposal들의 `approval_required=false` + `status='approved'` + `self_mod_status='sent'`.
- **검증**: `pnpm --filter founder-ui build` + Playwright smoke(`corepack pnpm exec node e2e/*.mjs`, `.claude/rules/50` — role/testId selector, 카드 렌더 + 다중선택 + 승인 버튼 enable). 실패 시 artifact 저장, 자동수정 금지.

전체 통합 e2e(권장, M4 후): 모의 후보 1건 주입 → 야간 루프 → 카드 노출 → 일괄 승인 → 디스패치 → worktree merge → `MemoryEntry(bpr)` 1행 → 다음 분석에서 해당 메모리 입력 확인. (메모리 노트 `l5-prd-completion-definition`: 도메인만이 아니라 배선+UI+통합 전 층 완료가 "구현"의 정의.)

---

## 5. launchd 야간 잡 추가

기존 `com.l5.hermes.self-learning.plist`(09:00)를 템플릿으로 **`com.l5.hermes.night-bpr-loop.plist`** 1개 추가.

- `Label`: `com.l5.hermes.night-bpr-loop`
- `ProgramArguments`: `/usr/local/bin/node`, `…/services/hermes-runtime/dist/gateway.js`, `night-bpr-loop`
- `WorkingDirectory`: `…/services/hermes-runtime`
- `EnvironmentVariables`: 기존 plist와 동일(`NOCOBASE_URL`/`NOCOBASE_TOKEN`/`TELEGRAM_*`/`NODE_ENV`) — **하드코딩 금지 원칙상 비밀은 plist에만**(레포 .env 미수정).
- `StartCalendarInterval`: **Hour 8 / Minute 30**. 근거: 09:00 `self-learning` + 09:05 `cmo-strategy-watch` 보다 **앞서** 도는 게 자연스럽다(밤사이 누적분 분석 → 아침에 self-learning이 카탈로그 갱신). 야간 누적이 목적이면 03:00도 후보 — 사장님 결정 필요(아래 open question).
- `StandardOutPath`/`StandardErrorPath`: `~/Library/Logs/l5-hermes/night-bpr-loop.{log,err}`.
- `RunAtLoad`: `false`.

설치(사장님이 실행, 자동 적용 금지): `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.l5.hermes.night-bpr-loop.plist`.

**주의**: 디스패치(실제 코딩)는 이 야간 잡이 아니라 기존 `com.l5.hermes.task-dispatcher`(60s)가 담당한다 — 야간 잡은 "수집·분석·카드"까지만(승인 전 코딩 금지 게이트 보존). 결과 회수는 디스패처 또는 별도 회수 틱이 `MemoryEntry`로 적재.

---

## 미해결 질문 (사장님/구현 착수 전 결정 필요)

설계 subagent들이 코드를 직접 읽으며 식별한, 결정이 필요한 항목 목록.

- (tiger-registry-schema) 키 콘텐츠 보고서/CFO 비용집계는 현재 packages/l5-core 안의 순수 함수라 '실행 로그'가 디스크에 남지 않는다. 이 둘의 error_sources를 (a) 호출하는 hermes-runtime 로프 로그로 잡을지, (b) manual_intake만 둘지 결정 필요.
- (tiger-registry-schema) 외부 repo ai-slide-video-factory의 실제 로그/실행기록 경로 패턴이 확인 안 됨. 해당 repo를 한 번 둘러봐 error_sources glob을 확정해야 함(현재 logs/**, output/** 추정).
- (tiger-registry-schema) services/youtube·agent-runtime·hermes-runtime에 표준화된 로그 디렉터리(logs/)가 실제로 존재하는지 미확인. 없으면 수집기가 stdout 캡처 또는 launchd 로그(~/.l5/...)를 소스로 써야 하며 error_sources 규칙을 절대경로 예외로 확장할지 결정 필요.
- (tiger-registry-schema) CRO/CPO/COO 확장 도구가 미지정 — 초안에 CRO 슬롯만 placeholder로 넣었는데, 빈 슬롯을 레지스트리에 두는 게 맞는지(테스트가 빈 error_sources를 허용해야 함) 결정 필요.
- (tiger-collector) 도구별 실제 로그 포맷/경로가 확인되지 않았다. ai-slide-video-factory repo는 현재 디스크에 없고(ls 결과 없음), services/youtube·founder-ui도 표준 구조의 실행로그 파일을 아직 안 남기는 것으로 보인다. 각 도구가 어디에 어떤 포맷(jsonl level/kind 필드?)으로 로그를 남기는지 확정해줘야 JsonlLogAdapter 매핑을 못 박을 수 있다. 1차 출시는 agent-tasks + 수동제보만으로 동작하고, 도구 로그 어댑터는 레지스트리에 'none'으로 시작해 점진 연결하는 안을 제안한다 — 승인?
- (tiger-collector) native_phase_runs(PhaseRunSink/PhaseRunPatch, native-orchestrator.ts)의 status='failed'/'held'가 CTO 워크플로우의 가장 풍부한 실패 신호원이다. 이걸 별도 어댑터(예: 'phase-runs')로 1급 소스로 넣을지, agent_tasks 상태로만 잡을지 결정 필요. 넣으면 CTO 자가개선 후보 품질이 크게 올라가지만 영속화 싱크(현재 NocoBase 비의존 주입형)의 실제 저장 위치 확인이 선행돼야 한다.
- (tiger-collector) 수동 제보 적재 경로: 텔레그램 봇/founder-ui 중 어디서 tiger-manual-reports.jsonl을 쓰게 할지(쓰기 주체)가 미정. 이 영역(수집기)은 읽기만 하면 되지만 짝이 되는 쓰기 경로 담당 영역과 파일 스키마를 합의해야 한다.
- (tiger-collector) 수집 윈도우(since): 마지막 수집 스냅샷 이후만 볼지, 매번 최근 24h 고정 윈도우로 볼지. 전자는 누락 0이지만 스냅샷 손상 시 폭주, 후자는 단순하지만 잡 누락 시 신호 유실. cmo-strategy-watch처럼 스냅샷 기반 권장하나 확정 필요.
- (tiger-night-bpr-loop) Claude CLI 실행기(runAgentCommand)를 hermes에서 agent-runtime dist로 직접 import할지, 아니면 ~50줄 child_process 코드를 hermes/src/api/claude-cli.ts로 이식할지. 권장은 이식(cto-native가 ACR spawn-runner 이식한 선례; monorepo cross-package dist 의존 회피). 사장님 결정 필요.
- (tiger-night-bpr-loop) BPRLog/WorkflowImprovementProposal 스키마에 repo_path 필드가 없음. cross-repo 디스패치(intent.project_path)에 필수인 repo_path를 (a)카드 state 파일에만 보관할지 (b)엔티티에 컬럼 추가(스키마 변경 D + DECISIONS.md)할지. 승인→CTO 전송 영역과 정합 필요.
- (tiger-night-bpr-loop) NocoBase에 bpr_logs / workflow_improvement_proposals 컬렉션이 실제로 정의·마이그레이션 되어 있는지 미확인(엔티티 타입만 존재). 컬렉션 부재 시 정의 추가가 선행되어야 하며 이는 별도 DB 영역 작업.
- (tiger-night-bpr-loop) Claude 분석 모델 선택: 비용 0(구독 무제한)이지만 야간 배치 품질 위해 opus vs sonnet. 후보 수가 적으면 단발이라 opus 권장, 많으면 sonnet 배치. 기본값 결정 필요.
- (tiger-night-bpr-loop) 수집기가 병목 후보를 어떤 state 파일 경로/스키마로 떨구는지 — 이 영역의 입력 계약. 수집기 영역과 BottleneckCandidate 스키마·경로 합의 필요.
- (self-improve-sidebar-page) target_repo를 카드에 어떻게 채울지: 호랑이 루프가 도구 레지스트리(확정 목록)를 코드 상수로 들고 executive+tool→절대경로를 매핑하는가, 아니면 별도 registry 테이블/JSON으로 둘 것인가? pulk 내부 도구는 repo root + 서브패스 표기(target_repo_label='pulk · services/youtube')로 합의 필요.
- (self-improve-sidebar-page) bulkApproveSelfImprove의 dispatch 단위: 카드 N개가 같은 repo를 가리킬 때 repo별로 1개 task로 묶을지(병렬 phase), 카드별 1 task로 N개 생성할지. 배경 기획은 'repo별 병렬 코딩'이라 했으므로 백엔드에서 target_repo로 group-by 하는 편이 맞아 보이나, 이 경우 UI BulkApproveResult.dispatched의 키를 proposal_id가 아니라 repo 묶음으로 바꿔야 함 — 확정 필요.
- (self-improve-sidebar-page) 🐯 자가개선 메뉴를 NAV_TOOLS(도구 섹션)에 둘지, 아니면 별도 상단 메뉴로 둘지. 현재 설계는 도구 섹션 말미에 배치.
- (tiger-cto-parallel-orchestration) WorkflowImprovementProposal에 target_repo 절대경로 필드를 additive로 추가할지(권장), 아니면 related_workflow_id→repo 매핑 테이블을 별도로 둘지 — 호랑이 카드 작성 영역과 필드 계약 확정 필요.
- (tiger-cto-parallel-orchestration) 그룹 동시성(코어수-2)만으로 충분한지, 아니면 native-orchestrator 내부 레벨 Promise.all도 동일 세마포어로 2차 상한을 둘지(한 repo에 카드가 매우 많을 때 spawn 폭주 방지).
- (tiger-cto-parallel-orchestration) 외부 repo(ai-slide-video-factory)의 표준 e2e/QA 명령(verify_command로 넣을 정확한 스크립트)이 무엇인지 — 해당 repo의 package.json 스크립트 확인 필요.
- (tiger-safety-data-learning-roadmap) 야간 잡 실행 시각: self-learning(09:00)·cmo-strategy-watch(09:05) 앞단인 08:30이 좋은지, 아니면 밤사이 누적 분석 의도로 03:00이 좋은지 사장님 결정 필요.
- (tiger-safety-data-learning-roadmap) 결과→MemoryEntry 회수를 기존 task-dispatcher 틱에 얹을지, 전용 회수 틱(예: night-bpr-collect)을 별도 launchd로 둘지. 디스패치/회수 책임 분리 여부 결정 필요.
- (tiger-safety-data-learning-roadmap) BPRLog/WorkflowImprovementProposal에 대상 repo 전용 필드가 없어 source_ref에 repo 키를 인코딩하는 방식으로 설계했는데, NocoBase 컬렉션에 repo_key 컬럼을 추가하는 편이 나을지(스키마 변경 → DECISIONS.md 기록 필요).
- (tiger-safety-data-learning-roadmap) 일괄 승인 시 self_mod_status를 tool-requests의 AgentTask 흐름에 합칠지, self-improve 전용 상태 필드를 둘지. UI/백엔드 상태 모델 통일 여부 결정 필요.

---

## 부록 A. 구현 시 만들거나 수정할 핵심 파일

- `/Users/wonminyang/Desktop/pulk/packages/l5-core/src/types/entities.ts`
- `/Users/wonminyang/Desktop/pulk/packages/l5-core/src/types/orchestration.ts`
- `/Users/wonminyang/Desktop/pulk/packages/l5-core/src/functions/tiger/tool-registry.ts`
- `/Users/wonminyang/Desktop/pulk/packages/l5-core/src/functions/tiger/__tests__/tool-registry.test.ts`
- `/Users/wonminyang/Desktop/pulk/packages/l5-core/src/index.ts`
- `/Users/wonminyang/Desktop/pulk/services/hermes-runtime/src/api/nocobase-client.ts`
- `/Users/wonminyang/Desktop/pulk/packages/l5-core/src/types/acr-intent.ts`
- `/Users/wonminyang/Desktop/pulk/services/hermes-runtime/src/loops/night-bpr-loop.ts`
- `packages/l5-core/src/functions/tiger-collector/index.ts`
- `packages/l5-core/src/functions/tiger-collector/types.ts`
- `packages/l5-core/src/functions/tiger-collector/collect-bottlenecks.ts`
- `packages/l5-core/src/functions/tiger-collector/__tests__/collect-bottlenecks.test.ts`
- `packages/l5-core/src/index.ts`
- `services/hermes-runtime/src/tiger/registry.ts`
- `services/hermes-runtime/src/tiger/adapters.ts`
- `services/hermes-runtime/src/tasks/tiger-collector.ts`
- `services/hermes-runtime/src/api/nocobase-client.ts`
- `services/hermes-runtime/src/loops/night-bpr-loop.ts`
- `packages/l5-core/src/functions/tiger/types.ts`
- `packages/l5-core/src/functions/tiger/prepare-candidates.ts`
- `packages/l5-core/src/functions/tiger/build-prompt.ts`
- `packages/l5-core/src/functions/tiger/parse-output.ts`
- `packages/l5-core/src/functions/tiger/card-mapping.ts`
- `packages/l5-core/src/functions/tiger/__tests__/`
- `services/hermes-runtime/src/api/claude-cli.ts`
- `services/hermes-runtime/src/loops/types.ts`
- `services/agent-runtime/src/orchestrator/spawn-agent.ts`
- `packages/l5-core/src/functions/cto-native/cli-command.ts`
- `services/hermes-runtime/src/notifier/telegram.ts`
- `apps/founder-ui/src/app/self-improve/page.tsx`
- `apps/founder-ui/src/lib/api.ts`
- `apps/founder-ui/src/components/Sidebar.tsx`
- `apps/nocobase-app/packages/plugins/@l5/plugin-executive-monitor/src/server/plugin.ts`
- `apps/founder-ui/src/components/Icon.tsx`
- `services/agent-runtime/src/orchestrator/native-orchestrator.ts`
- `services/agent-runtime/src/orchestrator/batch-runner.ts`
- `services/agent-runtime/src/orchestrator/worktree.ts`
- `packages/l5-core/src/functions/cto-native/batch-plan.ts`
- `packages/l5-core/src/functions/cto-native/parallelize.ts`
- `packages/l5-core/src/functions/cto-native/budget.ts`
- `packages/l5-core/src/functions/cto-native/recovery.ts`
- `packages/l5-core/src/types/acr-intent.ts`
- `packages/l5-core/src/types/entities.ts`
- `services/agent-runtime/src/agents/cto.ts`
- `packages/l5-core/src/functions/tiger/collect-candidates.ts`
- `packages/l5-core/src/functions/tiger/tiger-analyze.ts`
- `packages/l5-core/src/functions/tiger/proposal-to-task.ts`
- `packages/l5-core/src/functions/tiger/phase-result-to-memory.ts`
- `packages/l5-core/src/functions/tiger/tiger-registry.ts`
- `packages/l5-core/src/functions/tiger/__tests__/tiger-analyze.test.ts`
- `packages/l5-core/src/functions/cto-harness/boundary-check.ts`
- `services/hermes-runtime/src/tasks/task-dispatcher.ts`
- `services/hermes-runtime/src/gateway.ts`
- `services/hermes-runtime/src/runner.ts`
- `~/Library/LaunchAgents/com.l5.hermes.night-bpr-loop.plist`
