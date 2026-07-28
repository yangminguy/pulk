# Source contract — content-pulling-research

Faithful extraction from the committed TypeScript source. Do not invent fields or prompts; this file records what the source actually does.

## (d) Original source files

- `packages/l5-core/src/functions/video-room/pulling-content-report.ts` — the runtime orchestration `runPullingContentReport(input, deps)` with the three embedded LLM prompts and the deterministic scoring/grading pure functions. This is the primary source the SKILL.md mirrors.
- `packages/l5-core/src/functions/video-room/pulling-content-planning.ts` — the pure PRD §4 Step 0-12 builder/validator layer (`assemblePullingContentPlan`) with the Zod schemas below. Referenced for the strict schema shapes.
- `packages/l5-core/src/functions/video-room/key-content-report.ts` — provides `ReportProduct`, `ReportSourceVideo`, `VideoDurationInfo`, `IdentityMatch`, `isQualifiedCandidate`.
- `packages/l5-core/src/functions/video-room/gate-report-docs.ts` — renders the `pulling_plan_doc` HTML from `PullingContentReport`.

## (a) Output schema (field names · types · Korean free-text marked 🇰🇷)

`PullingContentReport` (from pulling-content-report.ts):

```
product: string 🇰🇷
target: string 🇰🇷
key_content_title: string 🇰🇷
key_funnel_summary: string 🇰🇷        // "desire → plan → action → reward" joined, or default
pulling_role: string                  // literal "현상 → 욕구"
search_summary: {
  keywords_used: number
  videos_collected: number
  videos_after_dedup: number
  longform_count: number
  over_50k_count: number
  qualified_count: number
}
viewtrap_budget: {
  used: number
  limit: number                       // VIEWTRAP_SEARCH_LIMIT = 10
  slots: ViewtrapBudgetSlot[]
}
topics: PullingTopic[]
approval_request: string 🇰🇷
provenance: {
  keywords_generated: number
  clusters_formed: number
  topics_selected: number
  notes: string[] 🇰🇷                 // diagnostic notes, incl. late extraNotes
}
```

`ViewtrapBudgetSlot`:
```
slot: number                          // 1-indexed
query: string 🇰🇷
purpose: string 🇰🇷
resultCount: number
goodOrGreatCount: number              // videos with perf or contrib grade >= 0.75
```

`PullingTopic`:
```
rank: number
topic_name: string 🇰🇷
grade: 'A' | 'B' | 'C' | 'D'          // TopicGrade
target_phenomenon: string 🇰🇷        // the phenomenon the customer faces now
created_desire: string 🇰🇷           // the desire to create
linked_key_content: string 🇰🇷       // = key_topic_title
evidence_videos: PullingEvidenceVideo[]
viewer_identity?: string 🇰🇷
identity_match?: 'match' | 'partial' | 'mismatch'   // IdentityMatch
identity_reason?: string 🇰🇷
selection_reason: string 🇰🇷
product_application: string 🇰🇷      // how the product plugs in (phenomenon → product)
funnel: PullingFunnel
topic_score: number                   // 0..1, rounded to 3 decimals
```

`PullingEvidenceVideo`:
```
videoId: string
title: string 🇰🇷
url: string                           // https://www.youtube.com/watch?v=<id>
thumbnailUrl: string                  // https://i.ytimg.com/vi/<id>/hqdefault.jpg
channelTitle: string 🇰🇷
viewCount: number
publishedAt: string                   // ISO, from durations; '' if unknown
isShort: boolean
exposure: string | null               // viewtrap 노출확률 grade
performance: string | null            // viewtrap 성과도 grade
contribution: string | null           // viewtrap 기여도 grade
videoScore: number                    // 0..1, rounded to 3 decimals
source: '뷰트랩' | '뷰트랩/YouTube' | 'YouTube'
```

`PullingFunnel` (all Korean free-text 🇰🇷):
```
phenomenon: string
desire: string
plan: string
action: string
reward: string
```

### Deterministic scoring constants (pure, unit-tested — do not re-derive)

- `MIN_VIEWS = 50_000`; `VIEWTRAP_SEARCH_LIMIT = 10`.
- `gradeToScore(grade)`: great|wow|매우좋음→1.0, good|좋음→0.75, normal|보통→0.5, bad|나쁨→0.25, worst|매우나쁨→0.0, else→0.5 (neutral).
- `videoScore` weights (§9-1): exposure 0.35 + contribution 0.20 + performance 0.15 + viewsScore 0.10 + channelAdj 0.10 + topicFit 0.10. viewsScore = min(viewsPerDay/5000,1) if viewsPerDay>0 else min(viewCount/500000,1). channelAdj/topicFit default 0.5.
- `computeChannelOutlier(views, channelAvg)` (§5-3): channelAvg<=0 → 0.5; else clamp(ratio/2, 0, 1), ratio = views/channelAvg.
- `topicScore` (§9-2): avg(videoScores) 0.45 + max(videoScores) 0.20 + min(repeatCount/3,1) 0.10 + clamp01(keyLink) 0.15 + clamp01(productLink) 0.10.
- `decideGrade(avgVideoScore, keyLink)`: strongData = avg>=0.6, okData = avg>=0.45, strongLink = keyLink>=0.6. A = strong+strongLink, B = strong+!strongLink, C = ok+strongLink, else D.
- Cluster input capped at top 15; topics default 5; `identity_match === 'mismatch'` clusters are dropped.

### PRD §4 Step 0-12 Zod schemas (from pulling-content-planning.ts, pure builder layer)

These validate the planning-agent deliverables (a separate, deterministic layer that composes into `assemblePullingContentPlan`). Enums as declared:

- `PullingTopicCandidate`: `{title, covered_stages: ('phenomenon'|'desire'|'plan'|'action'|'reward')[≥1], topic_axis, key_content_connection}`.
- `KeyReadyAudience`: `{required_problem_awareness, required_desire, required_plan_awareness, not_ready_reasons[]}`.
- `PullingLogicalExpansionMap`: `{product, category, feature_benefit[≥1], problems[≥1], audience_situations[≥1], possible_content_topics[≥1]}`.
- `PullingProblemAxisMap`: `{symptom_topics[], cause_topics[], desire_topics[], plan_topics[], misconception_topics[], reward_case_topics[]}` (≥1 topic total, else throw).
- `ContentTypePortfolio`: `{evergreen_candidates[], daily_candidates[], seasonal_candidates[], hero_candidates[]}` (evergreen or daily must be non-empty).
- `PullingViewtrapValidation`: `{search_keyword, candidate_titles[], performance_score('normal'|'good'|'great'), contribution_score(same), growth_status('growing'|'stalled'|'unknown'), reproducible_low_subscriber:bool, channel_value_risk:bool, person_value_risk:bool, verdict('use'|'watch'|'reject')}`. Verdict: channel/person value risk → reject; both scores normal + stalled → reject; perf≥good or contrib≥good → use; else watch.
- `PullingTopicScore`: 9 sub-scores (`performance_score, contribution_score, exposure_probability_score, growth_score, evergreen_score, reproducibility_score, key_connection_score, sales_logic_connection_score, home_selection_score`) + `total_score` + `verdict('use'|'watch'|'reject')`. key_connection or sales_logic_connection ≤0 → reject; total ≥60% max → use; ≥40% → watch; else reject.
- `ConsumerJourneyCoverageReport`: `{phenomenon_covered, desire_covered, plan_covered, action_connected, reward_promised: bool, natural_flow_score: number, notes[]}`.
- `ApprovedPullingTopic`: `{title, thumbnail_promise, covered_stages[≥1], content_type('daily'|'seasonal'|'evergreen'|'hero'), score: PullingTopicScore, key_content_connection}`.
- Strong rules (throw): Step 8 `enforceLongtailMustUse` (a `must_use` longtail evergreen must appear in approved topics); Step 10 key-connection sentence needs all of audience/trigger/key_core_problem/key_title non-empty; Step 11 the full journey (현상·욕구·계획·행동·보상) must be covered by the assembled set.

## (b) Step order and per-step LLM usage (pulling-content-report.ts)

| Source step | What it does | LLM call? |
|---|---|---|
| Step 1-2 `searchKeywordPrompt` | Define phenomenon domain + generate `count` short (2-4 word) search queries `{query,purpose,phenomenon,desire}`. Fallback: draft `searchAxes`. | **Yes** — 1 call |
| Step 3-7 discover loop | Per keyword: `discover` → `getDurations` → count longform/over-50k/good-or-great → dedup by videoId → `isQualifiedCandidate` filter → `videoScore` → push to pool + budget slot. Budget = keyword count, capped 10. | No (deterministic + injected I/O) |
| comments collection | `getComments` per pooled video in parallel; identity evidence for clustering. | No (injected I/O) |
| Step 6 exposure merge | `getExposureMap` → merge exposure grade by videoId, recompute `videoScore`. | No (injected I/O) |
| Step 4 channel adjust | `getChannelAdj` → recompute `videoScore` with channelAdj outlier. | No (injected I/O) |
| Step 9-10 `clusterPrompt` | Top-15 pool → cluster into `targetTopics` topics; identity fit; drop `mismatch`; fallback to top-videoScore single topic. | **Yes** — 1 call |
| Step 8 topic scoring | Per cluster: avg videoScore, `topicScore`, `decideGrade`, build `evidence_videos`. | No (deterministic) |
| Step 11 `topicLogicPrompt` | Per topic: `funnel` + `product_application`. Fallback funnel on failure. | **Yes** — N parallel calls (one per topic) |
| assemble | Build `PullingContentReport` (search_summary, viewtrap_budget, topics sorted by rank, approval_request, provenance merging late extraNotes). | No |

LLM prompts embedded in source (three total): `searchKeywordPrompt`, `clusterPrompt`, `topicLogicPrompt`, all built on `header(product, keyContent)` and expecting JSON responses parsed by the lenient `parseJson` helper. Failure of any LLM call is caught, noted in `provenance.notes`, and never rethrown.

## (c) Gate report placement

- Gate report stage: **`pulling_plan_doc`** — "풀링 리서치 리포트 (주제별 근거 영상 · 선별 이유 · 키 연결 논리)" (`gate-report-docs.ts` §5).
- Approval gate: **`pulling_content_set_approval`** (state-machine.ts: precondition `['pulling_plan_doc']`; approval-gates.ts: risk stage `strategy`; on approval transitions to `thumbnail_pattern_extraction`).
- The `PullingContentReport` JSON this skill produces is the data the `pulling_plan_doc` HTML is rendered from for the 사장님 to review at the `pulling_content_set_approval` gate.
