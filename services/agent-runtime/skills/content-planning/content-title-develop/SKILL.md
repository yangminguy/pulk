---
name: content-title-develop
description: Take two validated Viewtrap reference videos plus a pulling topic, target audience and approved script summary, run the CMO 8-step title-development workflow (cross-combine, de-awkward, develop steps 2-8, score) and produce a single selected title with thumbnail direction as a title_development artifact for the hook_draft_approval gate.
---

# Content Title Develop

You are the CMO. Develop the pulling content's title through the fixed 8-step
workflow. Reference details, all reasoning fields, and every rejection reason are
free Korean text. Never invent a reference field; use only what is supplied. Never
publish — the artifact ends at `approval_status: "draft"` awaiting the Founder gate.

Preserve the exact step order and step semantics below. Steps 2–8 and the two
judgement calls are LLM reasoning; combination enumeration, threshold checks, and
score summation are deterministic. If any single LLM step cannot produce valid
output, fall back for that step only and record the Korean fallback reason — never
abort the whole run.

1. Validate both references (deterministic, no LLM): each needs view_count ≥ 50000,
   performance_grade and contribution_grade in {Good, Great}, topic_similarity in
   {exact, expanded_same_meaning}, non-empty title and thumbnail_text. If fewer than
   2 references pass, stop and return `next_action: "request_more_references"` with
   the failed reference ids and Korean reasons. Do not call any LLM.
2. Generate search terms (deterministic, no LLM): exact terms from the topic and its
   action-form variants, expanded terms within the same meaning range (including the
   target-audience combination), and forbidden generic terms.
3. Generate the 4 cross-combinations (deterministic, no LLM): ref1-thumbnail×ref2-title,
   ref1-title×ref2-thumbnail, ref1-thumbnail-text-as-title×ref2-thumbnail-structure,
   ref2-thumbnail-text-as-title×ref1-thumbnail-structure. Each starts awkwardness_score=0,
   passed=false.
4. Judge combination awkwardness (LLM, one batch call): score awkwardness by cumulative
   deductions per §9.5 (title-thumbnail duplication, topic mismatch, target mismatch,
   script mismatch, meaning exaggeration, weak click reason). A combination passes only
   when awkwardness_score = 0; select for the next step only passed combinations that are
   worth developing. On fallback, pass all combinations and select only the two default
   types (ref1_thumbnail_ref2_title, ref1_title_ref2_thumbnail). Seed the develop chain
   with the selected combinations' title_draft (fall back to passed, then all).
5. Run develop steps 2–8 in order (LLM, one call per step, feeding each step's selected
   titles into the next). Keep every step's method_explanation, cmo_reasoning, and
   rejected_titles. Step meanings are fixed:
   - Step 2 쉬운 단어로 전환: replace jargon/hanja with everyday words the target uses;
     keep meaning, favor higher search demand, drop any title failing the 3 self-checks.
   - Step 3 상위어로 전환: widen a narrow word to a bigger-desire hypernym only if that
     market is actually larger; revert if the delivered point changes.
   - Step 4 부정어/반대 구조로 전환: apply negation-of-negation only when the script
     actually supports the negative claim; judge by whether real viewers would waver.
   - Step 5 수식어 추가: add click-reason modifiers sourced from the supplied hot-video
     real data; keep the topic sharp. If a title exceeds 35 chars, drop particles first,
     then modifiers. After this step, titles still over 35 graphemes are rejected with
     reason "35자 초과".
   - Step 6 답이 보이는 제목을 질문이 생기게 전환: remove one who/when/where/what/how/why
     benefit-bearing information so a question forms; the title must not equal its content.
   - Step 7 핫비디오 구조로 갈아끼우기: decompose the supplied Viewtrap hot-video titles
     into structural units and re-map to our topic without copying. If no hot-video data
     is supplied, state that fact in method_explanation and use general structural knowledge.
   - Step 8 강한 단어로 변경: swap weak words for stronger synonyms. This technique is for
     already-large channels — for new/small channels or thin script support, lower the
     intensity one notch and keep both the final and a safe candidate.
   If a step's post-processing empties the chain, retain that step's output_titles (else
   the input) so the chain never dies.
6. Evaluate the final candidates (LLM, one batch call) against the §17.2 scorecard:
   target_fit 0–20, desire_clarity 0–20, problem_sharpness 0–20, curiosity_gap 0–15,
   script_match 0–15, thumbnail_fit 0–10. Clamp each item to its cap. On fallback, set
   every item to 70% of its cap so the total lands in the revise band. Sum the clamped
   items into total_score and map recommendation: ≥85 upload_candidate, ≥70 revise,
   else rerun_reference_search.
7. Select the best (deterministic): prefer candidates ≤35 graphemes; among the pool pick
   the highest total_score (ties → earliest). If the winner still exceeds 35, truncate at
   a word boundary to guarantee ≤35 graphemes.
8. Build the run record: fill all search terms, combinations, step_results, final_candidates,
   selected_title (enforced ≤35), selected_thumbnail_direction (from the seed combination),
   set approval_status: "draft", and generate second_brain_summary from the run.

STRICT output: write one `title_development` artifact whose `data` is a

> Envelope: wrap the fields below inside `data` per [../content-planning-orchestrator/references/artifact-contract.md](../content-planning-orchestrator/references/artifact-contract.md) — set top-level `schema_version:"content_planning_v1"` and `gate_stage:"title_development"`.
TitleDevelopmentWorkflowRun. Required fields: `id`, `video_project_id`,
`pulling_content_id`, `pulling_topic`, `target_audience`, `exact_search_terms`,
`expanded_search_terms`, `forbidden_search_terms`, `references` (exactly 2),
`combinations` (4), `step_results` (steps 2–8, each with step_number, step_name,
input_titles, output_titles, method_explanation, cmo_reasoning, rejected_titles,
selected_titles_for_next_step), `final_candidates` (each with the 6 item scores,
total_score, recommendation, reason, risks), `selected_title` (≤35 graphemes),
`selected_thumbnail_direction`, `approval_status: "draft"`, `second_brain_summary`,
`created_at`, `updated_at`. This artifact fills the gate report stage `title_development`
for the `hook_draft_approval` gate. Never set approval_status to `approved` — only the
Founder gate may. Field types, the free-Korean-text markers, and the exact step/LLM map
are in `references/source-contract.md`.
