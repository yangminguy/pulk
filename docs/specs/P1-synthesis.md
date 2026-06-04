# P1 — Founder Synthesis Deliverable (Chief of Staff)

Status: SPEC (not yet implemented). Author: research/design pass, 2026-06-02.

## 0. Problem & Goal

Today the flow is: founder instruction → `chat:submitInstruction` (CEO interpret + decompose
+ `assignExecutiveTasks`) → founder approves plan (`chat:approvePlan`) → UI loops over each
task and calls `agent:executeTask` → each task runs `executeAgentTaskLive` (Haiku executive +
Haiku CEO review) → task goes `done` / `needs_review` and writes handoffs into `agent_handoffs`.

**Each task ends in isolation.** Nothing aggregates the per-task outputs into one founder-facing
artifact. The founder must mentally stitch together scattered handoffs and cannot cleanly decide
"what's next." This P1 builds: **detect when all tasks of one instruction are terminal → Chief of
Staff synthesizes one deliverable → post ONE synthesis card into chat** with: decision summary,
per-agent contributions, open gaps, and next-action buttons (approve / delegate / hold).

### Grounding facts (verified in repo)

- Instruction→task link: `agent_tasks.instruction_id` (uuid, not null). Plugin collection at
  `apps/nocobase-app/packages/plugins/@l5/plugin-orchestration/src/server/plugin.ts:242`.
- Terminal task statuses: `'done'` and `'killed'`. Non-terminal: `'queued' | 'running' |
  'blocked' | 'needs_review'`. (`AgentTask['status']`, `packages/l5-core/src/types/orchestration.ts`.)
  Note: `needs_review` is NOT terminal — it means CEO escalated to founder (outbound/payment) or a
  consultation/delegation is pending. Synthesis must wait until none remain.
- Live execution + final status write happens at the **end of the `agent:executeTask` action**:
  `plugin.ts:1338` (`executeAgentTaskLive`) → `plugin.ts:1411` (`taskRepo.update` status). This is
  the natural completion-detection hook — when a task transitions to terminal, check siblings.
- `chat_messages` collection (`plugin.ts:281`): `{ id, project_id, role, text, metadata(json) }`,
  camelCase `createdAt`. Existing roles in use: `'founder'`, `'ceo'`. The UI renders any non-founder
  role as a "CEO bubble" (`chat/page.tsx:610`), reading typed panels off `metadata`.
- LLM: `buildLLMClient(rawText)` helper at `plugin.ts:1749` → `createDefaultLLMClient('default')`
  (Haiku, claude CLI, MCP off). `LLMClient.complete({ system, user, trace_name, trace_metadata })`.
- Governance: never send customer PII to the LLM. Synthesis consumes only internal task
  outputs/handoffs (already internal), so no new PII surface — but the synthesizer MUST NOT pull
  `founder_memory`/customer records.
- Gotcha: REST `:create` ignores client `id`; internal `repository.create({ values:{ id, ... } })`
  honors it. All synthesis writes use the internal repo with an explicit `randomUUID()` id (matches
  existing handoff/chat writes, e.g. `plugin.ts:606`, `plugin.ts:1402`).

---

## 1. Completion Detection

### 1.1 Where it runs

In-process, at the tail of the `agent:executeTask` action in `plugin.ts`, immediately after the
existing `taskRepo.update(... status: result.updated_status ...)` (`plugin.ts:1411–1419`) and after
the handoff persistence loop. Add a single best-effort call:

```
await maybeSynthesizeInstruction(ctx, task.instruction_id).catch(err =>
  console.warn('[synthesis] skipped:', err?.message));
```

Rationale: the UI drives execution by calling `agent:executeTask` per task (`chat/page.tsx:500–506`),
and the Hermes consultation/delegation resume paths also re-queue→re-execute through this action.
So the *last* task to reach terminal status is always observed here. No separate cron is required for
the MVP. (A 60s Hermes safety-net sweep is listed as optional P1.3 to catch tasks completed by paths
that bypass this action, e.g. a future pure-dispatcher run; not needed for the current UI flow.)

### 1.2 The "all terminal" rule

`maybeSynthesizeInstruction(ctx, instruction_id)`:

1. If `!instruction_id` → return.
2. `const tasks = await agentTaskRepo.find({ filter: { instruction_id } })`.
3. If `tasks.length === 0` → return.
4. **Terminal check:** every task `t` satisfies `t.status === 'done' || t.status === 'killed'`.
   If any task is `queued | running | blocked | needs_review` → return (not ready).
5. At least one task is `done` (don't synthesize an all-killed/rejected plan).

### 1.3 Idempotency (don't re-synthesize)

Use a status marker on `founder_instructions`. The instruction already has a `status` lifecycle
(`new → interpreted → approved/rejected → ...`). Add one terminal value `synthesized`:

- Before synthesizing, re-read the instruction row; if `status === 'synthesized'` → return.
- Guard against the race where two near-simultaneous final tasks both pass the check: perform a
  **conditional claim update** first and only proceed if it actually flipped the row:

```
const claimed = await instructionRepo.update({
  filter: { id: instruction_id, status: { $ne: 'synthesized' } },
  values: { status: 'synthesized' },
});
// NocoBase update returns affected rows; if 0 rows changed, another call already claimed it → return.
```

(If the installed NocoBase `update` does not return an affected-count reliably, fall back to: read
status, `if (status === 'synthesized') return;`, then update. The small residual race is acceptable
for a single-process MVP and the `founder_deliverables` unique index in §1.4 is the hard backstop.)

### 1.4 Minimal DDL

Two changes. Both go in the plugin's collection/`ALTER TABLE` bootstrap (see §3).

(a) Reuse `founder_instructions.status` — add the literal value `'synthesized'`. **No DDL** (it's a
free-text `string` column, `plugin.ts:219`). Update the TS union in l5-core
(`FounderInstruction.status`) to include `'synthesized'` for type-correctness.

(b) New table `founder_deliverables` (the persisted synthesis, source of truth for the card and an
idempotency backstop):

```sql
CREATE TABLE IF NOT EXISTS founder_deliverables (
  id              uuid PRIMARY KEY,
  instruction_id  uuid NOT NULL,
  project_id      varchar,             -- nullable: instructions can run without a project
  business_id     varchar,
  decision_summary text NOT NULL,
  contributions   jsonb NOT NULL DEFAULT '[]',   -- Contribution[]
  open_gaps       jsonb NOT NULL DEFAULT '[]',   -- string[]
  next_actions    jsonb NOT NULL DEFAULT '[]',   -- NextAction[]
  chat_message_id uuid,                 -- the chat_messages row that renders this
  "createdAt"     timestamptz NOT NULL DEFAULT now(),
  "updatedAt"     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_founder_deliverables_instruction
  ON founder_deliverables (instruction_id);
```

The `UNIQUE(instruction_id)` index is the real idempotency guarantee: a duplicate synthesis insert
throws and is swallowed by the best-effort `.catch`. Defined via `defineCollection` (camelCase
`createdAt`, matching the project-status collection pattern at `plugin.ts:293`).

---

## 2. Chief of Staff Synthesizer (l5-core, pure)

### 2.1 File

New file: `packages/l5-core/src/functions/chief-of-staff/synthesize.ts`
Barrel: `packages/l5-core/src/functions/chief-of-staff/index.ts` →
`export { synthesizeDeliverable } from './synthesize';` plus type re-exports.
Wire into root: add `export * from './functions/chief-of-staff';` to
`packages/l5-core/src/index.ts`.

**Decision — do NOT reuse `generateFounderBrief`.** That function (`brief-generation.ts:78`) is a
*daily status* string builder (active experiments / pending decisions / today's priority) — wrong
input shape, wrong output (flat markdown string), and unwired. The synthesis deliverable is
instruction-scoped, structured (typed object, not a string), and LLM-driven. Reusing it would force
a bad abstraction. Leave `generateFounderBrief` untouched. We may reuse its plain-markdown styling
idea only inside the *fallback* renderer (§2.4).

### 2.2 Signature & types

```ts
import type { LLMClient } from '../ceo-orchestration/types';
import type { AgentTask, AgentHandoff, AgentRole } from '../../types/orchestration';

export interface TaskOutcome {
  task: Pick<AgentTask,
    'id' | 'assigned_agent' | 'title' | 'expected_output' | 'status' | 'risk_level'>;
  /** The executive work-product handoff (from_agent === assigned_agent), if present. */
  work_handoff?: Pick<AgentHandoff,
    'what_was_completed' | 'what_remains_open' | 'next_action' | 'context'>;
  /** The CEO review handoff (from_agent === 'CEO'), if present. */
  ceo_handoff?: Pick<AgentHandoff, 'what_was_completed' | 'next_action' | 'blocker'>;
}

export interface SynthesisInput {
  instruction_text: string;          // founder_instructions.raw_text
  ceo_goal: string;                  // ceo_interpretations.goal
  outcomes: TaskOutcome[];           // one per non-killed task, in creation order
}

export interface Contribution {
  agent: AgentRole;
  task_title: string;
  summary: string;                   // 1–2 sentence Korean summary of what this agent delivered
  status: AgentTask['status'];       // 'done' | 'killed'
}

export type NextActionKind = 'approve' | 'delegate' | 'hold';
export interface NextAction {
  kind: NextActionKind;
  label: string;                     // Korean button label
  /** For 'delegate': which agent the gap should route to. Optional otherwise. */
  target_agent?: AgentRole;
  /** Short Korean reason shown under the button. */
  reason: string;
}

export interface SynthesisResult {
  decision_summary: string;          // Korean, 2–4 sentences: what was decided/produced overall
  contributions: Contribution[];
  open_gaps: string[];               // Korean bullets: unresolved questions / missing pieces
  next_actions: NextAction[];        // 1–3, always includes one 'approve' and one 'hold'
}

export async function synthesizeDeliverable(
  input: SynthesisInput,
  llm: LLMClient,
): Promise<SynthesisResult>;
```

### 2.3 Behaviour & prompt

- Build `contributions` deterministically from `input.outcomes` (one per outcome) BEFORE the LLM
  call — the per-agent `summary` is filled by the LLM, but the list/agent/status/title are code-owned
  so the structure can never drift from reality.
- One LLM call (`trace_name: 'chiefOfStaff.synthesize'`, `trace_metadata: { instruction_text_len }`)
  returns JSON only. Reuse the existing robust parse pattern from `review.ts` (`extractJson` +
  defensive defaults) — copy a local `extractJson` rather than exporting/over-abstracting.
- System prompt (Korean output, English JSON keys/enums), shape:

```
You are the Chief of Staff of L5 Business OS. The CEO assigned several executives to one founder
instruction; they have all finished. Synthesize ONE founder-facing deliverable.

Return ONLY valid JSON:
{
  "decision_summary": string,           // 한국어 2-4문장: 전체적으로 무엇이 결정/산출되었는가
  "contribution_summaries": [           // 입력 task 순서와 1:1, 같은 길이
    { "task_id": string, "summary": string }   // 한국어 1-2문장
  ],
  "open_gaps": string[],                // 한국어, 미해결 질문/누락. 없으면 []
  "next_actions": [                     // 1-3개
    { "kind": "approve"|"delegate"|"hold",
      "label": string, "target_agent": string|null, "reason": string }
  ]
}
Rules:
- decision_summary: 파운더가 다음 세션으로 넘어갈 수 있게 핵심 판단을 요약.
- open_gaps가 있으면 그 중 하나를 해소할 'delegate' next_action을 target_agent와 함께 제안.
- 항상 'approve'(이대로 채택)와 'hold'(보류) 액션을 포함.
[OUTPUT LANGUAGE — STRICT] 모든 문자열 값은 한국어. JSON 키/enum 값은 영어.
```

- User prompt: instruction text, CEO goal, then per outcome: `task_id`, agent, title,
  expected_output, status, `what_was_completed`, `what_remains_open`, ceo note/blocker.
- Merge: map `contribution_summaries[i].summary` onto the code-built `contributions[i]` by index
  (fallback to `work_handoff.what_was_completed` then `'(요약 없음)'`). Validate/clamp
  `next_actions` to the allowed enum; if the model omits `approve`/`hold`, inject defaults
  (`approve`: "이대로 채택", `hold`: "보류하고 나중에 결정").

### 2.4 Fallback (no LLM / parse failure)

If `llm.complete` throws or JSON is unrecoverable, return a deterministic `SynthesisResult` built
purely from `outcomes`: `decision_summary` = `${ceo_goal} — ${doneCount}개 작업 완료`,
`contributions` from handoff `what_was_completed`, `open_gaps` from any non-empty
`what_remains_open`, `next_actions` = default approve + hold. This keeps the card always deliverable
even when Haiku is down. (Plugin wraps the whole thing in `.catch`, but the pure fallback means the
founder still gets a usable card rather than nothing.)

### 2.5 Unit tests

`packages/l5-core/src/functions/chief-of-staff/__tests__/synthesize.test.ts` (jest, no NocoBase):

1. **happy path** — stub `LLMClient` returns valid JSON; assert `contributions.length ===
   outcomes.length`, summaries merged by index, `decision_summary` populated.
2. **agent/status integrity** — model returns mismatched/short `contribution_summaries`; assert code
   still emits one contribution per outcome with correct `agent`/`status`/`task_title` (LLM can't
   corrupt structure).
3. **missing approve/hold** — model returns only a `delegate` action; assert defaults injected so
   `approve` and `hold` are always present.
4. **delegate gap routing** — given an `open_gaps` + a `delegate` action with `target_agent`, assert
   it's preserved and `target_agent` is a valid `AgentRole`.
5. **fallback** — stub `complete` throws; assert deterministic result (no throw), correct
   `doneCount`, gaps derived from `what_remains_open`.
6. **JSON-in-fence parse** — model wraps JSON in ```json fences; assert parsed (reuses review.ts
   pattern).

Build: `cd packages/l5-core && npm run build && npm test`. The plugin consumes `dist/`.

---

## 3. Plugin Wiring

All edits in `apps/nocobase-app/packages/plugins/@l5/plugin-orchestration`. **Every change must be
mirrored into both `src/server/plugin.ts` AND the bundled `dist/plugin.js`** (hand-patch dist;
back it up first like the existing `plugin.js.bak.*`).

### 3.1 Require the new l5-core export

Near the existing requires (`plugin.ts:23`), add:

```js
const { synthesizeDeliverable } = require(path.resolve(
  __dirname, '../../../../../../../packages/l5-core/dist/functions/chief-of-staff'));
```

### 3.2 Collection + DDL

- Add `founder_deliverables` via `db.collection(defineCollection({ ... }))` next to the
  `project_status` collection (`plugin.ts:293`). Fields per §1.4, with `{ name:'id', type:'uuid',
  primaryKey:true }` and json fields `contributions`/`open_gaps`/`next_actions`.
- Add the unique index: in the same `ALTER TABLE` best-effort block used for `agent_tasks`
  (`plugin.ts:124`), run the `CREATE UNIQUE INDEX IF NOT EXISTS uniq_founder_deliverables_instruction`
  statement (wrapped in try/catch like the existing contract-column block).
- ACL: add `this.app.acl.allow('founder_deliverables', '*', 'loggedIn');` next to
  `plugin.ts:106`. Also allow a new action: `this.app.acl.allow('chat', [...,'synthesisFor'],
  'loggedIn')` if a fetch action is added (§4.3); otherwise the card data rides in `chat_messages`
  metadata and no new action is needed.

### 3.3 `maybeSynthesizeInstruction` helper

New top-level async function in `plugin.ts` (near `persistTaskInsight`, `plugin.ts:1769`):

```
async function maybeSynthesizeInstruction(ctx, instruction_id) {
  if (!instruction_id) return;
  const db = ctx.db;
  const instructionRepo = db.getRepository('founder_instructions');
  const taskRepo = db.getRepository('agent_tasks');
  const handoffRepo = db.getRepository('agent_handoffs');
  const chatRepo = db.getRepository('chat_messages');
  const deliverableRepo = db.getRepository('founder_deliverables');

  const tasks = await taskRepo.find({ filter: { instruction_id } });
  if (!tasks.length) return;
  const allTerminal = tasks.every(t => t.status === 'done' || t.status === 'killed');
  if (!allTerminal) return;
  const doneTasks = tasks.filter(t => t.status === 'done');
  if (!doneTasks.length) return;

  // idempotency claim (§1.3)
  const inst = await instructionRepo.findOne({ filter: { id: instruction_id } });
  if (!inst || inst.status === 'synthesized') return;
  await instructionRepo.update({
    filter: { id: instruction_id, status: { $ne: 'synthesized' } },
    values: { status: 'synthesized' } });

  // collect handoffs per task → TaskOutcome[]
  const outcomes = [];
  for (const t of tasks.filter(t => t.status !== 'killed')) {
    const hs = await handoffRepo.find({ filter: { task_id: t.id }, sort: ['createdAt'] });
    const work = hs.find(h => h.from_agent === t.assigned_agent);
    const ceo  = hs.find(h => h.from_agent === 'CEO');
    outcomes.push({ task: t, work_handoff: work, ceo_handoff: ceo });
  }

  const interp = await db.getRepository('ceo_interpretations')
    .findOne({ filter: { instruction_id } });
  const llm = buildLLMClient(inst.raw_text ?? '');
  const result = await synthesizeDeliverable(
    { instruction_text: inst.raw_text ?? '', ceo_goal: interp?.goal ?? '', outcomes }, llm);

  // persist deliverable (UNIQUE(instruction_id) is the backstop)
  const deliverableId = randomUUID();
  const chatId = randomUUID();
  await deliverableRepo.create({ values: {
    id: deliverableId, instruction_id, project_id: inst.project_id ?? null,
    business_id: inst.business_id ?? null,
    decision_summary: result.decision_summary,
    contributions: result.contributions, open_gaps: result.open_gaps,
    next_actions: result.next_actions, chat_message_id: chatId } });

  // post the ONE founder deliverable card into chat
  if (inst.project_id) {
    await chatRepo.create({ values: {
      id: chatId, project_id: inst.project_id,
      role: 'chief_of_staff',
      text: result.decision_summary,
      metadata: {
        kind: 'synthesis',
        instructionId: instruction_id,
        deliverable_id: deliverableId,
        decision_summary: result.decision_summary,
        contributions: result.contributions,
        open_gaps: result.open_gaps,
        next_actions: result.next_actions,
      } } });
  }
}
```

### 3.4 Call site

After the task-status update + handoff loop in `agent:executeTask` (insert after `plugin.ts:1419`,
before `persistTaskInsight`):

```
await maybeSynthesizeInstruction(ctx, task.instruction_id ?? updatedTask?.instruction_id)
  .catch(err => console.warn('[synthesis] skipped:', err?.message));
```

(Use `task.instruction_id` — the task object is loaded earlier in the action.)

### 3.5 Exact dist edit points (mirror)

In `dist/plugin.js` (bundled, single file): (1) add the `synthesizeDeliverable` require; (2) add the
`founder_deliverables` `defineCollection` block; (3) add the unique-index `ALTER`/`CREATE INDEX`
statement; (4) add the ACL allow; (5) paste the compiled `maybeSynthesizeInstruction` function; (6)
add the call-site line in the `executeTask` action. Back up dist first (`cp plugin.js
plugin.js.bak.$(date +%s)`), then restart the NocoBase service. Verify the new collection/table and
index exist (`\d founder_deliverables` in postgres `nocobase`).

---

## 4. Founder UI

App: `apps/founder-ui` (Next.js, :3002). Chat at `src/app/chat/page.tsx`.

### 4.1 New component

`apps/founder-ui/src/components/SynthesisCard.tsx` — follows the `ApprovalQueueCard.tsx` /
`ProposedTasksPanel` visual language (Joinery tokens: `--paper-surface`, `--silver-2`, `--green`
accent bar, `AgentChip`, `RISK_CONFIG` badges). Props:

```ts
interface SynthesisCardProps {
  instructionId: string;
  decisionSummary: string;
  contributions: { agent: string; task_title: string; summary: string; status: string }[];
  openGaps: string[];
  nextActions: { kind: 'approve'|'delegate'|'hold'; label: string;
                 target_agent?: string; reason: string }[];
  onAction: (kind: 'approve'|'delegate'|'hold', targetAgent?: string) => Promise<void>;
}
```

Layout: header "운영 종합 보고 · Chief of Staff" + green accent bar; `decision_summary` block;
"임원별 기여" list (one row per contribution: `AgentChip` + title + summary, dimmed if
`status==='killed'`); "남은 공백" gaps list (amber tint, hidden if empty); footer action buttons
rendered from `nextActions` (approve = filled green, delegate = outline with target agent label,
hold = ghost). Buttons disable while `onAction` is in-flight.

### 4.2 Render in chat/page.tsx

- Extend the `CEOMessage` type with optional `synthesis` payload.
- In `fetchHistory` map (`chat/page.tsx:402–418`), when `meta.kind === 'synthesis'` populate a
  `synthesis` field from metadata (`decision_summary`, `contributions`, `open_gaps`,
  `next_actions`, `instructionId`).
- In the message render block (`chat/page.tsx:605–670`): the synthesis message has
  `role: 'chief_of_staff'` → already falls into the non-founder (left) bubble branch. Inside that
  branch, when `msg.synthesis` is present, render `<SynthesisCard ... />` instead of (or in addition
  to, after) the plain text. Keep the existing CEO label swap to "Chief of Staff" when role is
  `chief_of_staff`.

### 4.3 Wiring next-action buttons (reuse existing actions — no new backend needed)

`onAction(kind, targetAgent)`:

- **approve** → reuse `api.approvePlan(instructionId)` semantics? No — the plan is already executed.
  Instead "approve" here means "accept this deliverable and close out". Minimal MVP: mark the
  instruction closed via existing CRUD update on `founder_instructions`
  (`api`-level `closeInstruction` → `founder_instructions:update` status `closed`). Then refetch
  history. (No new server action; reuse the generic resource update already ACL-allowed at
  `plugin.ts:103`-area for `agent_tasks`; add `founder_instructions` `*` allow if not present —
  verify, it is registered at `registerCrudResources`, `plugin.ts:720`.)
- **delegate** → open the chat composer pre-filled with a follow-up instruction targeting
  `target_agent` (e.g. `"${target_agent}에게 위임: ${gap}"`) and call the normal
  `api.submitInstruction(...)`. This reuses the entire existing instruction→decompose→execute
  pipeline; the gap becomes a new instruction. (Simplest correct path; no new delegation endpoint.)
- **hold** → client-only: collapse the card / mark locally "held"; optionally
  `founder_instructions:update` status back to a `held` value. MVP: pure client state (no
  persistence) to avoid new columns. Document that hold is non-durable in P1.

Add `api.closeInstruction(id)` to `apps/founder-ui/src/lib/api.ts` hitting
`/api/founder_instructions:update` with `{ filterByTk:id, values:{ status:'closed' } }` (mirror the
existing `request<>()` helpers, e.g. `api.approvePlan`, `api.ts:214`).

---

## 5. Ordered Slices

| Slice | Scope | Effort | Depends on | Risk |
|-------|-------|--------|-----------|------|
| **P1.1** | l5-core `synthesizeDeliverable` + types + barrel + root export + unit tests (§2). Pure, no plugin/UI. `npm run build && npm test` green. | **M** | — | Low. Self-contained, fully testable offline. Main risk: Haiku JSON drift → mitigated by code-owned `contributions` structure + fence-tolerant parse + deterministic fallback. |
| **P1.2** | Plugin wiring (§3): `founder_deliverables` collection + DDL/index, ACL, `maybeSynthesizeInstruction`, call site in `executeTask`, dist mirror, idempotency claim. Manual e2e: run a multi-task instruction, confirm exactly ONE deliverable row + ONE `chat_messages` synthesis card, no duplicates on re-execute. | **M** | P1.1 (`dist/`) | Med. Dual src+dist patch is error-prone (per MEMORY: dist patching gotcha). Idempotency race if two final tasks land together → mitigated by conditional claim + UNIQUE index. `needs_review` tasks must block synthesis (consultation/delegation pending) — verify the terminal rule excludes them. |
| **P1.3** | Founder UI (§4): `SynthesisCard` component, chat render integration, button wiring (approve=close, delegate=new instruction, hold=local), `api.closeInstruction`. | **S–M** | P1.2 (card data in `chat_messages` metadata) | Low–Med. UI-only. Risk: button semantics ("approve" of an already-done plan) — defined as "accept & close", not re-approve, to avoid confusing the gate model. |

### Optional / explicitly out of scope for P1
- Hermes 60s safety-net sweep that calls `maybeSynthesizeInstruction` for instructions whose tasks
  all went terminal via a non-`executeTask` path. Not needed for the current UI-driven flow; add
  only if a pure background dispatcher is introduced.
- Durable `hold` state, deliverable editing/regeneration, multi-instruction roll-ups, Telegram push
  of the deliverable. Not in P1 — no speculative abstraction.

### Cross-cutting risks / notes
- **Governance:** synthesizer input is internal task outputs/handoffs only; do not pull customer/PII
  records. No new PII surface.
- **`role: 'chief_of_staff'`** is a new chat role — the UI's non-founder branch already handles any
  non-`'founder'` role, so no role allow-list change needed, but confirm `chat:history` doesn't
  filter by role (it doesn't — `plugin.ts:362` filters only by `project_id`).
- **No project_id case:** instructions can run without `project_id` (`chat/page.tsx:459` else
  branch). When `inst.project_id` is null, still persist `founder_deliverables` but skip the
  `chat_messages` card (no chat to post to). Acceptable for MVP.
- **Do not** modify `generateFounderBrief` or NocoBase core. Record the new collection in
  `docs/DATA_MODEL.md` and the synthesis decision in `docs/DECISIONS.md` at implementation time
  (per CLAUDE.md "Done When").
