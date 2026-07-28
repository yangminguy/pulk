---
name: content-pulling-research
description: Take a confirmed key content plan plus a product/target/draft context and produce a data-backed pulling research report of 4-5 pulling topics (phenomenon → desire) that pull qualified viewers toward the key content.
---

# Content Pulling Research

Pulling content owns the "현상(phenomenon) → 욕구(desire)" stage in front of the key content, which owns "욕구 → 계획 → 행동 → 보상". Every topic must trace to real YouTube/viewtrap evidence and connect back to the confirmed key content. All I/O (discover, durations, comments, channel-adjust, exposure map, LLM) comes from injected deps; scoring/grading/filtering are deterministic pure functions. Never throw on data/LLM failure — skip the failing item, push a provenance note, and continue.

Read `constraints` before starting: `maxKeywords` defaults to 10 and is hard-capped at 10 (viewtrap search budget per content set, workflow §6); `targetTopics` defaults to 5. Require a confirmed key content (`key_topic_title`) and a draft context (category, entry stage, item features/benefits, problems, search axes).

1. **Generate search keywords (LLM).** From the phenomenon domain, produce exactly `maxKeywords` short 2-4-word noun-phrase search queries. Long sentence queries are forbidden — viewtrap mismatches them and returns unrelated popular videos. Each query must touch a phenomenon the target audience feels, at the same identity level as the target (no lower operator/practitioner-level queries), and spread across different phenomena. Output per query: `{query, purpose, phenomenon, desire}`. On empty/failure, fall back to the draft `searchAxes` and note it.
2. **Discover + qualify (deterministic).** For each keyword (one viewtrap search = one budget slot, capped at 10): discover videos, fetch durations, count longform / over-50k / good-or-great, dedup by `videoId`, keep only `isQualifiedCandidate` (longform, ≥50,000 views, not a short). For each kept video compute `videoScore` and hold it in the pool. Record a budget slot `{slot, query, purpose, resultCount, goodOrGreatCount}`.
3. **Collect identity evidence (comments).** For pooled videos, fetch top comments in parallel (if `getComments` is injected). Comments are direct evidence of who actually watches; feed them into clustering. Note how many videos got comments.
4. **Merge exposure grades (viewtrap loaded table).** If `getExposureMap` is injected, merge exposure grade onto pooled videos by matching `videoId` (only videos the 사장님 already loaded in viewtrap match). Exposure is the highest-weighted signal (0.35) — recompute `videoScore` for every merged video. Note matched count.
5. **Apply channel outlier adjustment.** If `getChannelAdj` is injected, recompute `videoScore` with `channelAdj` to separate "big channel → high views" from "topic itself is strong". Missing → neutral 0.5.
6. **Cluster into topics (LLM).** Sort the pool by grade-richness (how many of exposure/performance/contribution are present) then `videoScore` desc, take the top 15, and ask the LLM to cluster them into exactly `targetTopics` topics by same phenomenon/target/search-intent/key-connection. Identity fit is top priority: drop clusters whose viewers sit at a lower identity level than the target even if views are high. Each topic bundles 2-3 evidence video indexes (prefer graded videos), and returns `{rank, topic_name, target_phenomenon, created_desire, video_indexes, viewer_identity, identity_match, identity_reason, key_link, product_link, selection_reason}`. Drop clusters with `identity_match === "mismatch"`. On empty clusters, fall back to a single topic built from the top-`videoScore` videos.
7. **Score + grade topics (deterministic).** For each cluster: gather its pooled videos, compute average `videoScore`, `topicScore` (avg 0.45 + best 0.20 + repeat 0.10 + key_link 0.15 + product_link 0.10), and grade A-D via `decideGrade(avgVideoScore, key_link)`. Build sorted `evidence_videos`.
8. **Build funnel + product application (LLM, parallel).** Per topic, generate the `{phenomenon, desire, plan, action, reward}` funnel (pulling owns phenomenon→desire; key content owns plan→action→reward) and a one-paragraph `product_application` that recognizes the phenomenon, explains the cause as a missing marketing structure, connects to the key content, then surfaces the product as the repeatable system. On failure, use a deterministic fallback funnel.
9. **Assemble the report.** Emit `search_summary`, `viewtrap_budget`, ranked `topics`, `approval_request`, and `provenance` (merging any late `extraNotes` from the discover adapter).

STRICT output — write the pulling research artifact JSON with all required fields:

> Envelope: wrap the fields below inside `data` per [../content-planning-orchestrator/references/artifact-contract.md](../content-planning-orchestrator/references/artifact-contract.md) — set top-level `schema_version:"content_planning_v1"` and `gate_stage:"pulling_plan_doc"`.

- `product` (string), `target` (string), `key_content_title` (string), `key_funnel_summary` (string), `pulling_role` (string, `"현상 → 욕구"`).
- `search_summary`: `{keywords_used, videos_collected, videos_after_dedup, longform_count, over_50k_count, qualified_count}` (all numbers).
- `viewtrap_budget`: `{used, limit, slots[]}` where each slot is `{slot, query, purpose, resultCount, goodOrGreatCount}`.
- `topics[]`: each `{rank, topic_name, grade(A|B|C|D), target_phenomenon, created_desire, linked_key_content, evidence_videos[], viewer_identity?, identity_match?(match|partial|mismatch), identity_reason?, selection_reason, product_application, funnel{phenomenon,desire,plan,action,reward}, topic_score}`. Each evidence video is `{videoId, title, url, thumbnailUrl, channelTitle, viewCount, publishedAt, isShort, exposure|null, performance|null, contribution|null, videoScore, source}`.
- `approval_request` (string), `provenance`: `{keywords_generated, clusters_formed, topics_selected, notes[]}`.

Block only structurally: never invent evidence videos, never exceed the 10-search viewtrap budget, and never emit a topic with no evidence videos when the pool is non-empty. This report fills gate report stage `pulling_plan_doc` for gate `pulling_content_set_approval`. Full field types and step-by-step LLM/deterministic split are in `references/source-contract.md`.
