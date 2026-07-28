# content-title-develop — source contract

Faithfully transferred from the committed L5 domain logic. Do not invent fields;
these are the actual types and the actual step/LLM map from the source TS.

## (d) Original source files

- `packages/l5-core/src/functions/cmo-strategy/title-development.ts`
  — deterministic functions (WO-1): reference validation, search-term baseline,
  4-way cross-combination, 35-char (grapheme) length guard, awkwardness threshold,
  final-score summation + threshold, title-swap monitor, second-brain summary,
  version log, proposal builder.
- `packages/l5-core/src/functions/cmo-strategy/title-development-llm.ts`
  — LLM executors (WO-2) + the synthesis pipeline `runTitleDevelopmentWorkflow`.
- `packages/l5-core/src/functions/cmo-strategy/title-development-types.ts`
  — the type definitions below (PRD §19; fields are frozen — no rename/add).

## (a) Output schema (TitleDevelopmentWorkflowRun)

Model for the develop steps 2–8: `claude-sonnet-4-6` (source `TITLE_DEVELOPMENT_MODEL`).
Free Korean text is marked **[KO free text]**.

### TitleDevelopmentWorkflowRun (the artifact `data`)

| field | type | notes |
|---|---|---|
| id | string (uuid) | |
| video_project_id | string | |
| pulling_content_id | string | |
| pulling_topic | string | **[KO free text]** |
| target_audience | string | **[KO free text]** |
| business_goal | string? | **[KO free text]**, optional |
| exact_search_terms | string[] | **[KO free text]** |
| expanded_search_terms | string[] | **[KO free text]** |
| forbidden_search_terms | string[] | **[KO free text]** |
| references | [TitleDevelopmentReference, TitleDevelopmentReference] | exactly 2 |
| combinations | TitleThumbnailCombination[] | 4 (cross-combos) |
| step_results | TitleDevelopmentStepResult[] | steps 2–8 |
| final_candidates | FinalTitleEvaluation[] | |
| selected_title | string | **[KO free text]**, enforced ≤35 graphemes |
| selected_thumbnail_direction | string | **[KO free text]** |
| approval_status | 'draft' \| 'approved' \| 'needs_revision' | always emit `'draft'` |
| second_brain_summary | string? | **[KO free text]** markdown |
| created_at | string (ISO) | |
| updated_at | string (ISO) | |

### TitleDevelopmentReference (input; validated, not produced)

| field | type | notes |
|---|---|---|
| id | string | |
| research_session_id | string | |
| source | 'viewtrap' \| 'youtube' \| 'manual' | |
| url | string? | |
| title | string | **[KO free text]** |
| thumbnail_text | string | **[KO free text]** |
| thumbnail_structure | string | **[KO free text]** |
| topic | string | **[KO free text]** |
| view_count | number (int ≥0) | must be ≥ 50000 to pass |
| performance_grade | 'Good' \| 'Great' | |
| contribution_grade | 'Good' \| 'Great' | |
| topic_similarity | 'exact' \| 'expanded_same_meaning' | |
| similarity_reason | string | **[KO free text]** |
| selected_reason | string | **[KO free text]** |

### TitleThumbnailCombination

| field | type | notes |
|---|---|---|
| id | string (uuid) | |
| combination_type | 'ref1_thumbnail_ref2_title' \| 'ref1_title_ref2_thumbnail' \| 'ref1_thumbnail_text_as_title_ref2_thumbnail' \| 'ref2_thumbnail_text_as_title_ref1_thumbnail' | |
| title_source_ref_id | string | |
| thumbnail_source_ref_id | string | |
| title_draft | string | **[KO free text]** |
| thumbnail_text_draft | string | **[KO free text]** |
| thumbnail_direction | string | **[KO free text]** |
| awkwardness_score | number | 0 = normal; >0 = awkward (cumulative deductions) |
| awkwardness_reason | string? | **[KO free text]** |
| passed | boolean | true iff awkwardness_score = 0 |
| selected_for_next_step | boolean | |

### TitleDevelopmentStepResult (one per step 2–8)

| field | type | notes |
|---|---|---|
| step_number | 2..8 | |
| step_name | string | **[KO free text]**, fixed names (see step map) |
| input_titles | string[] | **[KO free text]** |
| output_titles | string[] | **[KO free text]** |
| method_explanation | string | **[KO free text]** |
| cmo_reasoning | string | **[KO free text]** |
| rejected_titles | { title: string; reason: string }[] | both **[KO free text]** |
| selected_titles_for_next_step | string[] | **[KO free text]** |

### FinalTitleEvaluation

| field | type | cap / notes |
|---|---|---|
| title | string | **[KO free text]** |
| thumbnail_direction | string | **[KO free text]** |
| target_fit | number | 0–20 (clamped) |
| desire_clarity | number | 0–20 |
| problem_sharpness | number | 0–20 |
| curiosity_gap | number | 0–15 |
| script_match | number | 0–15 |
| thumbnail_fit | number | 0–10 |
| total_score | number | sum of clamped items (max 100) |
| recommendation | 'upload_candidate' \| 'revise' \| 'rerun_reference_search' | ≥85 / ≥70 / else |
| reason | string | **[KO free text]** |
| risks | string[] | **[KO free text]** |
| required_script_additions | string[]? | **[KO free text]**, optional |

### LLM call output schemas (intermediate, zod-parsed in source)

- awkwardness call → `[{ index:int≥0, awkwardness_score:number≥0, awkwardness_reason:string(default ''), selected_for_next_step:boolean }]`; `index` = input array order.
- step call → `{ output_titles:string[]≥1, method_explanation:string≥1, cmo_reasoning:string≥1, rejected_titles:[{title,reason}](default []), selected_titles_for_next_step:string[](default []) }`.
- final-eval call → `[{ index:int≥0, target_fit, desire_clarity, problem_sharpness, curiosity_gap, script_match, thumbnail_fit, reason:string, risks:string[](default []), required_script_additions:string[]? }]`; `index` = input array order.

## (b) Step order and LLM-call map

Source pipeline: `runTitleDevelopmentWorkflow` (title-development-llm.ts).

| # | step | function | LLM? | trace_name | on failure |
|---|---|---|---|---|---|
| 1 | validate references (≥2 pass, view≥50000, grades Good/Great, similarity exact/expanded) | validateTitleReferences | no | — | early return `request_more_references` (0 LLM calls) |
| 2 | search terms baseline | generateTitleSearchTerms | no | — | — |
| 3 | 4 cross-combinations | generateCrossCombinations | no | — | — |
| 4 | judge combination awkwardness (1 batch) | judgeCombinationAwkwardness | yes | `title-dev-awkwardness` | pass all, select default 2 types; fallback_count+1 |
| 5 | develop steps 2→3→4→5→6→7→8 (one call each, chained) | runTitleDevelopmentSteps | yes ×7 | `title-dev-step-{2..8}` | per-step: keep input as output, Korean fallback reason; fallback_count+1 each |
| 6 | final evaluation (1 batch) | evaluateFinalTitles | yes | `title-dev-final-eval` | all items 70% of cap (revise band); fallback_count+1 |
| 7 | best selection + 35-char (grapheme) enforcement | reduce + truncateTitleToMax | no | — | — |
| 8 | second_brain_summary | buildSecondBrainSummary | no | — | — |

Total LLM calls on the happy path: 1 (awkwardness) + 7 (steps 2–8) + 1 (final eval) = 9.
Each call retries `maxRetries` (default 1 → 2 attempts) on format/call error, then falls
back deterministically. No `llm` injected → every LLM step falls back (0 calls).

Post-processing hooks inside the steps:
- Step 5 (수식어 추가) only: titles >35 graphemes are moved to `rejected_titles` with
  reason `"35자 초과"` (§13.4). Applies at output of step 5.
- Any step: if `selected_titles_for_next_step` ends empty, it is refilled with
  `output_titles` (else the step input) so the chain never dies.
- Final selection: filter to ≤35-grapheme candidates first; if all exceed, keep the
  full pool. Winner = max `total_score`, ties → earliest. If the winner is still >35,
  `truncateTitleToMax` cuts at a word boundary (grapheme-aware, ko locale).

Fixed step names (`STEP_NAMES`, PRD §8 order): 2 쉬운 단어로 전환 · 3 상위어로 전환 ·
4 부정어/반대 구조로 전환 · 5 수식어 추가 · 6 답이 보이는 제목을 질문이 생기게 전환 ·
7 핫비디오 구조로 갈아끼우기 · 8 강한 단어로 변경.

Hot-video real data (`hot_videos`, Viewtrap-measured) is injected into step 5 and step 7
prompts. When absent, step 7 records the Korean note "핫비디오 실데이터 미제공 — 뷰트랩
실측 없이 일반 구조 지식으로 수행함. 뷰트랩 확인 권장." in method_explanation.

## (c) Gate report stage

This skill fills the gate report **stage = `title_development`**, feeding the
**gate `hook_draft_approval`** (page `strategy`, per
`packages/l5-core/src/functions/video-room/approval-gates.ts` GATE_PAGE_MAP).

The run is emitted with `approval_status: "draft"` (AC-13: no external publish before
Founder approval). The Founder gate — not this skill — flips it to `approved` or
`needs_revision`. In the CMO state machine the result is surfaced as a proposal card
at stage `thumbnail_pattern_extraction` (PRD §20.1, `buildTitleDevelopmentProposal`),
with `second_brain_summary` stored for reuse (AC-15).
