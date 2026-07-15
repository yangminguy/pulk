# P3-3 — Control Room = CTO Development Status (ACR-integrated)

Status: DESIGN (not yet implemented)
Author: research agent
Date: 2026-06-02

## 1. Problem & Goal

Today `apps/founder-ui/src/app/control-room/page.tsx` calls `api.currentTasks()` (a flat
list of `agent_tasks` filtered to `agent === 'CTO'`). There is:

- **no hierarchy** — Business ▸ Project ▸ dev-task is collapsed into one flat list,
- **no live ACR execution data** — branch, phase x/N, log tail are not shown (the page
  only links out to `http://localhost:3001`).

Goal: render the CTO's assigned work as a **Business ▸ Project ▸ dev-task** tree, each
dev-task showing its **owner agent**, **L5 status**, and **ACR execution data**
(`branch`, `phase x/N`, `status`, `log_tail`). Must degrade gracefully when ACR is down.

---

## 2. Ground truth found in the repo (read this before coding)

### 2.1 Where ACR lives

ACR (Agent Control Room) is a **separate Next.js repo**, not part of the pulk monorepo:

- Path: `/Users/wonminyang/Desktop/양원민 개발자/agent_control_room_docs`
- Web server: `http://localhost:3001` (launchd `com.l5.acr-web`, `next start -p 3001`)
- Daemon: `com.l5.acr-daemon` → `scripts/local-runner-daemon.mjs` (polls, runs agents)
- Resilience loop: `com.l5.acr-resilience`
- Confirmed **live** during research: `GET /api/agent-status` and `GET /api/multi-project`
  returned 200 JSON.

Shared secret between the two systems (from the daemon plist `EnvironmentVariables`):
`L5_SHARED_SECRET=l5-acr-live-e2e-2026`, `L5_BASE_URL=http://localhost:13000`.
(NOTE: `acr-client.ts` and `project-status-sync.ts` default `L5_BASE_URL` to `:13000`,
but `l5-callback/route.ts` defaults to `:13001`. This mismatch already exists; do not
"fix" it as part of this feature — just be aware when probing.)

### 2.2 How L5 ↔ ACR talk today

**Push (ACR → L5) — WORKS.** ACR posts to L5 `POST /api/agent:taskCallback`
(via ACR `app/api/l5-callback/route.ts`). The payload **already carries the execution
fields we want**:

```
l5_task_id, plan_id, phase, status, output_summary, next_owner,
diff_summary, log_tail, exit_code, branch, ... (questions, new_risk_level, merge_*)
```

Handler: `apps/nocobase-app/packages/plugins/@l5/plugin-orchestration/src/server/plugin.ts`,
resource `agent`, action `taskCallback` (line ~893–1129).

**Pull (L5 → ACR) — BROKEN / DEAD.** `services/hermes-runtime/src/api/acr-client.ts`
exports `getProject(projectId)` → `GET /api/projects/<id>` and
`getFeaturePlans(projectId)` → `GET /api/feature-plans?projectId=...`.
**Neither route exists in ACR.** Verified:
- `app/api/projects/route.ts` only defines `POST` (registration). There is **no GET**,
  and **no `app/api/projects/[id]/route.ts`** (confirmed missing).
- There is **no `app/api/feature-plans/` route** at all.

So both pull helpers always throw → caught → return `null`. The only consumer,
`project-status-sync.ts`, already tolerates this (it just omits the CTO plan section).
**Do not build the new feature on `acr-client.getFeaturePlans`/`getProject` — they
return nothing.**

### 2.3 Where the real ACR execution data actually lives

ACR persists state as JSON files under
`/Users/wonminyang/Desktop/양원민 개발자/agent_control_room_docs/data/`:

| File | Shape (verified) | Gives us |
|---|---|---|
| `feature-plans.json` | array of `{ projectId, title, userGoal, status, tasks:[{ id, planId, title, status, assignedAgent, priority, acceptanceCriteria, ... }] }` | **phase/step list + per-task assignedAgent + status** (the "x of N" denominator) |
| `workspaces.json` | array of `{ id, taskId, primaryAgent, runtimeId, branchName, status, changedFiles[], artifacts[], createdAt, updatedAt }` | **branch name + workspace status + changed-file count** per task |
| `execution-logs.json` | execution log entries (≈57KB) | **log tail** |
| `projects.json` | array of `{ id, name, path }` (43 rows). IDs are L5-prefixed, e.g. `l5-<businessId>` and bare `<taskId>` | project↔path mapping |

Key join keys observed:
- `feature-plans.json[].projectId` === e.g. `l5-0b54dbfa-...` (an L5 task/business id with `l5-` prefix).
- `feature-plans.json[].tasks[].id` === e.g.
  `l5-0b54dbfa-...-1780409929295-task-1` and
- `workspaces.json[].taskId` === the **same** task id form
  (`l5-0b54dbfa-...-1780409929295-task-5`), with `branchName`
  `task-l5-0b54dbfa-...-task-5-ws-b819fea0` and `status: "running"`.

So **ACR task id = feature-plan task id = workspace taskId** is the join key for
branch/phase/log. workspace `status` enum: `created | running | archived | needs_review`.

**There is NO HTTP GET endpoint that returns feature-plans or workspaces.**
The data is only reachable by **reading the JSON files** or by adding a new GET route to
ACR. Available ACR GET routes that touch execution state are coarse:
`/api/dashboard` (KPI snapshot only — returned all-zero/empty during research),
`/api/multi-project` (orchestrator slots), `/api/orchestration/logs` (global event log),
`/api/roadmap?projectId=` (needs a roadmap-store entry, 404 otherwise).
None of these give per-task branch+phase+log keyed by L5 task id.

### 2.4 L5 side data model (what we can join against)

`agent_tasks` columns relevant here (defined in orchestration
`src/server/plugin.ts` ~line 233–262):
`id, title, assigned_agent, status, risk_level, phase, business_id, project_id,
instruction_id, approval_required, blocker, output_summary, expected_output, updated_at`.

**Important gap:** `taskCallback` receives `branch`/`log_tail`/`exit_code` but **does NOT
persist them as columns**. It writes `phase` context only into the free-text `blocker`
field as a compact `phaseCtx` string (`phase=… branch=… exit=… diff_lines=…`) and to
`console.log`. The `phase` *column* exists but `taskCallback` never updates it either.
So **L5's DB alone cannot supply branch/phase-x-of-N/log_tail** — that is exactly why we
need the ACR adapter.

Hierarchy tables (preserved):
- `businesses` (`id, title, one_liner, status`) — read via `business:listActive`
  (`plugin-business-portfolio/src/server/plugin.ts` ~line 307).
- `projects` (`id, business_id, title, description, status, repo_path`) — collection
  `plugin-business-portfolio/src/server/collections/projects.ts`; read via
  `project:listActive?business_id=` (~line 336).
- `agent_tasks.business_id` / `agent_tasks.project_id` already exist for mapping
  dev-tasks → project → business.

L5 read API the founder-ui already uses:
- `GET /api/business:listActive` → `api.listBusinesses?` (see api client) ... actually
  business list is fetched in other pages; project list via
  `GET /api/project:listActive?business_id=` (`api.listProjects`, api.ts ~line 377).
- `GET /api/monitor:currentTasks?business_id=` → `api.currentTasks`
  (defined in **plugin-executive-monitor** `src/server/plugin.ts`
  `currentTasks()` ~line 53, NOT in orchestration).

---

## 3. Decision: how to fetch ACR execution data

Because ACR exposes **no usable GET API** for per-task branch/phase/log, and the JSON
files are the source of truth, we choose:

> **Primary: a small new GET route in ACR that serves the join we need, consumed by an
> L5 plugin transport. Fallback: derive a degraded view from `agent_tasks` only.**

Two implementation options were considered:

- **Option A (chosen): add one read-only GET endpoint to ACR** that reads
  `feature-plans.json` + `workspaces.json` + tails `execution-logs.json` and returns a
  compact per-L5-task execution record. Clean HTTP boundary, no cross-repo filesystem
  coupling from inside NocoBase, matches the existing `notifyACR*`/`registerACRProject`
  HTTP pattern. **This is the only change required in the ACR repo.**
- **Option B (rejected): read ACR's JSON files directly from the NocoBase plugin.** This
  couples the pulk monorepo to an absolute path outside it (`/Users/wonminyang/Desktop/양원민 개발자/...`),
  is brittle to ACR refactors, and crosses the L5↔ACR trust boundary by filesystem. Use
  only as a last resort if the ACR route cannot be added.

Both options keep ACR optional: if the endpoint/file is unreachable, the adapter returns
`null` per task and the UI shows L5-only status (Section 3.4).

### 3.1 New ACR endpoint (Option A)

`GET /api/l5/execution?projectId=<acrProjectId>` (new file
`app/api/l5/execution/route.ts` in the ACR repo).

- Auth: require header `x-l5-shared-secret: <L5_SHARED_SECRET>` (same secret already
  shared with the daemon). Reject otherwise with 401.
- Reads `data/feature-plans.json` (filter by `projectId`), `data/workspaces.json`
  (index by `taskId`), `data/execution-logs.json` (last N lines per taskId).
- Response (one entry per ACR/feature-plan task):

```jsonc
{
  "projectId": "l5-0b54dbfa-...",
  "plan_status": "planned",
  "tasks": [
    {
      "acr_task_id": "l5-0b54dbfa-...-1780409929295-task-5",
      "title": "...",
      "assigned_agent": "claude-code",
      "plan_status": "running",          // feature-plan task.status
      "phase_index": 5, "phase_total": 8, // index/N derived from tasks[] order
      "branch": "task-l5-...-task-5-ws-b819fea0", // workspace.branchName
      "workspace_status": "running",      // workspace.status
      "changed_files": 0,
      "log_tail": "…last ~40 lines…",     // optional, may be ""
      "updated_at": "2026-06-02T…"
    }
  ],
  "generated_at": "..."
}
```

`phase_total` = `tasks.length`; `phase_index` = 1-based position of the running/last task
(or count of `done`+1). Keep `log_tail` capped (~2KB) to keep the payload small.

### 3.2 L5 transport adapter (plugin transport, like secondbrain-transport.ts)

New file:
`apps/nocobase-app/packages/plugins/@l5/plugin-orchestration/src/server/acr-execution-transport.ts`

Model it on `src/server/secondbrain-transport.ts` (graceful-null pattern):

```ts
// ENV: ACR_BASE_URL (default http://localhost:3001), L5_SHARED_SECRET
// Returns null when ACR_BASE_URL is unset/unreachable.
export interface AcrExecTask {
  acr_task_id: string; assigned_agent: string | null;
  plan_status: string | null; phase_index: number | null; phase_total: number | null;
  branch: string | null; workspace_status: string | null;
  changed_files: number | null; log_tail: string | null; updated_at: string | null;
}
export interface AcrExecutionTransport {
  fetchExecution(acrProjectId: string): Promise<AcrExecTask[]>; // [] on any failure
}
export function makeAcrExecutionTransport(): AcrExecutionTransport | null;
```

- Uses `fetch(`${ACR_BASE_URL}/api/l5/execution?projectId=...`, { headers:{'x-l5-shared-secret':…}, signal: AbortSignal.timeout(4000) })`.
- Any non-200 / timeout / parse error → returns `[]` (never throws). Log a single warn.

### 3.3 Pure mapping in l5-core (testable, no NocoBase, no network)

New file: `packages/l5-core/src/functions/cto-control-room/build-control-room-tree.ts`
(+ `__tests__/build-control-room-tree.test.ts`). Pure function:

```ts
interface BuildArgs {
  businesses: { id: string; name: string }[];
  projects:   { id: string; business_id: string; name: string; status: string }[];
  ctoTasks:   { id: string; title: string; assigned_agent: string; status: string;
                risk_level: string|null; phase: string|null; blocker: string|null;
                business_id: string|null; project_id: string|null;
                approval_required: boolean; updated_at: string }[];
  acrByTaskId: Record<string, AcrExecTask>; // keyed by l5 task id (== acr_task_id)
}
// returns Business[] -> Project[] -> DevTask[] with merged ACR fields:
//   { branch, phase_label: "x / N" | null, exec_status, log_tail, agent, l5_status }
function buildControlRoomTree(args: BuildArgs): BusinessNode[];
```

Rules (export as unit-tested behaviour, per CLAUDE.md rule 3):
- Group `ctoTasks` by `business_id` then `project_id`. Tasks with null `project_id` go
  under a synthetic `"(no project)"` node inside their business; null `business_id` → a
  top-level `"(common)"` business node.
- ACR merge: look up `acrByTaskId[task.id]`. If present → fill
  `branch`, `phase_label = phase_index + " / " + phase_total`, `exec_status =
  workspace_status ?? plan_status`, `log_tail`. If absent → those fields `null` and the
  UI shows an "ACR 연결 안 됨 / 실행정보 없음" placeholder (degraded mode).
- Never drop a task because ACR is missing — L5 status (`status`, `blocker`) always shown.
- This is the only place mapping logic lives — UI stays presentation-only (CLAUDE.md
  Forbidden: no domain logic in UI components).

Export it from `packages/l5-core/src/index.ts` (alongside `buildProjectStatusMarkdown`).

### 3.4 Graceful degradation summary

| Condition | Behaviour |
|---|---|
| ACR endpoint 200 | Full tree with branch / phase x/N / status / log tail. |
| ACR down / 401 / timeout | Transport returns `[]`; tree still renders from `agent_tasks`; per-task ACR fields show "실행정보 없음"; a single non-blocking banner "Agent Control Room에 연결할 수 없습니다". |
| ACR endpoint not yet deployed | Same as "down" — feature ships usefully before the ACR route exists. |

---

## 4. Hierarchy API (L5 plugin action)

Add **one new action** that returns the assembled tree so the UI makes a single call.

Resource/action: `GET /api/monitor:controlRoomTree?business_id=<optional>`
(placed in **plugin-executive-monitor**, where the other `monitor:*` read actions live).

### Edit points

Source:
`apps/nocobase-app/packages/plugins/@l5/plugin-executive-monitor/src/server/plugin.ts`
- Add `controlRoomTree` function next to `currentTasks` (~line 53) and register it in the
  `monitor` resource `actions` map + `this.app.acl.allow('monitor', ['controlRoomTree'], 'loggedIn')`.
- Implementation:
  1. `business:listActive`-equivalent query (or reuse the same `SELECT … FROM businesses`).
  2. `SELECT id, business_id, title, status FROM projects WHERE status!='deleted'`
     (+ optional `business_id` filter).
  3. `agent_tasks.find({ filter: { assigned_agent: 'CTO', status: { $notIn:['done','killed'] } , …businessScope } })`
     reusing the existing `withBusinessFilter` / `readBusinessScope` helpers in this file.
  4. For each distinct `business_id` (mapped to the ACR projectId form `l5-<businessId>`),
     call the transport `makeAcrExecutionTransport()?.fetchExecution(acrProjectId)`,
     build `acrByTaskId` from results.
  5. Call `buildControlRoomTree(...)` from `@l5/core` and set `ctx.body = { ok:true, data: tree }`.

  Note on projectId form: ACR `feature-plans.json` keys by `l5-<businessId>` (and bare
  `<taskId>`). The transport call should pass the **business-level** ACR project id
  (`l5-${business_id}`); the returned tasks are matched back to L5 tasks by
  `acr_task_id === agent_tasks.id`. Confirm the exact prefix against
  `data/projects.json` at implementation time (research saw both `l5-<id>` and `<id>`).

Runtime (dist) patch — **both must be patched** per repo convention
(see MEMORY "NocoBase plugin dist patching"):
`apps/nocobase-app/packages/plugins/@l5/plugin-executive-monitor/dist/plugin.js`
- Add the same `controlRoomTree` action + ACL into the bundled file. The dist is a single
  bundled `plugin.js` (~confirmed for orchestration; executive-monitor dist also single
  file). The transport + l5-core mapping must be reachable from dist — prefer importing
  the **built** `@l5/core` (`packages/l5-core/dist/...`) the way
  `secondbrain-transport.ts` imports `packages/l5-core/dist/functions/memory/...`.
- Remember the GET querystring gotcha (MEMORY): read `ctx.request.query` first, then fall
  back to `ctx.action.params.values` (NocoBase pre-fills `values={}` on GET).

### Founder-ui api client

Edit `apps/founder-ui/src/lib/api.ts`:
- Add types `ControlRoomBusiness / ControlRoomProject / ControlRoomDevTask` mirroring the
  l5-core node shape (incl. `branch`, `phase_label`, `exec_status`, `log_tail`, `agent`).
- Add `controlRoomTree: (businessId?: string|null) => request<…>('/api/monitor:controlRoomTree…')`
  following the existing `currentTasks` pattern (unwrap `{ok,data}`, `.catch(()=>[])`).

---

## 5. Founder UI redesign — `control-room/page.tsx`

Keep the existing Joinery tokens, `AuthGate`, `StatusBadge`, `RISK_STYLES`,
`relativeTime`, icons, and the header (CTO / Control Room + auto-refresh + "Agent Control
Room" external button). Replace only the data + body.

### Component structure (all in `control-room/page.tsx`, presentation only)

```
ControlRoomContent
 ├─ BusinessProjectSelector   // business dropdown -> sets businessId; "전체" option
 ├─ (banner) ACR 연결 안 됨    // shown when every dev-task has null branch/exec_status
 └─ tree:
     BusinessNode (collapsible section, business name + task count)
       └─ ProjectNode (sub-section, project title + status pill)
            └─ DevTaskRow
                 ├─ agent chip (assigned_agent, reuse CTO chip style; support claude-code/codex/antigravity)
                 ├─ StatusBadge (l5 status)  + risk badge + 승인필요 badge (reuse)
                 ├─ ACR strip: branch (mono), "phase x / N", exec_status dot
                 ├─ blocker box (reuse existing red box) when present
                 └─ expandable <pre> log_tail (collapsed by default; only if log_tail)
```

Data flow:
- On mount + on `businessId` change + every 30s (keep existing `autoRefresh` toggle):
  `const tree = await api.controlRoomTree(businessId)`.
- Replace the current `api.currentTasks()` + `filter(t=>t.agent==='CTO')` (lines 131–142).
  CTO filtering now happens server-side in `controlRoomTree`.

### Reuse `RoadmapTimeline.tsx`?

`apps/founder-ui/src/components/RoadmapTimeline.tsx` exists and renders a phase timeline.
**Reuse is optional and secondary**: the dev-task "phase x / N" is a single scalar from
ACR, not a full roadmap, so a compact inline `x / N` indicator (mono text + small
progress bar) is enough and lighter. Only pull in `RoadmapTimeline` if we later want the
full per-plan phase list in an expanded dev-task drawer. For P3-3, do **not** add it —
keep the row compact. (Note `RoadmapMiniCard.tsx` also exists for chat preview.)

---

## 6. Ordered slices

| # | Slice | Effort | Depends on | Notes / risk |
|---|---|---|---|---|
| S1 | l5-core `buildControlRoomTree` pure fn + unit tests | **M** | — | No network. Covers grouping, null business/project, ACR-present vs absent merge. Unblocks everything; testable per CLAUDE.md rule 3. |
| S2 | ACR endpoint `GET /api/l5/execution` (ACR repo) + shared-secret auth | **M** | — | **Cross-repo edit** (outside pulk). Read-only over JSON files. Risk: ACR refactors file shapes. Verify join-key prefix against `data/projects.json`. |
| S3 | `acr-execution-transport.ts` (graceful-null) | **S** | S2 | Mirror secondbrain-transport. Returns `[]` on any failure. |
| S4 | `monitor:controlRoomTree` action — **src** edit | **M** | S1,S3 | Reuse `withBusinessFilter`/`readBusinessScope`. Import built `@l5/core`. |
| S5 | Mirror S4 into **dist/plugin.js** + ACL | **S** | S4 | Repo convention; watch GET querystring gotcha. |
| S6 | api client: types + `controlRoomTree()` | **S** | S4 | Mirror `currentTasks` unwrap/catch. |
| S7 | `control-room/page.tsx` redesign (selector + tree + ACR strip + log drawer) | **L** | S6 | Reuse existing badges/tokens/header. Presentation only. |
| S8 | Manual verification + docs (HANDOFF/TASKS/DECISIONS) | **S** | S7 | See Section 8. |

Ship order also supports a **degraded-first** path: S1+S4(without transport)+S6+S7 can
ship a hierarchy view from `agent_tasks` alone; S2/S3 then light up the ACR strip. If S2
(ACR cross-repo change) is blocked, ship S1+S4+S6+S7 with ACR fields permanently null
(documented fallback) — still a strict improvement over today's flat list.

---

## 7. Risks & open questions

1. **ACR coupling / cross-repo change (S2).** The only clean source of branch/phase/log is
   inside the ACR repo. Adding `GET /api/l5/execution` requires editing
   `/Users/wonminyang/Desktop/양원민 개발자/agent_control_room_docs`. If that repo is
   off-limits, fall back to Option B (read JSON files from the plugin via an absolute
   path env `ACR_DATA_DIR`) or to the degraded `agent_tasks`-only view.
2. **Auth.** Reuse `L5_SHARED_SECRET` (already on both sides) for the new ACR GET; do not
   invent a new token. No secret hardcoding (CLAUDE.md rule 9) — read from env.
3. **Join-key prefix ambiguity.** `feature-plans.json` keys by `l5-<businessId>` while
   workspaces/feature-plan **tasks** key by `l5-<businessId>-<ts>-task-N`. The L5
   `agent_tasks.id` must equal `acr_task_id` for the merge; confirm at S4 time with a live
   sample (research saw matching forms, but verify the exact `agent_tasks.id` value a CTO
   dispatch writes vs what ACR stores).
4. **No persisted branch/log in L5.** `taskCallback` does not store `branch`/`log_tail`
   columns (only embeds in `blocker` text). So the ACR adapter is the *only* live source —
   there is no DB shortcut. (Optional future: persist `branch`/`phase`/`log_tail` columns
   in `taskCallback` so the UI could fall back to last-known values when ACR is offline.
   Out of scope for P3-3.)
5. **`acr-client.ts` dead pull helpers.** `getProject`/`getFeaturePlans` target
   non-existent ACR routes. This spec does **not** depend on or repair them; leave as-is
   (their only consumer already tolerates null). Mention in DECISIONS if we later remove.
6. **L5_BASE_URL port mismatch** (`:13000` vs `:13001`) pre-exists; unrelated to this
   feature — do not change here.

---

## 8. Done-when (verification)

- `buildControlRoomTree` unit tests pass (ACR-present, ACR-absent, null business/project,
  multi-business grouping).
- `GET /api/monitor:controlRoomTree` returns a nested tree; with ACR up the dev-tasks
  carry `branch`/`phase_label`/`exec_status`/`log_tail`; with ACR stopped
  (`launchctl stop com.l5.acr-web`) the same call still returns the tree with those fields
  null and no 500.
- Founder UI `/control-room` renders Business ▸ Project ▸ dev-task with owner agent + L5
  status + ACR strip, and shows the degraded banner when ACR is down.
- `docs/TASKS.md`, `docs/HANDOFF.md` updated; the ACR-coupling decision recorded in
  `docs/DECISIONS.md` (CLAUDE.md "Done When").

---

## Appendix — concrete file references

ACR repo (`/Users/wonminyang/Desktop/양원민 개발자/agent_control_room_docs`):
- `app/api/l5-callback/route.ts` — push payload fields (branch/phase/log_tail/exit_code).
- `app/api/projects/route.ts` — POST-only registration; no GET; no `[id]` route.
- `data/feature-plans.json`, `data/workspaces.json`, `data/execution-logs.json`,
  `data/projects.json` — real execution state.
- NEW: `app/api/l5/execution/route.ts` (S2).

pulk monorepo:
- `services/hermes-runtime/src/api/acr-client.ts` — existing HTTP client (dead pull helpers).
- `apps/nocobase-app/packages/plugins/@l5/plugin-orchestration/src/server/plugin.ts`
  — `agent:taskCallback` (~893–1129); agent_tasks columns (~233–262).
- `apps/nocobase-app/packages/plugins/@l5/plugin-orchestration/src/server/secondbrain-transport.ts`
  — transport pattern to mirror; imports built `@l5/core` from `packages/l5-core/dist/...`.
- NEW: `…/plugin-orchestration/src/server/acr-execution-transport.ts` (S3).
- `apps/nocobase-app/packages/plugins/@l5/plugin-executive-monitor/src/server/plugin.ts`
  — `monitor:currentTasks` (~53), `withBusinessFilter`/`readBusinessScope`,
  `roadmap:list`; add `controlRoomTree` here (S4). Dist: `…/dist/plugin.js` (S5).
- `apps/nocobase-app/packages/plugins/@l5/plugin-business-portfolio/src/server/plugin.ts`
  — `business:listActive` (~307), `project:listActive` (~336).
- `apps/nocobase-app/packages/plugins/@l5/plugin-business-portfolio/src/server/collections/projects.ts`
  — projects collection fields.
- NEW: `packages/l5-core/src/functions/cto-control-room/build-control-room-tree.ts`
  (+ tests) (S1); export from `packages/l5-core/src/index.ts`.
- `apps/founder-ui/src/lib/api.ts` — `currentTasks`/`listProjects` patterns; add
  `controlRoomTree` (S6).
- `apps/founder-ui/src/app/control-room/page.tsx` — redesign (S7).
- `apps/founder-ui/src/components/RoadmapTimeline.tsx` / `RoadmapMiniCard.tsx` — optional,
  not used in P3-3.
- `apps/founder-ui/src/components/Sidebar.tsx` — existing `/control-room` nav entry (no change).
