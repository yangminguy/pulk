# P2 — Real-time Agent Monitoring (Implementation Spec)

Status: DESIGN (not implemented). Author: AI engineer / tech PM. Date: 2026-06-02.

## 0. Goal

After the founder assigns work to the CEO and approves the plan, the founder needs to
SEE, in near-real time, what each executive agent is doing — grouped under the founder
instruction that spawned the work:

- 🔍 investigating — calling tools (secondbrain.read, video-factory, etc.)
- 💬 talking — to another executive (delegation) or to the founder (consultation)
- ⏳ awaiting founder — paused on a founder answer
- 🧠 under CEO review — executive finished, CEO reviewing / verifier ran
- ✓ done — completed
- ⛔ blocked — hard blocker (dispatcher/ACR)

UI: group by founder instruction → under each, one card per agent with a live status
dot + a one-line "current action" + the counterpart (who it is talking to).

## 1. Decision: DB-derived status is enough for v1 (no new in-flight table)

The data to derive "current action" ALREADY EXISTS:

- `agent_tasks.status` ∈ {queued, running, blocked, needs_review, done, killed}
- `agent_tasks.blocker` prefix conventions, written by `plugin-orchestration`:
  - `awaiting_founder: <q>` (ask_founder tool — `executeTask`, plugin.ts ~L1234)
  - `awaiting_delegation: <delegationId>` (ask_executive tool — plugin.ts ~L1272)
  - `verifier:fail|inconclusive ...`, `clarification:escalate ...`, `empty_output: ...`,
    `merge_conflict ...` (CEO-review-lane blockers — `taskCallback`)
  - `done.<merge note> phase=...` (completed)
- `executive_consultations` (M4): `status=awaiting_founder|resolved`, `from_agent`, `task_id`, `question`
- `executive_delegations` (M6): `status=open|in_progress|resolved|escalated`, `from_agent`, `to_agent`,
  `origin_task_id`, `work_task_id`, `round`, `max_rounds`, `objective`

### Why NOT add a `task_activity` table for v1

The executive tool-loop (`packages/l5-core/src/functions/executive-runtime/tool-loop.ts`)
runs **synchronously inside a single HTTP `agent:executeTask` call**, and active
tool-calling is **OFF by default** (`L5_EXECUTIVE_TOOLS !== '1'`, plugin.ts L1337). When
tools are off, the executive only does a fast secondbrain READ for context and emits the
deliverable; there is no multi-second "investigating: secondbrain.read" window to surface.
The loop already has `invokedTools: string[]` (tool-loop.ts L164) and opt-in stderr
`L5_TOOL_LOOP_DEBUG` (L169) — but it writes nothing to the DB, and adding per-tool DB
writes would mean threading a DB writer into pure `l5-core` domain code (violates
"l5-core must be testable without NocoBase", CLAUDE.md rule 2). For v1 we therefore derive
`investigating` from coarse DB state (`status=running`) and label the tool generically.

**Deferred (P3, only if tool-calling is enabled on an async path):** a minimal
`task_activity(task_id, tool_name, phase, "createdAt")` upsert written by the plugin
wrapper around `executeAgentTaskLive` (NOT by l5-core), surfaced as `current_tool`. Spec'd
in §5 so it is not re-litigated. Not built in P2.

## 2. Live-status derivation (precise mapping)

Computed per `agent_tasks` row, using its joined delegation/consultation rows.

Inputs per task:
- `t.status`, `t.blocker` (string|null), `t.assigned_agent`, `t.approval_required`
- `consult` = latest `executive_consultations` WHERE `task_id = t.id` AND `status='awaiting_founder'`
- `delegOut` = `executive_delegations` WHERE `origin_task_id = t.id` AND `status IN ('open','in_progress')`
  (this task is the *requester*, waiting on a delegate)
- `delegIn` = `executive_delegations` WHERE `work_task_id = t.id` AND `status IN ('open','in_progress')`
  (this task IS the delegated worker doing the work)

Derivation order (first match wins):

| # | Condition | live_status | counterpart | current_action one-liner |
|---|-----------|-------------|-------------|--------------------------|
| 1 | `status='done'` | `done` | — | `완료` (+ merge note if present in blocker) |
| 2 | `status='killed'` | `done` (hidden) | — | row excluded from active view |
| 3 | `status='blocked'` | `blocked` | — | blocker text (first 120 chars) |
| 4 | `status='needs_review'` AND `blocker LIKE 'awaiting_founder:%'` (or `consult` exists) | `awaiting_founder` | `Founder` | `창업자 답변 대기: <question or blocker tail>` |
| 5 | `status='needs_review'` AND `blocker LIKE 'awaiting_delegation:%'` (or `delegOut` exists) | `talking` | `delegOut.to_agent` | `<to_agent>에게 위임 — <objective 60c> (round <r>/<max>)` |
| 6 | `status='needs_review'` (any other blocker: verifier/clarification/empty_output/merge_conflict) | `under_review` | `CEO` | `CEO 검토 중: <blocker reason 80c>` |
| 7 | `status='running'` AND `delegIn` exists | `talking` | `delegIn.from_agent` | `<from_agent>의 위임 수행 중 — <objective 60c>` |
| 8 | `status='running'` | `investigating` | — | `작업 수행 중…` (P3: `조사 중: <current_tool>`) |
| 9 | `status='queued'` AND `approval_required=true` | `awaiting_founder` | `Founder` | `승인 대기 중` |
| 10 | `status='queued'` | `queued` | — | `대기열` |

Notes:
- Rows 4/5 use the **blocker prefix as the primary signal** (always written by the
  orchestration plugin) and the consultation/delegation row as the **enrichment** for the
  one-liner (question text, objective, round). If the join row is missing (race), fall
  back to the blocker tail so the card never goes blank.
- `talking` carries a direction: row 5 = "→ down to a delegate", row 7 = "← doing a peer's
  delegated work", row 4 = "→ up to founder" (consultation). The UI shows `→ <counterpart>`.

### Repository queries (NocoBase repo API, matches existing plugin style)

In `plugin-executive-monitor/src/server/plugin.ts`, add a `liveStatus(ctx)` helper modeled
on `currentTasks` (L53) + `withInstructionSnippets` (L505). Pseudocode:

```ts
async function liveStatus(ctx: MonitorContext) {
  const db = ctx.db || ctx.app.db;
  const scope = readBusinessScope(ctx);                // reuse existing helper (L38)
  const rawQuery = (ctx as any).request?.query ?? {};
  const instructionId = rawQuery['instruction_id'] || null;

  const taskFilter: any = withBusinessFilter(
    { status: { $notIn: ['killed'] } },                // keep 'done' so groups show ✓
    scope,
  );
  if (instructionId) taskFilter.instruction_id = instructionId;

  const tasks = await db.getRepository('agent_tasks').find({
    filter: taskFilter,
    sort: ['-updated_at'],
  });

  const taskIds = tasks.map((t: any) => t.id);

  // Two scoped reads instead of N+1 — reuse existing repos.
  const consults = taskIds.length
    ? await db.getRepository('executive_consultations').find({
        filter: { task_id: { $in: taskIds }, status: 'awaiting_founder' },
      })
    : [];
  const delegs = taskIds.length
    ? await db.getRepository('executive_delegations').find({
        filter: {
          status: { $in: ['open', 'in_progress'] },
          $or: [
            { origin_task_id: { $in: taskIds } },
            { work_task_id:   { $in: taskIds } },
          ],
        },
      })
    : [];

  // Index for O(1) lookup
  const consultByTask  = new Map(consults.map((c: any) => [String(c.task_id), c]));
  const delegByOrigin  = new Map(delegs.filter((d:any)=>d.origin_task_id).map((d:any)=>[String(d.origin_task_id), d]));
  const delegByWork    = new Map(delegs.filter((d:any)=>d.work_task_id).map((d:any)=>[String(d.work_task_id), d]));

  // Instruction snippets — reuse withInstructionSnippets pattern (one find per distinct instruction_id; dedupe).
  const enriched = await Promise.all(tasks.map(async (t:any) => {
    const instr = t.instruction_id
      ? await db.getRepository('founder_instructions').findOne({ filter: { id: t.instruction_id } })
      : null;
    const derived = deriveLiveStatus(t, {
      consult: consultByTask.get(String(t.id)) ?? null,
      delegOut: delegByOrigin.get(String(t.id)) ?? null,
      delegIn:  delegByWork.get(String(t.id)) ?? null,
    });
    return {
      task_id: t.id,
      instruction_id: t.instruction_id,
      instruction_text: instr ? String(instr.raw_text).slice(0, 160) : null,
      agent: t.assigned_agent,
      task_title: t.title,
      raw_status: t.status,
      live_status: derived.live_status,       // queued|investigating|talking|awaiting_founder|under_review|done|blocked
      counterpart: derived.counterpart,       // 'Founder' | 'CEO' | '<AGENT>' | null
      current_action: derived.current_action, // one-line string
      risk_level: t.risk_level,
      phase: t.phase,
      approval_required: t.approval_required,
      updated_at: t.updated_at ?? t.updatedAt,
    };
  }));

  // Group by instruction
  const groups = new Map<string, any>();
  for (const row of enriched) {
    const key = row.instruction_id ?? '__none__';
    if (!groups.has(key)) groups.set(key, {
      instruction_id: row.instruction_id,
      instruction_text: row.instruction_text,
      agents: [],
    });
    groups.get(key).agents.push(row);
  }

  ctx.body = { ok: true, data: Array.from(groups.values()) };
}
```

`deriveLiveStatus` is a **pure function** — put it in
`packages/l5-core/src/functions/monitor/live-status.ts` (new) with unit tests
(`__tests__/live-status.test.ts`) covering each of the 10 rows. This satisfies CLAUDE.md
rule 3 ("every scoring rule must have unit tests") and keeps judgment logic out of the
plugin/UI. The plugin imports it via the same `require(path.resolve(__dirname, '.../dist/functions/monitor'))`
pattern used at the top of both plugins.

## 3. New plugin action — `monitor:liveStatus`

Owner plugin: **`@l5/plugin-executive-monitor`** (it already owns the `monitor` resource).

### Source edit points (`src/server/plugin.ts`)

1. Add `import` of `deriveLiveStatus` near the top `require(...)` block (L7–13 region):
   ```ts
   const { deriveLiveStatus } =
     require(path.resolve(__dirname, '../../../../../../../packages/l5-core/dist/functions/monitor'));
   ```
2. Add `async function liveStatus(ctx)` next to `currentTasks` (after L143).
3. Register the action inside the `monitor` resource block (after `projectTimeline`, L803):
   ```ts
   liveStatus: async (ctx, next) => { await liveStatus(ctx); await next(); },
   ```
4. Add `'liveStatus'` to the `this.app.acl.allow('monitor', [...], 'loggedIn')` array (L849–860).
5. (Optional, mirror existing GET convenience routes L845–847):
   `registerGetRoute(this.app, '/api/monitor/liveStatus', liveStatus);`

### Dist mirror (REQUIRED — runtime loads bundled `dist/plugin.js`)

Per project convention (memory: "NocoBase plugin dist patching"), every src change is
mirrored to the bundle. `dist/plugin.js` is a single minified bundle containing
`currentTasks` / `withInstructionSnippets` (confirmed: 13 matches). Two options:

- **Preferred:** rebuild the plugin (`yarn build` in the plugin dir) so `dist/plugin.js`
  regenerates from src. Verify the new action appears: `grep -c liveStatus dist/plugin.js`.
- **Fallback (if build unavailable):** hand-patch `dist/plugin.js` — add the `liveStatus`
  function body, the resource action entry, and the ACL string, mirroring src exactly.
  Inline the `deriveLiveStatus` logic (don't rely on the dist require resolving) OR ensure
  `packages/l5-core/dist/functions/monitor/index.js` is built first. Back up with
  `cp dist/plugin.js dist/plugin.js.bak.$(date +%s)` (existing convention — see existing
  `.bak.<ts>` files).

GET handlers read `ctx.request.query` first (memory: GET query gotcha) — already the
pattern in `readBusinessScope` (L39). `instruction_id` is optional; absent = all active
instructions in scope.

### Response shape

```jsonc
{
  "ok": true,
  "data": [
    {
      "instruction_id": "uuid|null",
      "instruction_text": "리드 30명에게 콜드 아웃리치 …",   // first 160 chars, null for ungrouped
      "agents": [
        {
          "task_id": "uuid",
          "agent": "CMO",
          "task_title": "아웃리치 메시지 초안",
          "raw_status": "needs_review",
          "live_status": "awaiting_founder",
          "counterpart": "Founder",
          "current_action": "창업자 답변 대기: 어떤 톤으로 보낼까요?",
          "risk_level": "D3",
          "phase": "market_pmf_diagnosis",
          "approval_required": false,
          "updated_at": "2026-06-02T12:00:00.000Z"
        }
      ]
    }
  ]
}
```

## 4. Founder UI redesign — `apps/founder-ui/src/app/monitor/page.tsx`

Replace the flat `currentTasks`+`blockedTasks` merge (page.tsx L637–653) with an
instruction-grouped live view. Keep `PhaseTransitionPanel` (L149) and the page header
untouched. The filter-tab block (L739) is dropped in favor of grouping; an `autoRefresh`
toggle is kept.

### API client (`src/lib/api.ts`)

Add a `liveStatus` method mirroring `currentTasks` (L232):

```ts
export type LiveAgent = {
  task_id: string; agent: string; task_title: string;
  raw_status: string;
  live_status: 'queued'|'investigating'|'talking'|'awaiting_founder'|'under_review'|'done'|'blocked';
  counterpart: 'Founder'|'CEO'|string|null;
  current_action: string;
  risk_level: string|null; phase: string|null;
  approval_required: boolean; updated_at: string|null;
};
export type LiveInstructionGroup = {
  instruction_id: string|null; instruction_text: string|null; agents: LiveAgent[];
};

liveStatus: (businessId?: string|null, instructionId?: string|null) => {
  const qs = new URLSearchParams();
  if (businessId !== undefined) qs.set('business_id', businessId ?? 'common');
  if (instructionId) qs.set('instruction_id', instructionId);
  const q = qs.toString();
  return request<{ data: { ok: boolean; data: LiveInstructionGroup[] } }>(
    `/api/monitor:liveStatus${q ? `?${q}` : ''}`
  ).then(r => unwrap(r) as LiveInstructionGroup[]).catch(() => []);
},
```

### Component structure (page.tsx)

```
MonitorContent
 ├─ PhaseTransitionPanel            (unchanged)
 ├─ header + autoRefresh toggle     (reuse existing L688–726)
 ├─ StatusLegend                    (NEW — the 7 dot colors + labels, render once)
 └─ groups.map(InstructionGroup)
       ├─ group header: instruction_text + agent count + aggregate dot
       └─ agents.map(AgentLiveCard)  (NEW — replaces TaskCard for this page)
```

`AgentLiveCard` (new, ~60 lines): reuses `AgentBadge` (L79) and the card chrome from
`TaskCard` (L484), but its body is: `<StatusDot live_status/>` + `live_status` label +
`current_action` one-liner + `→ <counterpart>` chip (when counterpart present). No
expandable reasoning panel — that stays on the inbox/timeline pages.

### Live-status visual map (Joinery tokens — confirmed in `globals.css`)

| live_status | emoji | dot color token | label (ko) | badge class |
|-------------|-------|-----------------|------------|-------------|
| investigating | 🔍 | `var(--green)` (pulse) | 조사 중 | `j-badge j-badge-live` |
| talking | 💬 | `var(--blue)` | 대화 중 | `j-badge j-badge-ref` |
| awaiting_founder | ⏳ | `var(--amber)` | 창업자 대기 | `j-badge j-badge-review` |
| under_review | 🧠 | `var(--amber)` | CEO 검토 | `j-badge j-badge-review` |
| done | ✓ | `var(--green)` | 완료 | `j-badge j-badge-live` |
| blocked | ⛔ | `var(--red)` | 차단됨 | `j-badge j-badge-blocked` |
| queued | · | `var(--silver-4)` | 대기열 | `j-badge j-badge-draft` |

Reuse existing `.j-badge-dot` (globals.css L215) for the dot. For `investigating`, add a
CSS pulse (`@keyframes` in `globals.css`, ~6 lines) on the green dot so "live work" reads
as active; all other dots are static. `AGENT_PASTEL` (page.tsx L67) already maps each
executive to a pastel pair — reuse for the agent badge. `counterpart` chip uses
`AgentBadge` when it is an executive, a plain `Founder`/`CEO` pill otherwise.

### Polling (not SSE for v1)

Reuse the existing `setInterval(load, …)` pattern (page.tsx L659). Lower the interval to
**8s** for this page (the current 30s is too slow to feel "real-time"; an executeTask cycle
is seconds-to-minutes). Pause when `document.hidden` (visibilitychange) to avoid background
churn. SSE is explicitly deferred — polling a small grouped JSON every 8s is simpler and
correct for a single-founder console. Document the SSE upgrade path (a Postgres
`LISTEN/NOTIFY` on `agent_tasks` updates → EventSource) as P3.

### Scope

Reuse `useBusiness()` (page.tsx L631) → pass `scope` as `business_id` exactly like
`currentTasks`. Instruction grouping is within the selected business scope.

## 5. Deferred — `task_activity` (P3, NOT in P2)

If/when `L5_EXECUTIVE_TOOLS=1` runs on an async dispatcher path:

```sql
CREATE TABLE IF NOT EXISTS task_activity (
  task_id    text PRIMARY KEY,         -- one live row per task (upsert)
  tool_name  text,                     -- e.g. 'secondbrain.read'
  iteration  int,
  phase      text,
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
```

Writer: a thin wrapper in `plugin-orchestration/src/server/plugin.ts` around the
`executeAgentTaskLive(task, llm, { tools })` call (executeTask L1338), passing an
`onToolInvoke(toolName, iteration)` callback that upserts `task_activity`. The callback is
injected from the **plugin** (which has `db`), keeping `l5-core/tool-loop.ts` DB-free —
the loop just needs a new optional `opts.onToolInvoke?(name, i)` hook called where
`invokedTools.push()` already happens (tool-loop.ts ~L240). `deriveLiveStatus` then reads
`current_tool` to upgrade row 8's one-liner to `조사 중: <tool_name>`. Until then, row 8
stays generic.

## 6. Ordered slices

| Slice | Scope | Effort | Depends on | Risk |
|-------|-------|--------|------------|------|
| **P2.1a** | `l5-core/functions/monitor/live-status.ts` pure `deriveLiveStatus` + unit tests (10 rows) | S | — | Low. Pure function, fully testable. |
| **P2.1b** | `monitor:liveStatus` action in executive-monitor (src + ACL + GET route), mirror to `dist/plugin.js` (rebuild or patch), backup bundle | M | P2.1a (built to `l5-core/dist`) | Med. **Dist mirroring is the main risk** — if bundle isn't rebuilt, action 404s. Verify with `grep -c liveStatus dist/plugin.js` and a live `curl /api/monitor:liveStatus`. N+1 instruction reads bounded by reusing dedupe from `withInstructionSnippets`. |
| **P2.2a** | `api.liveStatus` + types in `src/lib/api.ts` | S | P2.1b | Low. |
| **P2.2b** | `monitor/page.tsx` redesign: `StatusLegend`, `InstructionGroup`, `AgentLiveCard`, 8s visibility-aware polling; drop flat list + filter tabs; keep PhaseTransitionPanel | M | P2.2a | Med. Largest UI change; keep `PhaseTransitionPanel`/header/scope intact (surgical). Add pulse `@keyframes` to `globals.css`. |
| **P2.3 (opt)** | `task_activity` table + `onToolInvoke` hook for live tool name | M | P2.2 + `L5_EXECUTIVE_TOOLS=1` async path | Med. Only if tool-calling enabled. Out of P2. |

### Non-goals / guardrails

- No domain logic in `page.tsx` — all derivation in `deriveLiveStatus` (CLAUDE.md Forbidden).
- No new founder approval gate; `awaiting_founder` is display-only (it already maps to the
  existing consultation/approval flow — memory: "Founder 승인 모델").
- Do not touch `currentTasks`/`blockedTasks`/`approvalQueue` — other pages depend on them.
- Every src edit mirrored to `dist/plugin.js`; back up before patching.

## 7. Verification

1. `l5-core`: `yarn test` — `live-status.test.ts` green (all 10 rows).
2. Seed: submit an instruction, approve plan, trigger an `ask_founder` (consultation) and an
   `ask_executive` (delegation) so rows 4/5/7 are exercised; let one task reach `running`
   (row 8) and one `done` (row 1).
3. `curl 'http://localhost:13000/api/monitor:liveStatus?business_id=common' -H 'Authorization: Bearer <t>'`
   → grouped JSON with correct `live_status`/`counterpart`/`current_action` per the table.
4. UI (`:3002/monitor`): groups render per instruction; dots/labels match; `investigating`
   dot pulses; polling refreshes within 8s; toggle off stops polling; hidden tab pauses.

## 8. Cited references

- `apps/nocobase-app/packages/plugins/@l5/plugin-executive-monitor/src/server/plugin.ts`
  — `currentTasks` L53, `blockedTasks` L87, `approvalQueue` L117, `readBusinessScope` L38,
  `withBusinessFilter` L47, `withInstructionSnippets` L505, `monitor` resource L761,
  ACL L849, GET routes L845.
- `apps/nocobase-app/packages/plugins/@l5/plugin-orchestration/src/server/plugin.ts`
  — `agent_tasks` collection L242, `executive_consultations` L312, `executive_delegations`
  L329, ask_founder blocker write L1234, ask_executive blocker write L1272, executeTask
  tool gate L1337, executeAgentTaskLive call L1338, delegation `advance` L1579.
- `packages/l5-core/src/functions/executive-runtime/tool-loop.ts`
  — `invokedTools` L164, `L5_TOOL_LOOP_DEBUG` L169.
- `apps/founder-ui/src/app/monitor/page.tsx`
  — `AGENT_PASTEL` L67, `AgentBadge` L79, `TaskCard` L484, `MonitorContent`/load L637,
  polling L655, header L688.
- `apps/founder-ui/src/lib/api.ts` — `currentTasks` L232, `unwrap` L28.
- `apps/founder-ui/src/app/globals.css` — `.j-badge-dot` L215, `j-badge-live/ref/review/blocked/draft` L216–227, tints L49/51.
