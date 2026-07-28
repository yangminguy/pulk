# Source contract — content-key-plan

Faithful extraction from the committed pulk TS. Do not invent fields or prompts; everything here is copied from the source logic. Korean free-text fields are LLM-authored natural language and must stay Korean.

## (d) Original source files

- `packages/l5-core/src/functions/video-room/key-content-draft.ts` — key-content workflow (PRD §3 Step 1~7,10), sequential per-step LLM reasoning with deterministic fallback; produces `KeyContentDraft`.
- `packages/l5-core/src/functions/video-room/key-content-report.ts` — market/benchmark/sales-logic report pipeline; produces `KeyContentReport`. This is the flow that fills the gate doc.
- `packages/l5-core/src/functions/video-room/key-content-planning.ts` — `buildXxx` validators + Zod schemas used by the draft workflow (`ItemGeneralizationSchema`, `KeyContentSearchKeywordSetSchema`, `assembleKeyContentPlan`, cross-step throws).
- `packages/l5-core/src/functions/video-room/gate-report-docs.ts` — `buildKeyContentPlanDoc` renders the `key_content_plan_doc` HTML from `KeyContentReport` + `pulling_keyword_plan`.

## (a) Extracted output schema

### KeyContentReport (key-content-report.ts) — the gate-doc artifact

- `product: string`, `target: string` — Korean free text.
- `market: MarketKeywordRow[]`
  - `keyword: string`
  - `videoCount: number`, `avgViews: number`, `topViews: number` (integers; avgViews rounded)
  - `longformRatio: number`, `shortsRatio: number`, `recentRatio: number` (0..1, over videos with known duration)
  - `targetFit: FitGrade` = `'높음' | '보통' | '낮음'` (LLM; default `보통`)
  - `salesLink: FitGrade` = `'높음' | '보통' | '낮음'` (LLM; default `보통`)
  - `verdict: MarketVerdict` = `'진행 추천' | '보류' | '제외'` (deterministic)
  - `verdictReason: string` — Korean free text (deterministic template)
- `candidates: ReportCandidate[]`
  - `videoId, title, url, thumbnailUrl, channelTitle: string`; `viewCount: number`
  - `performance: string | null`, `contribution: string | null` (from `metrics['성과도']`/`['기여도']`)
  - `isShort: boolean`, `keyword: string`, `rank: number`, `topPick: boolean`, `transcriptAvailable: boolean`
  - `viewer_identity?: string` (Korean free text, one line — who the video pulls in)
  - `identity_match?: IdentityMatch` = `'match' | 'partial' | 'mismatch'`
  - `identity_reason?: string` (Korean free text)
  - `funnel?: FunnelAnalysis` = `{ phenomenon, desire, plan, action, reward }` — all Korean free text
  - `monetization?: MonetizationAnalysis` = `{ selling_product, pinned_comment, description_links, profile_links, moves_user_to, monetization_method, takeaway_for_us }` — all Korean free text
- `applied_sales_logic: AppliedSalesLogic | null`
  - `{ content_topic, core_target, target_phenomenon, desire_to_trigger, plan_user_makes, action_to_our_product, reward_user_expects }` — all Korean free text. **Must be non-null for the gate doc** (`buildKeyContentPlanDoc` throws on null).
- `recommended_video_id: string | null` (the `topPick` candidate's videoId)
- `recommendation_reason: string` — Korean free text (LLM synthesis; must cover demand / target-fit / edge-over-others / sales-logic linkage)
- `approval_request: string` — Korean free text (constant: `'위 3가지 콘텐츠 후보와 추천 콘텐츠를 기준으로 키 콘텐츠 기획을 확정해도 될까요?'`)
- `provenance: { keywords_analyzed: number; keywords_advanced: number; candidates_selected: number; transcripts_fetched: number; notes: string[] }`

Deterministic constants (key-content-report.ts): `MIN_VIEWS = 50_000`; `RECENT_WINDOW_MS = 365d`; verdict thresholds — 제외 if `videoCount < 3` OR `avgViews < 5_000` OR `targetFit==='낮음'`; 진행 추천 if `topViews >= 50_000 && avgViews >= 20_000 && targetFit==='높음' && salesLink!=='낮음'`; else 보류. Qualified candidate: `viewCount >= 50_000` AND (short → 성과도/기여도 ∈ {Good,Great,good,great}; long-form → pass if both grades empty else require Good+). `maxKeywords` default 6.

### KeyContentDraft (key-content-draft.ts) — upstream Step 1~7,10 workflow

Produced by `runKeyContentWorkflow`. Each step is validated by the matching `buildXxx` (Zod). LLM emits JSON **without ids**; code assigns deterministic index-based ids (`prob-item-i`, `prob-cat-i`, `funnel-<stage>-i`).

- `step1_generalization: ItemGeneralization` (deterministic — no LLM)
- `step2_item_fb`, `step3_category_fb`: feature/benefit maps — each `{ features[], characteristics[], benefits[] }`, every entry `{ item: string(min1), description: string(min1) }`, each array min 1.
- `step4_problems`: `{ item_problems: {problem, derived_from}[] (min1), category_problems: {problem, derived_from}[] }`
- `step5_funnel`: `{ phenomenon[], desire[], plan[], action[], reward[] }` (string arrays; empty strings filtered out on assembly)
- `step6_entry_decision`: `{ selected_entry_stage: 'phenomenon'|'desire'|'plan', rationale: string(min1) }`
- `step7_search_keywords: KeyContentSearchKeywordSet` (deterministic — no LLM)
- `step10_sales_logic`: `{ problem_statement, category_feature_benefit, category_need, item_feature_benefit, item_solution_statement, cta }` — each `string(min1)`, Korean free text.

`finalizeKeyContentPlan` merges the draft with Step 8 (`viewtrap_validation`, human-input), Step 9 (`viable_candidates`, deterministic from Step 8), and Step 11 (`approved_topic`: `{ title, thumbnail_promise, intro_direction, body_structure[], cta }`) via `assembleKeyContentPlan`, which enforces cross-step throws (e.g. entry_stage must match between step6 and step11).

## (b) Source step order and LLM usage

### key-content-draft.ts — `runKeyContentWorkflow` (sequential, per-step retry = maxRetries default 2 → 3 attempts)

| Step | LLM? | Depends on | Notes |
|---|---|---|---|
| Step 1 generalization | No (deterministic) | product | always succeeds |
| Step 2 item feature/benefit | Yes | step1 | runs parallel with step3 (both only need step1, R3) |
| Step 3 category feature/benefit | Yes | step1 | parallel with step2 |
| Step 4 problems (reverse-derive) | Yes | step2, step3, customer_problem | item_problems min 1 |
| Step 5 funnel placement | Yes | step4 | ≥2 stages filled |
| Step 6 entry-stage decision | Yes | step5 | parallel with step10 (R-M7) |
| Step 7 search keywords | No (deterministic) | step1~4 | always succeeds |
| Step 10 sales logic | Yes | step1~5 | parallel with step6 |

LLM steps = 2,3,4,5,6,10 (six). Deterministic steps = 1,7. Each LLM step: build prompt (prior validated steps injected as context) → retry loop (`extractJson` → `JSON.parse` → Zod parse → `buildXxx`) → on failure that step falls back deterministically and progresses. The older `draftKeyContentPlan` is `@deprecated` (single whole-draft LLM call). Steps 8/9/11 are out of the workflow's scope. No `Date.now()`/`randomUUID()` — ids are index-based.

### key-content-report.ts — `runKeyContentReport` (5 stages)

| Stage | LLM? | Output |
|---|---|---|
| 1. discover + durations → metrics | No (deterministic `computeMarketMetrics`) | per-keyword `MarketMetrics` |
| 2. market judge (single batch prompt) | Yes | `targetFit`/`salesLink` per keyword |
| 2b. verdict (`decideVerdict`) | No (deterministic) | `verdict` + reason |
| 3. candidate pool + final select | Yes (`selectPrompt`, one call) | 3 candidates ranked, identity_match; deterministic qualify/dedup/sort; comments fetched as evidence |
| 4. per-candidate sales logic | Yes (`salesLogicPrompt`, one call/candidate) | `funnel` + `monetization`; transcript fetched first |
| 5. synthesis | Yes (`synthesisPrompt`, one call) | `applied_sales_logic` + `recommendation_reason` |

LLM prompts (Korean, in source): `marketJudgePrompt`, `selectPrompt`, `salesLogicPrompt`, `synthesisPrompt`. JSON parsing is lenient (`parseJson` with fenced/balanced-bracket recovery, `fallback` on failure). All failures are caught → skip item, push to `provenance.notes`, never throw.

## (c) Gate report mapping

- Gate doc builder: `buildKeyContentPlanDoc` (gate-report-docs.ts).
- Stage: **`key_content_plan_doc`** — 키 콘텐츠 기획서 (선별 이유 · 벤치마킹 영상 · 판매 논리 · 풀링 키워드 계획).
- Gate: **`key_content_approval`** (approval-gates.ts maps it to owner role `strategy`; state-machine.ts requires approval and lists `key_content_plan_doc` as its required doc).
- Inputs: `{ project: {id,title}, report: KeyContentReport, key_topic_title?, pulling_keyword_plan: {keyword,reason}[] }`.
- Hard preconditions (throw): `report.applied_sales_logic` must be non-null (FR-4 §3); `pulling_keyword_plan` must be non-empty (FR-4 §4).
- Doc sections: (1) key topic + selection rationale + KB 04/06 criteria + market-verification table; (2) benchmark videos (top 5 by topPick/rank) with viewer-identity note; (3) applied sales logic table; (4) pulling-keyword plan. Cited KB criteria (`KEY_SELECTION_CRITERIA`): 역순 기획(04), 실측 가치 판단(06 §4), 시청자 정체성(06 §4), 판매 논리 5단계(03·04).
