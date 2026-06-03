# P3-2 — Knowledge Auto-Curation (replaces manual Memory Review)

Status: SPEC (not implemented). Author handoff for the next implementer.
Last reviewed against code: 2026-06-02.

## 1. Problem & Goal

Today the founder sees raw JSON insight cards with manual `[저장]/[폐기]` buttons.
Source of the pain:

- UI: `apps/founder-ui/src/app/memory/page.tsx` renders each `founder_memory`
  row (`insight_to_record ?? content ?? JSON.stringify(item)`) with Save/Discard
  buttons. The founder cannot meaningfully triage these.
- Candidates are produced by `persistTaskInsight()` in
  `apps/nocobase-app/packages/plugins/@l5/plugin-orchestration/src/server/plugin.ts:1769`
  (one pending row per completed task, dedup by `source_task_id`), plus the
  executive `secondbrain.write` tool which routes through `proposeWrite` into the
  same pending queue.
- The "CEO gate" today = the founder manually clicking Save, which sets
  `approval_status='saved'` via `monitor:saveMemory`
  (`plugin-executive-monitor/src/server/plugin.ts:436 updateMemoryStatus` →
  `pushToSecondBrainOnSave` at line 471).

**Goal:** replace the manual gate with **automatic curation**:

- Rules (then minimal LLM only for borderline) auto-DISCARD duplicates /
  low-quality / high-PII, and auto-SAVE high-reuse insights.
- "Save" = append to the Second Brain (the existing transport path).
- The founder only sees a **weekly summary** (newly saved / discarded) and can
  optionally override an auto-decision.
- Discards are **soft-deleted** with a 30-day grace window; a cron purges
  expired ones. No good knowledge is lost silently.

Governance (CLAUDE.md): never send/append `pii_level='high'` to the LLM or the
Second Brain. Keep LLM use minimal — rules first.

## 2. Current-state map (cite)

| Concern | Location |
| --- | --- |
| Candidate creation | `plugin-orchestration/.../plugin.ts:1769 persistTaskInsight` |
| Pure insight extraction | `packages/l5-core/src/functions/memory/collector.ts collectInsights` |
| Candidate types | `packages/l5-core/src/functions/memory/types.ts MemoryCandidate` |
| Manual reviewer (pure) | `packages/l5-core/src/functions/memory/reviewer.ts buildMemoryReviewBrief / applyMemoryDecision` |
| Collection schema | `plugin-executive-monitor/.../plugin.ts:733 registerFounderMemoryCollection` (`founder_memory`) |
| List/save/discard actions | `plugin-executive-monitor/.../plugin.ts:409 memoryCandidates`, `:436 updateMemoryStatus`, `:471 pushToSecondBrainOnSave` |
| Second Brain transport (spawn python) | `plugin-orchestration/src/server/secondbrain-transport.ts makeSecondBrainTransport` |
| Transport adapter / propose-write | `packages/l5-core/src/functions/memory/secondbrain-source.ts createSecondBrainSource / createSecondBrainTools(proposeWrite)` |
| Embedding query (dedup source) | transport `query()` → python `search.tempr.search(query, brain, top_k)` over `brains/biz/memory/embeddings.sqlite` |
| Embedding append | transport `append()` → python `lib.store.add_card(brain, claim, ...)` |
| Recall into prompts | `insight-bus.ts recallInsights / formatInsightsForPrompt`; `plugin-orchestration plugin.ts:1172` |
| Cron pattern (node-cron) | `plugin-executive-monitor/src/server/hermes-scheduler.ts startHermesScheduler` |
| UI api client | `apps/founder-ui/src/lib/api.ts:265 memoryCandidates/saveMemory/discardMemory` |
| Sidebar label | `apps/founder-ui/src/components/Sidebar.tsx:47 { href:'/memory', label:'Memory Review' }` |

Note the dual-runtime patch rule: every plugin `src/server/plugin.ts` change
MUST also be applied to the bundled `dist/plugin.js` (and `dist/server/...` if
present) — see MEMORY "NocoBase plugin dist patching".

## 3. Curation rules (l5-core, pure & testable)

### New module

`packages/l5-core/src/functions/memory/curation.ts`
Tests: `packages/l5-core/src/functions/memory/__tests__/curation.test.ts`
Export from `packages/l5-core/src/functions/memory/index.ts`.

This module is **pure** — no IO. Embedding similarity is passed in as data
(computed by the plugin via the transport), so it stays unit-testable.

### Types

```ts
export type CurationDecision = 'auto_save' | 'auto_discard' | 'needs_review';
export type DiscardReason =
  | 'duplicate' | 'too_short' | 'low_specificity' | 'pii_high' | 'low_value';

export interface CurationInput {
  insight: string;
  pii_level: 'none' | 'low' | 'high';
  workflow_improvement?: string;
  phase?: string;
  source_agent?: string;
  /** Max cosine similarity vs existing Second Brain cards, 0..1.
   *  Supplied by the plugin from transport.query embeddings; undefined if
   *  the store is unavailable (then dedup is skipped, fail-open to keep). */
  maxSimilarity?: number;
}

export interface CurationScore {
  specificity: number;   // 0..1 — has numbers / named entities / causal words
  reuse_value: number;   // 0..1 — generalizable, has workflow_improvement, etc.
  length_ok: boolean;
}

export interface CurationResult {
  decision: CurationDecision;
  reason?: DiscardReason;          // set when auto_discard
  score: CurationScore;
  needs_llm: boolean;              // true only in the borderline band
  explanation: string;             // short KO string for the weekly summary
}
```

### Thresholds (constants, exported for tuning)

```ts
export const CURATION = {
  MIN_LENGTH: 25,            // chars; below → too_short (collector already drops <10)
  DUP_SIMILARITY: 0.92,     // >= → duplicate auto_discard
  AUTO_SAVE_SCORE: 0.62,    // combined score >= → auto_save
  AUTO_DISCARD_SCORE: 0.30, // combined score <  → auto_discard low_value
  // band in between → needs_review (optionally LLM-assisted, see §3.4)
};
```

### 3.1 `scoreInsight(input): CurationScore` (pure, no LLM)

- `length_ok = insight.trim().length >= MIN_LENGTH`.
- `specificity`: cheap heuristics, each adds weight, clamp 0..1:
  - contains a digit / `%` / currency → +0.3
  - contains a causal/lesson marker (`때문`, `덕분`, `결과`, `왜냐`, `→`,
    `because`, `so that`) → +0.3
  - contains a proper-noun-ish token (capitalized latin word or quoted phrase)
    → +0.2
  - length 60..400 chars → +0.2 (too short = thin, too long = dump)
- `reuse_value`:
  - has non-empty `workflow_improvement` → +0.4
  - has `phase` set → +0.2
  - generalizable phrasing (no first-person "내가 X 했다" only) → +0.2
  - not duplicate (`maxSimilarity` undefined or `< DUP_SIMILARITY`) → +0.2

Keep these heuristics literal & data-driven so each branch has a unit test.

### 3.2 `curateInsight(input): CurationResult` (pure, deterministic)

Order of checks (first match wins):

1. `pii_level === 'high'` → `auto_discard`, reason `pii_high`. (Hard governance:
   never reaches LLM or Second Brain.)
2. `!length_ok` → `auto_discard`, reason `too_short`.
3. `maxSimilarity !== undefined && maxSimilarity >= DUP_SIMILARITY` →
   `auto_discard`, reason `duplicate`.
4. combined `= 0.5*specificity + 0.5*reuse_value`:
   - `>= AUTO_SAVE_SCORE` → `auto_save`.
   - `<  AUTO_DISCARD_SCORE` → `auto_discard`, reason `low_value`.
   - else → `needs_review`, `needs_llm = true`.

`explanation` is a short Korean sentence, e.g.
`"중복(유사도 0.95) — 기존 카드와 거의 동일"`,
`"구체성/재사용성 높음 → 자동 저장"`, `"PII 높음 → 자동 폐기"`.

### 3.3 `summarizeCuration(results): CurationSummary` (pure)

Folds an array of `{ id, result }` into counts + arrays for the weekly UI:

```ts
export interface CurationSummary {
  week_start: string;            // ISO date
  saved: Array<{ id; insight; explanation }>;
  discarded: Array<{ id; insight; reason; explanation; discarded_at; purge_at }>;
  needs_review: Array<{ id; insight; explanation }>;
  totals: { saved: number; discarded: number; needs_review: number };
}
```

### 3.4 Borderline LLM assist (optional, minimal)

Only `needs_review` items, and only if a flag is on. Pure module exposes
`buildCurationLLMPrompt(input): string` (KO, asks "keep vs discard + 1-line
reason", forbids echoing PII). The plugin calls the claude CLI (MCP off — see
MEMORY "L5 claude CLI 도구 루프") and maps the verdict back to `auto_save` /
`auto_discard`. If the LLM is unavailable, `needs_review` stays as-is (surfaced
to the founder, defaults to **kept-pending**, never auto-discarded). Keep this
slice optional/last — rules alone must ship a working feature.

### Unit tests (curation.test.ts)

- pii_high → auto_discard/pii_high (even with high score).
- length < MIN_LENGTH → too_short.
- maxSimilarity 0.95 → duplicate; 0.5 → not duplicate.
- rich insight (number + workflow_improvement + phase) → auto_save.
- vague short-ish insight → auto_discard/low_value.
- mid-band → needs_review & needs_llm true.
- `scoreInsight` each heuristic branch toggles expected weight.
- `summarizeCuration` counts + buckets correctly.
- Determinism: same input → same output (no Date/random inside pure fns; caller
  injects timestamps).

## 4. Soft-delete data model

Minimal additive change to `founder_memory`
(`plugin-executive-monitor/.../plugin.ts:733`). Keep existing `approval_status`
string; **add three nullable fields** (additive → no destructive migration):

```ts
{ name: 'curation_decision', type: 'string' },     // auto_save|auto_discard|needs_review|manual
{ name: 'discard_reason',   type: 'string' },      // DiscardReason | null
{ name: 'discarded_at',     type: 'date' },        // set when status→discarded
{ name: 'purge_at',         type: 'date' },        // discarded_at + 30d
```

Status semantics on `approval_status`:
`pending` → newly created, not yet curated.
`saved` → auto/manually saved (already appended to Second Brain).
`discarded` → soft-deleted; `discarded_at` + `purge_at` set; row retained for
30 days so it can be restored or recalled if needed.

NocoBase auto-manages `createdAt/updatedAt` (camelCase — MEMORY gotcha). Existing
rows simply have the new fields null; no backfill required.

### Purge cron (Hermes)

Add a job in `hermes-scheduler.ts startHermesScheduler` (same node-cron pattern,
e.g. daily `0 4 * * *`): `repo.destroy({ filter: { approval_status:'discarded',
purge_at: { $lt: nowISO } } })`. (Use the same `$lt`/JS-filter caution as
existing code — if operator support is shaky, fetch discarded rows and filter
`purge_at < now` in JS, then destroy by id.)

## 5. Plugin wiring

### 5.1 Where curation runs

Two complementary entry points:

**(a) At creation — `persistTaskInsight` (plugin-orchestration plugin.ts:1769).**
After building `collectInsights(...)` candidates, for each candidate:
1. If transport available, compute `maxSimilarity` via
   `_secondBrainTransport.query({ role: undefined, limit: 1 })` using the insight
   text as the query (transport `query` currently takes `filter.role` as the
   python `query` arg — see secondbrain-transport.ts:85; **extend the transport
   to accept a `text` query**, see §5.4). Skip (leave undefined) on any error.
2. Call `curateInsight({...candidate, maxSimilarity})`.
3. Persist the row with `curation_decision`, and:
   - `auto_save` → create row `approval_status:'saved'`, then append to Second
     Brain via the existing path (§5.2). (Replaces "founder clicks save".)
   - `auto_discard` → create row `approval_status:'discarded'`, `discard_reason`,
     `discarded_at=now`, `purge_at=now+30d`. **Never** append to Second Brain.
   - `needs_review` → `approval_status:'pending'` (founder may act; default kept).

This makes the "CEO gate" **auto + post-hoc notify** instead of a blocking
manual step. `pii_high` is auto-discarded and never sent anywhere.

**(b) Periodic sweep (cron, plugin-executive-monitor hermes-scheduler).** A daily
job re-curates any stragglers left `pending` (e.g. created before this feature,
or when the transport was down at creation time) so nothing sits forever. Reuses
the same `curateInsight` call.

### 5.2 Second Brain append path (reuse existing)

For an auto-save, reuse the established propose/append plumbing rather than a new
path:

- In-process (orchestration): `_secondBrainTransport.append({ insight,
  source_agent, source_task_id, phase, pii_level })` — the same call
  `makeFounderMemoryInsightSource.write`/`createSecondBrainSource.write` already
  funnel into.
- In executive-monitor's save action: the existing
  `pushToSecondBrainOnSave` (plugin.ts:471) already appends on `status→saved`.
  Auto-save can set `status:'saved'` and call the same helper so there is **one**
  append path. Guard: `pii_level==='high'` already blocks append there (line 483);
  keep that guard.

Idempotency: `persistTaskInsight` already dedups by `source_task_id`
(plugin.ts:1798). Auto-save must not double-append — append only on the
create/transition, not on re-curation of an already-`saved` row.

### 5.3 Weekly summary data

New read action `monitor:curationSummary` in plugin-executive-monitor (sibling to
`memoryCandidates` at plugin.ts:409). Logic:
- Query `founder_memory` rows with `updatedAt >= now-7d` (or `discarded_at`/save
  time in window).
- Map to `summarizeCuration` shape (call the pure l5-core fn).
- Return `{ ok, data: CurationSummary }`.
Register the action + ACL `loggedIn` alongside existing monitor actions
(plugin.ts:761 resourcer, :849 acl list).

New action `monitor:overrideCuration` `{ id, decision: 'save'|'discard'|'restore' }`:
- `save`: status→saved + append (if not already), clear discard fields.
- `discard`: status→discarded, set discarded_at/purge_at.
- `restore`: status→pending (undo an auto-discard within grace), clear
  discard fields. Lets the founder rescue a wrongly-discarded insight.

### 5.4 Transport extension (small)

`secondbrain-transport.ts query()` currently passes `filter.role` as the python
search query (line 85). For dedup we need to query by **insight text**. Add an
optional `text` field to the transport filter and the l5-core
`SecondBrainTransport.query` signature
(`packages/l5-core/src/functions/memory/secondbrain-source.ts:15`), passing
`filter.text ?? filter.role ?? ''` into the python `search()` arg. Return hits
already include similarity? Current python `search` returns hits but the TS map
(line 96) drops score — **add `score`/`similarity` to the mapped shape** and read
it for `maxSimilarity`. If the python layer doesn't return a score, fall back to
`needs_review` (don't fabricate dedup). Verify the python `search.tempr.search`
return shape before relying on it.

### 5.5 Exact edit points (src + dist both)

| File | Edit |
| --- | --- |
| `l5-core/src/functions/memory/curation.ts` | NEW pure module (§3) |
| `l5-core/src/functions/memory/__tests__/curation.test.ts` | NEW tests |
| `l5-core/src/functions/memory/index.ts` | export curation symbols |
| `l5-core/src/functions/memory/secondbrain-source.ts:15` | add `text?` + `score` to transport contract |
| `plugin-orchestration/src/server/secondbrain-transport.ts:80,96` | accept `text`, return `score` |
| `plugin-orchestration/src/server/plugin.ts:1769` | `persistTaskInsight`: curate + route save/discard |
| `plugin-orchestration/dist/plugin.js` | mirror the above (built or hand-patched) |
| `plugin-executive-monitor/src/server/plugin.ts:733` | add 4 fields to collection |
| `plugin-executive-monitor/src/server/plugin.ts:409+` | add `curationSummary`, `overrideCuration`; keep `memoryCandidates` for compat or retire |
| `plugin-executive-monitor/src/server/plugin.ts:761,849` | register actions + ACL |
| `plugin-executive-monitor/src/server/hermes-scheduler.ts` | add purge job + pending-sweep job |
| `plugin-executive-monitor/dist/plugin.js` + dist hermes-scheduler | mirror |
| `l5-core` build | `npm run build` so `dist/functions/memory/curation` exists (plugins require from `l5-core/dist`) |

## 6. Founder UI redesign

Rename the page concept from "Memory Review" to **"지식 (Knowledge)"**.

- `apps/founder-ui/src/components/Sidebar.tsx:47`: label
  `'Memory Review'` → `'지식'` (keep `href:'/memory'` to avoid route churn, or
  move to `/knowledge` + redirect — prefer keeping `/memory`).
- `apps/founder-ui/src/app/memory/page.tsx`: **remove the raw-JSON cards and
  Save/Discard buttons**. New layout:
  - Header: "이번 주 지식 큐레이션" + week range.
  - Two compact sections **저장됨 / 폐기됨** (counts as badges). Each item shows
    the human insight text (never `JSON.stringify`), the `explanation` (why), the
    `source_agent`/`phase` chips, and the existing `PiiBadge`.
  - Discarded items show a `30일 후 영구 삭제 · {purge_at}` note and a **복원**
    button (`overrideCuration restore`). Saved items show a Second Brain link
    (deep-link to the appended card if the transport returns an id; otherwise a
    static "세컨 브레인에 적립됨" badge).
  - Optional **needs_review** section: items the rules couldn't decide — small
    저장/폐기 buttons here only (the only place manual action remains).
  - Empty state reused from current page.
- `apps/founder-ui/src/lib/api.ts:265`: replace `memoryCandidates/saveMemory/
  discardMemory` with `curationSummary()` and `overrideCuration(id, decision)`.
  Keep the old three only if the `needs_review` manual path reuses them; else
  remove to avoid dead endpoints.
- Reuse Joinery tokens/classes already in the page (`j-card`, `j-badge*`,
  `j-btn*`, `--ink/--paper/--green/--red` vars). No new design system.

## 7. Ordered slices (effort · deps · risk)

1. **l5-core curation module + tests** — S. No deps. Pure, fully unit-tested.
   Risk: low. *This is the foundation; do first and prove with tests.*
2. **Collection soft-delete fields** — S. Dep: none (additive migration). Risk:
   low (verify NocoBase auto-syncs new fields on existing table).
3. **Transport text-query + score** — M. Dep: must verify python
   `search.tempr.search` actually returns a similarity score; if not, dedup
   degrades to `needs_review` (acceptable). Risk: med (cross-language shape).
4. **Wire auto-curation into `persistTaskInsight` + auto-save append** — M.
   Deps 1–3. Patch src **and** dist. Risk: med — **auto-discard could lose good
   data** → mitigated by soft-delete + 30-day grace + restore + fail-open on
   missing similarity + never auto-discarding `needs_review`.
5. **Weekly summary + override actions + purge/sweep cron** — M. Deps 2,4. Patch
   src + dist both plugins. Risk: med (cron purge is destructive — gate strictly
   on `approval_status='discarded' AND purge_at < now`; test the filter).
6. **Founder UI redesign + api client** — M. Dep 5. Risk: low. Remove raw-JSON
   cards last so the API is ready.
7. **(Optional, last) borderline LLM assist** — S/M. Dep 1,4. Risk: low (claude
   CLI MCP-off, governance: no PII in prompt). Ship only after rules path works.

### Key risks & mitigations

- **Auto-discard losing knowledge** → soft-delete + 30d `purge_at` + founder
  restore + weekly visibility; rules fail-open (no similarity ⇒ keep, not drop);
  `needs_review` never auto-discarded.
- **PII leak** → §3.2 step 1 hard-discards `pii_high` before any LLM/Second Brain
  contact; existing append guard at plugin.ts:483 retained.
- **Double append on re-curation** → append only on create/transition to
  `saved`, dedup by `source_task_id` (existing).
- **Dual-runtime drift** → every plugin edit mirrored into `dist/plugin.js`;
  `l5-core` rebuilt so `dist/functions/memory/curation` exists.
- **Dedup quality unknown** → verify python search returns a score before
  trusting `DUP_SIMILARITY`; otherwise route to `needs_review`.

## 8. Done when

- `curation.test.ts` passes (all branches).
- A completed task with a rich insight auto-saves and appears in the Second Brain
  query; a duplicate/short/high-PII insight auto-discards with the right reason.
- `/memory` shows the weekly saved/discarded summary, no raw JSON, restore works.
- Purge cron removes only `discarded` rows past `purge_at`.
- `docs/TASKS.md`, `docs/HANDOFF.md`, and (if schema/flow decision) `docs/DECISIONS.md` updated.
