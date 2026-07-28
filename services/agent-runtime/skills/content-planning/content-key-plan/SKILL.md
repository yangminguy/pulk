---
name: content-key-plan
description: Turn an approved product definition (product, target, viewtrap search keywords) plus real YouTube data into a key-content plan doc — selection rationale, benchmark videos, applied sales logic, and a pulling-keyword plan — that fills the key_content_plan_doc gate report for the key_content_approval gate.
---

# Content Key Plan

Input: an approved product definition (`product_name`, `category`, `target_audience`, `core_offer`) and its approved viewtrap search `keywords`. Every YouTube / transcript / comment / LLM call is an injected dependency. External or LLM failures skip only that item and continue — never throw; emit a partial report and record the skip in `provenance.notes`. Preserve the approved product meaning.

Full field types, per-step LLM usage, the gate mapping, and source file paths are in `references/source-contract.md` — read it before producing the artifact.

The plan is built by walking the product through the two reverse-engineering flows the source encodes: first the key-content workflow (product → feature/benefit → problem → funnel → entry stage → sales logic), then the market report that validates and benchmarks it against real videos. The decision steps below follow the report orchestration, which is the flow that fills the gate doc.

1. Market metrics per keyword (deterministic, no LLM). For each keyword discover videos + durations and compute `videoCount`, `avgViews`, `topViews`, `longformRatio`, `shortsRatio`, `recentRatio` (recent = uploaded within 12 months). Flag keywords with fewer than 3 sample videos as low-confidence in `notes`.

2. Market judgment (LLM, one batch call). Judge each keyword on `targetFit` and `salesLink` as `높음|보통|낮음`. targetFit is viewer identity, not topic match: if the person who searches/watches this keyword has a lower, hands-on operator identity than our target (e.g. target is 대표/사업가 but the keyword pulls in 실무자/자동화러 who want tool-build/how-to), targetFit is 낮음. Result/case and owner-eye-level operation framings signal 높음; tool-setup/editing/code how-to framings signal 낮음.

3. Verdict (deterministic, no LLM). Combine metrics + judgment into `진행 추천 | 보류 | 제외`: 제외 if videoCount < 3, or avgViews < 5,000, or targetFit=낮음; 진행 추천 if topViews ≥ 50,000 and avgViews ≥ 20,000 and targetFit=높음 and salesLink≠낮음; else 보류. Never exclude on format (long-form vs shorts) — label the format in the reason only.

4. Candidate pool + final selection (LLM). From 진행 추천 keywords (fall back to non-제외 keywords if none advanced), take qualified videos (≥50,000 views; shorts require Good/Great 성과도 or 기여도; long-form passes on views when grades are absent), top 3 by views per keyword. Attach top comments as identity evidence. LLM picks exactly 3 (rank 1–3, one `top=true`) prioritizing viewer-identity match; drop any `mismatch` even at high views. Fall back to top-3 by views if the LLM returns nothing.

5. Per-candidate sales-logic analysis (LLM, one call each). From the transcript (or metadata when no transcript) extract `monetization` (what it sells, pinned/description/profile links, where it moves the user, monetization method, takeaway for us) and `funnel` (phenomenon → desire → plan → action → reward).

6. Applied sales logic + recommendation (LLM, one synthesis call). Design our product's key-content sales logic (`content_topic` framed as a result/operation the owner applies to their own business — never a tool-build/how-to framing) and a data-grounded `recommendation_reason` covering demand, target fit, edge over other candidates, and sales-logic linkage.

7. Assemble the plan doc. Sales logic is mandatory (the gate doc throws on null `applied_sales_logic`) and the `pulling_keyword_plan` must be non-empty. Cite the KB 04/06 selection criteria and include the market-verification table as comparison evidence.

## STRICT output

> Envelope: wrap the fields below inside `data` per [../content-planning-orchestrator/references/artifact-contract.md](../content-planning-orchestrator/references/artifact-contract.md) — set top-level `schema_version:"content_planning_v1"` and `gate_stage:"key_content_plan_doc"`.

Write the plan artifact JSON. Required top-level fields (source `KeyContentReport`):

- `product` (string), `target` (string) — Korean free text.
- `market`: array of `{ keyword, videoCount, avgViews, topViews, longformRatio, shortsRatio, recentRatio, targetFit, salesLink, verdict, verdictReason }`. `targetFit`/`salesLink` ∈ `높음|보통|낮음`; `verdict` ∈ `진행 추천|보류|제외`; `verdictReason` Korean free text.
- `candidates`: array of `{ videoId, title, url, thumbnailUrl, channelTitle, viewCount, performance, contribution, isShort, keyword, rank, topPick, transcriptAvailable, viewer_identity?, identity_match?, identity_reason?, funnel?, monetization? }`. `identity_match` ∈ `match|partial|mismatch`; `funnel`/`monetization` as in the contract; free text is Korean.
- `applied_sales_logic`: `{ content_topic, core_target, target_phenomenon, desire_to_trigger, plan_user_makes, action_to_our_product, reward_user_expects }` — **required, non-null** for the gate doc (Korean free text).
- `recommended_video_id` (string|null), `recommendation_reason` (Korean free text), `approval_request` (Korean free text).
- `pulling_keyword_plan`: non-empty array of `{ keyword, reason }` (Korean free text) — consumed by the gate doc.
- `provenance`: `{ keywords_analyzed, keywords_advanced, candidates_selected, transcripts_fetched, notes[] }`.

This artifact fills gate report `stage="key_content_plan_doc"` for gate `key_content_approval`. Block (do not emit the doc) if `applied_sales_logic` is null or `pulling_keyword_plan` is empty — both are hard preconditions in the source.
