---
name: content-script-draft
description: Convert a confirmed video topic and its strategy/material cards into a full Korean narration script draft — a 30-second intro, per-logic-block body parts, an integrated full script, a deterministic QA report, and FR-8 rationale that records why each part was written.
---

# Content Script Draft

Take a confirmed key/pulling topic plus its assembled strategy, material, VOC, claim and logic-block inputs and produce a narration-ready Korean script draft. This mirrors `proposeScriptDraft` in `packages/l5-core/src/functions/video-room/content-production.ts`. Do not invent facts: every claim and scene must trace to a supplied material, VOC line, or safe claim. All draft prose is Korean free text for voice-over (pure text only — no markdown).

Read `references/source-contract.md` for the exact input/output schema, per-step LLM usage, and the gate-report contract before drafting.

## Judgment steps

1. **Validate and assemble context.** Require `content_id`, `content_type` (`key` | `pulling`) and a non-empty `topic_title`. From the cards build the minimum-valid context: a strategy brief, a material pack, a VOC pack and a claim/evidence report. When a field is missing, fall back deterministically — VOC falls back to the first two materials or a topic-derived pain line; `video_promise`/`core_message`/`strategic_angle`/`intro_direction`/`cta` fall back to topic-derived defaults. Never leave VOC empty (the intro writer throws on empty VOC).

2. **Resolve logic blocks.** If `logic_blocks` were supplied, normalize each (fill `block_id`, `role`, `covered_stages`, `main_claim`, `supporting_materials`, `viewer_emotion`, `transition_to_next_block`); otherwise generate exactly 3 blocks from the material pool, cycling consumer stages in order `phenomenon → desire → plan → action → reward`.

3. **Write the 30-second intro.** Produce `intro_30s` (first sentence, hook type, tension, viewer promise, script, used materials/insights, why it works). Re-confirm the click reason in the first sentence and empathize with the viewer's situation; do not reveal the answer yet. Target ~200 Korean chars (170–280, 30–50s of narration).

4. **Write one body part per logic block.** For each block produce a `ScriptPart` (draft, used materials, used VOC lines, used claims, transition out, risk notes) in block order.

5. **Integrate the full script.** Merge intro + parts into `integrated_script` (full_script, section_map, removed_repetition, added_transitions, strategy_alignment_notes).

6. **Optionally regenerate real prose with an LLM.** When an LLM is available, generate the real script from the deterministic skeleton using the STRICT `===INTRO===` / `===BODY===` contract in `references/source-contract.md`: intro 170–400 chars, body ≥ 2,000 chars, no markdown markers, no refusal/input-request language. On retry, feed back the prior body char count and demand ≥ 2,500 chars. Adopt an LLM result only when both intro and body pass the guards; on total failure keep the best non-refusal candidate if body ≥ 1,600 and intro ≥ 150 chars, otherwise keep the deterministic draft. Set `rationale.intro.generation` to `llm` or `deterministic` accordingly.

7. **Score QA deterministically.** Emit `qa` (ScriptQaReport) with the fixed threshold scores and per-stage `desire_stage_coverage` derived from the covered stages; carry `strategy_alignment_notes` into `logic_block_alignment`.

8. **Emit FR-8 rationale at generation time.** Record `rationale`: the intro's benchmark video id (or null), structure name, reason, used materials and generation mode; per-block source mapping (used materials/VOC/claims); and the full list of research sources. Rationale is produced during generation, never inferred after the fact.

## STRICT output contract

> Envelope: wrap the fields below inside `data` per [../content-planning-orchestrator/references/artifact-contract.md](../content-planning-orchestrator/references/artifact-contract.md) — set top-level `schema_version:"content_planning_v1"` and `gate_stage:"script_draft"`.

Write `script_draft.json` with these required top-level fields (full field-level types in `references/source-contract.md`):

- `intro_30s` — `Intro30s` object (Korean `script` free text).
- `logic_blocks` — array of `ScriptPart`, one per logic block, in order.
- `integrated_script` — `IntegratedScript` object; `full_script` is the narration-ready Korean text.
- `qa` — `ScriptQaReport` object; `overall_pass` must be present.
- `rationale` — `ScriptRationale` object (intro + per-block source mapping + research_sources).

Also emit the gate report for `stage: "script_draft"` feeding the `script_approval` gate, as specified in `references/source-contract.md`.

Block (do not emit an approvable draft) when: `topic_title` is empty, no material/VOC can be assembled for a required block, or the only available body text is refusal/input-request language.
