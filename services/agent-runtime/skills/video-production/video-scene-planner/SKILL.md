---
name: video-scene-planner
description: Turn an approved video content brief into ordered meaning-block scenes with narrative roles, visual intent, asset needs and full script coverage. Use after video-content-brief and before slide workers, media preparation or rendering.
---

# Video Scene Planner

Treat the approved script as immutable master meaning.

1. Split by understanding unit and breath, not sentence count.
2. Assign Hook, Problem, Claim, Mechanism, Example, Proof, Contrast, Process, Objection, or CTA.
3. Give each scene one assertion, one evidence need, one `evidence_mode` and one `visual_form`.
4. Select the form from meaning, not decoration:
   - relationship or causality → architecture, flow, funnel or orbital
   - ordered action → steps, roadmap or recorded UI
   - numeric proof → chart or metric cards
   - concrete real-world example → supplied footage, licensed photo/video or screenshot
   - trust, emotion or direct explanation → talking head
   - verbal reversal → comparison, reframe or kinetic typography
5. Score slideability; merge or split scenes that cannot communicate one focus.
6. Write a global `visual_rhythm` plan. For 8 or more scenes, use at least four visual families, keep any one family at or below 35%, and never repeat one form more than twice consecutively.
7. Provide non-binding Factory template hints and verify 100% block coverage.

Write `02_scene_plan.json` with `evidence_mode`, `visual_form`, `asset_need`, `visual_rhythm` and `script_block_ids`. Do not fabricate assets or final duration. If the evidence needed for a form does not exist, mark the scene blocked instead of silently converting it to a generic text slide.
