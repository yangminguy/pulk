# P3-4 — Tool Requests → CTO Self-Modification

Status: SPEC (design only, not implemented)
Author: AI Engineer / Tech PM
Date: 2026-06-02
Scope: design the `[CTO에게 전송 / Send to CTO]` button on Tool Requests that makes the
CTO autonomously modify its own tools/code via ACR, gated by a diff-preview +
founder-approval + rollback safety envelope, with a verification loop reusing M6.

---

## 0. TL;DR for the founder's question — "can we even build CTO fixing itself?"

**Yes, partially and safely — and most of the machinery already exists.** The CTO
already edits real code today: a CTO `agent_task` → `runCTOAgent` produces an
`ACRIntent` (branch + phases) → ACR runs the build on a git branch → ACR reports
back through `agent:taskCallback` → a verifier (`verifyCTOPhase`) gates the result
→ failures re-enter a retry loop (`cto-verification-loop`). "CTO self-modification"
is just **pointing that same pipeline at the L5 repo itself**, with the Tool Request's
proposal as the task objective.

What is genuinely new and must be built:
1. A **`Send to CTO`** action that turns a Tool Request into a CTO self-mod task.
2. **Diff persistence + a diff-preview surface** — ACR already sends `diff_summary`
   + `branch` in `taskCallback`, but today they are only written into the `blocker`
   text, never persisted as structured fields or shown to the founder.
3. A **founder approval gate keyed on self-modification** (D3+), with **rollback**
   (the branch is never auto-merged until approved; reject = delete branch).

**Honest limits.** This is *not* unbounded self-rewriting. It is bounded by:
- ACR works on a **branch**, never directly on `main`; apply = an explicit merge step.
- Self-mod of the *running* L5/ACR/plugin code cannot hot-reload itself mid-run; a
  change to the orchestration plugin requires a `dist/plugin.js` rebuild + NocoBase
  restart (see `launchd com.l5.*`). So "applied" for self-mod = **merged + flagged
  for restart**, not "instantly live." We surface this explicitly; we do not pretend
  the CTO rewrites its own running process in place.
- The CTO LLM is `claude-cli` with **MCP off**; no tool can silently exfiltrate or
  escalate. Risk classification stays internal (severity, not the approval gate).

---

## 1. What exists today (cited)

### Domain (l5-core)
- `packages/l5-core/src/functions/repetition-detection.ts` — `detectRepeatingTasks`,
  `analyzeRepetitionPattern`, `generateToolRequestTask`. The last already emits a
  CTO `AgentTask` with `source_ref: 'repetition-pattern:<id>'`, `assigned_agent:'CTO'`,
  `risk_level:'D2'`, `phase:'execution_build'`. **This is the existing Tool Request
  record — there is no separate `tool_requests` collection; a Tool Request IS a CTO
  `agent_task` tagged by `source_ref LIKE 'repetition-pattern:%'`.**
- `packages/l5-core/src/functions/tool-request.ts` — `decideToolCandidate`,
  `estimateToolBuildingEffort` (PMF/repetition/time gates → tool-candidate decision).
- `packages/l5-core/src/functions/tool-request/index.ts` — re-export shim only.
- M6 delegation engine `packages/l5-core/src/functions/delegation/`:
  - `index.ts` — `DelegationRequest`, `validateDelegationRequest`, round clamps.
  - `loop.ts` — `runDelegationLoop(maxRounds, { runWork, verify, onRound })`,
    deterministic, no LLM/IO. Returns `resolved | escalated`. **This is the
    verification-loop backbone to reuse.**
  - `tool.ts` — `createAskExecutiveTool({ propose })` (`ask_executive`).
  - `verify.ts` — `buildVerificationPrompt`, `parseVerdict` (conservative: unparseable
    ⇒ `pass:false`).

### CTO execution → ACR (the self-modify engine)
- `services/agent-runtime/src/agents/cto.ts` — `runCTOAgent`: classifies task
  (`classifyTask`), builds an `ACRIntent` of `CTOPhase[]` via dev-workflow SOP,
  `gateFromRisk()` (D1-D2 auto; D3 `auto_24h`/no auto-execute; D4-D5
  `manual_founder` + `l5_approval_required`), `resolveProjectPath(task)` reads
  `task.project_path | cwd | L5_DEFAULT_PROJECT_PATH`.
- `packages/l5-core/src/types/acr-intent.ts` — `ACRIntent`, `CTOPhase`,
  `ReleaseGateType ('none'|'auto_24h'|'manual_founder')`, `l5_approved`.
- `services/hermes-runtime/src/tasks/task-dispatcher.ts` — `runTaskDispatcher`: polls
  `queued && !approval_required` tasks, routes to `runCTOAgent`, self-heals on failure
  (`healFailedTask` → retry / escalate to founder / blocked). **Approval-required tasks
  are skipped here** — they wait for the founder gate.
- `services/hermes-runtime/src/tasks/cto-verification-loop.ts` — `runCTOVerificationLoop`:
  re-dispatches CTO tasks whose `blocker` contains `verifier:fail ... retry=true`, up to
  `MAX_RETRIES=2`, encoding the count in `blocker` as `cto_retry=N`.
- `services/hermes-runtime/src/api/acr-client.ts` — `notifyACRApprovalRequired`
  (`POST /api/approvals` with `acr_token` + `callback_url`), `registerACRProject`,
  `getProject`, `getFeaturePlans`. ACR base `ACR_BASE_URL` (default `:3001`).

### Result feedback (the loop home)
- `apps/nocobase-app/packages/plugins/@l5/plugin-orchestration/src/server/plugin.ts`:
  - `agent:taskCallback` (~L895) — ACR → L5 machine callback (auth via
    `x-l5-shared-secret`). Receives `status, diff_summary, log_tail, exit_code,
    branch, merge_action, merge_target, pr_url, new_risk_level, questions`. On
    `all_done`/`phase_complete` for CTO tasks it runs `verifyCTOPhase`; fail/inconclusive
    ⇒ `needs_review` with `blocker='verifier:fail ...'`. **`diff_summary` and `branch`
    are currently only logged / folded into `blocker` — NOT persisted structured.**
  - `acr:approvalCallback` (~L866) — ACR → L5: founder verdict relayed by token →
    sets task `done`/`killed`.
  - `agent:executeTask` (~L1390) — issues `acr_token = randomUUID()` for D3+ approval
    tasks, persists handoffs, returns `updated_task`. Also short-circuits when a
    delegation opens (`blocker` starts `awaiting_delegation:`).
  - `agent_tasks` collection (~L243) fields: `id, assigned_agent, title, rationale,
    expected_output, status, approval_required, risk_level, phase, source_ref,
    blocker, acr_token, business_id`. ALTER (~L124) adds `risk_level, phase,
    source_ref, acr_token, business_id, project_id`. **No `diff`, `branch`,
    `project_path` columns.**
  - Source `src/server/plugin.ts` + runtime `dist/plugin.js` are **both patched**
    (per project memory: edit src then patch the compiled `dist/plugin.js`; GET
    handlers read `ctx.request.query` first).

### Serving Tool Requests + approval queue
- `apps/nocobase-app/packages/plugins/@l5/plugin-executive-monitor/src/server/plugin.ts`:
  - `toolRequests` (~L320) — raw SQL: `agent_tasks WHERE assigned_agent='CTO' AND
    source_ref LIKE 'repetition-pattern:%'`. Returns `task_id, task_title, rationale,
    status, risk_level, phase, source_ref, blocker, approval_required, updated_at`.
  - `approvalQueue` (~L117) — `agent_tasks WHERE approval_required AND status NOT IN
    (done,killed)`. **The founder approval surface to reuse for diff-preview.**
  - `approveTask`/`rejectTask` (~L357/381) — set `done` / rejected.
- `apps/nocobase/packages/plugins/@l5/plugin-tool-request/` — **stub only** (TODO), do
  NOT use; the live path is `plugin-executive-monitor` + `plugin-orchestration`.

### Founder UI
- `apps/founder-ui/src/app/tool-requests/page.tsx` — cards rendered from
  `api.listToolRequests()`; status badge, priority, risk, `승인필요`, blocker banner.
  **No action button today.**
- `apps/founder-ui/src/app/approval/page.tsx` — founder approval page.
- `apps/founder-ui/src/lib/api.ts` — `listToolRequests` → `/api/monitor:toolRequests`;
  `executeTask` → `/api/agent:executeTask`; approval-queue helpers. Joinery tokens
  (`var(--green)`, `--ink-*`, `j-card`, `j-btn`).

---

## 2. End-to-end flow (target)

```
repetition signal / token-saving proposal
  → Tool Request card (CTO agent_task, source_ref=repetition-pattern:*)
  → founder clicks [CTO에게 전송 / Send to CTO]
      └─ monitor:sendToCTO  ── creates a NEW self-mod CTO task:
            objective       = the proposal text (rationale)
            acceptance_criteria = auto-derived (see §2.2)
            source_ref      = selfmod:<originToolRequestTaskId>
            risk_level      = D3 (self-modifying code; configurable floor)
            approval_required = false  (build first, gate at apply)
            self_mod_origin = <originToolRequestTaskId>   (link back)
        origin Tool Request status → 'sent'
  → Hermes task-dispatcher picks up the self-mod task (queued, !approval_required)
      → runCTOAgent → ACRIntent (project_path = L5 repo) → ACR builds on a BRANCH
  → ACR → agent:taskCallback(status=all_done, branch, diff_summary, exit_code)
      → verifyCTOPhase gate:
           fail/inconclusive → needs_review + verifier:fail (cto-verification-loop retries)
           pass              → status='awaiting_apply', PERSIST diff+branch  (NEW)
                               approval_required = (auto_apply_floor gate, §3)
  → Founder approval surface (approval queue) shows DIFF PREVIEW
      ├─ Approve → monitor:applySelfMod → merge branch  → status='applied'
      │             → run M6 runDelegationLoop verification (post-apply, §2.3)
      │             → origin Tool Request status → 'applied'
      └─ Reject  → monitor:rollbackSelfMod → delete/abandon branch → status='rolled_back'
                    → origin Tool Request status → 'rejected'
```

### 2.1 Data model — reuse `agent_tasks`, no new collection

A self-mod task is an `agent_task`, consistent with how Tool Requests already work.
The **origin** Tool Request is also an `agent_task`. We link them and persist the
diff. Add these columns via the existing ALTER block (`plugin.ts` ~L124) **and** the
`defineCollection` fields (~L243):

| field | type | purpose |
|---|---|---|
| `self_mod_origin` | text | origin Tool Request task id (set on the self-mod task) |
| `self_mod_status` | text | on the ORIGIN: `sent` \| `in_progress` \| `awaiting_apply` \| `applied` \| `rejected` (drives the UI badge) |
| `acr_branch` | text | branch ACR built on (from `taskCallback.branch`) — needed for apply/rollback |
| `acr_diff` | text | full `diff_summary` from `taskCallback` — the diff-preview payload |
| `acr_pr_url` | text | optional PR url if ACR opened one |

Rationale for new columns vs. stuffing `blocker`: the diff preview + apply/rollback
need **structured, queryable** branch/diff; the current `blocker`-text encoding
(`verifier:fail ...`, `cto_retry=N`) is for transient loop state, not a durable
artifact the founder reviews. Keep `blocker` for loop control; add fields for the
artifact. (Migration-light: all `ADD COLUMN IF NOT EXISTS`, Postgres only; SQLite path
already early-returns.)

`project_path` for the self-mod task = the L5 repo root. Set it on task creation
(`monitor:sendToCTO`) from an env (`L5_SELFMOD_PROJECT_PATH`, default repo root) so
`resolveProjectPath` in `cto.ts` dispatches ACR's cwd to the L5 repo. **This is the
one place where "modify its own code" is literally configured** — keep it explicit and
env-gated, never hardcoded (CLAUDE.md rule 9).

### 2.2 Auto acceptance_criteria

`monitor:sendToCTO` derives `acceptance_criteria: string[]` deterministically in
l5-core (new helper in `tool-request.ts`, e.g. `buildSelfModAcceptanceCriteria(origin)`):
- "변경은 별도 브랜치에서만 이뤄지고 main에 직접 머지되지 않는다."
- "기존 테스트가 모두 통과한다 (exit_code === 0)."
- "제안된 반복 작업(<pattern>)이 실제로 자동화/토큰 절감되었음을 diff가 보여준다."
- "변경 범위가 제안과 무관한 파일로 번지지 않는다 (surgical)."
- "self-modifying 변경이므로 founder 승인 전에는 적용되지 않는다."

These feed both the ACR phase `expected_output` and the M6 post-apply verify prompt.

### 2.3 Verification loop = reuse M6 `runDelegationLoop`

Two verification points, both already-built primitives:
1. **Pre-apply (build correctness):** the existing `verifyCTOPhase` gate inside
   `taskCallback` (no change to its mechanics) — fail ⇒ `cto-verification-loop`
   re-dispatch. This is the "did ACR produce a sane diff" check.
2. **Post-apply (objective met):** after merge, run `runDelegationLoop(maxRounds, {...})`
   where `runWork` = re-read the applied state / re-run the proposal's check, and
   `verify` = `parseVerdict(LLM(buildVerificationPrompt({ from_agent:'CTO',
   to_agent:'CTO', objective, acceptance_criteria, workOutput: appliedDiff })))`.
   `resolved` ⇒ origin Tool Request `applied`; `escalated` ⇒ `needs_review` + founder
   note. This reuses `loop.ts` + `verify.ts` verbatim; only the plugin-injected
   `runWork`/`verify` closures are new (mirrors how the executive runtime already
   injects them for delegation).

---

## 3. Safety design (CRITICAL — D3+, no one-click silent apply)

**Principle:** self-modifying code is at minimum **D3** (own tools/code). The flow
is *build → preview → human approve → apply → verify → (rollback on reject/fail)*.
There is **no path where a self-mod merges to `main` without an explicit founder
approval** at the configured floor.

### 3.1 Configurable auto-apply gate
A single env/config `L5_SELFMOD_AUTO_APPLY_FLOOR` (default `D3` = nothing self-applies):
- On `taskCallback` `pass`, compute `requiresApproval = riskRank(task.risk_level) >=
  riskRank(L5_SELFMOD_AUTO_APPLY_FLOOR)`. Default ⇒ **all** self-mods require approval.
- The founder can *later* lower the floor (e.g. `D2`) so D1-D2 self-mods auto-apply;
  the gate code reads the floor at runtime, so this is config-only, no redeploy.
- This mirrors the existing `gateFromRisk()` philosophy in `cto.ts` but keeps the
  self-mod floor **separate and stricter** than ordinary CTO tasks (ordinary D3 is
  `auto_24h`; self-mod D3 is `manual_founder`).

> Note: per project memory ("위험도는 게이트가 아님"), the general founder gate is
> outbound/payment. **Self-modification is the deliberate exception** — it adds a
> code-mutation gate. Record this in `docs/DECISIONS.md` when implementing.

### 3.2 Diff preview surface (reuse approval queue)
- `awaiting_apply` self-mod tasks set `approval_required=true` and appear in
  `monitor:approvalQueue`. Extend the `approvalQueue` projection to include
  `acr_diff`, `acr_branch`, `acr_pr_url`, and `self_mod_origin` when present.
- Founder UI `approval/page.tsx`: for self-mod items, render `acr_diff` in a
  monospace, scrollable, collapsed-by-default code block (cap render at ~2000 lines,
  link to PR if `acr_pr_url`). Two buttons: **적용(Apply)** / **롤백(Reject)**.

### 3.3 Apply / Rollback mechanism
- **Apply** → `monitor:applySelfMod({ task_id })`: instructs ACR to merge `acr_branch`
  into base (reuse the existing ACR merge path that already reports `merge_action`/
  `merge_target` in `taskCallback`; expose a `POST /api/projects/.../merge` style call
  via `acr-client.ts`, OR set `approval_required=false` + an `apply=true` flag that the
  Hermes side forwards as `l5_approved` so ACR performs the gated merge). On merge
  success → task `applied`; origin `self_mod_status='applied'`; kick M6 post-apply loop
  (§2.3). **If the change touched the orchestration plugin / running services**, set
  `blocker='applied:needs_restart <launchd label>'` — surfaced to the founder, because
  the running process cannot hot-swap itself.
- **Rollback** → `monitor:rollbackSelfMod({ task_id })`: ACR abandons/deletes
  `acr_branch` (never merged, so rollback = drop branch); task `rolled_back`; origin
  `self_mod_status='rejected'`. Because nothing was merged, **pre-apply rollback is
  trivially safe** (branch isolation). Post-apply rollback (rare, if verify fails after
  merge) = `git revert` of the merge commit on a new branch → back through the same
  approval gate (do not auto-force-push).
- **acr_token** continues to authenticate ACR↔L5 (`approvalCallback`), so the founder
  verdict can also arrive via ACR's own panel; both paths converge on the same task.

### 3.4 Blast-radius guards (cheap, high value)
- ACR phase prompt for self-mod includes an explicit **scope fence**: "only touch
  files implementing `<pattern>`; do not modify `apps/nocobase-app/.../plugin.ts`
  approval/gate logic, `docs/`, secrets, or launchd plists." (A self-mod that edits its
  own approval gate is the nightmare case — name it as forbidden in the packet.)
- Verifier acceptance criterion "변경 범위가 제안과 무관한 파일로 번지지 않는다" makes
  scope-creep a `verifier:fail`.
- Hard refuse if the diff touches `*/plugin-orchestration/*plugin*`, `*.env*`,
  `*/launchd/*`, or `SECURITY_*` — return to founder as `needs_review`, never auto-apply,
  regardless of floor. Implement as a deny-list check in `applySelfMod` before merge.

---

## 4. Founder UI changes

### 4.1 `tool-requests/page.tsx`
- Add a **[CTO에게 전송]** button on each card (Joinery `j-btn j-btn-primary j-btn-sm`),
  enabled only when the card has no active self-mod child (`self_mod_status` unset or
  `rejected`).
- Add a **self-mod status chip** driven by `self_mod_status`:
  `sent`(보냄) → `in_progress`(CTO 작업 중) → `awaiting_apply`(승인 대기) →
  `applied`(적용됨) / `rejected`(반려). Reuse the existing `StatusBadge` color system.
- On click → `api.sendToolRequestToCTO(task_id)`; optimistic set chip to `sent`; the
  30s auto-refresh reflects progress. When `awaiting_apply`, show a "승인 큐에서 diff
  검토" link to `/approval`.

### 4.2 `api.ts`
Add:
- `sendToolRequestToCTO(task_id)` → `POST /api/monitor:sendToCTO`.
- `applySelfMod(task_id)` → `POST /api/monitor:applySelfMod`.
- `rollbackSelfMod(task_id)` → `POST /api/monitor:rollbackSelfMod`.
- Extend `ToolRequestItem` + approval-queue types with `self_mod_status`, `acr_diff`,
  `acr_branch`, `acr_pr_url`.

### 4.3 `approval/page.tsx`
- Diff-preview block + Apply/Reject for self-mod approval items (see §3.2). This reuses
  the existing approval-queue plumbing; no new page.

---

## 5. Ordered slices

Effort: S ≈ <0.5d, M ≈ 1-2d, L ≈ 3d+. Each slice ends compilable + `dist` patched.

### P3.5 — Collect & link (S)
- l5-core: `buildSelfModAcceptanceCriteria(origin)` in `tool-request.ts` + unit tests
  (CLAUDE.md rule 3: every scoring/decision rule tested).
- plugin-orchestration: add `self_mod_origin, self_mod_status, acr_branch, acr_diff,
  acr_pr_url` columns (ALTER + `defineCollection`), patch `dist/plugin.js`.
- Deps: none. Risk: low (additive columns, Postgres-only path already guarded).

### P3.6 — Send → self-mod task (M)
- `monitor:sendToCTO` action (executive-monitor): create self-mod `agent_task`
  (objective=rationale, auto criteria, `source_ref='selfmod:<id>'`, risk floor D3,
  `project_path` from `L5_SELFMOD_PROJECT_PATH`, `approval_required=false`), set origin
  `self_mod_status='sent'`. ACL `loggedIn`. Patch src + dist.
- Founder UI: `[CTO에게 전송]` button + status chip + `sendToolRequestToCTO` in api.ts.
- Persist `branch`/`diff_summary` from `taskCallback` into `acr_branch`/`acr_diff`
  (orchestration plugin.ts): on CTO self-mod task `pass`, set `status='awaiting_apply'`,
  `approval_required = floorGate(...)`. Patch src + dist.
- Deps: P3.5. Risk: med — `taskCallback` is hot machine path; change must be additive
  and keep existing `verifier:fail`/`cto_retry` behavior intact for non-self-mod tasks
  (branch on `source_ref.startsWith('selfmod:')`).

### P3.7 — ACR self-modify, apply/rollback + verify (L)
- `monitor:applySelfMod` (merge via acr-client + deny-list guard §3.4) and
  `monitor:rollbackSelfMod` (abandon branch). Set origin `self_mod_status` accordingly.
- Post-apply M6 loop: inject `runWork`/`verify` closures into `runDelegationLoop`
  (reuse `verify.ts` prompt/parse). `resolved`→`applied`, `escalated`→`needs_review`.
- Approval UI: diff preview + Apply/Reject in `approval/page.tsx`; extend `approvalQueue`
  projection with diff fields.
- `L5_SELFMOD_AUTO_APPLY_FLOOR` config (default D3) read at gate time.
- `docs/DECISIONS.md`: record the self-mod code-mutation gate exception. `docs/HANDOFF.md`
  + `docs/TASKS.md` updated (CLAUDE.md "Done When").
- Deps: P3.6. Risks: **high** — this is the actual self-mutation. Mitigations: branch
  isolation, deny-list, floor=D3 default, M6 verify, restart-flag honesty.

---

## 6. Open questions for the founder
1. Self-mod `project_path` = the L5 monorepo root, or a sandbox clone first? (Sandbox =
   safer, but "applied" then needs a sync step. Recommend monorepo + branch isolation
   for MVP; revisit if the CTO ever proposes touching gate code.)
2. Who may press `Send to CTO` — founder only, or also CEO orchestration auto-promote a
   high-priority Tool Request? (Recommend founder-only for MVP; self-mod is the one place
   we want a human in the loop at *initiation*, not just apply.)
3. Default `MAX_RETRIES`/`max_rounds` for the post-apply loop (reuse M6 default 3?).
4. Restart automation: after `applied:needs_restart`, auto-`launchctl kickstart` the
   affected `com.l5.*` service, or leave manual? (Recommend manual confirm for MVP.)
